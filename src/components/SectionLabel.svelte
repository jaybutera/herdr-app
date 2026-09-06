<script lang="ts">
  let { text }: { text: string } = $props();
</script>

<div class="t-label label">{text}</div>

<style>
  .label {
    margin: 24px 0 8px;
  }
</style>
