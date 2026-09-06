<script lang="ts" generics="T extends string">
  // Sliding pill (section 7). Used for the project filter, the Messages/
  // Terminal toggle, and the poll-speed control.
  let {
    options,
    value,
    onChange,
  }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
</script>

<div class="seg" style="--count: {options.length}; --index: {index}">
  <span class="pill"></span>
  {#each options as opt (opt.value)}
    <button
      class="opt"
      class:on={opt.value === value}
      aria-pressed={opt.value === value}
      onclick={() => onChange(opt.value)}>{opt.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--count), 1fr);
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-chip);
    padding: 3px;
    isolation: isolate;
  }
  .pill {
    position: absolute;
    z-index: 0;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--count));
    transform: translateX(calc(var(--index) * 100%));
    background: var(--surface-2);
    border-radius: var(--r-chip);
    transition: transform var(--d-base) var(--ease-out);
  }
  .opt {
    position: relative;
    z-index: 1;
    min-height: 38px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--t-secondary);
    transition: color var(--d-fast) var(--ease-out);
    white-space: nowrap;
  }
  .opt.on {
    color: var(--t-primary);
  }
</style>
