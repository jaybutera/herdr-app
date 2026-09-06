<script lang="ts">
  // Esc sends keys:["Escape"]; 1/2/3 send text with no Enter, because Claude
  // Code dialogs select on the digit; Enter sends keys:["Enter"] (section 5.3a).
  let {
    onKey,
    onText,
    disabled = false,
    alertDigits = false,
  }: {
    onKey: (key: string) => void;
    onText: (text: string) => void;
    disabled?: boolean;
    alertDigits?: boolean;
  } = $props();
</script>

<div class="keys">
  <button class="chip" {disabled} onclick={() => onKey('Escape')}>Esc</button>
  <span class="group" class:alert={alertDigits}>
    {#each ['1', '2', '3'] as d (d)}
      <button class="chip digit" {disabled} onclick={() => onText(d)}>{d}</button>
    {/each}
  </span>
  <button class="chip" {disabled} onclick={() => onKey('Enter')}>Enter</button>
</div>

<style>
  .keys {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0 4px;
  }
  .group {
    display: flex;
    gap: 6px;
  }
  .chip {
    min-width: 44px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: var(--r-chip);
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--t-secondary);
    font-size: 13px;
    font-weight: 600;
    transition:
      background var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out);
  }
  .chip:active:not(:disabled) {
    background: var(--surface-2);
  }
  .chip:disabled {
    opacity: 0.45;
  }
  /* When the pane is blocked the digits read as the way out (section 5.3a). */
  .group.alert .digit {
    color: var(--c-alert);
    border-color: color-mix(in srgb, var(--c-alert) 45%, transparent);
  }
</style>
