<script lang="ts">
  // Three 6px dots bouncing 3px in sequence over 900ms (section 7).
</script>

<div class="dots" aria-label="Orchestrator is working">
  <span></span><span></span><span></span>
</div>

<style>
  .dots {
    display: flex;
    gap: 5px;
    padding: 8px 4px;
  }
  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--t-tertiary);
    animation: dot-bounce 900ms var(--ease-in-out) infinite;
  }
  span:nth-child(2) {
    animation-delay: 150ms;
  }
  span:nth-child(3) {
    animation-delay: 300ms;
  }
  @media (prefers-reduced-motion: reduce) {
    span {
      animation: none;
    }
  }
</style>
