<script lang="ts">
  // Single-line field growing to 5 lines (section 8). Send never double-submits:
  // the button disables until the request returns (section 9).
  import Icon from './Icon.svelte';

  let {
    placeholder,
    onSend,
    disabled = false,
    /** On the laptop, plain Enter inserts a newline and Ctrl/Cmd+Enter sends. */
    multiline = false,
    onFocusChange,
  }: {
    placeholder: string;
    onSend: (text: string) => Promise<void> | void;
    disabled?: boolean;
    multiline?: boolean;
    onFocusChange?: (focused: boolean) => void;
  } = $props();

  let value = $state('');
  let sending = $state(false);
  let el: HTMLTextAreaElement | undefined = $state();

  const canSend = $derived(value.trim().length > 0 && !disabled && !sending);

  function grow() {
    if (!el) return;
    el.style.height = 'auto';
    // 22px line-height, 5 lines max, plus the 20px of vertical padding.
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 20)}px`;
  }

  async function submit() {
    if (!canSend) return;
    const text = value.trim();
    sending = true;
    try {
      await onSend(text);
      value = '';
      queueMicrotask(grow);
    } finally {
      sending = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (multiline) {
      // Laptop: Ctrl/Cmd+Enter sends, plain Enter is a newline.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        void submit();
      }
      return;
    }
    // Phone: Enter sends, but only when the field is non-empty (section 9).
    if (!e.shiftKey) {
      e.preventDefault();
      if (canSend) void submit();
    }
  }
</script>

<div class="composer" class:disabled>
  <textarea
    bind:this={el}
    bind:value
    rows="1"
    {placeholder}
    {disabled}
    oninput={grow}
    onkeydown={onKeydown}
    onfocus={() => onFocusChange?.(true)}
    onblur={() => onFocusChange?.(false)}
  ></textarea>
  <button
    class="send"
    class:on={canSend}
    disabled={!canSend}
    aria-label="Send"
    onclick={() => void submit()}
  >
    <Icon name="send" size={18} />
  </button>
</div>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-composer);
    padding: 6px 6px 6px 14px;
    transition: border-color var(--d-fast) var(--ease-out);
  }
  .composer:focus-within {
    border-color: var(--accent);
  }
  .composer.disabled {
    opacity: 0.5;
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    padding: 8px 0;
    font-size: 15px;
    line-height: 22px;
    max-height: 130px;
    overflow-y: auto;
  }
  textarea::placeholder {
    color: var(--t-tertiary);
  }
  .send {
    flex: none;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--t-tertiary);
    transition:
      color var(--d-fast) var(--ease-out),
      background var(--d-fast) var(--ease-out);
  }
  .send.on {
    color: var(--bg);
    background: var(--accent);
  }
  .send.on:active {
    background: var(--accent-press);
  }
</style>
