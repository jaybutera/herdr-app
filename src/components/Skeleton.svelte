<script lang="ts">
  // Shimmer band moving left to right every 1.4s (section 7).
  let { shape = 'row' }: { shape?: 'card' | 'row' | 'bubble' | 'line'; width?: string } = $props();
</script>

<div class="skeleton {shape}"></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--surface) 25%,
      var(--surface-2) 50%,
      var(--surface) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
    border-radius: var(--r-card);
  }
  .card {
    height: 96px;
    margin-bottom: 12px;
  }
  .row {
    height: 68px;
    margin-bottom: 8px;
  }
  .bubble {
    height: 56px;
    width: 70%;
    margin-bottom: 12px;
    border-radius: var(--r-bubble);
  }
  .line {
    height: 14px;
    width: 40%;
    border-radius: 7px;
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
