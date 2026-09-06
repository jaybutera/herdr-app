<script lang="ts">
  // Section 4: one glyph and colour per status, drawn as inline SVG so it can
  // pulse and tint. Never an icon font.
  import { statusSpec, type Domain } from '../lib/format';

  let {
    domain,
    value,
    size = 10,
    pulse = true,
  }: { domain: Domain; value: string; size?: number; pulse?: boolean } = $props();

  const spec = $derived(statusSpec(domain, value));
  const isPulse = $derived(spec.glyph === 'pulse' && pulse);
  const r = $derived(size / 2);
</script>

<span class="dot" style="--c: {spec.color}; --size: {size}px" aria-label={spec.label}>
  <svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    {#if spec.glyph === 'filled' || spec.glyph === 'pulse'}
      <circle cx={r} cy={r} r={r * 0.8} fill="var(--c)" />
    {:else if spec.glyph === 'hollow'}
      <circle cx={r} cy={r} r={r * 0.65} fill="none" stroke="var(--c)" stroke-width="1.75" />
    {:else if spec.glyph === 'strike'}
      <circle cx={r} cy={r} r={r * 0.8} fill="var(--c)" />
      <line x1="0" y1={size} x2={size} y2="0" stroke="var(--bg)" stroke-width="1.75" />
    {:else if spec.glyph === 'check'}
      <path
        d="M{size * 0.2} {size * 0.52} L{size * 0.42} {size * 0.74} L{size * 0.82} {size * 0.26}"
        fill="none"
        stroke="var(--c)"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {:else if spec.glyph === 'cross'}
      <path
        d="M{size * 0.24} {size * 0.24} L{size * 0.76} {size * 0.76} M{size * 0.76} {size * 0.24} L{size * 0.24} {size * 0.76}"
        stroke="var(--c)"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    {:else if spec.glyph === 'dash'}
      <line
        x1={size * 0.2}
        y1={r}
        x2={size * 0.8}
        y2={r}
        stroke="var(--c)"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    {:else if spec.glyph === 'bang'}
      <circle cx={r} cy={r} r={r - 0.9} fill="none" stroke="var(--c)" stroke-width="1.5" />
      <line
        x1={r}
        y1={size * 0.28}
        x2={r}
        y2={size * 0.58}
        stroke="var(--c)"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <circle cx={r} cy={size * 0.74} r="0.9" fill="var(--c)" />
    {:else if spec.glyph === 'question'}
      <text
        x={r}
        y={size * 0.82}
        text-anchor="middle"
        font-size={size}
        fill="var(--c)"
        font-family="Inter, sans-serif">?</text
      >
    {:else if spec.glyph === 'slashed'}
      <circle cx={r} cy={r} r={r - 0.9} fill="none" stroke="var(--c)" stroke-width="1.5" />
      <line
        x1={size * 0.22}
        y1={size * 0.78}
        x2={size * 0.78}
        y2={size * 0.22}
        stroke="var(--c)"
        stroke-width="1.5"
      />
    {/if}
  </svg>
  {#if isPulse}
    <span class="ring"></span>
  {/if}
</span>

<style>
  .dot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    flex: none;
  }

  svg {
    display: block;
  }

  /* Section 4: a second ring scaling 1x to 2.2x, fading out over 1.6s. */
  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--c);
    animation: pulse-ring 1.6s var(--ease-out) infinite;
    pointer-events: none;
  }

  /* The pulse is the one ambient animation; it stops with the tab hidden. */
  :global(body.hidden) .ring {
    animation-play-state: paused;
  }

  @media (prefers-reduced-motion: reduce) {
    .ring {
      display: none;
    }
  }
</style>
