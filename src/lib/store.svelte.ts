// Application state. Svelte 5 runes in a .svelte.ts module, so screens read
// plain properties and the reactivity is handled here.

import { DEFAULTS, loadSettings, saveSettings, POLL_INTERVALS, type Settings } from './settings';
import { paneIndex, type PaneIndex } from './live';
import type { Pane } from './types';

export type Tab = 'fleet' | 'chat';

export type FleetRoute =
  | { screen: 'projects' }
  | { screen: 'project'; projectId: number }
  | { screen: 'task'; taskId: number; projectId: number };

class AppStore {
  settings = $state<Settings>({ ...DEFAULTS });
  settingsLoaded = $state(false);

  tab = $state<Tab>('fleet');
  /** The Fleet stack. Index 0 is always the Projects root. */
  stack = $state<FleetRoute[]>([{ screen: 'projects' }]);
  settingsOpen = $state(false);

  /** Scroll offsets kept per tab so switching tabs restores position. */
  scroll = $state<Record<string, number>>({});

  toast = $state<{ text: string; tone: 'normal' | 'alert'; id: number } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Consecutive failures across all sources; two in a row raise OfflineStrip. */
  failures = $state(0);
  /** Panes cached from the bridge. The live half of every task status. */
  panes = $state<Pane[]>([]);
  /** False until the first pane poll lands; nothing is judged live before then. */
  panesKnown = $state(false);
  /** Set when chat has messages the user has not seen. */
  chatUnread = $state(false);

  /** Page visibility drives every poll (section 9). */
  visible = $state(true);

  get intervals() {
    return POLL_INTERVALS[this.settings.pollSpeed];
  }

  get route(): FleetRoute {
    return this.stack[this.stack.length - 1];
  }

  get offline(): boolean {
    return this.failures >= 2;
  }

  get needsAttention(): boolean {
    return this.panes.some((p) => p.agent_status === 'blocked');
  }

  /** Pane lookup by id, rebuilt only when the pane list itself changes. */
  get paneIndex(): PaneIndex {
    return paneIndex(this.panes);
  }

  /** Record a pane poll, including an empty-but-successful one. */
  setPanes(panes: Pane[]) {
    this.panes = panes;
    this.panesKnown = true;
  }

  async init() {
    this.settings = await loadSettings();
    this.settingsLoaded = true;
  }

  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    await saveSettings(this.settings);
  }

  // ---------- navigation ----------

  /** Wraps a state change in a view transition when the platform has one. */
  transition(fn: () => void) {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduced) doc.startViewTransition(fn);
    else fn();
  }

  push(route: FleetRoute) {
    this.transition(() => {
      this.stack = [...this.stack, route];
    });
  }

  pop() {
    if (this.stack.length <= 1) return false;
    this.transition(() => {
      this.stack = this.stack.slice(0, -1);
    });
    return true;
  }

  setTab(tab: Tab) {
    if (tab === this.tab) return;
    this.transition(() => {
      this.tab = tab;
    });
    if (tab === 'chat') this.chatUnread = false;
  }

  /** Deep link from a chat event: push the task and switch to Fleet. */
  openTask(taskId: number, projectId: number) {
    this.stack = [{ screen: 'projects' }, { screen: 'project', projectId }, { screen: 'task', taskId, projectId }];
    this.setTab('fleet');
  }

  /** Android back: pop the Fleet stack, else leave Chat, else let the app exit. */
  handleBack(): boolean {
    if (this.settingsOpen) {
      this.settingsOpen = false;
      return true;
    }
    if (this.tab === 'chat') {
      this.setTab('fleet');
      return true;
    }
    return this.pop();
  }

  // ---------- feedback ----------

  showToast(text: string, tone: 'normal' | 'alert' = 'normal') {
    this.toast = { text, tone, id: Date.now() };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3000);
  }

  noteSuccess() {
    this.failures = 0;
  }

  noteFailure() {
    this.failures += 1;
  }
}

export const app = new AppStore();
