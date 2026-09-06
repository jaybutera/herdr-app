<script lang="ts">
  let { text, onRetry }: { text: string; onRetry?: () => void } = $props();
</script>

<div class="banner" role="alert">
  <span class="msg">{text}</span>
  {#if onRetry}
    <button onclick={onRetry}>Retry</button>
  {/if}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    /* Alert at 12% tint, section 6.1. */
    background: color-mix(in srgb, var(--c-alert) 12%, transparent);
    color: var(--c-alert);
    border-radius: var(--r-button);
    padding: 10px 12px;
    margin: 8px 0;
    font-size: 13px;
    line-height: 18px;
  }
  .msg {
    flex: 1;
    min-width: 0;
  }
  button {
    color: var(--c-alert);
    font-weight: 600;
    font-size: 13px;
    padding: 6px 8px;
    flex: none;
  }
</style>
