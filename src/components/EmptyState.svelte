<script lang="ts">
  let {
    text,
    actionLabel,
    onAction,
  }: { text: string; actionLabel?: string; onAction?: () => void } = $props();
</script>

<div class="empty">
  <p class="t-meta">{text}</p>
  {#if actionLabel && onAction}
    <button class="action" onclick={onAction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 16px;
    text-align: center;
  }
  p {
    margin: 0;
  }
  .action {
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 12px;
    min-height: 44px;
  }
</style>
