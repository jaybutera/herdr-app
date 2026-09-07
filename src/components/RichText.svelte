<script lang="ts">
  // Orchestrator text is plain by contract (its system prompt forbids markdown),
  // so this only autolinks URLs and turns pane ids into chips (section 5.4).
  // Text is rendered as text nodes, never as HTML.
  import PaneChip from './PaneChip.svelte';
  import { isTauri } from '../lib/settings';

  let {
    text,
    onPane,
  }: { text: string; onPane: (paneId: string) => void } = $props();

  /**
   * Hand the URL to the phone's browser.
   *
   * A plain anchor is not enough on Android: `target="_blank"` has no window to
   * open in, so the tap does nothing, and without it the WebView navigates
   * away from the app to the page. Both leave the user stuck. The opener plugin
   * is the only path out to the real browser, so every tap is intercepted here.
   * The laptop build has a real browser context, so it falls back to
   * `window.open`.
   */
  async function openUrl(e: MouseEvent, url: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!isTauri()) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const m = await import('@tauri-apps/plugin-opener');
      await m.openUrl(url);
    } catch {
      // Nothing sensible left to try; better than silently swallowing the tap.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

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
        rel="noreferrer noopener"
        onclick={(e) => void openUrl(e, p.v)}>{p.v}</a
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
    text-decoration: underline;
    text-underline-offset: 2px;
    /* The tap must land on the link, not scroll or select the bubble. */
    touch-action: manipulation;
    -webkit-tap-highlight-color: color-mix(in srgb, var(--accent) 30%, transparent);
    cursor: pointer;
  }
  .chip-wrap {
    display: inline-block;
    vertical-align: middle;
  }
</style>
