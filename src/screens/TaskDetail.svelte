<script lang="ts">
  // Section 5.3. One screen, two modes: running tasks with a session_ref get the
  // live view, everything else gets history.
  import Header from '../components/Header.svelte';
  import LiveStatusLine from '../components/LiveStatusLine.svelte';
  import SegmentedFilter from '../components/SegmentedFilter.svelte';
  import MessageBlock from '../components/MessageBlock.svelte';
  import UserBlock from '../components/UserBlock.svelte';
  import ToolLine from '../components/ToolLine.svelte';
  import DialogCard from '../components/DialogCard.svelte';
  import SpinnerLine from '../components/SpinnerLine.svelte';
  import TerminalView from '../components/TerminalView.svelte';
  import Composer from '../components/Composer.svelte';
  import QuickKeys from '../components/QuickKeys.svelte';
  import SectionLabel from '../components/SectionLabel.svelte';
  import ErrorBanner from '../components/ErrorBanner.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import StatusDot from '../components/StatusDot.svelte';
  import TimeDivider from '../components/TimeDivider.svelte';
  import ActionSheet from '../components/ActionSheet.svelte';
  import { app } from '../lib/store.svelte';
  import { ApiError, bridge, projtrack } from '../lib/api';
  import { parsePane, type Block } from '../lib/pane-parse';
  import { clockTime, dayKey, dayLabel, relativeTime, statusSpec } from '../lib/format';
  import type { AgentStatus, TaskDetail } from '../lib/types';
  import { onMount, tick } from 'svelte';

  let {
    taskId,
    onBack,
    onComposerFocus,
  }: { taskId: number; onBack: () => void; onComposerFocus?: (focused: boolean) => void } = $props();

  let task = $state<TaskDetail | null>(null);
  let loadingTask = $state(true);
  let taskError = $state<string | null>(null);

  // Live mode state.
  let paneText = $state('');
  let paneStatus = $state<AgentStatus>('unknown');
  let paneLabel = $state<string | undefined>(undefined);
  let paneGone = $state(false);
  let paneError = $state<string | null>(null);
  let paneFailures = 0;
  let firstRead = $state(true);
  let view = $state<'messages' | 'terminal'>('messages');
  /** Set when a finished task's session is still alive and the user opened it. */
  let forceLive = $state(false);
  let sessionAlive = $state(false);
  let menuOpen = $state(false);

  /** Locally echoed sends, shown at 60% until the pane read contains them or 5s
   *  pass, whichever comes first (section 5.3a). */
  let pending = $state<{ text: string; at: number }[]>([]);

  let scroller: HTMLDivElement | undefined = $state();
  let atBottom = $state(true);
  let showJump = $state(false);

  const isLive = $derived(
    !!task && !!task.session_ref && (task.status === 'running' || forceLive) && !paneGone
  );
  const blocks = $derived<Block[]>(paneText ? parsePane(paneText) : []);

  const visiblePending = $derived(
    pending.filter((p) => Date.now() - p.at < 5000 || !paneText.includes(p.text.slice(0, 40)))
  );

  async function loadTask() {
    try {
      task = await projtrack.task(app.settings, taskId);
      taskError = null;
      app.noteSuccess();
    } catch (e) {
      taskError = e instanceof Error ? e.message : 'Request failed';
      app.noteFailure();
    } finally {
      loadingTask = false;
    }
  }

  async function readPane() {
    const paneId = task?.session_ref;
    if (!paneId) return;
    try {
      const r = await bridge.read(app.settings, paneId);
      // Re-render only when the text actually changed (section 5.3a).
      if (r.text !== paneText) {
        paneText = r.text;
        await tick();
        if (atBottom) scrollToBottom(true);
      }
      paneStatus = r.agent_status;
      paneGone = false;
      paneError = null;
      paneFailures = 0;
      app.noteSuccess();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        paneGone = true;
        paneError = null;
        return;
      }
      paneFailures += 1;
      // Three failures in a row raise the banner; the last transcript stays on
      // screen either way, and is never cleared (section 9).
      if (paneFailures >= 3) paneError = e instanceof Error ? e.message : 'Request failed';
      app.noteFailure();
    } finally {
      firstRead = false;
    }
  }

  /** A finished task whose pane is still alive gets an "Open session" button. */
  async function checkSession() {
    if (!task?.session_ref || task.status === 'running') return;
    try {
      const p = await bridge.pane(app.settings, task.session_ref);
      sessionAlive = true;
      paneLabel = p.label;
    } catch {
      sessionAlive = false;
    }
  }

  function scrollToBottom(smooth = false) {
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function onScroll() {
    if (!scroller) return;
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    atBottom = gap < 24;
    // Autoscroll stops once the user is more than 80px up (section 5.3a).
    showJump = gap > 80;
  }

  async function sendText(text: string) {
    const paneId = task?.session_ref;
    if (!paneId) return;
    pending = [...pending, { text, at: Date.now() }];
    try {
      await bridge.send(app.settings, paneId, text);
      app.showToast('Sent');
      await readPane();
    } catch (e) {
      pending = pending.filter((p) => p.text !== text);
      app.showToast(e instanceof Error ? e.message : 'Send failed', 'alert');
    }
  }

  async function sendKey(key: string) {
    const paneId = task?.session_ref;
    if (!paneId) return;
    try {
      await bridge.keys(app.settings, paneId, [key]);
      app.showToast('Sent');
      setTimeout(() => void readPane(), 250);
    } catch (e) {
      app.showToast(e instanceof Error ? e.message : 'Send failed', 'alert');
    }
  }

  async function sendDigit(digit: string) {
    const paneId = task?.session_ref;
    if (!paneId) return;
    try {
      await bridge.text(app.settings, paneId, digit);
      setTimeout(() => void readPane(), 250);
    } catch (e) {
      app.showToast(e instanceof Error ? e.message : 'Send failed', 'alert');
    }
  }

  async function addNote(note: string) {
    try {
      await projtrack.addNote(app.settings, taskId, note);
      app.showToast('Note added');
      await loadTask();
    } catch (e) {
      app.showToast(e instanceof Error ? e.message : 'Could not add note', 'alert');
    }
  }

  async function abandon() {
    try {
      await projtrack.setTaskStatus(app.settings, taskId, 'abandoned');
      app.showToast('Marked abandoned');
      await loadTask();
    } catch (e) {
      app.showToast(e instanceof Error ? e.message : 'Could not update', 'alert');
    }
  }

  onMount(() => {
    void loadTask().then(() => {
      void checkSession();
      if (task?.status === 'running' && task.session_ref) void readPane();
    });
    const paneTimer = setInterval(() => {
      if (app.visible && isLive) void readPane();
    }, app.intervals.pane);
    const taskTimer = setInterval(() => {
      if (app.visible) void loadTask();
    }, 15_000);
    return () => {
      clearInterval(paneTimer);
      clearInterval(taskTimer);
    };
  });

  let wasVisible = true;
  $effect(() => {
    const now = app.visible;
    if (now && !wasVisible && isLive) void readPane();
    wasVisible = now;
  });

  // Opening the live view of a still-alive finished session starts its poll.
  $effect(() => {
    if (forceLive && !paneText) void readPane();
  });

  /** History events grouped with a divider whenever the day changes. */
  const events = $derived(task?.events ?? []);
</script>

<Header title={task?.title ?? ''} onBack={onBack} compact onMore={task ? () => (menuOpen = true) : undefined}>
  {#snippet subtitle()}
    {#if task}
      {#if isLive}
        <LiveStatusLine
          agentStatus={paneGone ? 'gone' : paneStatus}
          paneId={task.session_ref}
          label={paneLabel}
        />
      {:else}
        <div class="hist-status">
          <StatusDot domain="task" value={task.status} size={9} />
          <span class="t-meta">
            {statusSpec('task', task.status).label} · {relativeTime(task.updated_at)}
          </span>
        </div>
      {/if}
    {/if}
  {/snippet}
</Header>

{#if paneGone}
  <div class="pad"><ErrorBanner text="Pane gone" /></div>
{/if}

{#if isLive}
  <div class="pad toggle">
    <SegmentedFilter
      options={[
        { value: 'messages', label: 'Messages' },
        { value: 'terminal', label: 'Terminal' },
      ]}
      value={view}
      onChange={(v) => (view = v)}
    />
  </div>

  <div class="scroll" bind:this={scroller} onscroll={onScroll}>
    {#if firstRead && !paneText}
      <p class="t-meta center">Reading pane…</p>
    {:else if view === 'terminal'}
      <TerminalView text={paneText} />
    {:else}
      {#each blocks as b, i (i)}
        {#if b.kind === 'message'}
          <MessageBlock text={b.text} />
        {:else if b.kind === 'tool'}
          <ToolLine head={b.head} result={b.result} />
        {:else if b.kind === 'user'}
          <UserBlock text={b.text} />
        {:else if b.kind === 'dialog'}
          <DialogCard lines={b.lines} />
        {:else if b.kind === 'spinner'}
          <SpinnerLine word={b.word} elapsed={b.elapsed} />
        {/if}
      {/each}
      {#each visiblePending as p (p.at)}
        <UserBlock text={p.text} pending />
      {/each}
    {/if}
  </div>

  {#if showJump}
    <button class="jump" onclick={() => { scrollToBottom(true); showJump = false; atBottom = true; }}>
      ⌄ latest
    </button>
  {/if}

  <div class="foot">
    {#if paneError}
      <ErrorBanner
        text="Can't reach the pane bridge{paneError ? ` — ${paneError}` : ''}"
        onRetry={() => void readPane()}
      />
    {/if}
    <Composer
      placeholder="Message this session…"
      disabled={paneGone}
      onSend={sendText}
      onFocusChange={onComposerFocus}
    />
    <QuickKeys
      onKey={sendKey}
      onText={sendDigit}
      disabled={paneGone}
      alertDigits={paneStatus === 'blocked'}
    />
  </div>
{:else}
  <!-- 5.3b history mode -->
  <div class="scroll">
    {#if taskError}
      <ErrorBanner text="Can't reach projtrack{taskError ? ` — ${taskError}` : ''}" onRetry={loadTask} />
    {/if}

    {#if loadingTask && !task}
      <p class="t-meta center">Loading…</p>
    {:else if task}
      {#if sessionAlive && !forceLive}
        <button class="open-session" onclick={() => (forceLive = true)}>Open session</button>
      {/if}

      {#if task.result_summary?.trim()}
        <SectionLabel text="Result" />
        <div class="result t-body selectable">{task.result_summary}</div>
      {/if}

      {#if events.length}
        <SectionLabel text="History" />
        {#each events as ev, i (ev.id)}
          {#if i === 0 || dayKey(ev.created_at) !== dayKey(events[i - 1].created_at)}
            <TimeDivider label={dayLabel(ev.created_at)} />
          {/if}
          <div class="event">
            <span class="mono time">{clockTime(ev.created_at)}</span>
            <span class="t-body note selectable">{ev.note}</span>
          </div>
        {/each}
      {:else if !task.result_summary?.trim()}
        <EmptyState text="Nothing recorded for this task yet" />
      {/if}
    {/if}
  </div>

  <div class="foot">
    <Composer placeholder="Add a note…" onSend={addNote} onFocusChange={onComposerFocus} />
  </div>
{/if}

<ActionSheet
  open={menuOpen}
  title={task?.title ?? ''}
  onClose={() => (menuOpen = false)}
  actions={[
    {
      label: 'Abandon task',
      destructive: true,
      disabled: !task || ['done', 'abandoned'].includes(task.status),
      onSelect: abandon,
    },
  ]}
/>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px var(--pad-screen) 12px;
  }
  .pad {
    padding: 0 var(--pad-screen);
  }
  .toggle {
    padding-top: 8px;
    padding-bottom: 4px;
  }
  .foot {
    flex: none;
    padding: 4px var(--pad-screen) calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--hairline);
    background: var(--bg);
  }
  .center {
    text-align: center;
    padding: 32px 0;
  }
  .hist-status {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .jump {
    position: absolute;
    right: var(--pad-screen);
    bottom: 132px;
    z-index: 5;
    padding: 8px 14px;
    border-radius: var(--r-chip);
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--t-primary);
    font-size: 13px;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .result {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    padding: 14px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .event {
    display: flex;
    gap: 12px;
    padding: 8px 0;
    align-items: baseline;
  }
  .time {
    color: var(--t-secondary);
    flex: none;
  }
  .note {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .open-session {
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    padding: 10px 0;
    min-height: 44px;
  }
</style>
