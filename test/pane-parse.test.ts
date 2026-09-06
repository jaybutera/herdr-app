import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePane } from '../src/lib/pane-parse';

const real = readFileSync(new URL('./fixtures-pane-real.txt', import.meta.url), 'utf8');

describe('parsePane', () => {
  it('keeps every prose block, not only the last', () => {
    const blocks = parsePane(real);
    const messages = blocks.filter((b) => b.kind === 'message');
    expect(messages.length).toBeGreaterThan(2);
  });

  it('reads the user prompt echoed after ❯', () => {
    const blocks = parsePane(real);
    const user = blocks.find((b) => b.kind === 'user');
    expect(user).toBeDefined();
    expect(user && user.kind === 'user' && user.text).toContain('connection dropped mid-response');
  });

  it('ignores the empty input box', () => {
    const blocks = parsePane('❯ \n');
    expect(blocks).toHaveLength(0);
  });

  it('renders a tool call as a tool block with its ⎿ result', () => {
    const text = ['● Write(src/lib/pane-parse.ts)', '  ⎿  Wrote 147 lines to src/lib/pane-parse.ts'].join(
      '\n'
    );
    const blocks = parsePane(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'tool',
      head: 'Write(src/lib/pane-parse.ts)',
      result: ['Wrote 147 lines to src/lib/pane-parse.ts'],
    });
  });

  it('treats prose starting with a bullet as a message, not a tool', () => {
    const blocks = parsePane('● Now the pane-text parser, the trickiest piece.');
    expect(blocks[0].kind).toBe('message');
  });

  it('parses the parenthesised spinner from the spec', () => {
    const blocks = parsePane('✢ Skedaddling… (24s · ↓ 1.4k tokens)');
    expect(blocks[0]).toMatchObject({ kind: 'spinner', word: 'Skedaddling', elapsed: '24s' });
  });

  it('parses the "for" spinner form a finished turn leaves on screen', () => {
    const blocks = parsePane('✻ Sautéed for 38m 2s · done 12:34 PM');
    expect(blocks[0]).toMatchObject({ kind: 'spinner', word: 'Sautéed' });
  });

  it('collects a corner-opened box as one dialog', () => {
    const text = [
      '╭─────────────────────────╮',
      '│ Do you trust this folder?',
      '│  1. Yes                 │',
      '│  2. No                  │',
      '╰─────────────────────────╯',
    ].join('\n');
    const blocks = parsePane(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('dialog');
    expect(blocks[0].kind === 'dialog' && blocks[0].lines).toHaveLength(5);
  });

  it('does not turn a markdown table inside prose into a dialog', () => {
    // Observed in a live pane on 2026-09-06: an agent printing a table emits
    // rows starting with │, which must stay part of the prose block.
    const text = [
      '● Here is the ledger:',
      '  │ Project    │ Running │',
      '  │ zpay v2    │ 0       │',
    ].join('\n');
    const blocks = parsePane(text);
    expect(blocks.every((b) => b.kind !== 'dialog')).toBe(true);
  });

  it('drops the chrome lines the orchestrator drops', () => {
    const text = ['● Wrote the file.', '  Ran 1 shell command', '  ? for shortcuts'].join('\n');
    const blocks = parsePane(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind === 'message' && blocks[0].text).toBe('Wrote the file.');
  });

  it('stops a prose block at the footer rule', () => {
    const text = [
      '● The answer is 4.',
      '───────────────────────────',
      '❯ next question',
    ].join('\n');
    const blocks = parsePane(text);
    const msg = blocks.find((b) => b.kind === 'message');
    expect(msg && msg.kind === 'message' && msg.text).toBe('The answer is 4.');
  });

  it('returns nothing for an empty pane', () => {
    expect(parsePane('')).toEqual([]);
    expect(parsePane('\n\n  \n')).toEqual([]);
  });
});
