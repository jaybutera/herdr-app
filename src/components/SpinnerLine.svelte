<script lang="ts">
  // Glyph rotates through the five spinner characters at 8 fps (section 5.3a).
  import { SPINNER_GLYPHS } from '../lib/pane-parse';
  import { onDestroy } from 'svelte';

  let { word, elapsed }: { word: string; elapsed: string } = $props();

  let frame = $state(0);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer = reduced ? null : setInterval(() => (frame = (frame + 1) % SPINNER_GLYPHS.length), 125);
  onDestroy(() => timer && clearInterval(timer));
</script>

<p class="t-meta spin">
  <span class="glyph">{SPINNER_GLYPHS[frame]}</span>
  {word}{#if elapsed}<span class="mono elapsed"> {elapsed}</span>{/if}
</p>

<style>
  .spin {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
  }
  .glyph {
    color: var(--t-secondary);
  }
  .elapsed {
    color: var(--t-tertiary);
  }
</style>
