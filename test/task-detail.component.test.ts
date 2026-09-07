// Task detail against a bridge that behaves like the real one.
//
// The reported bug lived here rather than in the status logic: the pane read
// asked for a pane id the bridge had never issued, took the resulting 404 as
// proof the session was dead, and then stopped the only poll that could have
// corrected it.

import { render, screen, cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../src/lib/store.svelte';
import { ApiError } from '../src/lib/api';
import type { Machine, Pane, TaskDetail as TaskDetailShape } from '../src/lib/types';

// The bridge the app talks to, standing in for the live one. `read` answers
// only for `box/wC:p1`, exactly as the real bridge does: the untranslated ref
// `box:wC:p1` gets HTTP 404 "pane gone".
const reads = vi.fn();
const panes = vi.fn();
const task = vi.fn();

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api');
  return {
    ...actual,
    projtrack: { task: (...a: unknown[]) => task(...a), addNote: vi.fn(), setTaskStatus: vi.fn() },
    bridge: {
      read: (...a: unknown[]) => reads(...a),
      pane: (...a: unknown[]) => panes(...a),
      send: vi.fn(),
      keys: vi.fn(),
      text: vi.fn(),
    },
  };
});

const { default: TaskDetail } = await import('../src/screens/TaskDetail.svelte');

/** Task 103 as projtrack actually holds it. */
const TASK_103: TaskDetailShape = {
  id: 103,
  project_id: 5,
  title: 'traffic-harness fix round 1 on box',
  status: 'running',
  session_ref: 'box:wC:p1',
  result_summary: '',
  created_at: '2026-09-07T19:41:21Z',
  updated_at: '2026-09-07T19:46:16Z',
  events: [],
};

const BOX_PANE: Pane = {
  pane_id: 'box/wC:p1',
  machine: 'box',
  workspace_id: 'wC',
  label: 'traffic fix r1',
  cwd: '/home/casper/src/zecp2p-traffic',
  agent_status: 'working',
};

const MACHINES: Machine[] = [
  { name: 'local', reachable: true },
  { name: 'box', reachable: true },
];

/** The bridge answers for the id it issued and 404s on anything else. */
function bridgeAnsweringOnlyFor(paneId: string) {
  reads.mockImplementation(async (_s: unknown, id: string) => {
    if (id !== paneId) throw new ApiError('HTTP 404', 404);
    return {
      pane_id: paneId,
      machine: 'box',
      agent_status: 'working' as const,
      read_at: '2026-09-07T19:56:23Z',
      text: '● Now the sendrawtransaction handler:',
    };
  });
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  vi.clearAllMocks();
  task.mockResolvedValue(TASK_103);
  panes.mockResolvedValue(BOX_PANE);
  bridgeAnsweringOnlyFor('box/wC:p1');
  app.setPanes([]);
  app.setMachines([]);
  app.panesKnown = false;
});
afterEach(cleanup);

const draw = () => render(TaskDetail, { props: { taskId: 103, onBack: () => {} } });

describe('a session running on box', () => {
  it('reads the pane by the id the bridge issued, not the raw ref', async () => {
    app.setPanes([BOX_PANE]);
    app.setMachines(MACHINES);
    app.panesKnown = true;

    draw();
    await flush();

    expect(reads).toHaveBeenCalled();
    expect(reads.mock.calls.every((c) => c[1] === 'box/wC:p1')).toBe(true);
    // The untranslated ref is what produced the 404 in the live system.
    expect(reads.mock.calls.some((c) => c[1] === 'box:wC:p1')).toBe(false);
  });

  it('does not say "Pane gone" for a session the pane list shows working', async () => {
    app.setPanes([BOX_PANE]);
    app.setMachines(MACHINES);
    app.panesKnown = true;

    draw();
    await flush();

    expect(screen.queryByText('Pane gone')).toBeNull();
  });

  it('shows the transcript rather than an error', async () => {
    app.setPanes([BOX_PANE]);
    app.setMachines(MACHINES);
    app.panesKnown = true;

    draw();
    await flush();

    expect(screen.getByText(/sendrawtransaction/)).toBeTruthy();
  });

  it('asks the bridge nothing until the machine list can resolve the ref', async () => {
    // The window the bug lived in: the screen mounts before App's poll lands.
    draw();
    await flush();

    expect(reads).not.toHaveBeenCalled();
    expect(screen.queryByText('Pane gone')).toBeNull();
  });

  it('reads the pane on the tick the machine list arrives', async () => {
    draw();
    await flush();
    expect(reads).not.toHaveBeenCalled();

    app.setPanes([BOX_PANE]);
    app.setMachines(MACHINES);
    app.panesKnown = true;
    await flush();

    expect(reads).toHaveBeenCalledWith(expect.anything(), 'box/wC:p1');
    expect(screen.queryByText('Pane gone')).toBeNull();
  });
});

describe('a session whose pane really is gone', () => {
  it('says so once the pane list agrees', async () => {
    const dead = { ...TASK_103, session_ref: 'box:wZZ:p1' };
    task.mockResolvedValue(dead);
    app.setPanes([BOX_PANE]); // a different pane; wZZ:p1 is not there
    app.setMachines(MACHINES);
    app.panesKnown = true;

    draw();
    await flush();

    expect(screen.getByText('Pane gone')).toBeTruthy();
  });
});

describe('a session running on this laptop', () => {
  it('reads a local pane id unchanged', async () => {
    const local = { ...TASK_103, session_ref: 'w9K:p1' };
    task.mockResolvedValue(local);
    bridgeAnsweringOnlyFor('w9K:p1');
    app.setPanes([{ ...BOX_PANE, pane_id: 'w9K:p1', machine: 'local', workspace_id: 'w9K' }]);
    app.setMachines(MACHINES);
    app.panesKnown = true;

    draw();
    await flush();

    expect(reads).toHaveBeenCalledWith(expect.anything(), 'w9K:p1');
    expect(screen.queryByText('Pane gone')).toBeNull();
  });
});
