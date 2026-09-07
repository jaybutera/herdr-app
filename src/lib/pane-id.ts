// Turning a task's session_ref into a pane id the bridge understands.
//
// The two backends spell the same session differently, and both spellings are
// load-bearing where they are:
//
//   projtrack stores `session_ref` as `<machine>:<session id>`. That form is
//   what a person is told to type: `ssh box claude attach 93ee19ff`.
//
//   The pane bridge addresses a pane as `<machine>/<pane id>`. The slash is
//   what keeps a local id bare — `w95:p1` means this laptop — so the
//   orchestrator's watcher and the Claude hooks keep working with ids they
//   already hold.
//
// Without a translation between them every task on another machine looks like
// an orphan: the ledger says `box:w6:p1`, the pane list says `box/w6:p1`, the
// lookup misses, and the UI reports a session that is running fine as having no
// pane at all.

/** Machine name plus the pane or session id, from a stored session_ref. */
export interface SessionRef {
  machine: string;
  /** The id as the machine's own herdr knows it, with no prefix. */
  id: string;
  /** The pane id the bridge takes, prefixed unless it is local. */
  paneId: string;
}

export const LOCAL = 'local';

/**
 * Parse `session_ref`, given the machines the bridge knows about.
 *
 * The machine list is needed because a colon does not by itself mean a prefix:
 * a local pane id is `w95:p1`, and `w95` is not a machine. Splitting on the
 * last colon instead would break the other way, turning `box:w6:p1` into `p1`.
 *
 * With no machine list yet — the first poll has not landed — nothing is treated
 * as prefixed. That reads a box task as local for a moment, which shows it as
 * an orphan until the list arrives; the alternative is guessing that any
 * leading word is a machine, which would mangle every local pane id instead.
 */
export function parseSessionRef(ref: string | null | undefined, machines: readonly string[]): SessionRef {
  const text = String(ref ?? '');
  const colon = text.indexOf(':');
  if (colon > 0) {
    const head = text.slice(0, colon);
    if (head !== LOCAL && machines.includes(head)) {
      const id = text.slice(colon + 1);
      return { machine: head, id, paneId: `${head}/${id}` };
    }
  }
  return { machine: LOCAL, id: text, paneId: text };
}

/** The bridge pane id for a task's session_ref. */
export function paneIdForRef(ref: string | null | undefined, machines: readonly string[]): string {
  return parseSessionRef(ref, machines).paneId;
}

/** The machine a session_ref names, for showing on a session row. */
export function machineForRef(ref: string | null | undefined, machines: readonly string[]): string {
  return parseSessionRef(ref, machines).machine;
}

/** True when a machine name is worth showing; the laptop is the unmarked case. */
export function isRemote(machine: string): boolean {
  return !!machine && machine !== LOCAL;
}
