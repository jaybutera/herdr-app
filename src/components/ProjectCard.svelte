<script lang="ts">
  import StatusDot from './StatusDot.svelte';
  import RunSpinner from './RunSpinner.svelte';
  import { liveCountsLine, statusSpec } from '../lib/format';
  import { app } from '../lib/store.svelte';
  import { isSettled, liveCounts, liveTaskStatus } from '../lib/live';
  import { isRemote, machineForRef } from '../lib/pane-id';
  import type { SummaryProject, Task } from '../lib/types';

  let {
    project,
    selected = false,
    onOpen,
    onLongPress,
  }: {
    project: SummaryProject;
    selected?: boolean;
    onOpen: () => void;
    onLongPress: () => void;
  } = $props();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let longFired = false;
  /** Click-to-expand: the tasks that are not running are hidden until asked for. */
  let expanded = $state(false);

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
  /** Everything else, behind the expander. */
  const rest = $derived(lines.filter((l) => l.live !== 'running'));

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

<div class="wrap" class:selected>
  <button
    class="card"
    class:dead={project.status === 'dead'}
    class:dormant={project.status === 'dormant'}
    class:running={running.length > 0}
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
        <RunSpinner size={12} title="{running.length} running" />
      {/if}
    </span>
    <span class="t-meta counts">{liveCountsLine(counts)}</span>

    <!-- Collapsed, a card lists only what is genuinely running. -->
    {#each running as l (l.task.id)}
      <span class="run" data-testid="running-task">
        <RunSpinner size={11} />
        <span class="t-meta title">{l.task.title}</span>
        {#if l.remote}<span class="t-meta machine mono">{l.machine}</span>{/if}
      </span>
    {/each}
  </button>

  {#if rest.length > 0}
    <button
      class="expander"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="chev" class:open={expanded}>▸</span>
      <span class="t-meta">
        {expanded ? 'Hide' : `${rest.length} other task${rest.length === 1 ? '' : 's'}`}
      </span>
    </button>
  {/if}

  {#if expanded}
    <div class="rest">
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
     read as a group before any row is read individually. */
  .card.running {
    border-left: 2px solid var(--c-live);
  }
  .dormant {
    opacity: 0.8;
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
