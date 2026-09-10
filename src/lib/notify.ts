// A system notification for a new orchestrator message, on every target.
//
// Three implementations behind one call, because the platforms do not share
// one. The laptop uses the browser's Notification API. The Android WebView has
// no `Notification` constructor at all, so that path would leave the APK
// silently doing nothing; there the call goes through
// tauri-plugin-notification, which posts a real Android notification from the
// app process. The iPhone has the constructor but throws from it: an installed
// iOS web app may only post through its service worker registration, which is
// also how Chrome has always wanted it, so the registration is preferred over
// the constructor wherever one exists. Everything else about the feature — the
// unread dot, the toast, the watcher that decides there is something to say —
// is the same everywhere, so this file is the whole of the difference.
//
// Nothing here throws. A missing plugin, a WebView with neither API, a user who
// said no: all of it comes back as "not granted" or "did not send", and the
// in-app half carries on regardless.

import { isTauri } from './settings';

/** 'unsupported' means this platform has no notifications to ask about. */
export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

type Plugin = {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<string>;
  sendNotification(opts: { title: string; body?: string }): void;
};

let pluginPromise: Promise<Plugin | null> | null = null;

/** Loaded lazily, exactly like the store and opener plugins, so the web build
 *  never pulls the Tauri IPC path in. */
async function plugin(): Promise<Plugin | null> {
  if (!isTauri()) return null;
  if (!pluginPromise) {
    pluginPromise = import('@tauri-apps/plugin-notification')
      .then((m) => m as unknown as Plugin)
      .catch(() => null);
  }
  return pluginPromise;
}

/**
 * The registration, when this page has one: the phone's install and any browser
 * that took the worker. `getRegistration` rather than `ready`, which never
 * settles when nothing was ever registered — the APK, or a dist/ opened over
 * file://, would wait on it forever.
 */
async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (isTauri()) return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

// A notification posted through the worker is tapped in the worker, so the tap
// comes back here as a message. Held at module scope for the same reason the
// tag is one string: there is only ever one of these on screen.
let tapHandler: (() => void) | null = null;
let listening = false;

function listenForWorkerTap(): void {
  if (listening || isTauri()) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  listening = true;
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'orcha:notification-open') tapHandler?.();
  });
}

function webNotification(): typeof Notification | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as Window & { Notification?: typeof Notification }).Notification;
  return typeof ctor === 'function' ? ctor : null;
}

export async function permission(): Promise<NotifyPermission> {
  const p = await plugin();
  if (p) {
    try {
      return (await p.isPermissionGranted()) ? 'granted' : 'default';
    } catch {
      return 'unsupported';
    }
  }
  const web = webNotification();
  if (!web) return 'unsupported';
  return web.permission as NotifyPermission;
}

/**
 * Ask for permission. Must be called from a tap: Chrome refuses the prompt
 * without user activation, which is why this is wired to the Settings toggle
 * and not to app start.
 */
export async function requestPermission(): Promise<NotifyPermission> {
  const p = await plugin();
  if (p) {
    try {
      const r = await p.requestPermission();
      return r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'default';
    } catch {
      return 'unsupported';
    }
  }
  const web = webNotification();
  if (!web) return 'unsupported';
  try {
    return (await web.requestPermission()) as NotifyPermission;
  } catch {
    return 'unsupported';
  }
}

/**
 * Post one notification, replacing any earlier one from this app.
 *
 * `onOpen` is every target but the APK: a tapped Android notification raises
 * the app, which is the useful half, and routing its tap back into the WebView
 * needs an action listener and a channel that this does not have. The app opens
 * on Fleet with the Chat tab already carrying its dot, so nothing is lost.
 *
 * Returns whether the notification was actually posted.
 */
export async function notify(
  title: string,
  body: string,
  onOpen?: () => void
): Promise<boolean> {
  const p = await plugin();
  if (p) {
    try {
      if (!(await p.isPermissionGranted())) return false;
      p.sendNotification({ title, body });
      return true;
    } catch {
      return false;
    }
  }
  const web = webNotification();
  if (!web || web.permission !== 'granted') return false;

  // One tag, so a second message replaces the first rather than stacking a
  // notification per poll on a busy afternoon.
  const reg = await swRegistration();
  if (reg) {
    try {
      tapHandler = onOpen ?? null;
      listenForWorkerTap();
      await reg.showNotification(title, { body, tag: 'orcha-chat', icon: '/icons/icon-192.png' });
      return true;
    } catch {
      // Fall through: a registration that will not show is no worse than none.
    }
  }

  try {
    const n = new web(title, { body, tag: 'orcha-chat' });
    if (onOpen) {
      n.onclick = () => {
        window.focus();
        n.close();
        onOpen();
      };
    }
    return true;
  } catch {
    // Chrome throws here, and so does an installed iOS web app: both allow a
    // notification only through a service worker registration, which is the
    // branch above and is why reaching this one means there was none to use.
    return false;
  }
}
