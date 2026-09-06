<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<div class="divider">
  <span class="rule"></span>
  <span class="t-meta">{label}</span>
  <span class="rule"></span>
</div>

<style>
  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
  }
  .rule {
    flex: 1;
    height: 1px;
    background: var(--hairline);
  }
</style>
