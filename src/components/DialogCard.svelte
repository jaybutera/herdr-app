<script lang="ts">
  // A permission or trust prompt: the box text in mono inside an alert-bordered
  // card (section 5.3a).
  let { lines }: { lines: string[] } = $props();
</script>

<div class="dialog mono selectable">
  {#each lines as line, i (i)}<div class="line">{line}</div>{/each}
</div>

<style>
  .dialog {
    background: var(--surface-2);
    border: 1px solid color-mix(in srgb, var(--c-alert) 55%, transparent);
    border-radius: var(--r-card);
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .line {
    white-space: pre;
  }
</style>
