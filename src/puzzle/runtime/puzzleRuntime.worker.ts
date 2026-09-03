/**
 * Browser Web Worker entry point for 60 Hz deterministic puzzle simulation.
 * Runs independently of React render cycle and has no network client imports.
 */
import {
  PUZZLE_RUNTIME_VERSION,
  hashPuzzleAttemptTraceV1,
  hashPuzzleFinalStateV1,
  type PuzzleActionV1,
  type PuzzleAttemptEnvelopeV1,
  type PuzzleAttemptStatusV1,
  type PuzzleClaimedOutcomeV1,
  type PuzzleCommandV1,
  type PuzzleInputStateV1,
  type PublishedPuzzleV1,
} from '../publishedPuzzle.js';
import {
  advancePuzzle,
  createPuzzleRuntimeState,
  snapshotPuzzle,
  stableSeedForPuzzle,
  type PuzzleRuntimeSnapshot,
  type PuzzleRuntimeState,
} from './PuzzleRuntime.js';
import {
  toPuzzleRuntimeCommand,
  type PuzzleRuntimeCommand,
} from './puzzleCommands.js';
import {
  isPuzzleWorkerRequest,
  type PuzzleWorkerEvent,
  type PuzzleWorkerRequest,
} from './puzzleWorkerProtocol.js';
import { createPlayerRngChannels, type RngChannels } from '../../rng.js';

const TICK_INTERVAL_MS = 1000 / 60;

class PuzzleWorkerSession {
  private loadedPuzzle: PublishedPuzzleV1 | null = null;
  private attemptGrantId: string | null = null;
  private runtimeState: PuzzleRuntimeState | null = null;
  private rngChannels: RngChannels | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private isPaused = false;
  private commandTrace: PuzzleCommandV1[] = [];
  private pendingInputs: PuzzleInputStateV1[] = [];
  private pendingActions: PuzzleActionV1[] = [];
  private lastAppliedInput: PuzzleInputStateV1 = { left: false, right: false, softDrop: false };

  public handleMessage(request: unknown): void {
    if (!isPuzzleWorkerRequest(request)) {
      this.postEvent({
        type: 'error',
        message: 'Invalid puzzle worker request payload',
        code: 'INVALID_REQUEST',
      });
      return;
    }
    switch (request.type) {
      case 'load':
        this.loadPuzzle(request.puzzle, request.attemptGrantId ?? null);
        break;
      case 'input':
        this.queueInput(request.inputState);
        break;
      case 'action':
        this.queueAction(request.action);
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        this.restart();
        break;
      case 'dispose':
        this.dispose();
        break;
    }
  }

