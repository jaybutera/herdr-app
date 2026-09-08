<script lang="ts">
  import StatusDot from './StatusDot.svelte';
  import RunSpinner from './RunSpinner.svelte';
  import { liveCountsLine, statusSpec } from '../lib/format';
  import { dormancy, DEFAULT_DORMANT_AFTER_HOURS } from '../lib/dormancy';
  import { app } from '../lib/store.svelte';
  import { isSettled, liveCounts, liveTaskStatus } from '../lib/live';
  import { isRemote, machineForRef } from '../lib/pane-id';
  import type { SummaryProject, Task } from '../lib/types';

  let {
    project,
    selected = false,
    dormantAfterHours = DEFAULT_DORMANT_AFTER_HOURS,
    onOpen,
    onLongPress,
  }: {
    project: SummaryProject;
    selected?: boolean;
    /** The window projtrack reported, so the countdown matches the server. */
    dormantAfterHours?: number;
    onOpen: () => void;
    onLongPress: () => void;
  } = $props();


  let timer: ReturnType<typeof setTimeout> | null = null;
  let longFired = false;
  /** Click-to-expand: the tasks that are not running are hidden until asked for. */
  let expanded = $state(false);
  /** Ties the expander to the region it reveals; a card per project, so the id
   *  has to be per project too. */
  const restId = $derived(`project-${project.id}-rest`);

  function down() {
    longFired = false;
    timer = setTimeout(() => {
      longFired = true;
      onLongPress();
    }, 500);
  }
  function up() {
    if (timer) clearTimeout(timer);
    timer = null;
  }
  function click() {
    if (!longFired) onOpen();
  }
  function contextmenu(e: Event) {
    e.preventDefault();
    if (timer) clearTimeout(timer);
    longFired = true;
    onLongPress();
  }

  function line(t: Task) {
    const live = liveTaskStatus(t, app.paneIndex, app.panesKnown, app.machineNames);
    const machine = machineForRef(t.session_ref, app.machineNames);
    return { task: t, live, settled: isSettled(live), machine, remote: isRemote(machine) };
  }

  /**
   * True when nothing has confirmed any of this, because no pane list has landed.
   *
   * The rows still show: with the bridge down, dropping every running task would
   * be the same false claim the live layer exists to prevent. What is dropped is
   * the assertion. A turning arc says an agent is mid-turn right now, and with
   * the bridge unreachable that is the ledger talking; every one of the tasks it
   * lists as running would turn, at whatever age. Still, unlabelled, they carry
   * only what the ledger actually knows.
   */
  const unconfirmed = $derived(!app.panesKnown);

  /**
   * Every task the summary lists for this project, each carrying its own live
   * status. The card splits them rather than slicing the ledger's running list:
   * "running" here means the pane says the agent is working, which is the only
   * thing the spinner may be shown for.
   */
  const lines = $derived(
    [...(project.running_tasks ?? []), ...(project.open_tasks ?? [])]
      // A task can appear in both lists; the running copy is the one to keep.
      .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i)
      .map(line)
  );

  /** Shown on the collapsed card: only agents that are actually working. */
  const running = $derived(lines.filter((l) => l.live === 'running'));
  /**
   * Also shown on the collapsed card: agents that have stopped and are waiting
   * on an answer.
   *
   * A blocked pane is the one state that cannot resolve itself. Hiding it behind
   * the expander made the list quietest about the only task that needs Casper
   * now; the counts line said "1 needs review", which is the same phrase a
   * stalled task earns. It gets the alert glyph and its own label instead, so it
   * is never read as a slower kind of running.
   */
  const blocked = $derived(lines.filter((l) => l.live === 'blocked'));
  /** Everything else, behind the expander. */
  const rest = $derived(lines.filter((l) => l.live !== 'running' && l.live !== 'blocked'));
  /**
   * What the card says about this project going quiet, if anything.
   *
   * Dormant is no longer only a status somebody chose, so a card that just
   * showed the word left the user to guess whether they had marked it or the
   * clock had. The note says which: when it last had activity if it is already
   * dormant, how long it has left if it is close.
   *
   * Recomputed from the clock on every render, like every other relative time
   * in the app; the 15 s summary poll is what brings the card round again.
   *
   * Suppressed while a pane on this project is actually doing something. A
   * card reading "1 running · Quiet since 12 min ago" contradicts itself, and
   * the panes are the better witness: the ledger says when a row was last
   * written, they say what is happening now. This is reachable whenever a
   * project is marked dormant by hand with an agent still mid-run on it.
   */
  const quiet = $derived(
    running.length > 0 || blocked.length > 0
      ? { hoursLeft: 0, soon: false, note: '' }
      : dormancy(project, dormantAfterHours, Date.now())
  );

  const counts = $derived(
    liveCounts(
      project.task_counts,
      project.running_tasks ?? [],
      app.paneIndex,
      app.panesKnown,
      app.machineNames
    )
  );
</script>

<div
  class="wrap"
  class:selected
  class:dead={project.status === 'dead'}
  class:dormant={project.status === 'dormant'}
