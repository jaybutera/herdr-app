import { describe, expect, it } from 'vitest';
import { countsLine, relativeTime, statusSpec, stripLeadingEmoji } from '../src/lib/format';

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
