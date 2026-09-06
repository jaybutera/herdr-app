<script lang="ts">
  import Sheet from './Sheet.svelte';

  export interface Action {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    destructive?: boolean;
  }

  let {
    open,
    title,
    actions,
    onClose,
  }: { open: boolean; title: string; actions: Action[]; onClose: () => void } = $props();

  function pick(a: Action) {
    if (a.disabled) return;
    onClose();
    a.onSelect();
  }
</script>

<Sheet {open} {onClose}>
  <div class="body">
    <p class="t-label title">{title}</p>
    {#each actions as a (a.label)}
      <button
        class="row"
        class:destructive={a.destructive}
        disabled={a.disabled}
        onclick={() => pick(a)}>{a.label}</button
      >
    {/each}
  </div>
</Sheet>

<style>
  .body {
    padding: 4px 8px 12px;
  }
  .title {
    margin: 4px 12px 8px;
  }
  .row {
    display: block;
    width: 100%;
    text-align: left;
    min-height: 52px;
    padding: 0 12px;
    border-radius: var(--r-button);
    font-size: 15px;
    color: var(--t-primary);
  }
  .row:active:not(:disabled) {
    background: var(--surface);
  }
  .row:disabled {
    color: var(--t-tertiary);
  }
  .destructive:not(:disabled) {
    color: var(--c-alert);
  }
</style>
