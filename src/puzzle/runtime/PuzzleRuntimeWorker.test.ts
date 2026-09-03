import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_COLS, BOARD_ROWS } from '../../constants.js';
import { createPlayerRngChannels } from '../../rng.js';
import {
  hashPublishedPuzzlePayload,
  hashPuzzleFinalStateV1,
  type PublishedPuzzleV1,
} from '../publishedPuzzle.js';
import {
  advancePuzzle,
  createPuzzleRuntimeState,
  snapshotPuzzle,
  stableSeedForPuzzle,
} from './PuzzleRuntime.js';
import { toPuzzleRuntimeCommand } from './puzzleCommands.js';
import { PuzzleRuntimeClient } from './PuzzleRuntimeClient.js';
import { PuzzleWorkerSession } from './puzzleRuntime.worker.js';
import type { PuzzleWorkerEvent, PuzzleWorkerRequest } from './puzzleWorkerProtocol.js';

function createMockWorkerPair(): {
  clientWorker: Worker;
  session: PuzzleWorkerSession;
} {
  const session = new PuzzleWorkerSession();
  const clientListeners = new Set<(event: MessageEvent<unknown>) => void>();

  // Patch session's internal postEvent to send back to client listeners
  (session as any).postEvent = (event: PuzzleWorkerEvent) => {
    for (const listener of clientListeners) {
      listener({ data: event } as MessageEvent<unknown>);
    }
  };

  const clientWorker = {
    addEventListener: (type: string, listener: (ev: any) => void) => {
      if (type === 'message') clientListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (ev: any) => void) => {
      if (type === 'message') clientListeners.delete(listener);
    },
    postMessage: (data: unknown) => {
      session.handleMessage(data as PuzzleWorkerRequest);
    },
    terminate: () => {
      session.handleMessage({ type: 'dispose' });
      clientListeners.clear();
    },
  } as unknown as Worker;

  return { clientWorker, session };
}

async function createSamplePublishedPuzzle(): Promise<PublishedPuzzleV1> {
  const payload = {
    id: 'worker-test-puzzle-1',
    name: 'Worker Test Puzzle',
    initialBoard: Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => null),
    ),
    finitePieceSequence: ['T', 'I', 'O', 'L', 'J', 'S', 'Z'] as const,
    goal: { kind: 'clear-lines' as const, lines: 1 },
    allowedMechanics: { allowHold: true },
    timeline: [],
    visibilityPolicy: 'revealed' as const,
    benchmark: {
      metric: 'score' as const,
      direction: 'maximize' as const,
    },
  };
  const contentHash = await hashPublishedPuzzlePayload(payload);
  return {
    payload,
    contentHash,
    publicBaseline: {
      score: 100,
      ticksUsed: 60,
      piecesUsed: 1,
      linesCleared: 1,
    },
  };
}

