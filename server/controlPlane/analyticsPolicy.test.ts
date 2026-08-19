import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAnalyticsEventName,
  validateAnalyticsProperties,
} from './analyticsPolicy.js';

describe('reliability analytics policy', () => {
  it('accepts only approved event names and properties', () => {
    assert.equal(isAnalyticsEventName('match_voided'), true);
    assert.equal(isAnalyticsEventName('server_void'), false);
    assert.deepEqual(
      validateAnalyticsProperties('reconnect_success', {
        disconnected_seconds: 4,
      }),
      { disconnected_seconds: 4 },
    );
    assert.equal(
      validateAnalyticsProperties('reconnect_success', { socket_id: 'secret' }),
      null,
    );
  });

  it('rejects non-finite values and per-tick or credential payloads', () => {
    assert.equal(
      validateAnalyticsProperties('match_end', { duration_s: Number.NaN }),
      null,
    );
    assert.equal(
      validateAnalyticsProperties('match_end', { input_stream: 'left,left,left' }),
      null,
    );
    assert.equal(
      validateAnalyticsProperties('match_voided', { bearer_token: 'secret' }),
      null,
    );
  });
});
