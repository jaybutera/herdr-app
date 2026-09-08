// How the UI talks about a project going quiet.
//
// projtrack marks a project dormant once nothing has happened on it for
// `dormant_after_hours` (24 by default): no task created, patched or spawned,
// no event appended, no PATCH of the project itself. Using it puts it back to
// active. The rule is projtrack's; this module only decides what to say about
// it, so a card can explain a status the user never set by hand.

import { relativeTime } from './format';
import type { ProjectStatus } from './types';

/** projtrack's default, used until a summary says otherwise. */
export const DEFAULT_DORMANT_AFTER_HOURS = 24;

/**
 * How close to dormant an active project is, as a fraction of the window.
 *
 * Past this, the card says when the project goes quiet. Two thirds of a day is
 * roughly eight hours of warning: long enough to be a heads-up rather than an
 * alarm, and it only ever appears on a project nobody has touched since
 * yesterday.
 */
export const WARN_AT = 2 / 3;

export interface Dormancy {
  /** Hours the project has left before projtrack marks it dormant. 0 once due. */
  hoursLeft: number;
  /** True for an active project close enough to dormant to be worth saying so. */
  soon: boolean;
  /** The line a card shows, or '' when there is nothing worth saying. */
  note: string;
}

/**
 * What to say about one project's dormancy, if anything.
 *
 * Returns an empty note for the common case: an active project somebody worked
 * on this morning needs no explanation. A note appears in two situations, both
 * of which are the automatic rule doing something the user did not ask for:
 *
 *   * the project is dormant, and the card says since when
 *   * the project is active but close to the line, and the card says when
 *
 * `dead` gets nothing. It is outside the clock in both directions, and a
 * countdown on a project somebody has finished would be noise.
 */
export function dormancy(
  project: { status: ProjectStatus; last_activity?: string; updated_at: string },
  windowHours: number = DEFAULT_DORMANT_AFTER_HOURS,
  now: number = Date.now()
): Dormancy {
  const quiet: Dormancy = { hoursLeft: 0, soon: false, note: '' };
  if (project.status === 'dead') return quiet;

  // Fall back to updated_at so a projtrack too old to send last_activity still
  // renders. It is the same column that field is built from, just without the
  // task and event activity rolled in.
  const iso = project.last_activity || project.updated_at;
  const last = Date.parse(iso);
  if (Number.isNaN(last)) return quiet;

  if (project.status === 'dormant') {
    // Dormant is a state the clock may have chosen, so the card says what the
    // clock knows: when this project last had anything happen on it.
    return { hoursLeft: 0, soon: false, note: `Quiet since ${relativeTime(iso, now)}` };
  }

  const elapsedHours = (now - last) / 3_600_000;
  const hoursLeft = Math.max(0, windowHours - elapsedHours);
  if (elapsedHours < windowHours * WARN_AT) return quiet;
  return { hoursLeft, soon: true, note: `Dormant ${dueIn(hoursLeft)}` };
}

/** "in 4 h" / "in 35 min" / "any moment now", for a countdown to dormancy. */
function dueIn(hoursLeft: number): string {
  if (hoursLeft <= 0) return 'any moment now';
  if (hoursLeft < 1) {
    const mins = Math.max(1, Math.round(hoursLeft * 60));
    return `in ${mins} min`;
  }
  return `in ${Math.round(hoursLeft)} h`;
}

/**
 * The projects whose status the automatic rule changed between two polls.
 *
 * The app polls the summary; a project that went dormant while it was on
 * screen otherwise just quietly leaves the Active list, which reads as the app
 * losing it. Comparing the two responses is what turns that into something the
 * user is told about.
 *
 * Only active -> dormant is reported. Every other move is one the user made,
 * and they do not need telling what they just did.
 */
export function wentDormant<T extends { id: number; name: string; status: ProjectStatus }>(
  before: T[] | null,
  after: T[]
): T[] {
  if (!before) return [];
  const was = new Map(before.map((p) => [p.id, p.status]));
  return after.filter((p) => p.status === 'dormant' && was.get(p.id) === 'active');
}
