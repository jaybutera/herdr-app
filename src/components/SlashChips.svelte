<script lang="ts">
  let { muted, onSend }: { muted: boolean; onSend: (text: string) => void } = $props();
</script>

<div class="chips">
  <button class="chip mono" onclick={() => onSend('/status')}>/status</button>
  <button class="chip mono" onclick={() => onSend('/new')}>/new</button>
  <button class="chip mono" onclick={() => onSend(muted ? '/unmute' : '/mute')}>
    {muted ? 'unmute' : 'mute'}
  </button>
</div>

<style>
  .chips {
    display: flex;
    gap: 8px;
    padding: 8px 0 4px;
    flex-wrap: wrap;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: var(--r-chip);
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--t-secondary);
  }
  .chip:active {
    background: var(--surface-2);
  }
</style>
