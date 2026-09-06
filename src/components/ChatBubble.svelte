<script lang="ts">
  // User right in the accent tint, orchestrator left on the raised surface.
  // Max width 85%. No avatars, no names: there are only two parties (5.4).
  import RichText from './RichText.svelte';

  let {
    role,
    text,
    pending = false,
    queued = false,
    onPane,
  }: {
    role: 'user' | 'orchestrator' | 'system';
    text: string;
    pending?: boolean;
    queued?: boolean;
    onPane: (paneId: string) => void;
  } = $props();
</script>

<div class="wrap" class:mine={role === 'user'}>
  <div class="bubble" class:mine={role === 'user'} class:system={role === 'system'} class:pending>
    {#if role === 'system'}
      <span class="mono selectable">{text}</span>
    {:else}
      <RichText {text} {onPane} />
    {/if}
    {#if queued}<span class="clock" title="Queued, will retry">◷</span>{/if}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    justify-content: flex-start;
    padding: 4px 0;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .wrap.mine {
    justify-content: flex-end;
  }
  .bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: var(--r-bubble) var(--r-bubble) var(--r-bubble) 6px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    font-size: 15px;
    line-height: 22px;
    transition: opacity var(--d-base) var(--ease-out);
  }
  .bubble.mine {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: transparent;
    border-radius: var(--r-bubble) var(--r-bubble) 6px var(--r-bubble);
  }
  .bubble.system {
    background: var(--surface-2);
    color: var(--t-secondary);
  }
  .pending {
    opacity: 0.6;
  }
  .clock {
    margin-left: 6px;
    color: var(--t-tertiary);
  }
</style>