>
  <button
    class="card"
    class:running={running.length > 0 && !unconfirmed}
    class:blocked={blocked.length > 0}
    onclick={click}
    onpointerdown={down}
    onpointerup={up}
    onpointerleave={up}
    oncontextmenu={contextmenu}
  >
    <span class="head">
      <StatusDot domain="project" value={project.status} size={10} pulse={false} />
      <span class="t-heading name" style="view-transition-name: project-{project.id}">
        {project.name}
      </span>
      {#if running.length > 0}
        <!-- The card-level mark: a project with work in flight is picked out of
             the list without reading its counts line. -->
        <RunSpinner
          size={12}
          spin={!unconfirmed}
          title={unconfirmed
            ? `${running.length} listed as running`
            : `${running.length} running`}
        />
      {/if}
      {#if blocked.length > 0}
        <!-- A second, louder mark. The arc turns for work in flight; this one
             does not move, because nothing is moving until Casper answers. -->
        <span data-testid="blocked-mark">
          <StatusDot domain="live" value="blocked" size={12} />
        </span>
      {/if}
    </span>
    <span class="t-meta counts">
      {liveCountsLine(counts)}
      {#if quiet.note}
        <span class="quiet" class:soon={quiet.soon} data-testid="dormancy-note">
          · {quiet.note}
        </span>
      {/if}
    </span>

    <!-- Collapsed, a card lists what is running and what is waiting on an
         answer. Everything else is behind the expander. -->
    {#each blocked as l (l.task.id)}
      <span class="run" data-testid="blocked-task">
        <StatusDot domain="live" value="blocked" size={11} />
        <span class="t-meta title">{l.task.title}</span>
        <span class="t-meta flag alert">{statusSpec('live', 'blocked').label}</span>
        {#if l.remote}<span class="t-meta machine mono">{l.machine}</span>{/if}
      </span>
    {/each}
    {#each running as l (l.task.id)}
      <span class="run" data-testid="running-task">
        <RunSpinner
          size={11}
          spin={!unconfirmed}
          title={unconfirmed ? 'Listed as running' : 'Working'}
        />
        <span class="t-meta title">{l.task.title}</span>
        {#if l.remote}<span class="t-meta machine mono">{l.machine}</span>{/if}
      </span>
    {/each}
  </button>

  {#if rest.length > 0}
    <button
      class="expander"
      aria-expanded={expanded}
      aria-controls={expanded ? restId : undefined}
      onclick={() => (expanded = !expanded)}
    >
      <span class="chev" class:open={expanded}>▸</span>
      <span class="t-meta">
        {expanded ? 'Hide' : `${rest.length} other task${rest.length === 1 ? '' : 's'}`}
      </span>
    </button>
  {/if}

  {#if expanded}
    <div class="rest" id={restId}>
      {#each rest as l (l.task.id)}
        <span class="run other" data-testid="other-task">
          <StatusDot domain="live" value={l.live} size={8} />
          <span class="t-meta title">{l.task.title}</span>
          {#if l.settled}
            <span class="t-meta flag">{statusSpec('live', l.live).label}</span>
          {/if}
          {#if l.remote}<span class="t-meta machine mono">{l.machine}</span>{/if}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    margin-bottom: 12px;
    overflow: hidden;
    transition:
      background var(--d-fast) var(--ease-out),
      border-color var(--d-base) var(--ease-out),
      opacity var(--d-base) var(--ease-out);
  }
  .wrap.selected {
    background: var(--surface-2);
    border-color: color-mix(in srgb, var(--accent) 40%, var(--hairline));
  }
  .card {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    padding: 14px;
    transition: transform var(--d-base) var(--ease-spring);
  }
  .card:active {
    transform: scale(0.98);
    transition-duration: var(--d-fast);
  }
  /* A project with a working agent carries a live edge, so the running ones
     read as a group before any row is read individually. Excluding .blocked
     rather than leaning on source order: both selectors have the same
     specificity, so which one won was decided by which came second in the file,
     and reordering the block would have silently turned the edge green on a card
     with an agent waiting for an answer. */
  .card.running:not(.blocked) {
    border-left: 2px solid var(--c-live);
  }
  /* A blocked agent is waiting on an answer, which outranks work in flight:
     the edge is alert-red even on a card that also has something running. */
  .card.blocked {
    border-left: 2px solid var(--c-alert);
  }
  .dormant {
    opacity: 0.8;
  }
  /* The clock's own voice: why this project is dormant, or that it is about
     to be. Tertiary, because it explains the status rather than being it. */
  .quiet {
    color: var(--t-tertiary);
  }
  /* A project still active but running out of window. Not an alert: nothing is
     wrong, and the countdown stops the moment anybody touches it. */
  .quiet.soon {
    color: var(--c-muted);
  }
  .dead {
    opacity: 0.55;
  }
  .dead .name {
    text-decoration: line-through;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .counts {
    display: block;
    margin-top: 4px;
  }
  .run {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }
  .run .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t-primary);
  }
  .flag {
    flex: none;
    color: var(--c-done);
  }
  /* "Needs you" is not a result, so it does not get the done colour. */
  .flag.alert {
    color: var(--c-alert);
  }
  .machine {
    flex: none;
    padding: 0 5px;
    border-radius: var(--r-chip);
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--t-secondary);
    font-size: 0.9em;
  }
  .expander {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 8px 14px;
    background: transparent;
    border: 0;
    border-top: 1px solid var(--hairline);
    color: var(--t-tertiary);
  }
  .expander:active {
    background: var(--surface-2);
  }
  .chev {
    color: var(--t-tertiary);
    font-size: 11px;
    flex: none;
    transition: transform var(--d-fast) var(--ease-out);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .rest {
    padding: 2px 14px 12px;
    animation: block-in var(--d-fast) var(--ease-out);
  }
  .rest .run:first-child {
    margin-top: 6px;
  }
  .other .title {
    color: var(--t-secondary);
  }
  @media (prefers-reduced-motion: reduce) {
    .rest {
      animation: none;
    }
  }
</style>
