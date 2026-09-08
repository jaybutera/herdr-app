// Reading the orchestrator conversation, in the one place that knows how the
// daemon pages it. The Chat screen and the background watcher both go through
// here, so there is one answer to "what is the newest message" rather than two.

import { chat } from './api';
import type { Settings } from './settings';
import type { ChatMessage } from './types';

/** What one `/chat/messages` request answers with. The daemon caps it too. */
export const PAGE = 100;
/** MAX_IN_MEMORY on the daemon is 1000, so ten pages is the whole log. */
const MAX_PAGES = 12;

/**
 * Everything after `id`, however many pages that takes.
 *
 * A full page means there is more behind it. Following it here rather than
 * letting a 3 s poll take one page per tick is what stops a backlog from being
 * replayed through the view: the chat is pinned to the newest message it holds,
 * so a page per tick is a visible jump per tick until the backlog runs out.
 * Polling stops while the app is backgrounded, so the backlog on return is
 * routinely longer than one page.
 */
export async function messagesAfter(s: Settings, id: number): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  let cursor = id;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const r = await chat.messages(s, { after: cursor, limit: PAGE });
    const got = r.messages ?? [];
    out.push(...got);
    if (got.length < PAGE) break;
    cursor = got[got.length - 1].id;
  }
  return out;
}

/**
 * The tail of the conversation: the newest PAGE messages, ascending.
 *
 * An unbounded request means "the newest PAGE messages" (DESIGN 2.3), and a
 * daemon that answers with the oldest instead leaves the present unfetched.
 * That is exactly what the live one did, and it is why the chat opened 611
 * messages back and walked forward a page per poll. The daemon is fixed, but
 * the app is on a phone and the daemon is on the laptop, so they update on
 * their own schedules; following the pages to the end here means the newest
 * message is the newest message against either one.
 */
export async function newestMessages(s: Settings): Promise<ChatMessage[]> {
  const r = await chat.messages(s, { limit: PAGE });
  const first = r.messages ?? [];
  if (first.length < PAGE) return first;
  return [...first, ...(await messagesAfter(s, first[first.length - 1].id))];
}

/**
 * Messages the orchestrator has for Casper, as opposed to his own.
 *
 * Orchestrator replies and the watcher events (finished, stalled, session
 * ended) are what section 3.2 counts as unread. `user` messages are his own,
 * including the ones he sent from Telegram, and `system` messages are the
 * daemon answering a slash command he just typed; neither is news.
 */
export function forCasper(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.role === 'orchestrator' || m.role === 'event');
}
