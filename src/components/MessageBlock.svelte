<script lang="ts">
  let { text }: { text: string } = $props();
</script>

<div class="block">
  <span class="bullet">●</span>
  <p class="t-body selectable">{text}</p>
</div>

<style>
  .block {
    display: flex;
    gap: 8px;
    padding: 12px 0;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .bullet {
    color: var(--t-tertiary);
    flex: none;
    line-height: 22px;
  }
  p {
    margin: 0;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
