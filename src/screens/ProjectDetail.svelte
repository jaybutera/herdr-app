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
  import { isSettled, liveTaskStatus } from '../lib/live';
  import { relativeTime, statusSpec } from '../lib/format';
  import { dormancy } from '../lib/dormancy';
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

  // "Running" means the pane is still working. A ledger-running task whose agent
  // has stopped moves to its own group instead of padding the running list; that
  // group is what Casper actually has to deal with.
  const ledgerRunning = $derived(project?.tasks.filter((t) => t.status === 'running') ?? []);
  const running = $derived(
    ledgerRunning.filter((t) => !isSettled(liveTaskStatus(t, app.paneIndex, app.panesKnown, app.machineNames)))
  );
  const needsReview = $derived(
    ledgerRunning.filter((t) => isSettled(liveTaskStatus(t, app.paneIndex, app.panesKnown, app.machineNames)))
  );
  const queued = $derived(project?.tasks.filter((t) => t.status === 'queued') ?? []);

  /**
   * When anything last happened on this project, and what that means for its
   * status.
   *
   * `updated_at` used to be the line here, and it is the wrong column now that
   * the clock reads activity: it moves only on a PATCH of the project itself,
   * so a project whose agents worked on its tasks all morning still reported
   * being updated yesterday. `last_activity` is projtrack's rollup of the
   * project, its tasks and their events, which is the figure dormancy is
   * actually decided on.
   */
  const activityAt = $derived(project ? project.last_activity || project.updated_at : '');
  const quiet = $derived(project ? dormancy(project) : { note: '', soon: false, hoursLeft: 0 });
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
            {statusSpec('project', project.status).label} · active {relativeTime(activityAt)}
            {#if quiet.note}
              <span class="quiet" data-testid="dormancy-note">· {quiet.note}</span>
            {/if}
          </span>
        </div>
      {/if}
    {/snippet}
  </Header>

  <div class="scroll">
    {#if error}
      <ErrorBanner text="Can't reach projtrack{error ? ` — ${error}` : ''}" onRetry={load} />
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
        {#if needsReview.length}
          <SectionLabel text="Needs review" />
          {#each needsReview as t (t.id)}<TaskRow task={t} onOpen={() => onOpenTask(t)} />{/each}
        {/if}
        {#if queued.length}
          <SectionLabel text="Queued" />
          {#each queued as t (t.id)}<TaskRow task={t} onOpen={() => onOpenTask(t)} />{/each}
        {/if}
        {#if finished.length}
          <SectionLabel text="Finished" />
          {#each finished as t (t.id)}<TaskRow task={t} onOpen={() => onOpenTask(t)} />{/each}
        {/if}
        {#if !running.length && !needsReview.length && !queued.length && !finished.length}
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
  /* Why this project is dormant, or that it is heading that way. */
  .quiet {
    color: var(--t-tertiary);
    margin-left: 4px;
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
