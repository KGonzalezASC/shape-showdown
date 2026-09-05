import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createPlayerRngChannels } from '../rng';
import type { GameState } from '../types';
import { makePlayer } from '../puzzle/runtime/engine';
import {
  getChromeSnapshot,
  getPlayfieldSnapshot,
  getRawGameState,
  setClientMatchModelStore,
  setGameStateStore,
  subscribeChrome,
  subscribeMatchTick,
} from './gameStateStore';
import type { ClientMatchModel } from '../protocol/wireTypes';
import { toPublicPlayerState } from './publicSnapshots';

afterEach(() => {
  setGameStateStore(null, null);
});

describe('authoritative recovery snapshots', () => {
  it('replaces stale local state while preserving pause and outcome fields', () => {
    const playingState = createState({
      status: 'playing',
      tick: 120,
      pause: {
        playerId: 'opponent',
        startedAt: 1_000,
      },
    });
    setGameStateStore(playingState, 'me');

    assert.equal(getChromeSnapshot().pausePlayerId, 'opponent');
    assert.equal(getChromeSnapshot().pauseStartedAt, 1_000);
    assert.equal(getChromeSnapshot().tick, 120);

    const voidedState = createState({
      status: 'ended',
      tick: 121,
      winnerId: null,
      endReason: 'server-void',
      pause: undefined,
    });
    setGameStateStore(voidedState, 'me');

    assert.equal(getRawGameState(), voidedState);
    assert.equal(getChromeSnapshot().tick, 121);
    assert.equal(getChromeSnapshot().pausePlayerId, null);
    assert.equal(getChromeSnapshot().pauseStartedAt, null);
    assert.equal(getChromeSnapshot().winnerId, null);
    assert.equal(getChromeSnapshot().endReason, 'server-void');
  });
});

function createState(overrides: Partial<GameState>): GameState {
  return {
    players: {
      me: makePlayer('me', createPlayerRngChannels(123, 'A')),
      opponent: makePlayer('opponent', createPlayerRngChannels(123, 'B')),
    },
    status: 'waiting',
    countdown: 0,
    winnerId: null,
    tick: 0,
    seed: 123,
    ...overrides,
  };
}

describe('chrome vs tick subscription split', () => {
  it('does not notify chrome listeners on tick-only updates', () => {
    setGameStateStore(createState({ status: 'playing', tick: 10 }), 'me');

    let chromeNotifications = 0;
    let tickNotifications = 0;
    const unsubChrome = subscribeChrome(() => { chromeNotifications += 1; });
    const unsubTick = subscribeMatchTick(() => { tickNotifications += 1; });

    setGameStateStore(createState({ status: 'playing', tick: 11 }), 'me');
    assert.equal(chromeNotifications, 0);
    assert.equal(tickNotifications, 1);
    assert.equal(getChromeSnapshot().tick, 11);

    setGameStateStore(createState({
      status: 'playing',
      tick: 12,
      pause: { playerId: 'opponent', startedAt: 2_000 },
    }), 'me');
    assert.equal(chromeNotifications, 1);
    assert.equal(tickNotifications, 2);

    unsubChrome();
    unsubTick();
  });
});

describe('playfield player reference retention', () => {
  it('keeps opponentPlayer identity across local soft-drop Y updates', () => {
    const base = createState({ status: 'playing', tick: 20 });
    const myPlayer = toPublicPlayerState(base.players.me);
    const opponentPlayer = toPublicPlayerState(base.players.opponent);
    const model: ClientMatchModel = {
      tick: 20,
      seed: base.seed,
      chrome: {
        status: 'playing',
        countdown: 0,
        seed: base.seed,
        winnerId: null,
        endReason: undefined,
        technicalVictory: undefined,
        restartTimer: undefined,
        pausePlayerId: null,
        pauseStartedAt: null,
      },
      myId: 'me',
      myPlayer,
      opponentPlayer,
    };
    setClientMatchModelStore(model, 'me');
    const first = getPlayfieldSnapshot();
    assert.equal(first.opponentPlayer, opponentPlayer);

    assert.ok(myPlayer.activePiece);
    setClientMatchModelStore({
      ...model,
      tick: 21,
      myPlayer: {
        ...myPlayer,
        activePiece: { ...myPlayer.activePiece, y: myPlayer.activePiece.y + 1 },
      },
      // Fresh opponent object that is publicly equal — store must retain prior ref.
      opponentPlayer: { ...opponentPlayer, board: opponentPlayer.board.map((row) => [...row]) },
    }, 'me');

    const second = getPlayfieldSnapshot();
    assert.notEqual(second.myPlayer, first.myPlayer);
    assert.equal(second.myPlayer?.activePiece?.y, (first.myPlayer?.activePiece?.y ?? 0) + 1);
    assert.equal(second.opponentPlayer, first.opponentPlayer);
  });
});
