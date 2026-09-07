<script lang="ts">
  import StatusDot from './StatusDot.svelte';
  import { statusSpec } from '../lib/format';
  import { isRemote } from '../lib/pane-id';

  let {
    agentStatus,
    paneId,
    machine,
    label,
  }: { agentStatus: string; paneId: string; machine?: string; label?: string } = $props();

  const spec = $derived(statusSpec('pane', agentStatus));
  const blocked = $derived(agentStatus === 'blocked');
  // The laptop is the unmarked case: badging every local session with "local"
  // would put a word on almost every row and say nothing.
  const remote = $derived(isRemote(machine ?? ''));
</script>

<div class="line" class:blocked>
  <StatusDot domain="pane" value={agentStatus} size={9} />
  <span class="t-meta status" style="color: {blocked ? 'var(--c-alert)' : 'var(--t-secondary)'}">
    {spec.label}
  </span>
  <span class="t-meta sep">·</span>
  {#if remote}
    <span class="machine mono">{machine}</span>
  {/if}
  <span class="mono id">{paneId}</span>
  {#if label}
    <span class="t-meta sep">·</span>
    <span class="t-meta label">{label}</span>
  {/if}
</div>

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 2px 0;
    border-radius: var(--r-chip);
    transition: background var(--d-base) var(--ease-out);
  }
  .blocked {
    background: color-mix(in srgb, var(--c-alert) 12%, transparent);
    padding: 2px 10px;
    margin-left: -10px;
  }
  .id {
    color: var(--t-secondary);
    flex: none;
  }
  .machine {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--r-chip);
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--t-secondary);
    font-size: 0.85em;
  }
  .sep,
  .status {
    flex: none;
  }
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
