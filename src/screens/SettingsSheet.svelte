<script lang="ts">
  // Section 5.5. Full-screen sheet; the Test buttons never block closing.
  import Sheet from '../components/Sheet.svelte';
  import TextField from '../components/TextField.svelte';
  import SegmentedFilter from '../components/SegmentedFilter.svelte';
  import { app } from '../lib/store.svelte';
  import { apiFailureLabel, chat, projtrack } from '../lib/api';
  import { DEFAULTS, type PollSpeed } from '../lib/settings';
  import { permission, requestPermission } from '../lib/notify';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  let projtrackUrl = $state(app.settings.projtrackUrl);
  let bridgeUrl = $state(app.settings.bridgeUrl);
  let token = $state(app.settings.token);
  let speed = $state<PollSpeed>(app.settings.pollSpeed);
  let notify = $state(app.settings.notify);
  /** Why notifications are off when the toggle alone does not explain it. */
  let notifyNote = $state<string | null>(null);

  let projtrackTest = $state<{ ok: boolean; text: string } | null>(null);
  let bridgeTest = $state<{ ok: boolean; text: string } | null>(null);

  // Re-seed the fields whenever the sheet opens, so a cancel is not sticky.
  $effect(() => {
    if (open) {
      projtrackUrl = app.settings.projtrackUrl;
      bridgeUrl = app.settings.bridgeUrl;
      token = app.settings.token;
      speed = app.settings.pollSpeed;
      notify = app.settings.notify;
      notifyNote = null;
      projtrackTest = null;
      bridgeTest = null;
      void describeNotifications();
    }
  });

  /**
   * Turning notifications on asks the platform for permission, from this tap.
   * Chrome refuses the prompt without a user gesture and Android 13 shows its
   * own, which is why the toggle does the asking rather than app start. A
   * refusal turns the switch back off, because leaving it on would promise
   * something the app cannot deliver.
   */
  async function setNotify(on: boolean) {
    notifyNote = null;
    if (!on) {
      notify = false;
      return;
    }
    const state = await requestPermission();
    if (state === 'granted') {
      notify = true;
      notifyNote = null;
      return;
    }
    notify = false;
    notifyNote =
      state === 'denied'
        ? 'Blocked. Allow notifications for this app in the system settings.'
        : state === 'unsupported'
          ? 'This build has no system notifications. The Chat tab still shows a dot.'
          : 'Not granted.';
  }

  /** Says when the switch is on but the platform has since withdrawn it. */
  async function describeNotifications() {
    if (!app.settings.notify) return;
    const state = await permission();
    if (state !== 'granted') {
      notifyNote = 'Permission is no longer granted. Turn this off and on again.';
    }
  }

  async function testProjtrack() {
    projtrackTest = null;
    try {
      await projtrack.health({ ...app.settings, projtrackUrl, token });
      projtrackTest = { ok: true, text: 'Reachable' };
    } catch (e) {
      projtrackTest = { ok: false, text: apiFailureLabel(e, !!token.trim()) };
    }
  }

  async function testBridge() {
    bridgeTest = null;
    try {
      await chat.state({ ...app.settings, bridgeUrl, token });
      bridgeTest = { ok: true, text: 'Reachable' };
    } catch (e) {
      bridgeTest = { ok: false, text: apiFailureLabel(e, !!token.trim()) };
    }
  }

  async function done() {
    await app.updateSettings({
      projtrackUrl: projtrackUrl.trim() || DEFAULTS.projtrackUrl,
      bridgeUrl: bridgeUrl.trim() || DEFAULTS.bridgeUrl,
      token: token.trim(),
      pollSpeed: speed,
      notify,
    });
    onClose();
  }

  const version = __APP_VERSION__;
  const buildHash = __BUILD_HASH__;
</script>

<Sheet {open} onClose={done} full>
  <div class="head">
    <h2 class="t-heading">Settings</h2>
    <button class="done" onclick={done}>Done</button>
  </div>

  <div class="body">
    <TextField
      label="Bridge URL"
      bind:value={bridgeUrl}
      placeholder={DEFAULTS.bridgeUrl}
      onTest={testBridge}
      testResult={bridgeTest}
    />
    <TextField
      label="projtrack URL"
      bind:value={projtrackUrl}
      placeholder={DEFAULTS.bridgeUrl}
      onTest={testProjtrack}
      testResult={projtrackTest}
    />
    <p class="t-meta note">
      projtrack is reached through the bridge, so both are normally the same
      host and port.
    </p>
    <TextField label="Bearer token" bind:value={token} masked placeholder="none" />

    <div class="field">
      <span class="t-label">Live refresh</span>
      <div class="seg">
        <SegmentedFilter
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'normal', label: 'Normal' },
            { value: 'slow', label: 'Slow' },
          ]}
          value={speed}
          onChange={(v) => (speed = v)}
        />
      </div>
      <p class="t-meta hint">
        {#if speed === 'fast'}1 s pane · 2 s chat{:else if speed === 'normal'}2 s pane · 3 s chat{:else}5
          s pane · 10 s chat{/if}
      </p>
    </div>

    <div class="field">
      <span class="t-label">New message notifications</span>
      <div class="seg">
        <SegmentedFilter
          options={[
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
          ]}
          value={notify ? 'on' : 'off'}
          onChange={(v) => void setNotify(v === 'on')}
        />
      </div>
      <p class="t-meta hint">
        {#if notifyNote}{notifyNote}{:else}A system notification when the orchestrator answers or a
          session finishes while the chat is not on screen. The Chat tab shows a dot either way.{/if}
      </p>
    </div>

    <div class="about">
      <span class="t-label">About</span>
      <p class="t-meta">Orcha {version} · build <span class="mono">{buildHash}</span></p>
      <p class="t-meta">Spec: <span class="mono">~/src/orcha-app/DESIGN.md</span></p>
    </div>
  </div>
</Sheet>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px var(--pad-screen) 12px;
    flex: none;
  }
  h2 {
    margin: 0;
  }
  .done {
    color: var(--accent);
    font-weight: 600;
    font-size: 15px;
    min-height: 44px;
    padding: 0 4px;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--pad-screen) 32px;
  }
  .field {
    margin-bottom: 20px;
  }
  .seg {
    margin-top: 6px;
  }
  .hint {
    margin: 6px 0 0;
  }
  .note {
    margin: -8px 0 20px;
  }
  .about {
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
  }
  .about p {
    margin: 6px 0 0;
  }
</style>
