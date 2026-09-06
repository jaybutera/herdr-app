<script lang="ts">
  // Large form (display type) on roots, compact form (heading + back) on pushed
  // screens (section 8).
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    onBack,
    onGear,
    onMore,
    subtitle,
    compact = false,
    viewTransitionName,
  }: {
    title: string;
    onBack?: () => void;
    onGear?: () => void;
    onMore?: () => void;
    subtitle?: Snippet;
    compact?: boolean;
    viewTransitionName?: string;
  } = $props();
</script>

<header class:compact>
  <div class="row">
    {#if onBack}
      <button class="icon-btn back" aria-label="Back" onclick={onBack}>
        <Icon name="back" size={24} />
      </button>
    {/if}
    <h1
      class={compact ? 't-heading' : 't-display'}
      style={viewTransitionName ? `view-transition-name: ${viewTransitionName}` : undefined}
    >
      {title}
    </h1>
    {#if onMore}
      <button class="icon-btn" aria-label="More" onclick={onMore}>
        <Icon name="more" size={22} />
      </button>
    {/if}
    {#if onGear}
      <button class="icon-btn gear" aria-label="Settings" onclick={onGear}>
        <Icon name="settings" size={22} />
      </button>
    {/if}
  </div>
  {#if subtitle}
    <div class="sub">{@render subtitle()}</div>
  {/if}
</header>

<style>
  header {
    flex: none;
    padding: 12px var(--pad-screen) 8px;
    padding-top: calc(12px + env(safe-area-inset-top));
  }
  header.compact {
    padding-top: calc(8px + env(safe-area-inset-top));
    padding-bottom: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  h1 {
    margin: 0;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .icon-btn {
    flex: none;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--t-secondary);
    border-radius: 50%;
    margin: 0 -10px;
  }
  .icon-btn:active {
    background: var(--surface);
  }
  .back {
    margin-left: -12px;
  }
  .sub {
    margin-top: 2px;
    min-height: 18px;
  }
  /* The rail carries the gear at >=900px, so the header drops it (section 3.3). */
  @media (min-width: 900px) {
    .gear {
      display: none;
    }
  }
</style>
