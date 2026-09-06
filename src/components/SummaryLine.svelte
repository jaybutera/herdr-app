<script lang="ts">
  // "3 running · 7 queued · 9 projects". The " · " separators step through
  // --accent while a fetch is in flight, instead of a spinner (section 7).
  let {
    running,
    queued,
    projects,
    refreshing = false,
    loading = false,
  }: {
    running: number;
    queued: number;
    projects: number;
    refreshing?: boolean;
    loading?: boolean;
  } = $props();

  const runText = $derived(running === 0 ? 'Nothing running' : `${running} running`);
</script>

<p class="t-meta line" class:refreshing>
  {#if loading}
    Loading fleet
  {:else}
    <span>{runText}</span>
    <span class="sep s1"> · </span>
    <span>{queued} queued</span>
    <span class="sep s2"> · </span>
    <span>{projects} {projects === 1 ? 'project' : 'projects'}</span>
  {/if}
</p>

<style>
  .line {
    margin: 0;
  }
  .refreshing .sep {
    animation: sep-step 600ms var(--ease-in-out) infinite;
  }
  .refreshing .s1 {
    animation-delay: 0ms;
  }
  .refreshing .s2 {
    animation-delay: 200ms;
  }
  @keyframes sep-step {
    0%,
    100% {
      color: var(--t-secondary);
    }
    50% {
      color: var(--accent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .refreshing .sep {
      animation: none;
    }
  }
</style>
