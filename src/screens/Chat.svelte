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
  /** The growing element. Watched directly: the scroller's own box never
   *  changes size, only its content does. */
  let content: HTMLDivElement | undefined = $state();
  /** True while the view is pinned to the newest message. Set false only by a
   *  real user scroll away from the bottom. */
  let atBottom = true;
  /** Suppresses onScroll bookkeeping while we are the ones moving the scroller,
   *  so a programmatic jump is never mistaken for the user scrolling up. */
  let selfScrolling = false;
  /** Hidden until the first pin lands, so the catch-up is never on screen. */
  let ready = $state(false);
  /** Shown when the user has scrolled up and new messages are below. */
  let showJump = $state(false);
  /** Highest id present at first paint. History mounts flat; only messages that
   *  arrive after this animate in, so the scroller never grows under the pin. */
  let historyMark = $state(0);

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
      historyMark = messages.length ? messages[messages.length - 1].id : 0;
      if (st) chatState = st;
      error = null;
      app.noteSuccess();
      await pinToBottom();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Request failed';
      app.noteFailure();
    } finally {
      loading = false;
      // `ready` is set by scheduleReveal once the height holds still. On the
      // error path there is no pin to wait for, so reveal the banner directly.
      if (error) ready = true;
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
        if (atBottom) scrollToBottom();
        else showJump = true;
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
    atBottom = true;
    showJump = false;
    await tick();
    scrollToBottom();
    try {
      await chat.post(app.settings, text);
      queued = queued.filter((q) => q.text !== text);
      await poll();
    } catch {
      app.showToast('Offline · queued', 'alert');
    }
  }

  /**
   * Jump to the newest message. Always instant: `behavior: 'smooth'` here was
   * what made a full history animate past the reader one poll at a time.
   */
  function scrollToBottom() {
    if (!scroller) return;
    selfScrolling = true;
    scroller.scrollTop = scroller.scrollHeight;
    // Cleared after the scroll event this assignment queues has been dispatched.
    requestAnimationFrame(() => {
      selfScrolling = false;
    });
  }

  /**
   * Pin to the bottom and stay there.
   *
   * The previous version guessed: it re-pinned for a fixed twelve frames and
   * stopped as soon as two of them measured the same `scrollHeight`. On a long
   * history that budget expires while the view is still growing, and a brief
   * plateau mid-layout ends it even sooner. Everything that landed afterwards
   * (the web fonts swapping in, `TypingDots` appearing once `/chat/state` says
   * the orchestrator is busy, the next poll's messages) grew the scroller with
   * nothing left watching it, which is what walked the view back into history
   * in stages.
   *
   * `keepPinned` instead watches the content box for the life of the screen, so
   * there is no budget to run out: while `atBottom` holds, any growth is
   * answered on the frame it happens.
   */
  function scheduleReveal() {
    // Reveal only once the scroller has held still for two consecutive frames,
    // so the first painted frame is already at the newest message.
    let stable = 0;
    let last = -1;
    const step = () => {
      if (!scroller) return;
      scrollToBottom();
      const h = scroller.scrollHeight;
      stable = h === last ? stable + 1 : 0;
      last = h;
      if (stable >= 2) {
        ready = true;
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Never leave the chat invisible because the height never settles.
    setTimeout(() => {
      if (!ready) {
        scrollToBottom();
        ready = true;
      }
    }, 600);
  }

  async function pinToBottom() {
    await tick();
    atBottom = true;
    showJump = false;
    scrollToBottom();
    scheduleReveal();
    // Fonts land after their own swap; the observer catches the reflow, but ask
    // for the pin explicitly in case the swap changes nothing else.
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) {
      fonts.ready
        .then(() => {
          if (atBottom) scrollToBottom();
        })
        .catch(() => {
          // Nothing to do; the observer is still watching.
        });
    }
  }

  /**
   * Re-pin on every content growth while the user has not scrolled away. This
   * is what makes the fix hold for late arrivals rather than only at mount.
   */
  function keepPinned(el: HTMLDivElement) {
    if (typeof ResizeObserver === 'undefined') return () => {};
    const ro = new ResizeObserver(() => {
      if (atBottom) scrollToBottom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }

  function onScroll() {
    if (!scroller || selfScrolling) return;
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    atBottom = gap < 24;
    // Matches TaskDetail: the pin releases only once the user is clearly up.
    if (gap > 80) showJump = true;
    else if (atBottom) showJump = false;
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
    const stopPin = content ? keepPinned(content) : () => {};
    const timer = setInterval(() => {
      if (app.visible && app.tab === 'chat') void poll();
    }, app.intervals.chat);
    return () => {
      clearInterval(timer);
      stopPin();
    };
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
  <div class="scrollwrap">
    <div class="scroll" class:ready bind:this={scroller} onscroll={onScroll}>
      <div class="content" bind:this={content}>
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
            <div class="row" class:fresh={m.id > historyMark}>
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
            </div>
          {/each}
          {#each queued as q (q.at)}
            <ChatBubble role="user" text={q.text} pending queued onPane={onOpenPane} />
          {/each}
        {/if}

        {#if typing}
          <TypingDots />
        {/if}
      </div>
    </div>

    {#if showJump}
      <button
        class="jump"
        onclick={() => {
          atBottom = true;
          showJump = false;
          scrollToBottom();
        }}>⌄ latest</button
      >
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
  /* Containing block for the jump button, so it sits just above the composer
     without a hardcoded offset. */
  .scrollwrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px var(--pad-screen);
    /* Held blank for the frame or two the pin takes, so the reader never sees
       the view settle onto the newest message. */
    opacity: 0;
  }
  .scroll.ready {
    opacity: 1;
    transition: opacity var(--d-fast) var(--ease-out);
  }
  /* The whole history mounts at once on open. Animating each bubble in made the
     scroller grow under the pin, which is what left the view back in history.
     History lands flat; only messages that arrive later animate. */
  .row :global(.wrap),
  .row :global(.card) {
    animation: none;
  }
  .row.fresh :global(.wrap),
  .row.fresh :global(.card) {
    animation: block-in var(--d-base) var(--ease-out);
  }
  .jump {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: 12px;
    z-index: 2;
    padding: 8px 14px;
    border-radius: var(--r-chip);
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--t-primary);
    font-size: 13px;
    animation: block-in var(--d-base) var(--ease-out);
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
