<script lang="ts">
  // Section 5.2. Three groups in fixed order; a group with no tasks is omitted
  // entirely rather than shown empty.
  import Header from '../components/Header.svelte';
  import StatusDot from '../components/StatusDot.svelte';
  import SectionLabel from '../components/SectionLabel.svelte';
  import TaskRow from '../components/TaskRow.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorBanner from '../components/ErrorBanner.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ActionSheet from '../components/ActionSheet.svelte';
  import { app } from '../lib/store.svelte';
  import { ApiError, projtrack } from '../lib/api';
  import { relativeTime, statusSpec } from '../lib/format';
  import type { ProjectDetail, ProjectStatus, Task } from '../lib/types';
  import { onMount } from 'svelte';

  let {
    projectId,
    onBack,
    onOpenTask,
  }: { projectId: number; onBack: () => void; onOpenTask: (task: Task) => void } = $props();

  let project = $state<ProjectDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let gone = $state(false);
  let menuOpen = $state(false);
  let descExpanded = $state(false);

  const running = $derived(project?.tasks.filter((t) => t.status === 'running') ?? []);
  const queued = $derived(project?.tasks.filter((t) => t.status === 'queued') ?? []);
  const finished = $derived(
    (project?.tasks.filter((t) => ['done', 'failed', 'abandoned'].includes(t.status)) ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  );

  async function load() {
    try {
      project = await projtrack.project(app.settings, projectId);
      error = null;
      gone = false;
      app.noteSuccess();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        gone = true;
        error = null;
      } else {
        error = e instanceof Error ? e.message : 'Request failed';
        app.noteFailure();
      }
    } finally {
      loading = false;
    }
  }

  async function setStatus(status: ProjectStatus) {
    try {
      await projtrack.setProjectStatus(app.settings, projectId, status);
      if (project) project = { ...project, status };
      app.showToast(`Marked ${status}`);
    } catch (e) {
      app.showToast(e instanceof Error ? e.message : 'Could not update', 'alert');
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => {
      if (app.visible) void load();
    }, 10_000);
    return () => clearInterval(timer);
  });

  let wasVisible = true;
  $effect(() => {
    const now = app.visible;
    if (now && !wasVisible) void load();
    wasVisible = now;
  });
</script>

{#if gone}
  <Header title="" onBack={onBack} compact />
  <EmptyState text="This project was deleted" actionLabel="Back" onAction={onBack} />
{:else}
  <Header
    title={project?.name ?? ''}
    onBack={onBack}
    onMore={project ? () => (menuOpen = true) : undefined}
    compact={false}
  >
    {#snippet subtitle()}
      {#if project}
        <div class="meta">
          <StatusDot domain="project" value={project.status} size={9} pulse={false} />
          <span class="t-meta">
            {statusSpec('project', project.status).label} · updated {relativeTime(project.updated_at)}
          </span>
        </div>
      {/if}
    {/snippet}
  </Header>

  <div class="scroll">
    {#if error}
      <ErrorBanner text="Can't reach projtrack" onRetry={load} />
    {/if}

    {#if loading && !project}
      <Skeleton shape="line" />
      <div class="gap"></div>
      <Skeleton shape="row" />
      <Skeleton shape="row" />
    {:else if project}
      <div class="body" class:dim={error}>
        {#if project.description}
          <button
            class="t-body desc"
            class:clamp={!descExpanded}
            onclick={() => (descExpanded = !descExpanded)}
          >
            {project.description}
          </button>
        {/if}

        {#if running.length}
          <SectionLabel text="Running" />
          {#each running as t (t.id)}<TaskRow task={t} onOpen={() => onOpenTask(t)} />{/each}
        {/if}
        {#if queued.length}
          <SectionLabel text="Queued" />
          {#each queued as t (t.id)}<TaskRow task={t} onOpen={() => onOpenTask(t)} />{/each}
        {/if}
        {#if finished.length}
          <SectionLabel text="Finished" />
          {#each finished as t (t.id)}<TaskRow task={t} onOpen={() => onOpenTask(t)} />{/each}
        {/if}
        {#if !running.length && !queued.length && !finished.length}
          <EmptyState text="No tasks yet" />
        {/if}
      </div>
    {/if}
  </div>

  <ActionSheet
    open={menuOpen}
    title={project?.name ?? ''}
    onClose={() => (menuOpen = false)}
    actions={(['active', 'dormant', 'dead'] as ProjectStatus[]).map((s) => ({
      label: `Mark ${s}`,
      disabled: project?.status === s,
      destructive: s === 'dead',
      onSelect: () => setStatus(s),
    }))}
  />
{/if}

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--pad-screen) 24px;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .desc {
    display: block;
    width: 100%;
    text-align: left;
    margin: 8px 0 0;
    color: var(--t-secondary);
  }
  .clamp {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .body {
    transition: opacity var(--d-base) var(--ease-out);
  }
  .body.dim {
    opacity: 0.6;
  }
  .gap {
    height: 16px;
  }
</style>
