// The watcher that tells Casper the orchestrator has something for him while
// he is looking at Fleet, at another window, or at nothing at all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../src/lib/types';

const messages = vi.fn();
const notify = vi.fn();

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api');
  return { ...actual, chat: { messages: (...a: unknown[]) => messages(...a), state: vi.fn(), post: vi.fn() } };
});
vi.mock('../src/lib/notify', () => ({
  notify: (...a: unknown[]) => notify(...a),
  permission: vi.fn(),
  requestPermission: vi.fn(),
}));

const { checkOnce } = await import('../src/lib/chat-watch');
const { app } = await import('../src/lib/store.svelte');

let nextId = 0;
function msg(role: ChatMessage['role'], text: string, kind: ChatMessage['kind'] = 'text'): ChatMessage {
  nextId += 1;
  return { id: nextId, role, kind, text, pane_id: null, ts: '2026-09-08T09:00:00Z' };
}

/** The conversation as the daemon holds it, ascending by id. */
let log: ChatMessage[] = [];

function daemonServing(all: ChatMessage[]) {
  log = all;
  messages.mockImplementation(async (_s: unknown, opts: { after?: number; limit?: number } = {}) => {
    const cap = opts.limit ?? 100;
    if (opts.after !== undefined) return { messages: log.filter((m) => m.id > opts.after!).slice(0, cap) };
    return { messages: log.slice(-cap) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 0;
  app.tab = 'fleet';
  app.visible = true;
  app.chatSeenId = 0;
  app.chatUnreadCount = 0;
  app.settings = { ...app.settings, notify: true };
  notify.mockResolvedValue(true);
  daemonServing([msg('user', 'what is running?'), msg('orchestrator', 'four sessions')]);
});
afterEach(() => {
  app.toast = null;
});

describe('the first look of a session', () => {
  it('records where the conversation is without announcing the history', async () => {
    await checkOnce();

    expect(app.chatSeenId).toBe(2);
    expect(app.chatUnread).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('says nothing about an empty conversation either', async () => {
    daemonServing([]);
    await checkOnce();

    expect(app.chatUnread).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('a message arriving while Casper is on Fleet', () => {
  beforeEach(async () => {
    await checkOnce(); // seed
  });

  it('raises the tab dot and posts a notification', async () => {
    daemonServing([...log, msg('orchestrator', 'The daybias-v2 run is done.')]);
    await checkOnce();

    expect(app.chatUnread).toBe(true);
    expect(app.chatUnreadCount).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('Orcha');
    expect(notify.mock.calls[0][1]).toBe('The daybias-v2 run is done.');
  });

  it('shows it in the app as well, since he is looking at the app', async () => {
    daemonServing([...log, msg('orchestrator', 'The daybias-v2 run is done.')]);
    await checkOnce();

    expect(app.toast?.text).toContain('daybias-v2');
  });

  it('counts a burst rather than posting one notification each', async () => {
    daemonServing([
      ...log,
      msg('orchestrator', 'first'),
      msg('event', '✅ hook audit r3 (wA2:p1) finished', 'finished'),
      msg('orchestrator', 'and the last word'),
    ]);
    await checkOnce();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('Orcha · 3 new messages');
    expect(notify.mock.calls[0][1]).toBe('and the last word');
    expect(app.chatUnreadCount).toBe(3);
  });

  it('strips the leading glyph an event carries, since the body has no room', async () => {
    daemonServing([...log, msg('event', '⚠️ zpay token launch never started working', 'stalled')]);
    await checkOnce();

    expect(notify.mock.calls[0][1]).toBe('zpay token launch never started working');
  });

  it('does not announce his own messages, wherever he typed them', async () => {
    daemonServing([...log, msg('user', 'sent from Telegram')]);
    await checkOnce();

    expect(notify).not.toHaveBeenCalled();
    expect(app.chatUnread).toBe(false);
    // Still marked, so the same message is not weighed again every tick.
    expect(app.chatSeenId).toBe(3);
  });

  it('leaves an unread orchestrator message unread when he types from Telegram', async () => {
    daemonServing([...log, msg('orchestrator', 'the runner audit is clean')]);
    await checkOnce();
    expect(app.chatUnreadCount).toBe(1);

    daemonServing([...log, msg('user', 'thanks, and the app?')]);
    await checkOnce();

    // He has not read the answer; saying something elsewhere is not reading it.
    expect(app.chatUnreadCount).toBe(1);
    expect(app.chatSeenId).toBe(4);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('does not announce the daemon answering a slash command', async () => {
    daemonServing([...log, msg('system', 'muted until 18:00')]);
    await checkOnce();

    expect(notify).not.toHaveBeenCalled();
    expect(app.chatUnread).toBe(false);
  });
});

describe('the system notification is opt-in', () => {
  it('is not posted when the setting is off', async () => {
    app.settings = { ...app.settings, notify: false };
    await checkOnce();
    daemonServing([...log, msg('orchestrator', 'done')]);
    await checkOnce();

    expect(notify).not.toHaveBeenCalled();
  });

  it('but the tab dot is not, so the app still says so', async () => {
    app.settings = { ...app.settings, notify: false };
    await checkOnce();
    daemonServing([...log, msg('orchestrator', 'done')]);
    await checkOnce();

    expect(app.chatUnread).toBe(true);
  });
});

describe('while the chat is on screen', () => {
  it('says nothing, because he is already reading it', async () => {
    await checkOnce();
    app.tab = 'chat';
    daemonServing([...log, msg('orchestrator', 'done')]);
    await checkOnce();

    expect(notify).not.toHaveBeenCalled();
    expect(app.chatUnread).toBe(false);
  });

  it('but does watch a chat tab in a window nobody is looking at', async () => {
    await checkOnce();
    app.tab = 'chat';
    app.visible = false;
    daemonServing([...log, msg('orchestrator', 'done')]);
    await checkOnce();

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('and posts no toast to a screen nobody is looking at', async () => {
    await checkOnce();
    app.visible = false;
    daemonServing([...log, msg('orchestrator', 'done')]);
    await checkOnce();

    expect(app.toast).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('reading the chat', () => {
  it('clears the dot and moves the mark, so nothing is announced twice', async () => {
    await checkOnce();
    daemonServing([...log, msg('orchestrator', 'done')]);
    await checkOnce();
    expect(app.chatUnread).toBe(true);

    app.noteChatSeen(3);
    expect(app.chatUnread).toBe(false);

    await checkOnce();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('when the daemon cannot be reached', () => {
  it('stays quiet and leaves the mark alone for the next tick', async () => {
    await checkOnce();
    messages.mockRejectedValue(new Error('Network error'));

    await expect(checkOnce()).resolves.toBeUndefined();
    expect(app.chatSeenId).toBe(2);
    expect(app.chatUnread).toBe(false);
  });
});
