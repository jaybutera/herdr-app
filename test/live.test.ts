// The bug this file guards: Fleet reported "10 running" while `herdr agent
// list` showed three working panes, because projtrack's ledger status was
// treated as live truth. Each case below is one way that divergence appears.

import { describe, expect, it } from 'vitest';
import {
  countLive,
  isSettled,
  liveCounts,
  liveTaskStatus,
  paneIndex,
  paneIsGone,
  shouldPollPane,
} from '../src/lib/live';
import type { AgentStatus, Pane, Task } from '../src/lib/types';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    project_id: 1,
    title: 'a task',
    status: 'running',
    session_ref: 'w9K:p1',
    result_summary: '',
    created_at: '2026-09-06T19:57:46Z',
    updated_at: '2026-09-06T19:57:51Z',
    ...over,
  };
}

function panes(...specs: [string, AgentStatus][]): Pane[] {
  return specs.map(([pane_id, agent_status]) => ({
    pane_id,
    workspace_id: pane_id.split(':')[0],
    label: 'l',
    cwd: '/tmp',
    agent_status,
  }));
}

const idx = (...specs: [string, AgentStatus][]) => paneIndex(panes(...specs));

describe('liveTaskStatus', () => {
  it('keeps running when the pane is working', () => {
    expect(liveTaskStatus(task(), idx(['w9K:p1', 'working']), true)).toBe('running');
  });

  // The exact case Casper hit: task 30, pane w9K:p1, ledger "running",
  // agent "done".
  it('reports finished when the agent is done but the ledger says running', () => {
    expect(liveTaskStatus(task(), idx(['w9K:p1', 'done']), true)).toBe('finished');
  });

  it('reports stalled when the pane went idle', () => {
    expect(liveTaskStatus(task(), idx(['w9K:p1', 'idle']), true)).toBe('stalled');
  });

  it('reports blocked when the agent is waiting on a person', () => {
    expect(liveTaskStatus(task(), idx(['w9K:p1', 'blocked']), true)).toBe('blocked');
  });

  it('reports orphan when the pane is gone', () => {
    expect(liveTaskStatus(task(), idx(['wZZ:p1', 'working']), true)).toBe('orphan');
  });

  it('reports orphan when a running task has no session_ref at all', () => {
    expect(liveTaskStatus(task({ session_ref: '' }), idx(), true)).toBe('orphan');
  });

  it('keeps the ledger word when the pane exists but the agent is unknown', () => {
    expect(liveTaskStatus(task(), idx(['w9K:p1', 'unknown']), true)).toBe('running');
  });

  // Before the first pane poll lands, and whenever the bridge is unreachable,
  // every session would otherwise look like an orphan. Claiming that is the
  // same class of false statement as the original bug.
  it('trusts the ledger while the pane list is unknown', () => {
    expect(liveTaskStatus(task(), idx(), false)).toBe('running');
    expect(liveTaskStatus(task({ session_ref: '' }), idx(), false)).toBe('running');
  });

  it('never overrides a task the ledger has already closed out', () => {
    for (const s of ['done', 'failed', 'abandoned', 'queued'] as const) {
      expect(liveTaskStatus(task({ status: s }), idx(['w9K:p1', 'working']), true)).toBe(s);
    }
  });
});

describe('isSettled', () => {
  it('covers exactly the states that mean the agent stopped', () => {
    expect(isSettled('finished')).toBe(true);
    expect(isSettled('stalled')).toBe(true);
    expect(isSettled('orphan')).toBe(true);
    expect(isSettled('running')).toBe(false);
    expect(isSettled('blocked')).toBe(false);
    expect(isSettled('done')).toBe(false);
  });
});

describe('countLive', () => {
  it('counts only genuinely working agents as running', () => {
    const tasks = [
      task({ id: 1, session_ref: 'wA8:p1' }),
      task({ id: 2, session_ref: 'w9K:p1' }),
      task({ id: 3, session_ref: 'w9M:p1' }),
    ];
    const i = idx(['wA8:p1', 'working'], ['w9K:p1', 'done'], ['w9M:p1', 'done']);
    expect(countLive(tasks, i, true)).toEqual({ running: 1, attention: 2 });
  });
});

