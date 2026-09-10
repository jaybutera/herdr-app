// What the banner says when a request fails.
//
// The reported bug was the wording, not the request: "Can't reach projtrack at
// http://127.0.0.1:17988 — HTTP 403" for a bridge that was up and answering,
// on a laptop whose only actual problem was an empty bearer token in Settings.

import { describe, expect, it } from 'vitest';

import { ApiError, apiFailureLabel, apiFailureText } from '../src/lib/api';

const WITH_TOKEN = true;
const NO_TOKEN = false;

describe('a request rejected for its token', () => {
  it('does not call a server that answered unreachable', () => {
    const text = apiFailureText('projtrack at http://127.0.0.1:17988', new ApiError('HTTP 403', 403), NO_TOKEN);

    expect(text).not.toMatch(/Can't reach/);
  });

  it('names the token, and Settings, as the thing to fix', () => {
    const text = apiFailureText('projtrack at http://127.0.0.1:17988', new ApiError('HTTP 403', 403), NO_TOKEN);

    expect(text).toMatch(/bearer token/);
    expect(text).toMatch(/Settings/);
  });

  it('tells an empty token from a wrong one, which are the same status', () => {
    const missing = apiFailureText('projtrack', new ApiError('HTTP 403', 403), NO_TOKEN);
    const wrong = apiFailureText('projtrack', new ApiError('HTTP 403', 403), WITH_TOKEN);

    expect(missing).toMatch(/set one/);
    expect(wrong).toMatch(/check it/);
    expect(missing).not.toEqual(wrong);
  });

  it('says the same of a 401', () => {
    expect(apiFailureText('projtrack', new ApiError('HTTP 401', 401), WITH_TOKEN)).toMatch(/bearer token/);
  });

  it('keeps the status visible for anyone reading the screen over a shoulder', () => {
    expect(apiFailureText('projtrack', new ApiError('HTTP 403', 403), NO_TOKEN)).toMatch(/403/);
  });
});

describe('a request that failed some other way', () => {
  it('reports a 500 as an answer, because the server gave one', () => {
    const text = apiFailureText('projtrack', new ApiError('HTTP 500', 500), WITH_TOKEN);

    expect(text).toMatch(/answered HTTP 500/);
    expect(text).not.toMatch(/Can't reach/);
  });

  it('still says "can\'t reach" for the one case where nothing came back', () => {
    const text = apiFailureText('projtrack', new ApiError('Load failed', 0), WITH_TOKEN);

    expect(text).toMatch(/Can't reach projtrack/);
    expect(text).toMatch(/Load failed/);
  });

  it('treats a plain Error as a transport failure', () => {
    expect(apiFailureText('the orchestrator', new Error('boom'), WITH_TOKEN)).toMatch(/Can't reach the orchestrator/);
  });
});

describe('the compact label beside a Settings field', () => {
  it('says which of the two token mistakes it was', () => {
    expect(apiFailureLabel(new ApiError('HTTP 403', 403), NO_TOKEN)).toBe('No token set');
    expect(apiFailureLabel(new ApiError('HTTP 403', 403), WITH_TOKEN)).toBe('Token rejected');
  });

  it('falls back to the bare status for anything else', () => {
    expect(apiFailureLabel(new ApiError('HTTP 502', 502), WITH_TOKEN)).toBe('HTTP 502');
  });

  it('shows the transport message when the request never landed', () => {
    expect(apiFailureLabel(new ApiError('Load failed', 0), WITH_TOKEN)).toBe('Load failed');
  });
});
