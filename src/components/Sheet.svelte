<script lang="ts">
  // Bottom sheet: slides up over --d-slow --ease-spring, backdrop fades over
  // --d-base, drag down tracks the finger, release past 30% dismisses (§7).
  import type { Snippet } from 'svelte';

  let {
    open,
    onClose,
    full = false,
    children,
  }: { open: boolean; onClose: () => void; full?: boolean; children: Snippet } = $props();

  let dragY = $state(0);
  let dragging = $state(false);
  let startY = 0;
  let sheetEl: HTMLDivElement | undefined = $state();

  function onPointerDown(e: PointerEvent) {
    // Only the grab handle starts a drag, so lists inside the sheet still scroll.
    dragging = true;
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    dragY = Math.max(0, e.clientY - startY);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    const height = sheetEl?.offsetHeight ?? 1;
    if (dragY > height * 0.3) onClose();
    dragY = 0;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div class="backdrop" onclick={onClose} role="presentation"></div>
  <div
    class="sheet"
    class:full
    bind:this={sheetEl}
    style="transform: translateY({dragY}px); transition: {dragging ? 'none' : ''}"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="handle"
      role="button"
      tabindex="-1"
      aria-label="Drag to dismiss"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    >
      <span class="grab"></span>
    </div>
    {@render children()}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: fade-in var(--d-base) var(--ease-out);
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 71;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 20px 20px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: sheet-up var(--d-slow) var(--ease-spring);
    transition: transform var(--d-base) var(--ease-out);
    touch-action: none;
  }
  .sheet.full {
    top: 0;
    border-radius: 0;
    max-height: none;
    padding-top: env(safe-area-inset-top);
  }
  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
  .handle {
    display: flex;
    justify-content: center;
    padding: 10px 0 6px;
    flex: none;
    cursor: grab;
    touch-action: none;
  }
  .grab {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--t-tertiary);
  }
  @media (min-width: 900px) {
    .sheet {
      left: 50%;
      transform: translateX(-50%) !important;
      width: 560px;
      max-width: calc(100vw - 48px);
    }
    .sheet.full {
      top: 24px;
      bottom: 24px;
      border-radius: 20px;
    }
  }
</style>