describe('PuzzleRuntime Web Worker and client adapter', () => {
  it('runs an attempt, records commands, and matches Bun simulation parity', async () => {
    const puzzle = await createSamplePublishedPuzzle();
    const { clientWorker, session } = createMockWorkerPair();
    const client = new PuzzleRuntimeClient({ worker: clientWorker });

    let finishedEvent: Extract<PuzzleWorkerEvent, { type: 'finished' }> | null = null;
    client.onFinished((event) => {
      finishedEvent = event;
    });

    const initialSnapshot = await client.load(puzzle);
    assert.equal(initialSnapshot.status, 'playing');
    assert.equal(initialSnapshot.ticksUsed, 0);

    // Queue input and action via client
    client.setInput({ left: true, right: false, softDrop: false });
    client.sendAction('rotateCW');

    // Advance session ticks directly for deterministic inspection
    for (let i = 0; i < 5; i++) {
      (session as any).tick();
    }

    client.sendAction('hardDrop');
    (session as any).tick();

    // Verify commands were recorded with safe integer ticks and contiguous order
    const commands = (session as any).commandTrace;
    assert.ok(commands.length >= 3, 'commands must be recorded in trace');
    for (const cmd of commands) {
      assert.ok(Number.isSafeInteger(cmd.tick) && cmd.tick >= 0);
      assert.ok(Number.isSafeInteger(cmd.orderWithinTick) && cmd.orderWithinTick >= 0);
    }

    // Now reproduce the exact same commands in standalone Bun runtime
    const seed = stableSeedForPuzzle(puzzle.payload.id);
    const rng = createPlayerRngChannels(seed, 'puzzle');
    const standaloneState = createPuzzleRuntimeState({
      payload: puzzle.payload,
      seed,
      rngChannels: rng,
    });

    const maxTick = Math.max(...commands.map((c: any) => c.tick));
    for (let tick = 0; tick <= maxTick; tick++) {
      const tickCmds = commands
        .filter((c: any) => c.tick === tick)
        .sort((a: any, b: any) => a.orderWithinTick - b.orderWithinTick)
        .map(toPuzzleRuntimeCommand);
      advancePuzzle(standaloneState, tickCmds, rng);
    }

    const standaloneSnapshot = snapshotPuzzle(standaloneState);
    const workerSnapshot = snapshotPuzzle((session as any).runtimeState);

    // Compare final simulation state
    assert.equal(workerSnapshot.gameState.tick, standaloneSnapshot.gameState.tick);
    assert.equal(workerSnapshot.piecesUsed, standaloneSnapshot.piecesUsed);
    assert.equal(workerSnapshot.linesCleared, standaloneSnapshot.linesCleared);
    assert.equal(workerSnapshot.score, standaloneSnapshot.score);

    // Verify hash parity
    const workerHash = await hashPuzzleFinalStateV1({
      status: workerSnapshot.status,
      ticksUsed: workerSnapshot.ticksUsed,
      piecesUsed: workerSnapshot.piecesUsed,
      linesCleared: workerSnapshot.linesCleared,
      score: workerSnapshot.score,
      board: workerSnapshot.gameState.players.puzzle.board,
    });

    const standaloneHash = await hashPuzzleFinalStateV1({
      status: standaloneSnapshot.status,
      ticksUsed: standaloneSnapshot.ticksUsed,
      piecesUsed: standaloneSnapshot.piecesUsed,
      linesCleared: standaloneSnapshot.linesCleared,
      score: standaloneSnapshot.score,
      board: standaloneSnapshot.gameState.players.puzzle.board,
    });

    assert.equal(workerHash, standaloneHash, 'final state hashes must match exactly');
    client.dispose();
  });

  it('terminates cleanly on route exit and prevents leak to next attempt', async () => {
    const puzzle = await createSamplePublishedPuzzle();
    const { clientWorker, session } = createMockWorkerPair();
    const client = new PuzzleRuntimeClient({ worker: clientWorker });

    let snapshotsReceived = 0;
    client.onSnapshot(() => {
      snapshotsReceived++;
    });

    await client.load(puzzle);
    (session as any).tick();
    assert.ok(snapshotsReceived > 0, 'snapshot should be received while active');

    // Route exit / dispose
    client.dispose();
    const countAtDispose = snapshotsReceived;

    // Subsequent ticks on session must not reach disposed client
    (session as any).tick();
    assert.equal(snapshotsReceived, countAtDispose, 'no snapshots should arrive after dispose');

    // New client for fresh attempt starts clean
    const { clientWorker: clientWorker2 } = createMockWorkerPair();
    const client2 = new PuzzleRuntimeClient({ worker: clientWorker2 });
    const freshSnapshot = await client2.load(puzzle);
    assert.equal(freshSnapshot.ticksUsed, 0, 'new attempt starts from tick 0');
    client2.dispose();
  });

  it('enforces all-false input boundary on pause and prevents catch-up burst on resume', async () => {
    const puzzle = await createSamplePublishedPuzzle();
    const { clientWorker, session } = createMockWorkerPair();
    const client = new PuzzleRuntimeClient({ worker: clientWorker });

    await client.load(puzzle);

    // Player holds left
    client.setInput({ left: true, right: false, softDrop: false });
    (session as any).tick();
    assert.equal((session as any).lastAppliedInput.left, true);

    // Page hidden / blur triggers pause
    client.setInput({ left: false, right: false, softDrop: false });
    client.pause();

    // Verify all-false input was applied
    assert.equal((session as any).lastAppliedInput.left, false);
    assert.equal((session as any).lastAppliedInput.right, false);
    assert.equal((session as any).lastAppliedInput.softDrop, false);
    assert.equal((session as any).isPaused, true);

    const pausedTick = (session as any).runtimeState.gameState.tick;

    // Tick calls while paused do not advance state (no catch-up burst)
    (session as any).tick();
    (session as any).tick();
    assert.equal((session as any).runtimeState.gameState.tick, pausedTick);

    // Resume starts with all inputs false
    client.resume();
    assert.equal((session as any).isPaused, false);
    assert.equal((session as any).lastAppliedInput.left, false);

    client.dispose();
  });

  it('rejects shallow and invalid worker requests with INVALID_REQUEST', () => {
    const { session } = createMockWorkerPair();
    const errors: any[] = [];
    (session as any).postEvent = (event: any) => {
      if (event.type === 'error') errors.push(event);
    };

    // Shallow action
    session.handleMessage({ type: 'action', action: 'not-valid' });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'INVALID_REQUEST');

    // Incomplete load
    session.handleMessage({ type: 'load' });
    assert.equal(errors.length, 2);
    assert.equal(errors[1].code, 'INVALID_REQUEST');

    // Invalid input state
    session.handleMessage({ type: 'input', inputState: { left: 'not-bool' } });
    assert.equal(errors.length, 3);
    assert.equal(errors[2].code, 'INVALID_REQUEST');
  });
});
