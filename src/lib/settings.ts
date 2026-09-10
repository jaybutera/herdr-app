// Settings persistence. localStorage on the laptop, Tauri's store plugin on
// Android (section 5.5). The store plugin is loaded lazily so the web build
// never pulls the Tauri IPC path.

export type PollSpeed = 'fast' | 'normal' | 'slow';

export interface Settings {
  projtrackUrl: string;
  bridgeUrl: string;
  token: string;
  pollSpeed: PollSpeed;
  /** Fleet root remembers its filter across launches (section 9). */
  projectFilter: string;
  /**
   * Whether to post a system notification when the orchestrator has something
   * to say and the chat is not on screen. Off until it is turned on in
   * Settings, because asking for notification permission needs a tap: Chrome
   * refuses the prompt without one, and Android 13 shows its own. The in-app
   * dot and toast do not depend on this.
   */
  notify: boolean;
}

/** Pane / chat / projects poll intervals in ms, by speed (section 5.5). */
export const POLL_INTERVALS: Record<PollSpeed, { pane: number; chat: number; projects: number }> = {
  fast: { pane: 1000, chat: 2000, projects: 10000 },
  normal: { pane: 2000, chat: 3000, projects: 15000 },
  slow: { pane: 5000, chat: 10000, projects: 30000 },
};

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** The laptop's own bridge: the right guess only for a page on the laptop. */
const LOOPBACK = 'http://127.0.0.1:17988';

function isLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Where to look before anyone has been to Settings.
 *
 * A page that came from somewhere other than a dev server on this machine came
 * from something that also answers the API — the orchestrator, which serves
 * this bundle at `/`, or the hosted copy that proxies to it — so that page's
 * own origin is a far better guess than a loopback address, which on a phone
 * names the phone. It is only ever a default: Settings still decides.
 *
 * Not on Android, where the page is served by Tauri from its own asset
 * protocol and its origin means nothing on the network.
 */
function defaultBase(): string {
  if (typeof window === 'undefined' || isTauri()) return LOOPBACK;
  const { origin, protocol } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return LOOPBACK;
  return isLoopback(origin) ? LOOPBACK : origin;
}

export const DEFAULTS: Settings = {
  // Blank, meaning "wherever the bridge is". projtrack binds loopback and sends
  // no CORS headers, so no browser has ever called it directly: its calls go to
  // the bridge's /projtrack routes and the two fields are the same address in
  // every deployment there has been. See projtrackBase.
  projtrackUrl: '',
  bridgeUrl: defaultBase(),
  token: '',
  pollSpeed: 'normal',
  projectFilter: 'active',
  notify: false,
};

/**
 * The base for projtrack's calls.
 *
 * Blank means the bridge, which is what the field now defaults to. So does a
 * loopback address entered while the bridge is somewhere else: that is the old
 * default nobody edited, and from a phone or a hosted page it names the device
 * the page is open on rather than the laptop — a request that cannot succeed
 * and whose failure reads as "projtrack is down". The bridge is proxying
 * projtrack in every one of those cases anyway.
 *
 * A loopback projtrack alongside a loopback bridge is left alone: that is the
 * laptop, where both are right.
 */
export function projtrackBase(s: Settings): string {
  const named = s.projtrackUrl.trim();
  if (!named) return s.bridgeUrl;
  if (isLoopback(named) && !isLoopback(s.bridgeUrl)) return s.bridgeUrl;
  return named;
}

// The app is Orcha now, but the storage keys keep the old name on purpose:
// they address settings already written on Casper's phone. Renaming them
// discards the bridge URL and the token, same as changing the applicationId
// would. Not worth a tidier string.
const KEY = 'herdr.settings';

type TauriStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
};

let storePromise: Promise<TauriStore | null> | null = null;

async function tauriStore(): Promise<TauriStore | null> {
  if (!isTauri()) return null;
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store')
      // Keeps its old filename for the reason given at KEY above.
      .then((m) => m.load('herdr.json', { autoSave: true }) as unknown as Promise<TauriStore>)
      .catch(() => null);
  }
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  const store = await tauriStore();
  if (store) {
    try {
      const saved = (await store.get(KEY)) as Partial<Settings> | null;
      if (saved) return { ...DEFAULTS, ...saved };
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* first run, or storage blocked */
  }
  return { ...DEFAULTS };
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-fatal: the Tauri store below is the durable copy on Android */
  }
  const store = await tauriStore();
  if (store) {
    try {
      await store.set(KEY, s);
      await store.save();
    } catch {
      /* non-fatal */
    }
  }
}
