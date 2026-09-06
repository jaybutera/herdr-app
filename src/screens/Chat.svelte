<script lang="ts">
  // Section 5.4. The same conversation the Telegram bot holds.
  import Header from '../components/Header.svelte';
  import ChatBubble from '../components/ChatBubble.svelte';
  import EventCard from '../components/EventCard.svelte';
  import TypingDots from '../components/TypingDots.svelte';
  import SlashChips from '../components/SlashChips.svelte';
  import Composer from '../components/Composer.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorBanner from '../components/ErrorBanner.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import TimeDivider from '../components/TimeDivider.svelte';
  import StatusDot from '../components/StatusDot.svelte';
  import { app } from '../lib/store.svelte';
  import { chat } from '../lib/api';
  import { clockTime, stripLeadingEmoji } from '../lib/format';
  import type { ChatMessage, ChatState } from '../lib/types';
  import { onMount, tick } from 'svelte';

  let { onOpenPane }: { onOpenPane: (paneId: string) => void } = $props();

  let messages = $state<ChatMessage[]>([]);
  let chatState = $state<ChatState | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  /** Sends that have not been accepted yet; retried on reconnect (5.4). */
  let queued = $state<{ text: string; at: number }[]>([]);
  let lastSentAt = $state(0);

  let scroller: HTMLDivElement | undefined = $state();
  let atBottom = true;

  const lastId = $derived(messages.length ? messages[messages.length - 1].id : 0);
  // TypingDots show while busy, or within 20s of sending, whichever is longer.
  const typing = $derived(
    (chatState?.busy ?? false) || Date.now() - lastSentAt < 20_000
  );
  const agents = $derived(chatState?.agents ?? []);
  const workingCount = $derived(agents.filter((a) => a.agent_status === 'working').length);
  const blockedCount = $derived(agents.filter((a) => a.agent_status === 'blocked').length);

  async function loadInitial() {
    try {
      const [msgs, st] = await Promise.all([
        chat.messages(app.settings, { limit: 100 }),
        chat.state(app.settings).catch(() => null),
      ]);
      messages = msgs.messages ?? [];
      if (st) chatState = st;
      error = null;
      app.noteSuccess();
      await tick();
      scrollToBottom();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Request failed';
      app.noteFailure();
    } finally {
      loading = false;
    }
  }

  async function poll() {
    try {
      const [msgs, st] = await Promise.all([
        chat.messages(app.settings, { after: lastId }),
        chat.state(app.settings).catch(() => null),
      ]);
      const fresh = msgs.messages ?? [];
      if (fresh.length) {
        messages = [...messages, ...fresh];
        // Anything the daemon accepted clears the matching local echo.
        queued = queued.filter((q) => !fresh.some((m) => m.role === 'user' && m.text === q.text));
        await tick();
        if (atBottom) scrollToBottom(true);
      }
      if (st) chatState = st;
      error = null;
      app.noteSuccess();
      void flushQueue();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Request failed';
      app.noteFailure();
    }
  }

  async function flushQueue() {
    if (!queued.length) return;
    const item = queued[0];
    try {
      await chat.post(app.settings, item.text);
      queued = queued.slice(1);
      await poll();
    } catch {
      // Stays queued; the next successful poll retries it.
    }
  }

  async function sendMessage(text: string) {
    lastSentAt = Date.now();
    queued = [...queued, { text, at: Date.now() }];
    await tick();
    scrollToBottom(true);
    try {
      await chat.post(app.settings, text);
      queued = queued.filter((q) => q.text !== text);
      await poll();
    } catch {
      app.showToast('Offline · queued', 'alert');
    }
  }

  function scrollToBottom(smooth = false) {
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function onScroll() {
    if (!scroller) return;
    atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
  }

  /** A divider whenever more than 10 minutes pass between messages. */
  function needsDivider(i: number): boolean {
    if (i === 0) return false;
    const a = Date.parse(messages[i - 1].ts);
    const b = Date.parse(messages[i].ts);
    return Number.isFinite(a) && Number.isFinite(b) && b - a > 10 * 60 * 1000;
  }

  onMount(() => {
    void loadInitial();
    const timer = setInterval(() => {
      if (app.visible && app.tab === 'chat') void poll();
    }, app.intervals.chat);
    return () => clearInterval(timer);
  });

  let wasVisible = true;
  $effect(() => {
    const now = app.visible;
    if (now && !wasVisible) void poll();
    wasVisible = now;
  });
</script>

<Header title="Orchestrator" onGear={() => (app.settingsOpen = true)}>
  {#snippet subtitle()}
    <div class="status">
      <StatusDot domain="pane" value={chatState?.busy ? 'working' : 'idle'} size={9} />
      <span class="t-meta">
        {chatState?.busy ? 'working' : 'idle'}
        {#if workingCount}· {workingCount} working{/if}
        {#if blockedCount}· {blockedCount} needs you{/if}
        {#if chatState?.muted}· muted{/if}
      </span>
    </div>
  {/snippet}
</Header>

<div class="col">
  <div class="scroll" bind:this={scroller} onscroll={onScroll}>
    {#if error}
      <ErrorBanner
        text="Can't reach the orchestrator{error ? ` — ${error}` : ''}"
        onRetry={() => void loadInitial()}
      />
    {/if}

    {#if loading && !messages.length}
      <Skeleton shape="bubble" />
      <Skeleton shape="bubble" />
      <Skeleton shape="bubble" />
    {:else if !messages.length && !queued.length}
      <EmptyState text="Ask what the fleet is doing" />
    {:else}
      {#each messages as m, i (m.id)}
        {#if needsDivider(i)}
          <TimeDivider label={clockTime(m.ts)} />
        {/if}
        {#if m.role === 'event'}
          <EventCard
            kind={m.kind}
            text={stripLeadingEmoji(m.text)}
            paneId={m.pane_id}
            onPane={onOpenPane}
          />
        {:else}
          <ChatBubble
            role={m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'orchestrator'}
            text={m.role === 'user' ? m.text : stripLeadingEmoji(m.text)}
            onPane={onOpenPane}
          />
        {/if}
      {/each}
      {#each queued as q (q.at)}
        <ChatBubble role="user" text={q.text} pending queued onPane={onOpenPane} />
      {/each}
    {/if}

    {#if typing}
      <TypingDots />
    {/if}
  </div>

  <div class="foot">
    <Composer
      placeholder="Message the orchestrator…"
      onSend={sendMessage}
      multiline={typeof window !== 'undefined' && window.innerWidth >= 900}
    />
    <SlashChips muted={chatState?.muted ?? false} onSend={(t) => void sendMessage(t)} />
  </div>
</div>

<style>
  .col {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px var(--pad-screen);
  }
  .foot {
    flex: none;
    padding: 4px var(--pad-screen) 8px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
