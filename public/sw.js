// The service worker behind the iPhone install.
//
// Android gets an APK; the iPhone gets this same bundle added to the home
// screen, and a worker is what makes that behave like an app rather than a
// bookmark. It buys two things nothing else can:
//
//   - the app opens when the laptop is asleep or the tailnet is not up. It
//     opens onto its own "can't reach the bridge" state, which is a screen the
//     app already knows how to draw, instead of Safari's error page.
//   - a notification iOS will actually post. Safari has no `new Notification`
//     even in an installed app; `registration.showNotification` is the only
//     door, and it is a worker method.
//
// It caches the shell and nothing else. The bridge and projtrack answer on
// this same origin, so a worker that cached everything same-origin would
// quietly serve yesterday's pane text: below, the document, /assets/ and
// /icons/ are answered from here and every other request is left alone to go
// to the network as if no worker were installed.

const SHELL = 'orcha-shell-v2';

// One key for the document however it was asked for, so '/' and '/index.html'
// are the same cached page.
const DOC = '/index.html';

// How long a cold launch waits for the laptop before it draws from the cache.
// A dead host does not refuse a connection, it says nothing at all, so without
// a deadline of our own an asleep laptop is a white screen for as long as TCP
// takes to give up.
const DOC_TIMEOUT_MS = 2500;

function isShellAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('install', (e) => {
  // The whole shell is taken now, while the phone is plainly on the tailnet,
  // rather than left to accumulate as the app asks for things. Waiting for the
  // requests to arrive does not work: the load that installs a worker is
  // already underway when it activates, so its own script, stylesheet and fonts
  // never pass through the worker at all, and the next launch — the first one
  // that might be offline — is the first one that would have populated it.
  e.waitUntil(
    caches
      .open(SHELL)
      .then(precache)
      .catch(() => {
        // A shell we could not take whole is not a reason to refuse to install:
        // the fetch handler below still caches what it sees, and the app is no
        // worse off than with no worker at all.
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Every file the app needs to open, found by reading the page rather than by
 * being listed here. Asset filenames carry a content hash, so a list in this
 * file would be a list of the names one build had — right until the next build,
 * which is exactly when it would matter.
 */
async function precache(cache, document) {
  const doc = document ?? (await fetch(new Request(DOC, { cache: 'reload' })));
  if (!doc.ok) throw new Error(`document ${doc.status}`);
  const html = await doc.clone().text();
  await cache.put(DOC, doc);
  await cache.add('/manifest.webmanifest').catch(() => {});

  const wanted = new Set();
  const queue = assetRefs(html);
  while (queue.length) {
    const ref = queue.shift();
    if (wanted.has(ref)) continue;
    wanted.add(ref);
    // A name carries the hash of what is in the file, so a name already held is
    // the same file: this runs on every launch and downloads only what changed,
    // which after a rebuild is the bundle and not the 350 kB of fonts beside it.
    let res = await cache.match(ref);
    if (!res) {
      res = await fetch(ref, { cache: 'reload' });
      if (!res.ok) continue;
      await cache.put(ref, res.clone());
    }
    // The fonts are named in the stylesheet, not in the page, so a stylesheet
    // is read for what it in turn asks for.
    if (ref.endsWith('.css')) queue.push(...assetRefs(await res.clone().text()));
  }

  // What the page no longer names is a previous build's, and nothing will ask
  // for it again: hashed names are never reused.
  for (const req of await cache.keys()) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/assets/') && !wanted.has(pathname)) await cache.delete(req);
  }
}

/** The /assets/ paths named in a page or a stylesheet. */
function assetRefs(text) {
  return [...text.matchAll(/\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*/g)].map((m) => m[0]);
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') return e.respondWith(documentResponse(e));
  if (isShellAsset(url)) return e.respondWith(assetResponse(e));
  // Anything else — /panes, /chat/messages, /projtrack/* — is the bridge's.
});

/**
 * Network first, so a rebuilt bundle is picked up; cache when it is not there.
 *
 * A fresh document means fresh asset names, so the shell is taken again behind
 * it — under waitUntil, because a worker whose respondWith has settled may be
 * stopped, and a write that was still in flight is simply lost.
 */
async function documentResponse(e) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await withTimeout(fetch(e.request), DOC_TIMEOUT_MS);
    if (fresh.ok) {
      e.waitUntil(precache(cache, fresh.clone()));
      return fresh;
    }
    // Something answered, but not with the app: the orchestrator restarting
    // mid-launch, or a config that no longer points at a dist/. A held page
    // that works is worth more than a fresh 404, which is a white screen.
    return (await cache.match(DOC)) ?? fresh;
  } catch {
    const cached = await cache.match(DOC);
    if (cached) return cached;
    throw new Error('offline and no cached document');
  }
}

/** Cache first: every asset filename carries a content hash, so a hit is never stale. */
async function assetResponse(e) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  const fresh = await fetch(e.request);
  if (fresh.ok) e.waitUntil(cache.put(e.request, fresh.clone()));
  return fresh;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// Tapping the notification should land on the chat, the same as it does on the
// laptop. The page owns that navigation, so the tap is forwarded to it and the
// app is only opened cold when there is no window to forward to.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((c) => c.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'orcha:notification-open' });
        return;
      }
      await self.clients.openWindow('/');
    })()
  );
});
