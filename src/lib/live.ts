// Live task status: what the agent is actually doing, not what the ledger says.
//
// projtrack's task.status is a ledger value. It is written when a task is
// dispatched and rewritten only when something closes the task out; if a
// session finishes without that write landing, the row stays "running"
// indefinitely. The pane bridge is the live signal: agent_status comes from the
// agent itself.
//
// Casper hit this on the phone: Fleet said "10 running" while `herdr agent
// list` reported three working panes, and one of those was not a projtrack task
// at all. Task detail already read the pane, so the same task read "Running" in
// the list that led to it and "Finished" once opened. Two screens, one task,
// two answers.
//
// So a task that claims to be running is believed only while its pane agrees.
// Everything else, including a finished task's own ledger row, is left alone:
// once a task is done, done is the truth and no pane can contradict it.

import { paneIdForRef } from './pane-id';
import type { AgentStatus, Pane, Task, TaskCounts } from './types';

/** What the UI shows for a task, after the live pane has its say. */
export type LiveTaskStatus =
  | 'running' // the pane is working: the ledger and the agent agree
  | 'blocked' // the pane is waiting on Casper
  | 'finished' // the agent stopped; the ledger has not caught up
  | 'stalled' // the pane went idle without finishing
  | 'orphan' // the ledger says running, but there is no such pane
  | 'queued'
  | 'done'
  | 'failed'
  | 'abandoned';

/** Live statuses that mean "this task is no longer moving on its own". */
const SETTLED: ReadonlySet<LiveTaskStatus> = new Set(['finished', 'stalled', 'orphan']);

export type PaneIndex = ReadonlyMap<string, Pane>;

export function paneIndex(panes: readonly Pane[]): PaneIndex {
  return new Map(panes.map((p) => [p.pane_id, p]));
}

/**
 * The status to display for `task`.
 *
 * `panes` being empty is treated as "no information", not as "every pane is
 * gone": the bridge can be down or still on its first poll, and reporting a
 * fleet of orphans in that window would be its own false claim.
 */
export function liveTaskStatus(
  task: Task,
  panes: PaneIndex,
  panesKnown: boolean,
  machines: readonly string[] = []
): LiveTaskStatus {
  if (task.status !== 'running') return task.status;
  if (!panesKnown) return 'running';
  if (!task.session_ref) return 'orphan';

  // The ledger spells a remote session `box:w6:p1` and the pane list spells it
  // `box/w6:p1`. Looking the ref up unchanged misses every session on another
  // machine and reports a healthy one as an orphan.
  const pane = panes.get(paneIdForRef(task.session_ref, machines));
  if (!pane) return 'orphan';

  switch (pane.agent_status) {
    case 'working':
      return 'running';
    case 'blocked':
      return 'blocked';
    case 'done':
      return 'finished';
    case 'idle':
      return 'stalled';
    default:
      // 'unknown': the pane exists but the agent did not say. Keep the ledger's
      // word rather than inventing a state.
      return 'running';
  }
}

/** True when the task needs Casper before anything else happens. */
export function isSettled(s: LiveTaskStatus): boolean {
  return SETTLED.has(s);
}

/** Tasks still genuinely moving, for the counts a screen shows. */
export function countLive(
  tasks: readonly Task[],
  panes: PaneIndex,
  panesKnown: boolean,
  machines: readonly string[] = []
) {
  let running = 0;
  let attention = 0;
  for (const t of tasks) {
    const s = liveTaskStatus(t, panes, panesKnown, machines);
    if (s === 'running') running += 1;
    else if (s === 'blocked' || isSettled(s)) attention += 1;
  }
  return { running, attention };
}

/**
 * The task counts a project card shows, with the ledger's `running` bucket
 * split into what is still running and what has quietly stopped.
 */
export function liveCounts(
  counts: TaskCounts | undefined,
  runningTasks: readonly Task[],
  panes: PaneIndex,
  panesKnown: boolean,
  machines: readonly string[] = []
): TaskCounts & { needsReview: number } {
  const base: TaskCounts = {
    queued: counts?.queued ?? 0,
    running: counts?.running ?? 0,
    done: counts?.done ?? 0,
    failed: counts?.failed ?? 0,
    abandoned: counts?.abandoned ?? 0,
  };
  if (!panesKnown) return { ...base, needsReview: 0 };

  // Only the tasks we can actually see the panes for can be reclassified; a
  // project whose running list is truncated keeps the rest in `running`.
  let stillRunning = 0;
  let needsReview = 0;
  for (const t of runningTasks) {
    const s = liveTaskStatus(t, panes, panesKnown, machines);
    if (s === 'running') stillRunning += 1;
    else needsReview += 1;
  }
  const unseen = Math.max(0, base.running - runningTasks.length);
  return { ...base, running: stillRunning + unseen, needsReview };
}

/**
 * Whether a 404 from the pane read should be believed.
 *
 * The read addresses one pane and answers about that pane alone; the pane list
 * is the same signal every other screen judges the task by, and it carries the
 * ids the bridge itself issued. When the list still shows the session working,
 * a 404 from the read is the stale half of a disagreement, not news.
 *
 * This is the bug that put "Pane gone" on task 103 while its agent was working
 * in pane wC:p1 on box: the read asked for the untranslated ref `box:wC:p1`,
 * an id the bridge has never issued, and got 404 back for a live session.
 */
export function paneIsGone(paneGone: boolean, live: LiveTaskStatus): boolean {
  return paneGone && live !== 'running' && live !== 'blocked';
}

/**
 * Whether the pane poll should keep running.
 *
 * Deliberately not the same condition as the live view. Gating the poll on a
 * flag that a 404 sets makes that 404 permanent: the only thing that can clear
 * it is the read the gate has just switched off. The poll runs while the task
 * claims a session and the ref can be addressed; what the read finds is then
 * free to change its mind.
 */
export function shouldPollPane(opts: {
  hasSession: boolean;
  ledgerRunning: boolean;
  forceLive: boolean;
  refPending: boolean;
}): boolean {
  return opts.hasSession && (opts.ledgerRunning || opts.forceLive) && !opts.refPending;
}
