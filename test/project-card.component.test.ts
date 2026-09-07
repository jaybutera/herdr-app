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

describe('before the first pane poll lands', () => {
  it('believes the ledger rather than calling a live session gone', () => {
    // panesKnown false means "no information". Showing every session as stopped
    // in that window is the same false claim the live layer exists to prevent.
    const t = task({ id: 103, title: 'box task', session_ref: 'box:wC:p1' });
    setFleet([], [], false);
    draw(project({ running_tasks: [t] }));

    expect(runningRows()).toHaveLength(1);
  });
});
