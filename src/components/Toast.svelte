<script lang="ts">
  import { app } from '../lib/store.svelte';
</script>

{#if app.toast}
  {#key app.toast.id}
    <div class="toast" class:alert={app.toast.tone === 'alert'} role="status">
      {app.toast.text}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(72px + env(safe-area-inset-bottom));
    z-index: 60;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--t-primary);
    padding: 10px 16px;
    border-radius: var(--r-chip);
    font-size: 13px;
    max-width: calc(100% - 32px);
    animation: block-in var(--d-base) var(--ease-out);
    pointer-events: none;
  }
  .alert {
    color: var(--c-alert);
  }
  @media (min-width: 900px) {
    .toast {
      bottom: 24px;
    }
  }
</style>
