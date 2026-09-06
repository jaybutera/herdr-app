<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    label,
    value = $bindable(''),
    placeholder = '',
    masked = false,
    testLabel,
    onTest,
    testResult,
  }: {
    label: string;
    value: string;
    placeholder?: string;
    masked?: boolean;
    testLabel?: string;
    onTest?: () => void;
    testResult?: { ok: boolean; text: string } | null;
  } = $props();

  let revealed = $state(false);
</script>

<div class="field">
  <label class="t-label" for="f-{label}">{label}</label>
  <div class="box">
    <input
      id="f-{label}"
      type={masked && !revealed ? 'password' : 'text'}
      bind:value
      {placeholder}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    />
    {#if masked}
      <button
        class="reveal"
        aria-label={revealed ? 'Hide' : 'Reveal'}
        onclick={() => (revealed = !revealed)}
      >
        <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
      </button>
    {/if}
  </div>
  {#if onTest}
    <div class="test">
      <button class="test-btn" onclick={onTest}>{testLabel ?? 'Test'}</button>
      {#if testResult}
        <span class="result" class:ok={testResult.ok}>
          {#if testResult.ok}<Icon name="check" size={14} />{/if}
          {testResult.text}
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .field {
    margin-bottom: 20px;
  }
  label {
    display: block;
    margin-bottom: 6px;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-button);
    padding: 0 12px;
    transition: border-color var(--d-fast) var(--ease-out);
  }
  .box:focus-within {
    border-color: var(--accent);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 46px;
    font-size: 15px;
  }
  input::placeholder {
    color: var(--t-tertiary);
  }
  .reveal {
    color: var(--t-secondary);
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
  }
  .test {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    min-height: 28px;
  }
  .test-btn {
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    padding: 6px 2px;
  }
  .result {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--c-alert);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result.ok {
    color: var(--c-live);
  }
</style>
