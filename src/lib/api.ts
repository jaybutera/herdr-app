// HTTP client for the two backends. Base URLs and the bearer token come from
// Settings (section 2); every request carries the token when one is set.

import type {
  ChatMessage,
  ChatState,
  Machine,
  Pane,
  PaneRead,
  ProjectDetail,
  ProjectStatus,
  Summary,
  TaskDetail,
  TaskStatus,
} from './types';
import type { Settings } from './settings';

/** Thrown for any non-2xx or transport failure; `status` is 0 when the request never landed. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const TIMEOUT_MS = 12_000;

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

/**
 * On Android every request goes through tauri-plugin-http, which performs it in
 * Rust rather than in the WebView.
 *
 * v0.1.0 used the WebView's own `fetch` and could not reach the laptop at all:
 * the app showed "Can't reach projtrack" on a phone whose browser fetched the
 * same URL fine. The WebView's networking is a second implementation with its
 * own version skew and its own rules about what a page may request, and none of
 * it is visible from the host. Going native takes the whole layer out of the
 * path: the request is made by the app process, so what works from a shell on
 * the phone works from the app.
 *
 * The laptop keeps the browser's `fetch`; there is no Tauri there to call.
 */
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

let nativeFetch: FetchFn | null = null;
let nativeFetchLoaded = false;

async function pickFetch(): Promise<FetchFn> {
  const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!tauri) return fetch;
  if (!nativeFetchLoaded) {
    nativeFetchLoaded = true;
    try {
      const mod = await import('@tauri-apps/plugin-http');
      nativeFetch = mod.fetch as unknown as FetchFn;
    } catch {
      // Better a request through the WebView than no request at all.
      nativeFetch = null;
    }
  }
  return nativeFetch ?? fetch;
}

/**
 * A 12 s deadline that does not assume `AbortSignal.timeout`.
 *
 * That method is Chrome 103 and later. minSdk here is 24, and Android System
 * WebView updates independently of the OS, so an older one throws
 * "AbortSignal.timeout is not a function" from inside the try block that wraps
 * the fetch — which the catch then reported as a network error. This is the second
 * half of the same v0.1.0 bug: a working network path presented as an
 * unreachable server.
 */
function deadline(): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('Request timed out')), TIMEOUT_MS);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function request<T>(
  base: string,
  path: string,
  settings: Settings,
  init: RequestInit = {}
): Promise<T> {
  if (!base) throw new ApiError('No URL configured');
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (settings.token) headers['Authorization'] = `Bearer ${settings.token}`;
  if (init.body) headers['Content-Type'] = 'application/json';

  const doFetch = await pickFetch();
  const { signal, done } = deadline();
  let res: Response;
  try {
    res = await doFetch(joinUrl(base, path), { ...init, headers, signal });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : 'Network error', 0);
  } finally {
    done();
  }
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Bad JSON in response', res.status);
  }
}

// ---------- projtrack (section 2.1) ----------
//
// Routed through the bridge's /projtrack proxy rather than called directly.
// projtrack listens on loopback and sends no CORS headers, so neither target can
// reach it from a browser: the phone is not on the host, and the laptop page is
// a different origin. The proxy also means one base URL and one token to
// configure instead of two.

export const projtrack = {
  summary: (s: Settings) =>
    request<Summary>(s.projtrackUrl, '/projtrack/summary?status=all', s),

  project: (s: Settings, id: number) =>
    request<ProjectDetail>(s.projtrackUrl, `/projtrack/projects/${id}`, s),

  task: (s: Settings, id: number) =>
    request<TaskDetail>(s.projtrackUrl, `/projtrack/tasks/${id}`, s),

  setProjectStatus: (s: Settings, id: number, status: ProjectStatus) =>
    request<ProjectDetail>(s.projtrackUrl, `/projtrack/projects/${id}`, s, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  setTaskStatus: (s: Settings, id: number, status: TaskStatus) =>
    request<TaskDetail>(s.projtrackUrl, `/projtrack/tasks/${id}`, s, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  addNote: (s: Settings, taskId: number, note: string) =>
    request<unknown>(s.projtrackUrl, `/projtrack/tasks/${taskId}/events`, s, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  health: (s: Settings) => request<unknown>(s.projtrackUrl, '/projtrack/health', s),
};

// ---------- pane bridge (section 2.2) ----------

export const bridge = {
  panes: (s: Settings) => request<{ panes: Pane[] }>(s.bridgeUrl, '/panes', s),

  /** Which machines the bridge can reach, for showing one as offline. */
  machines: (s: Settings) => request<{ machines: Machine[] }>(s.bridgeUrl, '/machines', s),

  pane: (s: Settings, paneId: string) =>
    request<Pane>(s.bridgeUrl, `/panes/${encodeURIComponent(paneId)}`, s),

  read: (s: Settings, paneId: string, lines = 200) =>
    request<PaneRead>(
      s.bridgeUrl,
      `/panes/${encodeURIComponent(paneId)}/read?source=recent-unwrapped&lines=${lines}`,
      s
    ),

  send: (s: Settings, paneId: string, text: string) =>
    request<void>(s.bridgeUrl, `/panes/${encodeURIComponent(paneId)}/send`, s, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  keys: (s: Settings, paneId: string, keys: string[]) =>
    request<void>(s.bridgeUrl, `/panes/${encodeURIComponent(paneId)}/keys`, s, {
      method: 'POST',
      body: JSON.stringify({ keys }),
    }),

  text: (s: Settings, paneId: string, text: string) =>
    request<void>(s.bridgeUrl, `/panes/${encodeURIComponent(paneId)}/text`, s, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};

// ---------- orchestrator chat (section 2.3) ----------

export const chat = {
  messages: (s: Settings, opts: { after?: number; before?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.after !== undefined) q.set('after', String(opts.after));
    if (opts.before !== undefined) q.set('before', String(opts.before));
    q.set('limit', String(opts.limit ?? 100));
    return request<{ messages: ChatMessage[] }>(s.bridgeUrl, `/chat/messages?${q}`, s);
  },

  post: (s: Settings, text: string) =>
    request<ChatMessage>(s.bridgeUrl, '/chat/messages', s, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  state: (s: Settings) => request<ChatState>(s.bridgeUrl, '/chat/state', s),
};