describe('liveCounts', () => {
  it('splits the ledger running bucket by what the panes say', () => {
    const counts = { queued: 1, running: 2, done: 4, failed: 0, abandoned: 1 };
    const running = [task({ id: 30, session_ref: 'w9K:p1' }), task({ id: 31, session_ref: 'w9M:p1' })];
    const out = liveCounts(counts, running, idx(['w9K:p1', 'done'], ['w9M:p1', 'done']), true);
    expect(out.running).toBe(0);
    expect(out.needsReview).toBe(2);
    expect(out.done).toBe(4);
  });

  // A summary that lists fewer running tasks than it counts must not lose them.
  it('keeps running tasks it cannot see panes for', () => {
    const counts = { queued: 0, running: 3, done: 0, failed: 0, abandoned: 0 };
    const running = [task({ id: 1, session_ref: 'w9K:p1' })];
    const out = liveCounts(counts, running, idx(['w9K:p1', 'done']), true);
    expect(out.running).toBe(2); // the one seen is finished; two unseen remain
    expect(out.needsReview).toBe(1);
  });

  it('leaves the ledger counts alone while the pane list is unknown', () => {
    const counts = { queued: 1, running: 2, done: 4, failed: 0, abandoned: 1 };
    const out = liveCounts(counts, [task()], idx(), false);
    expect(out.running).toBe(2);
    expect(out.needsReview).toBe(0);
  });
});

// The pane-gone bug, reported from the live system: task 103 on box showed
// "pane gone" while its agent was working in pane wC:p1. Two things caused it,
// and each has its own guard below.
describe('paneIsGone', () => {
  it('does not believe a 404 while the pane list says the agent is working', () => {
    // The exact shape of the bug: the read asked for the untranslated ref and
    // got 404 for a session the pane list can see running on box.
    expect(paneIsGone(true, 'running')).toBe(false);
  });

  it('does not believe a 404 while the pane list says the agent is blocked', () => {
    expect(paneIsGone(true, 'blocked')).toBe(false);
  });

  it('believes a 404 once the pane list agrees the session is gone', () => {
    expect(paneIsGone(true, 'orphan')).toBe(true);
  });

  it('believes a 404 for a session that has stopped', () => {
    expect(paneIsGone(true, 'finished')).toBe(true);
    expect(paneIsGone(true, 'stalled')).toBe(true);
  });

  it('is false whenever the read did not 404 at all', () => {
    for (const s of ['running', 'blocked', 'finished', 'stalled', 'orphan'] as const) {
      expect(paneIsGone(false, s)).toBe(false);
    }
  });
});

describe('shouldPollPane', () => {
  const base = { hasSession: true, ledgerRunning: true, forceLive: false, refPending: false };

  it('polls a running task that has a session', () => {
    expect(shouldPollPane(base)).toBe(true);
  });

  // The second half of the bug: the poll used to be gated on the same flag the
  // 404 set, so one 404 stopped the only code that could clear it. The poll has
  // to survive a 404 or the screen can never correct itself.
  it('keeps polling regardless of a pane that 404d', () => {
    expect(shouldPollPane(base)).toBe(true);
  });

  it('waits while the ref cannot be turned into a bridge pane id', () => {
    // Polling here asks the bridge for `box:wC:p1` and gets 404 for a session
    // that is fine.
    expect(shouldPollPane({ ...base, refPending: true })).toBe(false);
  });

  it('does not poll a task with no session at all', () => {
    expect(shouldPollPane({ ...base, hasSession: false })).toBe(false);
  });

  it('does not poll a task the ledger has closed out', () => {
    expect(shouldPollPane({ ...base, ledgerRunning: false })).toBe(false);
  });

  it('polls a closed-out task whose live view the user opened anyway', () => {
    expect(shouldPollPane({ ...base, ledgerRunning: false, forceLive: true })).toBe(true);
  });
});
