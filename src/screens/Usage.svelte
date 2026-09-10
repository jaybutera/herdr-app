<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte';
  import { apiFailureText, usage, type UsageResponse, type UsageAccount } from '../lib/api';

  let data = $state<UsageResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function relative(when: string | null) {
    if (!when) return 'reset time unavailable';
    const ms = new Date(when).getTime() - Date.now();
    if (ms <= 0) return 'reset due';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.ceil((ms % 3_600_000) / 60_000);
    return `resets in ${hours ? `${hours}h ` : ''}${minutes}m`;
  }

  async function load(force = false) {
    loading = true;
    error = null;
    try {
      data = await usage.read(app.settings, force);
      app.noteSuccess();
    } catch (e) {
      error = apiFailureText('usage statistics', e, !!app.settings.token);
      data = null;
      app.noteFailure();
    } finally { loading = false; }
  }

  function title(provider: string, account: UsageAccount, index: number) {
    const plan = account.subscription ?? account.plan;
    return `${provider === 'claude' ? 'Claude' : 'Codex'}${plan ? ` · ${plan}` : ''}${index ? ` · account ${index + 1}` : ''}`;
  }

  onMount(() => void load());
</script>

<section class="screen">
  <header>
    <div><p class="eyebrow">Accounts</p><h1>Usage</h1></div>
    <button class="refresh" onclick={() => void load(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
  </header>

  {#if error}<div class="error">{error}</div>{/if}
  {#if data}
    {#if data.stale}<div class="warning">Showing the last successful snapshot; the provider refresh failed.</div>{/if}
    {#each Object.entries(data.providers) as [provider, details]}
      {#each details.accounts as account, index}
        <article class="card">
          <div class="card-head"><h2>{title(provider, account, index)}</h2><span>{account.machines.join(' · ')}</span></div>
          <p class="source">Subscription quota · {details.source}</p>
          {#each account.limits as limit}
            <div class="limit">
              <div class="line"><strong>{limit.name}</strong><span>{limit.remaining_percent}% left</span></div>
              <div class="track" aria-label={`${limit.name}: ${limit.used_percent}% used`}><i style={`width:${Math.min(100, limit.used_percent)}%`}></i></div>
              <div class="meta"><span>{limit.used_percent}% used</span><span>{relative(limit.resets_at)}</span></div>
            </div>
          {/each}
          {#if account.observed_at}<p class="observed">Provider snapshot {new Date(account.observed_at).toLocaleString()}</p>{/if}
        </article>
      {:else}
        <article class="card empty"><h2>{provider === 'claude' ? 'Claude' : 'Codex'}</h2><p>No current subscription quota is available.</p></article>
      {/each}
    {/each}

    <article class="card activity">
      <p class="source">Measured locally · not subscription quota</p>
      <h2>Device activity</h2>
      {#each Object.entries(data.local_activity) as [provider, activity]}
        <div class="activity-row"><strong>{provider === 'claude' ? 'Claude' : 'Codex'}</strong><span>{activity.sessions_24h} sessions / 24h · {activity.sessions_7d} / 7d</span></div>
      {/each}
    </article>

    {#if data.unavailable.length}
      <div class="unavailable">
        {#each data.unavailable as item}<p><strong>{item.provider} · {item.machine}</strong> — {item.reason}</p>{/each}
      </div>
    {/if}
    <p class="updated">Updated {new Date(data.generated_at).toLocaleString()} · cached for five minutes</p>
  {/if}
</section>

<style>
  .screen{height:100%;overflow:auto;padding:calc(18px + env(safe-area-inset-top)) var(--pad-screen) calc(80px + env(safe-area-inset-bottom));max-width:760px;width:100%;margin:auto}
  header,.card-head,.line,.meta,.activity-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  header{margin-bottom:20px}.eyebrow,.source,.updated,.observed{margin:0;color:var(--t-secondary);font-size:12px}.eyebrow,.source{text-transform:uppercase;letter-spacing:.08em;font-weight:600}h1{font-size:28px;margin:2px 0 0}h2{font-size:17px;margin:0}.refresh{padding:9px 13px;border-radius:10px;background:var(--surface-2);font-size:13px}.refresh:disabled{opacity:.55}
  .card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-card);padding:16px;margin-bottom:12px}.card-head span,.meta,.observed,.empty p,.activity-row span{font-size:13px;color:var(--t-secondary)}.source{margin:7px 0 18px}.limit+.limit{margin-top:18px}.line strong{font-size:14px}.line span{font:13px 'JetBrains Mono';color:var(--t-primary)}.track{height:7px;background:var(--surface-2);border-radius:99px;margin:8px 0 5px;overflow:hidden}.track i{display:block;height:100%;background:var(--accent);border-radius:99px}.meta{font-size:12px}.observed{margin-top:14px}.activity h2{margin:4px 0 12px}.activity-row{padding:8px 0;border-top:1px solid var(--hairline)}.warning,.error,.unavailable{padding:12px 14px;border-radius:12px;margin-bottom:12px;font-size:13px}.warning{background:rgba(242,193,78,.1);color:var(--c-wait)}.error{background:rgba(255,107,107,.1);color:var(--c-alert)}.unavailable{border:1px solid var(--hairline);color:var(--t-secondary)}.unavailable p{margin:4px 0}.updated{text-align:center;margin:18px 0}
  @media(min-width:900px){.screen{padding-bottom:28px}}
</style>
