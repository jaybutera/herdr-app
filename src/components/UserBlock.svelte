<script lang="ts">
  let { text, pending = false }: { text: string; pending?: boolean } = $props();
</script>

<div class="wrap">
  <p class="t-body bubble selectable" class:pending>{text}</p>
</div>

<style>
  .wrap {
    display: flex;
    justify-content: flex-end;
    padding: 6px 0;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .bubble {
    margin: 0;
    max-width: 85%;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-radius: var(--r-bubble) var(--r-bubble) 6px var(--r-bubble);
    padding: 10px 14px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    transition: opacity var(--d-base) var(--ease-out);
  }
  .pending {
    opacity: 0.6;
  }
</style>
