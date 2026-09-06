<script lang="ts">
  // Full-width, not a bubble: kind glyph and colour, optional PaneChip (5.4).
  import PaneChip from './PaneChip.svelte';
  import RichText from './RichText.svelte';
  import type { ChatKind } from '../lib/types';

  let {
    kind,
    text,
    paneId,
    taskTitle,
    onPane,
  }: {
    kind: ChatKind;
    text: string;
    paneId?: string | null;
    taskTitle?: string;
    onPane: (paneId: string) => void;
  } = $props();

  const TONE: Record<string, { color: string; glyph: string }> = {
    finished: { color: 'var(--c-done)', glyph: '✓' },
    stalled: { color: 'var(--c-alert)', glyph: '!' },
    error: { color: 'var(--c-alert)', glyph: '!' },
    ended: { color: 'var(--c-muted)', glyph: '—' },
    status: { color: 'var(--c-muted)', glyph: '·' },
    text: { color: 'var(--c-muted)', glyph: '·' },
  };
  const tone = $derived(TONE[kind] ?? TONE.text);
</script>

<div class="card" style="--tone: {tone.color}" class:mono-body={kind === 'status'}>
  <div class="head">
    <span class="glyph">{tone.glyph}</span>
    <span class="body"><RichText {text} {onPane} /></span>
  </div>
  {#if paneId}
    <div class="chip">
      <PaneChip {paneId} label={taskTitle} onOpen={() => onPane(paneId)} />
    </div>
  {/if}
</div>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-left: 2px solid var(--tone);
    border-radius: var(--r-card);
    padding: 12px 14px;
    margin: 6px 0;
    animation: block-in var(--d-base) var(--ease-out);
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .glyph {
    color: var(--tone);
    font-weight: 600;
    flex: none;
    line-height: 22px;
  }
  .body {
    min-width: 0;
    font-size: 15px;
    line-height: 22px;
  }
  .mono-body .body {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    line-height: 18px;
    color: var(--t-secondary);
  }
  .chip {
    margin-top: 8px;
  }
</style>
