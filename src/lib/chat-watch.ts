// Telling Casper the orchestrator said something while he was looking at
// something else.
//
// The app already polls the chat, but only on the Chat tab and only while the
// screen is visible, which is precisely when he does not need telling. This is
// the other half: a small poll that runs whenever the conversation is NOT in
// front of him, and that raises the tab dot, a toast, and a system
// notification when the orchestrator or one of the watchers has news.
//
// It deliberately keeps running while the page is hidden, against section 9's
// "all polling stops when the page is hidden". A notification that only fires
// while you are already looking at the app is not a notification. The cost is
// one request per tick: browsers throttle timers in a hidden tab to about one
// a minute anyway, and on Android the WebView is suspended when the app is
// backgrounded, so the phone pays nothing for it and is told on return instead.

import { app } from './store.svelte';
import { forCasper, messagesAfter, newestMessages } from './chat-feed';
import { notify } from './notify';
import { stripLeadingEmoji } from './format';
import type { ChatMessage } from './types';

/** As much of a message as a notification body should carry. */
const BODY_CHARS = 180;
/** A toast is read at a glance, so it gets less. */
const TOAST_CHARS = 70;

function clip(text: string, max: number): string {
  const t = stripLeadingEmoji(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** What the notification says. One message speaks for itself; several are
 *  counted, with the newest as the body. */
export function announcement(fresh: ChatMessage[]): { title: string; body: string } {
  const newest = fresh[fresh.length - 1];
  return {
    title: fresh.length === 1 ? 'Orcha' : `Orcha · ${fresh.length} new messages`,
    body: clip(newest.text, BODY_CHARS),
  };
}

/** True while the conversation is actually in front of him. */
function chatIsOnScreen(): boolean {
  return app.tab === 'chat' && app.visible;
}

/**
 * One tick. Exported so a test can drive it without an interval.
 *
 * Errors are swallowed: the daemon being unreachable is already reported by
 * the polls that own the screen, and a watcher that raised the offline strip
 * from the background would say it twice.
 */
export async function checkOnce(): Promise<void> {
  if (chatIsOnScreen()) return;
  try {
    // First look of the session: record where the conversation is, and say
    // nothing. Everything before this moment is history he has already had the
    // chance to read, not news.
    if (!app.chatSeenId) {
      const tail = await newestMessages(app.settings);
      if (tail.length) app.noteChatSeen(tail[tail.length - 1].id);
      return;
    }

    const arrived = await messagesAfter(app.settings, app.chatSeenId);
    if (!arrived.length) return;

    const fresh = forCasper(arrived);
    const newestId = arrived[arrived.length - 1].id;
    if (!fresh.length) {
      // His own messages, typed here or in Telegram, or the daemon answering a
      // slash command. Nothing to announce, but the mark still moves so they
      // are not weighed again every tick. A count of zero rather than
      // `noteChatSeen`, because an orchestrator message he has not read yet is
      // still unread after he says something from Telegram.
      app.noteChatArrivals(newestId, 0);
      return;
    }

    app.noteChatArrivals(newestId, fresh.length);

    const { title, body } = announcement(fresh);
    // A toast is only worth showing to someone who is looking at the app; when
    // he is not, the system notification is the one that will still be there.
    if (app.visible) app.showToast(clip(body, TOAST_CHARS));
    // The system notification is opt-in; the dot and the toast are not.
    if (app.settings.notify) void notify(title, body, () => app.setTab('chat'));
  } catch {
    // Offline, or the daemon is down. The next tick tries again.
  }
}

/**
 * Start watching. Returns the stop function, for App's onMount teardown.
 *
 * The cadence is the projects interval rather than the chat one: this is a
 * background watch, not a live view, and 15 s late on a notification is not
 * something anyone can feel.
 */
export function startChatWatch(): () => void {
  void checkOnce();
  const timer = setInterval(() => void checkOnce(), app.intervals.projects);
  return () => clearInterval(timer);
}
