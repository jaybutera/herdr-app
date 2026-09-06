// Time strings and status vocabulary. Sections 4 and 9.

import type { TaskCounts } from './types';

/** "just now" / "N min ago" / "N h ago" / "6 Sep". Never a raw ISO string. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "started 43 min ago" style, with the leading verb supplied by the caller. */
export function since(iso: string, verb: string, now: number = Date.now()): string {
  const rel = relativeTime(iso, now);
  return rel === 'just now' ? `${verb} just now` : `${verb} ${rel}`;
}

/** Local HH:MM for event rows and time dividers. */
export function clockTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function dayKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toDateString();
}

export function dayLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------- status vocabulary (section 4) ----------

export type Domain = 'project' | 'task' | 'pane';
export type Glyph = 'filled' | 'hollow' | 'strike' | 'pulse' | 'check' | 'cross' | 'dash' | 'bang' | 'question' | 'slashed';

export interface StatusSpec {
  color: string;
  glyph: Glyph;
  label: string;
}

const PROJECT: Record<string, StatusSpec> = {
  active: { color: 'var(--c-live)', glyph: 'filled', label: 'Active' },
  dormant: { color: 'var(--c-muted)', glyph: 'hollow', label: 'Dormant' },
  dead: { color: 'var(--c-dead)', glyph: 'strike', label: 'Dead' },
};

const TASK: Record<string, StatusSpec> = {
  running: { color: 'var(--c-live)', glyph: 'pulse', label: 'Running' },
  queued: { color: 'var(--c-wait)', glyph: 'hollow', label: 'Queued' },
  done: { color: 'var(--c-done)', glyph: 'check', label: 'Done' },
  failed: { color: 'var(--c-alert)', glyph: 'cross', label: 'Failed' },
  abandoned: { color: 'var(--c-dead)', glyph: 'dash', label: 'Abandoned' },
};

const PANE: Record<string, StatusSpec> = {
  working: { color: 'var(--c-live)', glyph: 'pulse', label: 'Working' },
  idle: { color: 'var(--c-muted)', glyph: 'filled', label: 'Idle' },
  blocked: { color: 'var(--c-alert)', glyph: 'bang', label: 'Needs you' },
  done: { color: 'var(--c-done)', glyph: 'check', label: 'Finished' },
  unknown: { color: 'var(--c-dead)', glyph: 'question', label: 'No agent' },
  gone: { color: 'var(--c-dead)', glyph: 'slashed', label: 'Pane gone' },
};

const FALLBACK: StatusSpec = { color: 'var(--c-dead)', glyph: 'question', label: 'Unknown' };

export function statusSpec(domain: Domain, value: string): StatusSpec {
  const table = domain === 'project' ? PROJECT : domain === 'task' ? TASK : PANE;
  return table[value] ?? FALLBACK;
}

/** The counts line: only non-zero counts, fixed order, joined with " · ". */
export function countsLine(counts: TaskCounts | undefined): string {
  const order: [keyof TaskCounts, string][] = [
    ['running', 'running'],
    ['queued', 'queued'],
    ['done', 'done'],
    ['failed', 'failed'],
    ['abandoned', 'abandoned'],
  ];
  const parts = order
    .filter(([k]) => (counts?.[k] ?? 0) > 0)
    .map(([k, word]) => `${counts?.[k]} ${word}`);
  return parts.length ? parts.join(' · ') : 'No tasks yet';
}

/** Pane ids inside orchestrator text become chips (section 5.4). */
export const PANE_ID_RE = /\bw[\w]+:p\d+\b/g;

/** The orchestrator prefixes some messages with an emoji the UI renders as a glyph. */
export function stripLeadingEmoji(text: string): string {
  return text.replace(/^\s*(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2705}\u{26A0}]️?\s*)+/u, '');
}
