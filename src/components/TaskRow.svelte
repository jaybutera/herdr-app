<script lang="ts">
  // Glyph, title, a second line decided by status, chevron (section 5.2).
  import StatusDot from './StatusDot.svelte';
  import Icon from './Icon.svelte';
  import { since } from '../lib/format';
  import type { Task } from '../lib/types';

  let { task, onOpen }: { task: Task; onOpen: () => void } = $props();

  /** Running: pane id plus "started N ago". Finished: the first two lines of
   *  result_summary. Queued: nothing. */
  const second = $derived.by(() => {
    if (task.status === 'running') return null; // rendered with a mono pane id below
    if (task.status === 'queued') return null;
    const summary = (task.result_summary ?? '').trim();
    return summary ? summary.split('\n').slice(0, 2).join(' ') : null;
  });
</script>

<button class="row" onclick={onOpen}>
  <span class="glyph">
    <StatusDot domain="task" value={task.status} size={10} />
  </span>
  <span class="mid">
    <span class="t-body title">{task.title}</span>
    {#if task.status === 'running'}
      <span class="t-meta sub">
        {#if task.session_ref}<span class="mono pane">{task.session_ref}</span> · {/if}
        {since(task.updated_at, 'started')}
      </span>
    {:else if second}
      <span class="t-meta sub clamp">{second}</span>
    {/if}
  </span>
  <span class="chev"><Icon name="forward" size={18} /></span>
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    min-height: 56px;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    margin-bottom: 8px;
    transition:
      transform var(--d-base) var(--ease-spring),
      background var(--d-fast) var(--ease-out);
  }
  .row:active {
    transform: scale(0.98);
    background: var(--surface-2);
    transition-duration: var(--d-fast);
  }
  .glyph {
    flex: none;
    display: grid;
    place-items: center;
    width: 12px;
  }
  .mid {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    min-width: 0;
  }
  .clamp {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .pane {
    color: var(--t-secondary);
  }
  .chev {
    flex: none;
    color: var(--t-tertiary);
  }
</style>
