import { describe, expect, it } from 'vitest';
import { DEFAULTS, projtrackBase, type Settings } from '../src/lib/settings';

const at = (bridgeUrl: string, projtrackUrl: string): Settings => ({
  ...DEFAULTS,
  bridgeUrl,
  projtrackUrl,
});

describe('projtrackBase', () => {
  it('follows the bridge when the field is blank', () => {
    expect(projtrackBase(at('https://orcha.example', ''))).toBe('https://orcha.example');
    expect(projtrackBase(at('https://orcha.example', '   '))).toBe('https://orcha.example');
  });

  it('follows the bridge when the field still holds the old loopback default', () => {
    // The case this exists for: a phone or a hosted page where 127.0.0.1 names
    // the device the page is open on, and the request cannot land.
    expect(projtrackBase(at('https://orcha.example', 'http://127.0.0.1:17988'))).toBe(
      'https://orcha.example'
    );
    expect(projtrackBase(at('https://orcha.example', 'http://localhost:8787'))).toBe(
      'https://orcha.example'
    );
  });

  it('leaves loopback alone when the bridge is loopback too', () => {
    // The laptop, where both are right and projtrack may genuinely be elsewhere.
    expect(projtrackBase(at('http://127.0.0.1:17988', 'http://127.0.0.1:8787'))).toBe(
      'http://127.0.0.1:8787'
    );
  });

  it('keeps an address that was deliberately set somewhere else', () => {
    expect(projtrackBase(at('https://orcha.example', 'https://projtrack.example'))).toBe(
      'https://projtrack.example'
    );
  });

  it('keeps a value it cannot parse, rather than quietly redirecting it', () => {
    expect(projtrackBase(at('https://orcha.example', 'not a url'))).toBe('not a url');
  });

  it('defaults the projtrack field to blank, meaning the bridge', () => {
    expect(DEFAULTS.projtrackUrl).toBe('');
  });
});
