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
}

/** Pane / chat / projects poll intervals in ms, by speed (section 5.5). */
export const POLL_INTERVALS: Record<PollSpeed, { pane: number; chat: number; projects: number }> = {
  fast: { pane: 1000, chat: 2000, projects: 10000 },
  normal: { pane: 2000, chat: 3000, projects: 15000 },
  slow: { pane: 5000, chat: 10000, projects: 30000 },
};

export const DEFAULTS: Settings = {
  // Both point at the bridge: projtrack is loopback-only with no CORS headers,
  // so its calls are proxied through the bridge's /projtrack routes. The phone
  // reaches the laptop over Tailscale, so these are overridden in Settings on
  // the device (http://<tailscale-host>:17988).
  projtrackUrl: 'http://127.0.0.1:17988',
  bridgeUrl: 'http://127.0.0.1:17988',
  token: '',
  pollSpeed: 'normal',
  projectFilter: 'active',
};

const KEY = 'herdr.settings';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

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
