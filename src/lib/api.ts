// HTTP client for the two backends. Base URLs and the bearer token come from
// Settings (section 2); every request carries the token when one is set.

import type {
  ChatMessage,
  ChatState,
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

  let res: Response;
  try {
    res = await fetch(joinUrl(base, path), {
      ...init,
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : 'Network error', 0);
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
