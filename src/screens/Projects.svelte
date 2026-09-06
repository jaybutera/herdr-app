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
      // Projects with a running task first, then updated_at descending.
      const runA = (a.running_tasks?.length ?? 0) > 0 ? 0 : 1;
      const runB = (b.running_tasks?.length ?? 0) > 0 ? 0 : 1;
      if (runA !== runB) return runA - runB;
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

<Header title="Herdr" onGear={() => (app.settingsOpen = true)}>
  {#snippet subtitle()}
    <SummaryLine
      running={summary?.running_tasks ?? 0}
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
