<script lang="ts">
  // Bottom bar on the phone, 64px left rail at >=900px (sections 3.1, 3.3, 6.3).
  // Owns the safe areas.
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/store.svelte';

  let { children, hideBar = false }: { children: Snippet; hideBar?: boolean } = $props();

  const tabs = [
    { id: 'fleet' as const, label: 'Fleet', icon: 'fleet' as const },
    { id: 'chat' as const, label: 'Chat', icon: 'chat' as const },
    { id: 'usage' as const, label: 'Usage', icon: 'usage' as const },
  ];

  function dotFor(id: 'fleet' | 'chat' | 'usage') {
    // Fleet: red dot when any cached pane is blocked. Chat: unread dot (§3.2).
    if (id === 'fleet') return app.needsAttention ? 'alert' : null;
    return id === 'chat' && app.chatUnread ? 'accent' : null;
  }
</script>

<div class="shell">
  <nav class="bar" class:hidden={hideBar} aria-label="Main">
    {#each tabs as t (t.id)}
      <button
        class="tab"
        class:on={app.tab === t.id}
        aria-current={app.tab === t.id ? 'page' : undefined}
        onclick={() => app.setTab(t.id)}
      >
        <span class="icon-wrap">
          <Icon name={t.icon} size={24} />
          {#if dotFor(t.id)}
            <span class="badge {dotFor(t.id)}"></span>
          {/if}
        </span>
        <span class="label">{t.label}</span>
      </button>
    {/each}
    <button class="tab gear" aria-label="Settings" onclick={() => (app.settingsOpen = true)}>
      <span class="icon-wrap"><Icon name="settings" size={22} /></span>
    </button>
  </nav>

  <main class="content" class:bar-hidden={hideBar}>
    {@render children()}
  </main>
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .content {
    flex: 1;
    min-height: 0;
    order: 1;
    display: flex;
    flex-direction: column;
  }

  .bar {
    order: 2;
    flex: none;
    display: flex;
    align-items: center;
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid var(--hairline);
    transition:
      transform var(--d-base) var(--ease-out),
      opacity var(--d-base) var(--ease-out);
  }

  /* Hidden on Task detail and whenever a composer has focus (section 3.1). */
  .bar.hidden {
    display: none;
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 56px;
    color: var(--t-tertiary);
    transition: color var(--d-fast) var(--ease-out);
  }
  .tab.on {
    color: var(--t-primary);
  }
  /* The gear is bar-anchored on the rail only; on the phone it lives in the
     header, so it is hidden here. */
  .gear {
    display: none;
  }

  .icon-wrap {
    position: relative;
    display: grid;
    place-items: center;
  }
  .label {
    font-size: 11px;
    line-height: 14px;
  }
  .badge {
    position: absolute;
    top: -1px;
    right: -3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .badge.alert {
    background: var(--c-alert);
  }
  .badge.accent {
    background: var(--accent);
  }

  @media (min-width: 900px) {
    .shell {
      flex-direction: row;
    }
    .bar {
      order: 0;
      flex-direction: column;
      justify-content: flex-start;
      gap: 4px;
      width: 64px;
      height: 100%;
      padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
      border-top: none;
      border-right: 1px solid var(--hairline);
    }
    /* The rail keeps its tabs even on Task detail; only the phone bar hides. */
    .bar.hidden {
      display: flex;
    }
    .tab {
      flex: none;
      width: 100%;
      min-height: 56px;
    }
    .gear {
      display: flex;
      margin-top: auto;
      color: var(--t-tertiary);
    }
    .content {
      order: 1;
      flex: 1;
      min-width: 0;
    }
  }
</style>
