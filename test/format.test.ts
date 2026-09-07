import { describe, expect, it } from 'vitest';
import {
  countsLine,
  liveCountsLine,
  relativeTime,
  statusSpec,
  stripLeadingEmoji,
} from '../src/lib/format';

const NOW = Date.parse('2026-09-06T18:00:00Z');

describe('relativeTime', () => {
  it('says "just now" under a minute', () => {
    expect(relativeTime('2026-09-06T17:59:30Z', NOW)).toBe('just now');
  });
  it('counts minutes under an hour', () => {
    expect(relativeTime('2026-09-06T17:17:00Z', NOW)).toBe('43 min ago');
  });
  it('counts hours under a day', () => {
    expect(relativeTime('2026-09-06T15:00:00Z', NOW)).toBe('3 h ago');
  });
  it('falls back to a local date past a day', () => {
    // Never a raw ISO string outside Terminal view (section 9).
    const out = relativeTime('2026-09-01T15:00:00Z', NOW);
    expect(out).not.toContain('T');
    expect(out).not.toContain('Z');
  });
  it('returns empty for an unparseable stamp', () => {
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});

describe('countsLine', () => {
  it('lists only non-zero counts in the fixed order', () => {
    expect(
      countsLine({ queued: 2, running: 1, done: 0, failed: 0, abandoned: 1 })
    ).toBe('1 running · 2 queued · 1 abandoned');
  });
  it('says "No tasks yet" when every count is zero', () => {
    expect(countsLine({ queued: 0, running: 0, done: 0, failed: 0, abandoned: 0 })).toBe(
      'No tasks yet'
    );
  });
  it('survives a missing counts object', () => {
    expect(countsLine(undefined)).toBe('No tasks yet');
  });
});

describe('statusSpec', () => {
  it('maps each domain to its own vocabulary', () => {
    expect(statusSpec('task', 'running').label).toBe('Running');
    expect(statusSpec('pane', 'blocked').label).toBe('Needs you');
    expect(statusSpec('pane', 'done').label).toBe('Finished');
    expect(statusSpec('project', 'dead').label).toBe('Dead');
  });
  it('falls back rather than throwing on a status it has never seen', () => {
    expect(statusSpec('pane', 'brand-new-state').label).toBe('Unknown');
  });

  // Nit 2. The header needs a word for "the ref has not resolved, so nothing has
  // been read and the pane list cannot be looked up either". Both of the words
  // it had claim something: "Working" that an agent is mid-turn, "No agent" that
  // there is none.
  it('has a word for a session that has not been located yet', () => {
    expect(statusSpec('pane', 'pending').label).toBe('Finding session');
    expect(statusSpec('pane', 'pending').label).not.toBe(statusSpec('pane', 'working').label);
    expect(statusSpec('pane', 'pending').label).not.toBe(statusSpec('pane', 'unknown').label);
  });
});

describe('stripLeadingEmoji', () => {
  it('drops the leading glyph so a message never shows two icons', () => {
    expect(stripLeadingEmoji('✅ zpay landing finished')).toBe('zpay landing finished');
    expect(stripLeadingEmoji('⚠️ token deploy never started')).toBe('token deploy never started');
  });
  it('leaves ordinary text alone', () => {
    expect(stripLeadingEmoji('the build is green')).toBe('the build is green');
  });
});

// Nit 1, round 2. The blocked row on the card reads "Needs you"; the counts line
// above it read "1 needs review", which is what a stalled task earns.
describe('liveCountsLine', () => {
  const base = { queued: 0, running: 0, done: 0, failed: 0, abandoned: 0, needsReview: 0 };

  it('says "needs you" for a blocked agent, not "needs review"', () => {
    const line = liveCountsLine({ ...base, blocked: 1 });
    expect(line).toBe('1 needs you');
    expect(line).not.toContain('review');
  });

  it('puts the blocked figure first, ahead of work in flight', () => {
    expect(liveCountsLine({ ...base, running: 2, blocked: 1 })).toBe('1 needs you · 2 running');
  });

  it('keeps blocked and needs-review as separate figures', () => {
    expect(liveCountsLine({ ...base, running: 1, blocked: 1, needsReview: 2 })).toBe(
      '1 needs you · 1 running · 2 need review'
    );
  });

  it('leaves the line alone when nothing is blocked', () => {
    expect(liveCountsLine({ ...base, running: 1, needsReview: 2 })).toBe('1 running · 2 need review');
  });

  it('still reads a card with no tasks at all', () => {
    expect(liveCountsLine({ ...base, blocked: 0 })).toBe('No tasks yet');
  });
});
