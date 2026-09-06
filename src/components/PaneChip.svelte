<script lang="ts">
  // Mono chip; tapping navigates to the task when one is known, else toasts
  // "No task for this pane" (section 8).
  let {
    paneId,
    label,
    onOpen,
  }: { paneId: string; label?: string; onOpen: () => void } = $props();
</script>

<button class="chip" onclick={onOpen}>
  <span class="mono">{paneId}</span>{#if label}<span class="t-meta lbl"> · {label}</span>{/if}
  <span class="arrow">→</span>
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: 32px;
    padding: 4px 10px;
    border-radius: var(--r-chip);
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--t-secondary);
  }
  .chip:active {
    background: var(--surface);
  }
  .lbl {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arrow {
    color: var(--t-tertiary);
    flex: none;
  }
</style>
