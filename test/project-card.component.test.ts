// What a project row shows, in each state a live pane can put it in.
//
// The rule the card enforces: a spinner means the pane says the agent is
// working right now. A task whose ledger row says "running" while its pane has
// stopped, or whose pane is gone, is not running and must not spin; it belongs
// behind the expander with everything else.

import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ProjectCard from '../src/components/ProjectCard.svelte';
import { app } from '../src/lib/store.svelte';
import type { AgentStatus, Machine, Pane, SummaryProject, Task } from '../src/lib/types';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    project_id: 5,
    title: 'a task',
    status: 'running',
    session_ref: 'w9K:p1',
    result_summary: '',
    created_at: '2026-09-07T19:41:21Z',
    updated_at: '2026-09-07T19:46:16Z',
    ...over,
  };
}

function pane(pane_id: string, machine: string, agent_status: AgentStatus): Pane {
  return {
    pane_id,
    machine,
    workspace_id: pane_id.split(':')[0],
    label: 'l',
    cwd: '/tmp',
    agent_status,
  };
}

function project(over: Partial<SummaryProject> = {}): SummaryProject {
  return {
    id: 5,
    name: 'transaction volume emulator',
    status: 'active',
    created_at: '',
    updated_at: '2026-09-07T19:46:16Z',
    running_tasks: [],
    open_tasks: [],
    task_counts: { queued: 0, running: 0, done: 0, failed: 0, abandoned: 0 },
    ...over,
  };
}

function setFleet(panes: Pane[], machines: Machine[] = [], known = true) {
  app.setPanes(panes);
  app.setMachines(machines);
  app.panesKnown = known;
}

const noop = () => {};
const draw = (p: SummaryProject) =>
  render(ProjectCard, { props: { project: p, onOpen: noop, onLongPress: noop } });

const runningRows = () => screen.queryAllByTestId('running-task');
const otherRows = () => screen.queryAllByTestId('other-task');
const blockedRows = () => screen.queryAllByTestId('blocked-task');

beforeEach(() => setFleet([], [], true));
afterEach(cleanup);

