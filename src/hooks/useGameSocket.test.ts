import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gameConfigUrl,
  isProtocolMismatchError,
  isRetryableTicketConnectError,
} from './useGameSocket';

describe('game client request routing', () => {
  it('loads runtime config from the site root for the /game/ entry point', () => {
    assert.equal(
      gameConfigUrl('https://main.shape-showdown.pages.dev/game/'),
      'https://main.shape-showdown.pages.dev/game-config.json',
    );
  });
});

describe('ticket connection recovery', () => {
  test('refreshes a ticket rejected as stale or already consumed', () => {
    assert.equal(
      isRetryableTicketConnectError(new Error('match ticket rejected')),
      true,
    );
    assert.equal(
      isRetryableTicketConnectError(new Error('match ticket already consumed')),
      true,
    );
    assert.equal(
      isRetryableTicketConnectError(Object.assign(new Error('ticket rejected'), {
        data: { code: 'MATCH_TICKET_REJECTED' },
      })),
      true,
    );
    assert.equal(
      isRetryableTicketConnectError(Object.assign(new Error('ticket consumed'), {
        data: { code: 'MATCH_TICKET_CONSUMED' },
      })),
      true,
    );
  });

  test('does not classify transport or protocol errors as stale tickets', () => {
    assert.equal(
      isRetryableTicketConnectError(new Error('websocket transport error')),
      false,
    );
    assert.equal(
      isRetryableTicketConnectError(new Error('protocol version mismatch')),
      false,
    );
  });

  test('recognizes stable protocol mismatch errors for terminal reload guidance', () => {
    assert.equal(
      isProtocolMismatchError(new Error('PROTOCOL_VERSION_MISMATCH: client is stale')),
      true,
    );
    assert.equal(
      isProtocolMismatchError(new Error('websocket transport error')),
      false,
    );
  });
});
