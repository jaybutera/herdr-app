// The static server behind the hosted app.
//
// orcha-app is a page and an API that do not live in the same place. The API is
// the orchestrator on the laptop, reachable on the tailnet and no further,
// because the token in front of it is the only thing between the tailnet and
// typing into any Claude session. The page has no such constraint and should
// not inherit one: an iPhone opens it from the home screen at any hour, and it
// has to load whether or not the laptop is awake.
//
// So the page is hosted, the API is not, and this serves the page. It is a few
// dozen lines of node:http rather than a dependency because the whole job is
// four content types and two cache headers.

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT ?? 8080);

// The orchestrator, reached over the tailnet this container joined at start
// (see entrypoint.sh). Unset, and this is a static host and nothing more.
//
// Why the API comes through here at all, when the phone is on the tailnet and
// could call the laptop itself: browsers have stopped allowing that. A page on
// a public origin may not open a connection to a private address — Tailscale's
// 100.64/10 is one — without a permission the user is never asked for in an
// installed web app. Chrome 152 hangs the request; Safari does not enforce it
// yet and is expected to. Proxying puts the page and the API back on one
// origin, which is the arrangement no browser has any objection to, and it
// takes Tailscale off the phone as a requirement.
// Same reasoning as the key guard in entrypoint.sh: with no way to remove a
// variable, "off" is a value, and anything that is not an http(s) URL is off.
// It also means a typo here cannot become a 500 on every request.
const BRIDGE_TARGET = (() => {
  const given = (process.env.BRIDGE_TARGET ?? '').trim();
  try {
    const u = new URL(given);
    return u.protocol === 'http:' || u.protocol === 'https:' ? given : '';
  } catch {
    return '';
  }
})();
// tailscaled runs with no interface of its own, so nothing in this container
// reaches the tailnet by dialling it directly: outbound connections go through
// the HTTP proxy it listens on.
const TS_HTTP_PROXY = (process.env.TS_HTTP_PROXY ?? '').trim();
const BRIDGE_TIMEOUT_MS = 20_000;

// The same headers the orchestrator sends, for the same reason: a page served
// from somewhere else — a laptop's own copy of this bundle, pointed here —
// otherwise gets "Failed to fetch" and no way to tell that from a host that is
// down. Same-origin use, which is the ordinary case, never consults them.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
};

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * The bundle's own paths. The app is one page that swaps screens rather than
 * navigating, so this is the whole of it: no route of the app's is missing from
 * this list, and everything else on this host belongs to the orchestrator.
 */
const APP_FILES = new Set([
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
  '/healthz',
]);
const APP_DIRS = ['/assets/', '/icons/'];

function isAppPath(pathname) {
  return APP_FILES.has(pathname) || APP_DIRS.some((d) => pathname.startsWith(d));
}

async function readAsset(pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1);
  const file = path.resolve(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  try {
    return { file, body: await fs.readFile(file) };
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  // Anything that is not the app is the API. Said this way round rather than by
  // listing the orchestrator's routes, so that a route added there needs no
  // change here — and so the app's own origin is the right thing to put in
  // Settings, which is what makes a fresh install need no address typed at all.
  if (!isAppPath(pathname)) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...CORS, 'access-control-max-age': '86400' });
      return res.end();
    }
    // `/bridge/...` is the same API under an explicit name, kept because it
    // reads clearly in Settings and in a curl.
    const bridgePrefixed = pathname === '/bridge' || pathname.startsWith('/bridge/');
    if (BRIDGE_TARGET) {
      return proxyToBridge(req, res, bridgePrefixed ? pathname : `/bridge${pathname}`, url.search);
    }
    // Answer as the API, not as the page: handing the app an HTML document
    // where it expects JSON makes a missing configuration read as a parse
    // error, which sends the reader looking in the wrong place entirely.
    //
    // 501 and not 503. The app gives 503 a specific meaning — the bridge is
    // fine and the machine behind it is down — and says so on screen; a host
    // with no bridge at all saying that is a wrong diagnosis in confident
    // words. 501 is what this is: a route this host does not implement.
    res.writeHead(501, { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(
      JSON.stringify({ error: 'this host serves the app only; set Bridge URL in Settings' })
    );
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    return res.end();
  }

  // Railway watches this; it must not depend on the bundle being readable, or a
  // bad build would look like a healthy service serving nothing. It is spelled
  // `/healthz` and not `/health` because the orchestrator has a `/health` and
  // that one belongs to the API.
  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('ok');
  }

  const asset = (await readAsset(pathname)) ?? (await readAsset('/'));
  if (!asset) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('no bundle');
  }

  // Every filename under /assets/ carries a content hash, so those can be held
  // forever. The page, the worker and the manifest are how a new build is
  // noticed at all, and must be asked for every time.
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': TYPES[path.extname(asset.file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': asset.body.length,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    // The page talks to a bridge the user names in Settings, so it may not be
    // put in a frame by anyone: the token is typed into this origin.
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  res.end(req.method === 'HEAD' ? undefined : asset.body);
});

/**
 * Hand one request to the orchestrator and its answer back, unchanged.
 *
 * Everything but `/bridge/health` must arrive with a token. The orchestrator
 * checks it too and is the only one that can — this holds no copy of it, so
 * that a compromise here is not a compromise of the session-typing API — but
 * refusing here means an unauthenticated stranger never becomes traffic on
 * someone's laptop. `/health` is the exception on purpose: the app's Test
 * button uses it to tell a wrong token apart from nothing listening.
 */
function proxyToBridge(req, res, pathname, search) {
  const upstreamPath = pathname.slice('/bridge'.length) || '/';

  if (upstreamPath !== '/health' && !req.headers.authorization) {
    res.writeHead(401, { ...CORS, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  const target = new URL(BRIDGE_TARGET);
  const headers = { host: target.host };
  for (const h of ['authorization', 'content-type', 'accept']) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }

  // An HTTP proxy is addressed by putting the whole URL in the request line,
  // which is what `path` becomes here; without one the target is dialled
  // directly, which is how this runs locally against a laptop on the tailnet.
  const via = TS_HTTP_PROXY ? TS_HTTP_PROXY.split(':') : null;
  const options = via
    ? {
        host: via[0],
        port: Number(via[1] ?? 80),
        path: `${target.origin}${upstreamPath}${search}`,
        headers,
      }
    : {
        host: target.hostname,
        port: Number(target.port || 80),
        path: `${upstreamPath}${search}`,
        headers,
      };

  const upstream = http.request({ method: req.method, ...options }, (r) => {
    res.writeHead(r.statusCode ?? 502, {
      ...CORS,
      'content-type': r.headers['content-type'] ?? 'application/json',
      'cache-control': 'no-store',
    });
    r.pipe(res);
  });

  upstream.setTimeout(BRIDGE_TIMEOUT_MS, () => upstream.destroy(new Error('bridge timed out')));
  upstream.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    // The laptop being asleep is the ordinary case, not a fault: the app draws
    // its own offline state from this.
    res.writeHead(502, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bridge unreachable', detail: err.message }));
  });
  req.pipe(upstream);
}

server.listen(PORT, '::', () =>
  console.log(`orcha-app on :${PORT}${BRIDGE_TARGET ? ` proxying /bridge -> ${BRIDGE_TARGET}` : ''}`)
);
