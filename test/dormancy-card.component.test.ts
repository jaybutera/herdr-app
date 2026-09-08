// What a project card says about going quiet.
//
// Dormant used to mean only "somebody marked this dormant". It is now also
// something the clock does after 24 hours untouched, so a card showing the bare
// word leaves the user guessing which of the two happened. These cover the line
// that answers it, and the case where there must be no line at all.

import { render, screen, cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProjectCard from '../src/components/ProjectCard.svelte';
import { app } from '../src/lib/store.svelte';
import type { AgentStatus, Pane, SummaryProject, Task } from '../src/lib/types';

const NOW = Date.parse('2026-09-08T18:00:00Z');
const HOUR = 3_600_000;

function project(over: Partial<SummaryProject> = {}): SummaryProject {
  return {
    id: 5,
    name: 'zpay v2 site',
    status: 'active',
    created_at: '',
    updated_at: '2026-09-08T17:00:00Z',
    last_activity: '2026-09-08T17:00:00Z',
    running_tasks: [],
    open_tasks: [],
    task_counts: { queued: 0, running: 0, done: 0, failed: 0, abandoned: 0 },
    ...over,
  };
}

/** A project whose last activity was `hoursAgo` before the frozen clock. */
function quietFor(hoursAgo: number, over: Partial<SummaryProject> = {}) {
  const iso = new Date(NOW - hoursAgo * HOUR).toISOString();
  return project({ updated_at: iso, last_activity: iso, ...over });
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    project_id: 5,
    title: 'a task',
    status: 'running',
    session_ref: 'w9K:p1',
    result_summary: '',
    created_at: '',
    updated_at: '2026-09-08T17:50:00Z',
    ...over,
  };
}

function pane(pane_id: string, agent_status: AgentStatus): Pane {
  return {
    pane_id,
    machine: 'local',
    workspace_id: pane_id.split(':')[0],
    label: 'l',
    cwd: '/tmp',
    agent_status,
  };
}

const noop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  app.setPanes([]);
  app.setMachines([]);
  app.panesKnown = true;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('the dormancy note on a project card', () => {
  it('is absent on a project worked on this morning', () => {
    render(ProjectCard, { project: quietFor(2), onOpen: noop, onLongPress: noop });
    expect(screen.queryByTestId('dormancy-note')).toBeNull();
  });

  it('says when a dormant project last had anything happen', () => {
    render(ProjectCard, {
      project: quietFor(30, { status: 'dormant' }),
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.getByTestId('dormancy-note').textContent).toContain('Quiet since');
  });

  it('counts an active project down as it approaches the window', () => {
    render(ProjectCard, { project: quietFor(20), onOpen: noop, onLongPress: noop });
    expect(screen.getByTestId('dormancy-note').textContent).toContain('Dormant in 4 h');
  });

  it('counts down to the window projtrack actually reported', () => {
    // The server's number, not a copy of the default hardcoded in the UI.
    render(ProjectCard, {
      project: quietFor(5),
      dormantAfterHours: 6,
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.getByTestId('dormancy-note').textContent).toContain('Dormant in 1 h');
  });

  it('says nothing on a dead project, however old', () => {
    render(ProjectCard, {
      project: quietFor(900, { status: 'dead' }),
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.queryByTestId('dormancy-note')).toBeNull();
  });

  it('stays quiet when task activity keeps a stale project row awake', () => {
    // The rollup is the whole point: an old project row plus recent task work
    // is an awake project, and the card must not threaten to park it.
    render(ProjectCard, {
      project: project({
        updated_at: new Date(NOW - 40 * HOUR).toISOString(),
        last_activity: new Date(NOW - 1 * HOUR).toISOString(),
      }),
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.queryByTestId('dormancy-note')).toBeNull();
  });

  it('does not call a project quiet while one of its agents is working', () => {
    // Reachable by marking a project dormant with an agent still mid-run on
    // it. "1 running · Quiet since 12 min ago" is a card contradicting itself,
    // and the pane is the better witness about what is happening now.
    app.setPanes([pane('w9K:p1', 'working')]);
    render(ProjectCard, {
      project: quietFor(30, { status: 'dormant', running_tasks: [task()] }),
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.queryByTestId('dormancy-note')).toBeNull();
  });

  it('does not call a project quiet while one of its agents is blocked', () => {
    app.setPanes([pane('w9K:p1', 'blocked')]);
    render(ProjectCard, {
      project: quietFor(30, { status: 'dormant', running_tasks: [task()] }),
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.queryByTestId('dormancy-note')).toBeNull();
  });

  it('calls it quiet again once that agent has stopped', () => {
    app.setPanes([pane('w9K:p1', 'done')]);
    render(ProjectCard, {
      project: quietFor(30, { status: 'dormant', running_tasks: [task()] }),
      onOpen: noop,
      onLongPress: noop,
    });
    expect(screen.getByTestId('dormancy-note').textContent).toContain('Quiet since');
  });

  it('still renders against a projtrack that sends no last_activity', () => {
    const p = quietFor(20);
    delete p.last_activity;
    render(ProjectCard, { project: p, onOpen: noop, onLongPress: noop });
    expect(screen.getByTestId('dormancy-note').textContent).toContain('Dormant in 4 h');
  });
});
