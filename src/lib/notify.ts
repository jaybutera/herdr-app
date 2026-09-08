// A system notification for a new orchestrator message, on both targets.
//
// Two implementations behind one call, because the platforms do not share one.
// The laptop build uses the browser's Notification API. The Android WebView has
// no `Notification` constructor at all, so that path would leave the APK
// silently doing nothing; there the call goes through
// tauri-plugin-notification, which posts a real Android notification from the
// app process. Everything else about the feature — the unread dot, the toast,
// the watcher that decides there is something to say — is the same on both, so
// this file is the whole of the difference.
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
 * `onOpen` is the laptop only: a tapped Android notification raises the app,
 * which is the useful half, and routing its tap back into the WebView needs an
 * action listener and a channel that this does not have. The app opens on Fleet
 * with the Chat tab already carrying its dot, so nothing is lost.
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
  try {
    // One tag, so a second message replaces the first rather than stacking a
    // notification per poll on a busy afternoon.
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
    // Android's Chrome throws here: it only allows notifications through a
    // service worker registration. The APK does not take this path.
    return false;
  }
}
