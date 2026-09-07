<script lang="ts">
  import StatusDot from './StatusDot.svelte';
  import { liveCountsLine, statusSpec } from '../lib/format';
  import { app } from '../lib/store.svelte';
  import { isSettled, liveCounts, liveTaskStatus } from '../lib/live';
  import type { SummaryProject } from '../lib/types';

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

  const running = $derived(project.running_tasks?.slice(0, 2) ?? []);
  /** Each preview line carries its own live status, so a card cannot show a
   *  pulsing dot next to a task whose agent stopped hours ago. */
  const previews = $derived(
    running.map((t) => {
      const live = liveTaskStatus(t, app.paneIndex, app.panesKnown, app.machineNames);
      return { task: t, live, settled: isSettled(live) };
    })
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

<button
  class="card"
  class:dead={project.status === 'dead'}
  class:dormant={project.status === 'dormant'}
  class:selected
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
  </span>
  <span class="t-meta counts">{liveCountsLine(counts)}</span>
  {#each previews as p (p.task.id)}
    <span class="run">
      <span class="chev">▸</span>
      <span class="t-meta title">{p.task.title}</span>
      {#if p.settled}
        <span class="t-meta flag">{statusSpec('live', p.live).label}</span>
      {/if}
      <StatusDot domain="live" value={p.live} size={8} />
    </span>
  {/each}
</button>

<style>
  .card {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    padding: 14px;
    margin-bottom: 12px;
    transition:
      transform var(--d-base) var(--ease-spring),
      background var(--d-fast) var(--ease-out),
      opacity var(--d-base) var(--ease-out);
  }
  .card:active {
    transform: scale(0.98);
    background: var(--surface-2);
    transition-duration: var(--d-fast);
  }
  .card.selected {
    background: var(--surface-2);
    border-color: color-mix(in srgb, var(--accent) 40%, var(--hairline));
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
  .chev {
    color: var(--t-tertiary);
    font-size: 11px;
    flex: none;
  }
  .flag {
    flex: none;
    color: var(--c-done);
  }
  .run .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t-primary);
  }
</style>
