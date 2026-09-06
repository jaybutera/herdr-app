<script lang="ts">
  // Orchestrator text is plain by contract (its system prompt forbids markdown),
  // so this only autolinks URLs and turns pane ids into chips (section 5.4).
  // Text is rendered as text nodes, never as HTML.
  import PaneChip from './PaneChip.svelte';

  let {
    text,
    onPane,
  }: { text: string; onPane: (paneId: string) => void } = $props();

  type Piece =
    | { t: 'text'; v: string }
    | { t: 'url'; v: string }
    | { t: 'pane'; v: string };

  const TOKEN = /(https?:\/\/[^\s<>"')]+)|(\bw[\w]+:p\d+\b)/g;

  const pieces = $derived.by((): Piece[] => {
    const out: Piece[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN)) {
      const at = m.index ?? 0;
      if (at > last) out.push({ t: 'text', v: text.slice(last, at) });
      if (m[1]) out.push({ t: 'url', v: m[1] });
      else out.push({ t: 'pane', v: m[2] });
      last = at + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
  });
</script>

<span class="rich selectable"
  >{#each pieces as p, i (i)}{#if p.t === 'text'}{p.v}{:else if p.t === 'url'}<a
        href={p.v}
        target="_blank"
        rel="noreferrer noopener">{p.v}</a
      >{:else}<span class="chip-wrap"><PaneChip paneId={p.v} onOpen={() => onPane(p.v)} /></span
      >{/if}{/each}</span
>

<style>
  .rich {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  a {
    color: var(--accent);
  }
  .chip-wrap {
    display: inline-block;
    vertical-align: middle;
  }
</style>
