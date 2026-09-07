<script lang="ts">
  import AppShell from './components/AppShell.svelte';
  import Toast from './components/Toast.svelte';
  import OfflineStrip from './components/OfflineStrip.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import Projects from './screens/Projects.svelte';
  import ProjectDetail from './screens/ProjectDetail.svelte';
  import TaskDetail from './screens/TaskDetail.svelte';
  import Chat from './screens/Chat.svelte';
  import SettingsSheet from './screens/SettingsSheet.svelte';
  import { app } from './lib/store.svelte';
  import { bridge, projtrack } from './lib/api';
  import type { Task } from './lib/types';
  import { onMount } from 'svelte';

  let wide = $state(false);
  let composerFocused = $state(false);

  const route = $derived(app.route);
  // The bottom bar hides on Task detail and whenever a composer has focus (3.1).
  const hideBar = $derived(route.screen === 'task' || composerFocused);

  function openProject(id: number) {
    app.push({ screen: 'project', projectId: id });
  }

  function openTask(task: Task) {
    app.push({ screen: 'task', taskId: task.id, projectId: task.project_id });
  }

  /** A chat event's pane id links to the task whose session_ref matches, found
   *  from the cached /summary response (section 2.4). */
  async function openPane(paneId: string) {
    try {
      const summary = await projtrack.summary(app.settings);
      for (const p of summary.projects) {
        const hit = [...(p.running_tasks ?? []), ...(p.open_tasks ?? [])].find(
          (t) => t.session_ref === paneId
        );
        if (hit) {
          app.openTask(hit.id, p.id);
          return;
        }
      }
      app.showToast('No task for this pane');
    } catch {
      app.showToast('No task for this pane');
    }
  }

  onMount(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const apply = () => (wide = mq.matches);
    apply();
    mq.addEventListener('change', apply);

    // All polling stops when the page is hidden and resumes on return (§9).
    const onVis = () => {
      app.visible = document.visibilityState === 'visible';
      document.body.classList.toggle('hidden', !app.visible);
    };
    document.addEventListener('visibilitychange', onVis);
    onVis();

    // Android hardware/gesture back pops the Fleet stack (section 3.1). The
    // history entry is the hook Tauri's WebView gives us for that.
    history.replaceState({ herdr: true }, '');
    const onPop = () => {
      const handled = app.handleBack();
      if (handled) history.pushState({ herdr: true }, '');
      // Not handled means the Fleet root: let the app exit.
    };
    window.addEventListener('popstate', onPop);
    history.pushState({ herdr: true }, '');

    // The pane list is the live half of every task status (section 3.2), so it
    // polls on the same cadence as the projects list rather than at a third of
    // it: a task that finishes should stop reading "Working" within one tick,
    // not up to 20s later.
    const pollPanes = async () => {
      if (!app.visible) return;
      try {
        const r = await bridge.panes(app.settings);
        app.setPanes(r.panes ?? []);
      } catch {
        // The bridge may not be up. `panesKnown` stays as it was, so screens
        // fall back to the ledger rather than calling every session an orphan.
      }
      try {
        const m = await bridge.machines(app.settings);
        app.setMachines(m.machines ?? []);
      } catch {
        // A bridge without /machines is an older one. The machines named by
        // the panes themselves still come through, so a session on another
        // machine keeps resolving; what is lost is only knowing about a
        // machine that currently has no panes on it.
      }
    };
    void pollPanes();
    const paneTimer = setInterval(pollPanes, app.intervals.projects);

    return () => {
      mq.removeEventListener('change', apply);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('popstate', onPop);
      clearInterval(paneTimer);
    };
  });

  const selectedProjectId = $derived(
    route.screen === 'project' || route.screen === 'task' ? route.projectId : undefined
  );
</script>

<AppShell {hideBar}>
  <OfflineStrip show={app.offline} />

  {#if app.tab === 'chat'}
    <div class="pane full">
      <Chat onOpenPane={openPane} />
    </div>
  {:else if wide}
    <!-- 3.3 master-detail: Projects at 320px, detail in the second column. -->
    <div class="split">
      <div class="master">
        <Projects onOpenProject={openProject} selectedId={selectedProjectId} />
      </div>
      <div class="detail">
        {#if route.screen === 'task'}
          {#key route.taskId}
            <TaskDetail
              taskId={route.taskId}
              onBack={() => app.pop()}
              onComposerFocus={(f) => (composerFocused = f)}
            />
          {/key}
        {:else if route.screen === 'project'}
          {#key route.projectId}
            <ProjectDetail
              projectId={route.projectId}
              onBack={() => app.pop()}
              onOpenTask={openTask}
            />
          {/key}
        {:else}
          <EmptyState text="Select a project" />
        {/if}
      </div>
    </div>
  {:else}
    <div class="pane full">
      {#if route.screen === 'projects'}
        <Projects onOpenProject={openProject} />
      {:else if route.screen === 'project'}
        {#key route.projectId}
          <div class="pushed">
            <ProjectDetail
              projectId={route.projectId}
              onBack={() => app.pop()}
              onOpenTask={openTask}
            />
          </div>
        {/key}
      {:else if route.screen === 'task'}
        {#key route.taskId}
          <div class="pushed">
            <TaskDetail
              taskId={route.taskId}
              onBack={() => app.pop()}
              onComposerFocus={(f) => (composerFocused = f)}
            />
          </div>
        {/key}
      {/if}
    </div>
  {/if}
</AppShell>

<SettingsSheet open={app.settingsOpen} onClose={() => (app.settingsOpen = false)} />
<Toast />

<style>
  .pane {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .full {
    width: 100%;
  }
  /* Push: slide in from the right while fading (section 7). */
  .pushed {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    animation: screen-in var(--d-base) var(--ease-out);
  }
  .split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 320px 1fr;
  }
  .master,
  .detail {
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .master {
    border-right: 1px solid var(--hairline);
  }
</style>
