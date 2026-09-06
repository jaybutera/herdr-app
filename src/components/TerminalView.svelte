<script lang="ts">
  // Raw pane text: the fallback that must always work (section 5.3a).
  let { text }: { text: string } = $props();
</script>

<pre class="term t-terminal selectable">{text}</pre>

<style>
  .term {
    margin: 0;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    overflow-x: auto;
    white-space: pre;
    color: var(--t-primary);
  }
</style>
