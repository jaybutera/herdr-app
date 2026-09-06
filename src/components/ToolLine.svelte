<script lang="ts">
  // Collapsed one-liner in mono; tapping expands the ⎿ result lines (5.3a).
  import Icon from './Icon.svelte';

  let { head, result }: { head: string; result: string[] } = $props();
  let open = $state(false);
</script>

<div class="tool">
  <button class="head" onclick={() => (open = !open)} disabled={result.length === 0}>
    <span class="chev" class:open><Icon name="forward" size={14} /></span>
    <span class="mono text">{head}</span>
  </button>
  {#if open && result.length}
    <div class="result mono selectable">
      {#each result as line, i (i)}<div class="line">{line}</div>{/each}
    </div>
  {/if}
</div>

<style>
  .tool {
    padding: 2px 0;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    min-height: 28px;
    color: var(--t-secondary);
  }
  .chev {
    flex: none;
    display: grid;
    place-items: center;
    transition: transform var(--d-fast) var(--ease-out);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result {
    background: var(--surface-2);
    border-radius: var(--r-button);
    padding: 8px 10px;
    margin: 4px 0 4px 20px;
    color: var(--t-secondary);
    overflow-x: auto;
  }
  .line {
    white-space: pre;
  }
</style>
