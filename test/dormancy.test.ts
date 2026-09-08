import { describe, expect, it } from 'vitest';
import { DEFAULT_DORMANT_AFTER_HOURS, dormancy, wentDormant } from '../src/lib/dormancy';
import { relativeTime } from '../src/lib/format';
import type { ProjectStatus } from '../src/lib/types';

const NOW = Date.parse('2026-09-08T18:00:00Z');
const HOUR = 3_600_000;

/** A project whose last activity was `hoursAgo` hours before NOW. */
function project(status: ProjectStatus, hoursAgo: number) {
  const iso = new Date(NOW - hoursAgo * HOUR).toISOString();
  return { status, last_activity: iso, updated_at: iso };
}

describe('dormancy', () => {
  it('says nothing about a project worked on this morning', () => {
    // The common case. A card explaining that an active project is active
    // would be noise on every row in the list.
    expect(dormancy(project('active', 2), DEFAULT_DORMANT_AFTER_HOURS, NOW).note).toBe('');
  });

  it('warns once an active project is two thirds of the way to quiet', () => {
    const out = dormancy(project('active', 17), DEFAULT_DORMANT_AFTER_HOURS, NOW);
    expect(out.soon).toBe(true);
    expect(out.note).toBe('Dormant in 7 h');
  });

  it('does not warn just before the two-thirds mark', () => {
    expect(dormancy(project('active', 15), DEFAULT_DORMANT_AFTER_HOURS, NOW).soon).toBe(false);
  });

  it('counts down in minutes inside the last hour', () => {
    expect(dormancy(project('active', 23.5), DEFAULT_DORMANT_AFTER_HOURS, NOW).note).toBe(
      'Dormant in 30 min'
    );
  });

  it('says "any moment now" for an active project already past the window', () => {
    // projtrack settles on read, so the app can hold a response listing a
    // project whose window has expired since it was generated.
    const out = dormancy(project('active', 26), DEFAULT_DORMANT_AFTER_HOURS, NOW);
    expect(out.note).toBe('Dormant any moment now');
    expect(out.hoursLeft).toBe(0);
  });

  it('tells a dormant project when it last had anything happen', () => {
    // Dormant is now a status nobody may have chosen, so the card says why.
    // The date itself is relativeTime's business and locale-dependent, so this
    // asserts the phrasing and that a real date landed in it, not the format.
    const out = dormancy(project('dormant', 30), DEFAULT_DORMANT_AFTER_HOURS, NOW);
    expect(out.note).toMatch(/^Quiet since \S/);
    expect(out.note).toContain(relativeTime(new Date(NOW - 30 * HOUR).toISOString(), NOW));
    expect(out.soon).toBe(false);
  });

  it('says the hours for a project dormant under a shorter window', () => {
    // relativeTime switches to a calendar date at 24 h, so an hours-ago phrase
    // only appears when projtrack is running a window shorter than that.
    expect(dormancy(project('dormant', 7), 6, NOW).note).toBe('Quiet since 7 h ago');
  });

  it('says nothing about a dead project', () => {
    // Dead is outside the clock in both directions; a countdown on a project
    // somebody finished is noise.
    expect(dormancy(project('dead', 400), DEFAULT_DORMANT_AFTER_HOURS, NOW).note).toBe('');
  });

  it('honours a window projtrack reports as something other than 24 h', () => {
    const out = dormancy(project('active', 5), 6, NOW);
    expect(out.soon).toBe(true);
    expect(out.note).toBe('Dormant in 1 h');
  });

  it('falls back to updated_at when projtrack sends no last_activity', () => {
    // An older projtrack does not compute the rollup; the card still renders.
    const iso = new Date(NOW - 20 * HOUR).toISOString();
    const out = dormancy({ status: 'active', updated_at: iso }, DEFAULT_DORMANT_AFTER_HOURS, NOW);
    expect(out.soon).toBe(true);
  });

  it('prefers last_activity over updated_at when both are present', () => {
    // The whole point of the rollup: a stale project row plus fresh task work
    // is an awake project, and the card must not warn about it.
    const out = dormancy(
      {
        status: 'active',
        updated_at: new Date(NOW - 40 * HOUR).toISOString(),
        last_activity: new Date(NOW - 1 * HOUR).toISOString(),
      },
      DEFAULT_DORMANT_AFTER_HOURS,
      NOW
    );
    expect(out.soon).toBe(false);
    expect(out.note).toBe('');
  });

  it('says nothing when the timestamp will not parse', () => {
    expect(dormancy({ status: 'active', updated_at: 'not a date' }, 24, NOW).note).toBe('');
  });
});

describe('wentDormant', () => {
  const active = { id: 1, name: 'zpay v2 site', status: 'active' as ProjectStatus };
  const dormant = { id: 1, name: 'zpay v2 site', status: 'dormant' as ProjectStatus };

  it('reports a project the clock moved between two polls', () => {
    expect(wentDormant([active], [dormant]).map((p) => p.id)).toEqual([1]);
  });

  it('reports nothing on the first poll, when there is no before', () => {
    // Otherwise every dormant project would be announced at startup as though
    // it had just happened.
    expect(wentDormant(null, [dormant])).toEqual([]);
  });

  it('ignores a project that was already dormant', () => {
    expect(wentDormant([dormant], [dormant])).toEqual([]);
  });

  it('ignores a project the user marked dead', () => {
    const dead = { id: 1, name: 'zpay v2 site', status: 'dead' as ProjectStatus };
    expect(wentDormant([active], [dead])).toEqual([]);
  });

  it('ignores a project waking back up', () => {
    expect(wentDormant([dormant], [active])).toEqual([]);
  });

  it('ignores a project that was not in the previous poll', () => {
    expect(wentDormant([], [dormant])).toEqual([]);
  });

  it('reports several at once', () => {
    const before = [active, { id: 2, name: 'b', status: 'active' as ProjectStatus }];
    const after = [dormant, { id: 2, name: 'b', status: 'dormant' as ProjectStatus }];
    expect(wentDormant(before, after).map((p) => p.id)).toEqual([1, 2]);
  });
});