describe('a task running on this laptop', () => {
  it('is listed on the collapsed card with a spinner', () => {
    const t = task({ id: 30, title: 'local work', session_ref: 'w9K:p1' });
    setFleet([pane('w9K:p1', 'local', 'working')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(1);
    expect(runningRows()[0].textContent).toContain('local work');
    // The spinner is the rotating arc, labelled for the screen reader.
    expect(runningRows()[0].querySelector('[aria-label="Working"]')).not.toBeNull();
  });
});

describe('a task running on box', () => {
  // The live case from the report: task 103, session_ref box:wC:p1, pane
  // box/wC:p1 on box, agent working. It must read as running, not pane gone.
  const t = task({ id: 103, title: 'traffic-harness fix round 1 on box', session_ref: 'box:wC:p1' });

  it('is listed as running once the machine list names box', () => {
    setFleet(
      [pane('box/wC:p1', 'box', 'working')],
      [{ name: 'local', reachable: true }, { name: 'box', reachable: true }]
    );
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(1);
    expect(runningRows()[0].textContent).toContain('traffic-harness fix round 1 on box');
  });

  it('badges the machine so a remote session is not read as local', () => {
    setFleet(
      [pane('box/wC:p1', 'box', 'working')],
      [{ name: 'local', reachable: true }, { name: 'box', reachable: true }]
    );
    draw(project({ running_tasks: [t] }));

    expect(runningRows()[0].textContent).toContain('box');
  });

  it('resolves from the panes alone when /machines has not answered', () => {
    // A bridge too old to serve /machines still names the machine on each pane,
    // which is enough to translate the ref.
    setFleet([pane('box/wC:p1', 'box', 'working')], []);
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(1);
  });
});

describe('a task whose pane is gone', () => {
  it('does not spin and is not on the collapsed card', async () => {
    const t = task({ id: 41, title: 'orphaned task', session_ref: 'box:wZZ:p1' });
    setFleet(
      [pane('box/wC:p1', 'box', 'working')],
      [{ name: 'local', reachable: true }, { name: 'box', reachable: true }]
    );
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(0);
    // It is a task like any other that is not running: behind the expander,
    // where it says what actually happened to it.
    expect(screen.queryByText('Session gone')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(otherRows()).toHaveLength(1);
    expect(screen.getByText('Session gone')).toBeTruthy();
  });
});

describe('a task that is idle or finished', () => {
  it('a stopped agent is not shown as running', () => {
    const t = task({ id: 42, title: 'stopped task', session_ref: 'w9K:p1' });
    setFleet([pane('w9K:p1', 'local', 'idle')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(0);
  });

  it('a finished agent is not shown as running', () => {
    const t = task({ id: 43, title: 'finished task', session_ref: 'w9K:p1' });
    setFleet([pane('w9K:p1', 'local', 'done')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(0);
  });

  it('a queued task never spins', () => {
    const t = task({ id: 44, title: 'queued task', status: 'queued', session_ref: '' });
    draw(project({ open_tasks: [t] }));

    expect(runningRows()).toHaveLength(0);
  });
});

describe('collapsed and expanded', () => {
  const running = task({ id: 30, title: 'working task', session_ref: 'w9K:p1' });
  const queued = task({ id: 31, title: 'queued task', status: 'queued', session_ref: '' });
  const done = task({ id: 32, title: 'done task', status: 'done', session_ref: '' });

  function drawMixed() {
    setFleet([pane('w9K:p1', 'local', 'working')], [{ name: 'local', reachable: true }]);
    return draw(project({ running_tasks: [running], open_tasks: [queued, done] }));
  }

  it('shows only the running task until the card is expanded', () => {
    drawMixed();
    expect(runningRows()).toHaveLength(1);
    expect(otherRows()).toHaveLength(0);
    expect(screen.queryByText('queued task')).toBeNull();
  });

  it('names how many tasks the expander is hiding', () => {
    drawMixed();
    expect(screen.getByText('2 other tasks')).toBeTruthy();
  });

  it('reveals the rest on click and hides them again', async () => {
    drawMixed();
    const toggle = screen.getByRole('button', { expanded: false });

    await fireEvent.click(toggle);
    expect(otherRows()).toHaveLength(2);
    expect(screen.getByText('queued task')).toBeTruthy();
    // The running task stays where it was rather than moving into the list.
    expect(runningRows()).toHaveLength(1);

    await fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(otherRows()).toHaveLength(0);
  });

  it('offers no expander when every task is running', () => {
    setFleet([pane('w9K:p1', 'local', 'working')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [running] }));

    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });

  it('says "1 other task" rather than "1 other tasks"', () => {
    setFleet([pane('w9K:p1', 'local', 'working')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [running], open_tasks: [queued] }));

    expect(screen.getByText('1 other task')).toBeTruthy();
  });

  it('lists a task once when it appears in both running and open', () => {
    setFleet([pane('w9K:p1', 'local', 'working')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [running], open_tasks: [running] }));

    expect(runningRows()).toHaveLength(1);
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });
});


// Should-fix 1. A blocked pane is an agent that has stopped and is waiting on a
// permission prompt or a question. It is the one state that cannot resolve
// itself, and the collapsed card showed only `live === 'running'`, so it was
// also the one state the list said nothing about until the card was tapped.
describe('a task whose agent is waiting on an answer', () => {
  const t = task({ id: 51, title: 'needs a permission answer', session_ref: 'w9K:p1' });

  function drawBlocked() {
    setFleet([pane('w9K:p1', 'local', 'blocked')], [{ name: 'local', reachable: true }]);
    return draw(project({ running_tasks: [t] }));
  }

  it('is on the collapsed card without expanding anything', () => {
    drawBlocked();

    expect(blockedRows()).toHaveLength(1);
    expect(blockedRows()[0].textContent).toContain('needs a permission answer');
  });

  it('is not hidden behind the expander', () => {
    drawBlocked();

    // Nothing is left to hide, so there is no expander at all.
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
    expect(otherRows()).toHaveLength(0);
  });

  it('says what it needs rather than leaving the row to be guessed at', () => {
    drawBlocked();

    expect(blockedRows()[0].textContent).toContain('Needs you');
  });

  it('does not spin: nothing is moving until it is answered', () => {
    drawBlocked();

    // The rotating arc is the running mark and means an agent is mid-turn.
    expect(runningRows()).toHaveLength(0);
    expect(blockedRows()[0].querySelector('[aria-label="Working"]')).toBeNull();
    expect(blockedRows()[0].querySelector('[aria-label="Needs you"]')).not.toBeNull();
  });

  it('marks the card itself, so the project is picked out of the list', () => {
    drawBlocked();

    expect(screen.queryAllByTestId('blocked-mark')).toHaveLength(1);
  });

  it('badges the machine for a blocked session on box', () => {
    const remote = task({ id: 52, title: 'blocked on box', session_ref: 'box:wC:p1' });
    setFleet(
      [pane('box/wC:p1', 'box', 'blocked')],
      [{ name: 'local', reachable: true }, { name: 'box', reachable: true }]
    );
    draw(project({ running_tasks: [remote] }));

    expect(blockedRows()).toHaveLength(1);
    expect(blockedRows()[0].textContent).toContain('box');
  });

  it('shows alongside a running task rather than replacing it', () => {
    const working = task({ id: 53, title: 'still working', session_ref: 'wA8:p1' });
    setFleet(
      [pane('w9K:p1', 'local', 'blocked'), pane('wA8:p1', 'local', 'working')],
      [{ name: 'local', reachable: true }]
    );
    draw(project({ running_tasks: [t, working] }));

    expect(blockedRows()).toHaveLength(1);
    expect(runningRows()).toHaveLength(1);
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });

  it('leaves the settled tasks behind the expander where they were', () => {
    const stopped = task({ id: 54, title: 'stopped task', session_ref: 'wA8:p1' });
    setFleet(
      [pane('w9K:p1', 'local', 'blocked'), pane('wA8:p1', 'local', 'idle')],
      [{ name: 'local', reachable: true }]
    );
    draw(project({ running_tasks: [t, stopped] }));

    expect(blockedRows()).toHaveLength(1);
    expect(screen.getByText('1 other task')).toBeTruthy();
    expect(screen.queryByText('stopped task')).toBeNull();
  });
});

describe('before the first pane poll lands', () => {
  const t = task({ id: 103, title: 'box task', session_ref: 'box:wC:p1' });

  it('believes the ledger rather than calling a live session gone', () => {
    // panesKnown false means "no information". Showing every session as stopped
    // in that window is the same false claim the live layer exists to prevent.
    setFleet([], [], false);
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(1);
  });

  // Nit 8. Keeping the row is right; claiming the agent is mid-turn is not. With
  // the bridge down every ledger-running task would turn its arc, at whatever
  // age, and the ledger is exactly the source that goes stale silently.
  it('holds the arc still rather than asserting an agent is working', () => {
    setFleet([], [], false);
    draw(project({ running_tasks: [t] }));

    const row = runningRows()[0];
    expect(row.querySelector('[aria-label="Working"]')).toBeNull();
    expect(row.querySelector('[aria-label="Listed as running"]')).not.toBeNull();
  });

  it('turns the arc once the pane list confirms the agent is working', () => {
    setFleet(
      [pane('box/wC:p1', 'box', 'working')],
      [{ name: 'local', reachable: true }, { name: 'box', reachable: true }]
    );
    draw(project({ running_tasks: [t] }));

    expect(runningRows()[0].querySelector('[aria-label="Working"]')).not.toBeNull();
  });
});

// Nit 6. The expander is a disclosure control; a screen reader needs to be able
// to get from it to what it revealed.
describe('the expander', () => {
  it('names the region it reveals once that region exists', async () => {
    const running = task({ id: 30, title: 'working task', session_ref: 'w9K:p1' });
    const queued = task({ id: 31, title: 'queued task', status: 'queued', session_ref: '' });
    setFleet([pane('w9K:p1', 'local', 'working')], [{ name: 'local', reachable: true }]);
    draw(project({ running_tasks: [running], open_tasks: [queued] }));

    const toggle = screen.getByRole('button', { expanded: false });
    // Collapsed there is nothing to point at, so it points at nothing.
    expect(toggle.getAttribute('aria-controls')).toBeNull();

    await fireEvent.click(toggle);
    const open = screen.getByRole('button', { expanded: true });
    const id = open.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).not.toBeNull();
  });
});
