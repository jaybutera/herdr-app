<script lang="ts">
  // Fleet root, section 5.1.
  import Header from '../components/Header.svelte';
  import SummaryLine from '../components/SummaryLine.svelte';
  import SegmentedFilter from '../components/SegmentedFilter.svelte';
  import ProjectCard from '../components/ProjectCard.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ErrorBanner from '../components/ErrorBanner.svelte';
  import ActionSheet from '../components/ActionSheet.svelte';
  import { app } from '../lib/store.svelte';
  import { projtrack } from '../lib/api';
  import { isSettled, liveTaskStatus } from '../lib/live';
  import type { ProjectStatus, Summary, SummaryProject } from '../lib/types';
  import { onMount } from 'svelte';

  let {
    onOpenProject,
    selectedId,
  }: { onOpenProject: (id: number) => void; selectedId?: number } = $props();

  type Filter = ProjectStatus | 'all';

  let summary = $state<Summary | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let menuFor = $state<SummaryProject | null>(null);
  let filter = $state<Filter>((app.settings.projectFilter as Filter) || 'active');

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'dormant', label: 'Dormant' },
    { value: 'dead', label: 'Dead' },
    { value: 'all', label: 'All' },
  ];

  /**
   * A project's running tasks split by what their panes actually report.
   *
   * Blocked is its own figure. Counting it as running claimed work was in
   * flight for an agent sitting at a prompt, and counting it as review used the
   * phrase a stalled task earns for the one task that can still be answered.
   */
  function liveCount(p: SummaryProject) {
    let running = 0;
    let blocked = 0;
    let review = 0;
    for (const t of p.running_tasks ?? []) {
      const s = liveTaskStatus(t, app.paneIndex, app.panesKnown, app.machineNames);
      if (s === 'blocked') blocked += 1;
      else if (isSettled(s)) review += 1;
      else running += 1;
    }
    return { running, blocked, review };
  }

  /** Fleet totals counted from the panes, not from the ledger's running_tasks. */
  const totals = $derived.by(() => {
    let running = 0;
    let blocked = 0;
    let review = 0;
    for (const p of summary?.projects ?? []) {
      const c = liveCount(p);
      running += c.running;
      blocked += c.blocked;
      review += c.review;
    }
    // Tasks the summary counts as running but does not list are still counted;
    // the ledger's total is the floor, and only what we can see gets moved.
    const listed = (summary?.projects ?? []).reduce((n, p) => n + (p.running_tasks?.length ?? 0), 0);
    const unseen = Math.max(0, (summary?.running_tasks ?? 0) - listed);
    return { running: running + unseen, blocked, review };
  });

  /** Filter is applied client-side so switching it never spins (section 5.1). */
  const shown = $derived.by(() => {
    const all = summary?.projects ?? [];
    const list = filter === 'all' ? [...all] : all.filter((p) => p.status === filter);
    return list.sort((a, b) => {
      // Dead always last in the All view.
      if (filter === 'all') {
        const deadA = a.status === 'dead' ? 1 : 0;
        const deadB = b.status === 'dead' ? 1 : 0;
        if (deadA !== deadB) return deadA - deadB;
      }
      // Projects with a genuinely running task first, then those with an agent
      // waiting on Casper, then updated_at descending. Sorting on the ledger's
      // running list floated projects whose every agent had already stopped.
      const rank = (p: SummaryProject) => {
        const c = liveCount(p);
        if (c.running > 0) return 0;
        if (c.review > 0) return 1;
        return 2;
      };
      const rankA = rank(a);
      const rankB = rank(b);
      if (rankA !== rankB) return rankA - rankB;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
  });

  async function load(quiet = false) {
    if (quiet) refreshing = true;
    try {
      summary = await projtrack.summary(app.settings);
      error = null;
      app.noteSuccess();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Request failed';
      app.noteFailure();
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function setFilter(v: Filter) {
    filter = v;
    void app.updateSettings({ projectFilter: v });
  }

  async function setStatus(p: SummaryProject, status: ProjectStatus) {
    try {
      await projtrack.setProjectStatus(app.settings, p.id, status);
      // Update in place so the card does not wait for the next poll.
      if (summary) {
        summary = {
          ...summary,
          projects: summary.projects.map((x) => (x.id === p.id ? { ...x, status } : x)),
        };
      }
      app.showToast(`Marked ${status}`);
    } catch (e) {
      app.showToast(e instanceof Error ? e.message : 'Could not update', 'alert');
    }
  }

  const emptyText = $derived(
    filter === 'all' ? 'No projects yet' : `No ${filter} projects`
  );

  onMount(() => {
    void load();
    // Every 15s while visible; polling stops when hidden (section 9).
    const timer = setInterval(() => {
      if (app.visible) void load(true);
    }, app.intervals.projects);
    return () => clearInterval(timer);
  });

  // Returning to the foreground refetches immediately (section 9). Only the
  // false -> true edge fires; `loading` is deliberately not read here.
  let wasVisible = true;
  $effect(() => {
    const now = app.visible;
    if (now && !wasVisible) void load(true);
    wasVisible = now;
  });
</script>

<Header title="Orcha" onGear={() => (app.settingsOpen = true)}>
  {#snippet subtitle()}
    <SummaryLine
      running={totals.running}
      blocked={totals.blocked}
      needsReview={totals.review}
      queued={summary?.queued_tasks ?? 0}
      projects={shown.length}
      {refreshing}
      loading={loading && !summary}
    />
  {/snippet}
</Header>

<div class="scroll">
  <div class="filter">
    <SegmentedFilter options={FILTERS} value={filter} onChange={setFilter} />
  </div>

  {#if error}
    <ErrorBanner
      text="Can't reach projtrack at {app.settings.projtrackUrl}{error ? ` — ${error}` : ''}"
      onRetry={() => load()}
    />
  {/if}

  <div class="list" class:dim={error && summary}>
    {#if loading && !summary}
      <Skeleton shape="card" />
      <Skeleton shape="card" />
      <Skeleton shape="card" />
    {:else if shown.length === 0}
      <EmptyState text={emptyText} />
    {:else}
      {#each shown as p (p.id)}
        <ProjectCard
          project={p}
          selected={selectedId === p.id}
          onOpen={() => onOpenProject(p.id)}
          onLongPress={() => (menuFor = p)}
        />
      {/each}
    {/if}
  </div>
</div>

<ActionSheet
  open={menuFor !== null}
  title={menuFor?.name ?? ''}
  onClose={() => (menuFor = null)}
  actions={(['active', 'dormant', 'dead'] as ProjectStatus[]).map((s) => ({
    label: `Mark ${s}`,
    disabled: menuFor?.status === s,
    destructive: s === 'dead',
    onSelect: () => menuFor && setStatus(menuFor, s),
  }))}
/>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--pad-screen) 16px;
  }
  .filter {
    margin: 12px 0 16px;
  }
  .list {
    transition: opacity var(--d-base) var(--ease-out);
  }
  .list.dim {
    opacity: 0.6;
  }
</style>
