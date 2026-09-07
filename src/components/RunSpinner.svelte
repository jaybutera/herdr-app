<script lang="ts">
  // A rotating arc, for a task whose agent is working right now.
  //
  // StatusDot's pulse says "this status is live"; it does not say the agent is
  // mid-turn, and on the project list it sits next to statuses that are not
  // moving at all. The arc turns, so a running task is picked out of a list at a
  // glance without reading a single label. Drawn as inline SVG for the same
  // reason as every other glyph in section 4: it tints from a CSS variable and
  // never needs an icon font.

  let {
    size = 11,
    title = 'Working',
    /**
     * False when the arc should be drawn but held still.
     *
     * Motion is the claim: it says an agent is working right now. With no pane
     * list the only source is the ledger, which goes stale silently, so the task
     * keeps its row and the arc stops turning rather than asserting liveness
     * nothing has checked.
     */
    spin = true,
  }: { size?: number; title?: string; spin?: boolean } = $props();

  const r = $derived(size / 2);
  const arc = $derived(2 * Math.PI * (r - 1.1));
  /** How much of the circle is drawn; the rest is the gap that reads as motion. */
  const DRAWN = 0.72;
</script>

<span class="spin" style="--size: {size}px" role="img" aria-label={title}>
  <svg
    class:still={!spin}
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
    aria-hidden="true"
  >
    <circle
      cx={r}
      cy={r}
      r={r - 1.1}
      fill="none"
      stroke="var(--c-live)"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-dasharray="{arc * DRAWN} {arc}"
    />
  </svg>
</span>

<style>
  .spin {
    display: inline-flex;
    width: var(--size);
    height: var(--size);
    flex: none;
  }
  svg {
    display: block;
    transform-origin: 50% 50%;
    animation: spin-arc 900ms linear infinite;
  }
  svg.still {
    animation: none;
    opacity: 0.65;
  }
  /* The ambient animations all stop with the tab hidden (section 9). */
  :global(body.hidden) svg {
    animation-play-state: paused;
  }
  @media (prefers-reduced-motion: reduce) {
    svg {
      animation: none;
    }
  }
</style>