  private postEvent(event: PuzzleWorkerEvent): void {
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
      self.postMessage(event);
    }
  }

  private loadPuzzle(puzzle: PublishedPuzzleV1, attemptGrantId: string | null): void {
    this.stopTickTimer();
    try {
      this.loadedPuzzle = puzzle;
      this.attemptGrantId = attemptGrantId;
      this.initRuntime();
      if (!this.runtimeState) return;

      const initialSnapshot = snapshotPuzzle(this.runtimeState);
      this.postEvent({
        type: 'ready',
        puzzleId: puzzle.payload.id,
        initialSnapshot,
      });

      this.startTickTimer();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postEvent({ type: 'error', message, code: 'LOAD_ERROR' });
    }
  }

  private initRuntime(): void {
    if (!this.loadedPuzzle) return;
    const seed = stableSeedForPuzzle(this.loadedPuzzle.payload.id);
    this.rngChannels = createPlayerRngChannels(seed, 'puzzle');
    this.runtimeState = createPuzzleRuntimeState({
      payload: this.loadedPuzzle.payload,
      seed,
      rngChannels: this.rngChannels,
    });
    this.commandTrace = [];
    this.pendingInputs = [];
    this.pendingActions = [];
    this.lastAppliedInput = { left: false, right: false, softDrop: false };
    this.isPaused = false;
  }

  private startTickTimer(): void {
    this.stopTickTimer();
    if (!this.runtimeState || this.runtimeState.status !== 'playing' || this.isPaused) return;
    this.tickTimer = setInterval(() => {
      this.tick();
    }, TICK_INTERVAL_MS);
  }

  private stopTickTimer(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private queueInput(input: PuzzleInputStateV1): void {
    if (!this.runtimeState || this.runtimeState.status !== 'playing' || this.isPaused) return;
    this.pendingInputs.push({
      left: !!input.left,
      right: !!input.right,
      softDrop: !!input.softDrop,
    });
  }

  private queueAction(action: PuzzleActionV1): void {
    if (!this.runtimeState || this.runtimeState.status !== 'playing' || this.isPaused) return;
    this.pendingActions.push(action);
  }

  private tick(): void {
    if (!this.runtimeState || !this.rngChannels || this.runtimeState.status !== 'playing' || this.isPaused) {
      return;
    }

    const currentTick = this.runtimeState.gameState.tick;
    let orderWithinTick = 0;
    const commandsForTick: PuzzleRuntimeCommand[] = [];

    // Process queued inputs in chronological arrival order
    for (const nextInput of this.pendingInputs) {
      if (
        nextInput.left !== this.lastAppliedInput.left
        || nextInput.right !== this.lastAppliedInput.right
        || nextInput.softDrop !== this.lastAppliedInput.softDrop
      ) {
        const inputCmd: PuzzleCommandV1 = {
          tick: currentTick,
          orderWithinTick: orderWithinTick++,
          kind: 'input',
          left: nextInput.left,
          right: nextInput.right,
          softDrop: nextInput.softDrop,
        };
        this.commandTrace.push(inputCmd);
        commandsForTick.push(toPuzzleRuntimeCommand(inputCmd));
        this.lastAppliedInput = nextInput;
      }
    }
    this.pendingInputs = [];

    // Process queued discrete actions in chronological arrival order
    for (const action of this.pendingActions) {
      const actionCmd: PuzzleCommandV1 = {
        tick: currentTick,
        orderWithinTick: orderWithinTick++,
        kind: 'action',
        action,
      };
      this.commandTrace.push(actionCmd);
      commandsForTick.push(toPuzzleRuntimeCommand(actionCmd));
    }
    this.pendingActions = [];

    // Advance single simulation tick
    advancePuzzle(this.runtimeState, commandsForTick, this.rngChannels);
    const snapshot = snapshotPuzzle(this.runtimeState);

    this.postEvent({
      type: 'snapshot',
      snapshot,
    });

    if (this.runtimeState.status !== 'playing') {
      this.handleTerminalState(snapshot);
    }
  }

  private async handleTerminalState(finalSnapshot: PuzzleRuntimeSnapshot): Promise<void> {
    this.stopTickTimer();
    if (!this.runtimeState || !this.loadedPuzzle) return;

    const player = this.runtimeState.gameState.players.puzzle;
    const finalStateHash = await hashPuzzleFinalStateV1({
      status: this.runtimeState.status,
      ticksUsed: this.runtimeState.gameState.tick,
      piecesUsed: this.runtimeState.piecesPlaced,
      linesCleared: player ? player.linesCleared : finalSnapshot.linesCleared,
      score: player ? player.score : finalSnapshot.score,
      board: player ? player.board : [],
    });

    const claimedOutcome: PuzzleClaimedOutcomeV1 = {
      status: this.runtimeState.status as PuzzleAttemptStatusV1,
      ticksUsed: this.runtimeState.gameState.tick,
      piecesUsed: this.runtimeState.piecesPlaced,
      linesCleared: finalSnapshot.linesCleared,
      score: finalSnapshot.score,
      finalStateHash,
    };

    const envelopeBase = {
      schemaVersion: 1 as const,
      puzzleRuntimeVersion: PUZZLE_RUNTIME_VERSION,
      puzzleId: this.loadedPuzzle.payload.id,
      contentHash: this.loadedPuzzle.contentHash,
      attemptGrantId: this.attemptGrantId,
      commands: [...this.commandTrace],
      claimedOutcome,
    };

    const traceHash = await hashPuzzleAttemptTraceV1({
      ...envelopeBase,
      traceHash: '0000000000000000000000000000000000000000000000000000000000000000',
    });

    const envelope: PuzzleAttemptEnvelopeV1 = {
      ...envelopeBase,
      traceHash,
    };

    this.postEvent({
      type: 'finished',
      result: {
        status: this.runtimeState.status,
        solved: this.runtimeState.status === 'solved',
        topOut: this.runtimeState.status === 'top-out',
        ticksUsed: this.runtimeState.gameState.tick,
        piecesUsed: this.runtimeState.piecesPlaced,
        linesCleared: finalSnapshot.linesCleared,
        perfectClear: finalSnapshot.perfectClear,
        score: finalSnapshot.score,
      },
      claimedOutcome,
      commands: [...this.commandTrace],
      finalSnapshot,
      envelope,
    });
  }

  private pause(): void {
    if (this.isPaused || !this.runtimeState || this.runtimeState.status !== 'playing') return;

    // Queue one all-false input state for the next tick, advance that tick, then pause.
    this.pendingInputs.push({ left: false, right: false, softDrop: false });
    this.tick();
    this.isPaused = true;
    this.stopTickTimer();
  }

  private resume(): void {
    if (!this.isPaused || !this.runtimeState || this.runtimeState.status !== 'playing') return;

    // Resume starts with all inputs false, never catching up hidden-tab ticks in one burst.
    this.pendingInputs = [];
    this.pendingActions = [];
    this.lastAppliedInput = { left: false, right: false, softDrop: false };
    this.isPaused = false;
    this.startTickTimer();
  }

  private restart(): void {
    this.stopTickTimer();
    if (!this.loadedPuzzle) return;
    this.initRuntime();
    if (!this.runtimeState) return;

    const initialSnapshot = snapshotPuzzle(this.runtimeState);
    this.postEvent({
      type: 'ready',
      puzzleId: this.loadedPuzzle.payload.id,
      initialSnapshot,
    });
    this.startTickTimer();
  }

  private dispose(): void {
    this.stopTickTimer();
    this.loadedPuzzle = null;
    this.runtimeState = null;
    this.rngChannels = null;
    this.commandTrace = [];
    this.pendingInputs = [];
    this.pendingActions = [];
    if (typeof self !== 'undefined' && 'close' in self && typeof (self as any).close === 'function') {
      (self as any).close();
    }
  }
}

// Instantiate worker session and bind incoming messages
const session = new PuzzleWorkerSession();

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (isPuzzleWorkerRequest(event.data)) {
      session.handleMessage(event.data);
    }
  });
}

export { PuzzleWorkerSession };
