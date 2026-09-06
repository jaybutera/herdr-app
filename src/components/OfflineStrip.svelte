<script lang="ts">
  // 28px strip under the header once two consecutive polls fail (section 5.6).
  let { show }: { show: boolean } = $props();
</script>

{#if show}
  <div class="strip">Offline · retrying</div>
{/if}

<style>
  .strip {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    color: var(--t-secondary);
    font-size: 13px;
    border-bottom: 1px solid var(--hairline);
    animation: block-in var(--d-base) var(--ease-out);
  }
</style>
