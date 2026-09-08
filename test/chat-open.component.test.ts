// Where the chat is scrolled the moment it opens.
//
// The reported bug: opening the chat showed a message hundreds back ("Round 3:
// still a fail, but narrower."), then jumped forward every three seconds until
// it reached the present about twenty seconds later. It was read twice as a
// scroll-and-layout fault and fixed twice in the pinning code. It was neither.
// The daemon's `/chat/messages` answered an unbounded request with the OLDEST
// hundred messages, so the chat opened holding messages 1..100 of 711 and was
// pinned to the newest message it had — number 100. Each poll for `after=100`
// brought the next hundred and the pin moved to those. The jumps were the
// history arriving, one page per tick.
//
// The daemon now answers with the tail. These tests hold the app to the same
// result against a daemon that does not, because the phone and the laptop
// update on their own schedules.

import { render, screen, cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../src/lib/types';

const messages = vi.fn();
const state = vi.fn();

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api');
  return {
    ...actual,
    chat: {
      messages: (...a: unknown[]) => messages(...a),
      state: (...a: unknown[]) => state(...a),
      post: vi.fn(),
    },
    projtrack: { summary: vi.fn() },
    bridge: { panes: vi.fn(), machines: vi.fn() },
  };
});

const { default: Chat } = await import('../src/screens/Chat.svelte');
const { app: store } = await import('../src/lib/store.svelte');

/** 711 messages, the length of the log the bug was reported against. */
const LOG: ChatMessage[] = Array.from({ length: 711 }, (_, i) => ({
  id: i + 1,
  role: i % 2 ? 'user' : 'orchestrator',
  kind: 'text',
  text: i + 1 === 100 ? 'Round 3: still a fail, but narrower.' : `message ${i + 1}`,
  pane_id: null,
  ts: '2026-09-07T12:00:00Z',
}));

const NEWEST = LOG[LOG.length - 1].text;
const PAGE = 100;

/**
 * A daemon that pages from the START of the history when asked without bounds,
 * which is what the live one did. `after` walks forward a page at a time.
 */
function daemonAnsweringFromTheStart() {
  messages.mockImplementation(async (_s: unknown, opts: { after?: number; limit?: number } = {}) => {
    const from = opts.after ?? 0;
    return { messages: LOG.filter((m) => m.id > from).slice(0, opts.limit ?? PAGE) };
  });
}

/** A daemon on the current code: no bounds means the newest `limit`. */
function daemonAnsweringWithTheTail() {
  messages.mockImplementation(async (_s: unknown, opts: { after?: number; limit?: number } = {}) => {
    const cap = opts.limit ?? PAGE;
    if (opts.after !== undefined) {
      return { messages: LOG.filter((m) => m.id > opts.after!).slice(0, cap) };
    }
    return { messages: LOG.slice(-cap) };
  });
}

const flush = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  await new Promise((r) => realSetTimeout(r, 0));
};
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  // The chat poll is on an interval; nothing here may depend on it having run.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.clearAllMocks();
  state.mockResolvedValue({ busy: false, muted: false, agents: [] });
  // The poll only runs on the visible Chat tab (section 9).
  store.tab = 'chat';
  store.visible = true;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const draw = () => render(Chat, { props: { onOpenPane: () => {} } });

describe('opening the chat against a daemon that pages from the start', () => {
  it('has the newest message on screen before the first poll', async () => {
    daemonAnsweringFromTheStart();
    draw();
    await flush();

    expect(screen.getByText(NEWEST)).toBeTruthy();
  });

  it('does not leave the view sitting on message 100 of 711', async () => {
    daemonAnsweringFromTheStart();
    draw();
    await flush();

    // The whole history is present, so the pin is on 711 and not on the last
    // message of the first page. Rendering "Round 3" is fine; rendering it as
    // the newest thing the app holds is the bug.
    const shown = screen.getAllByText(/^message \d+$|^Round 3/);
    expect(shown.length).toBe(LOG.length);
  });

  it('follows the pages in one open rather than one page per poll', async () => {
    daemonAnsweringFromTheStart();
    draw();
    await flush();

    // 711 messages is the first page plus seven more, then a short page that
    // ends it: eight requests, all before the first paint.
    expect(messages.mock.calls.length).toBe(8);
    expect(messages.mock.calls.every((c) => c[0] !== undefined)).toBe(true);
  });
});

describe('opening the chat against a daemon that answers with the tail', () => {
  it('shows the newest message', async () => {
    daemonAnsweringWithTheTail();
    draw();
    await flush();

    expect(screen.getByText(NEWEST)).toBeTruthy();
  });

  it('costs one page and one empty confirmation, not the whole history', async () => {
    daemonAnsweringWithTheTail();
    draw();
    await flush();

    expect(messages.mock.calls.length).toBe(2);
    expect(screen.queryByText('message 1')).toBeNull();
  });
});

describe('coming back after a long absence', () => {
  it('takes the whole backlog on the first poll instead of a page a tick', async () => {
    // Open on a short log, so the app holds only the first few messages...
    const short = LOG.slice(0, 5);
    messages.mockImplementation(async () => ({ messages: short }));
    draw();
    await flush();
    expect(screen.getByText('message 5')).toBeTruthy();

    // ...then 706 arrive while the phone is asleep, and the poll fires once.
    daemonAnsweringFromTheStart();
    await vi.advanceTimersByTimeAsync(3000);
    await flush();

    expect(screen.getByText(NEWEST)).toBeTruthy();
  });
});
