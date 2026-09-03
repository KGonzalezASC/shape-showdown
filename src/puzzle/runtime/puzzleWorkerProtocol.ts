/**
 * Validated message protocol between the main thread (PuzzleRuntimeClient)
 * and the browser simulation worker (puzzleRuntime.worker.ts).
 */
import {
  parsePublishedPuzzleStructureV1,
  type PuzzleActionV1,
  type PuzzleAttemptEnvelopeV1,
  type PuzzleClaimedOutcomeV1,
  type PuzzleCommandV1,
  type PuzzleInputStateV1,
  type PublishedPuzzleV1,
} from '../publishedPuzzle.js';
import type {
  PuzzleRuntimeResult,
  PuzzleRuntimeSnapshot,
} from './PuzzleRuntime.js';

/**
 * Requests sent from main thread to puzzle worker.
 */
export type PuzzleWorkerRequest =
  | {
      type: 'load';
      puzzle: PublishedPuzzleV1;
      attemptGrantId?: string | null;
    }
  | {
      type: 'input';
      inputState: PuzzleInputStateV1;
    }
  | {
      type: 'action';
      action: PuzzleActionV1;
    }
  | {
      type: 'pause';
    }
  | {
      type: 'resume';
    }
  | {
      type: 'restart';
    }
  | {
      type: 'dispose';
    };

/**
 * Events posted from puzzle worker to main thread.
 */
export type PuzzleWorkerEvent =
  | {
      type: 'ready';
      puzzleId: string;
      initialSnapshot: PuzzleRuntimeSnapshot;
    }
  | {
      type: 'snapshot';
      snapshot: PuzzleRuntimeSnapshot;
    }
  | {
      type: 'finished';
      result: PuzzleRuntimeResult;
      claimedOutcome: PuzzleClaimedOutcomeV1;
      commands: readonly PuzzleCommandV1[];
      finalSnapshot: PuzzleRuntimeSnapshot;
      envelope?: PuzzleAttemptEnvelopeV1;
    }
  | {
      type: 'error';
      message: string;
      code?: string;
    };

const VALID_ACTIONS = new Set<PuzzleActionV1>(['rotateCW', 'rotateCCW', 'hardDrop', 'hold']);

export function isPuzzleInputState(value: unknown): value is PuzzleInputStateV1 {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.left === 'boolean'
    && typeof input.right === 'boolean'
    && typeof input.softDrop === 'boolean'
  );
}

export function isPuzzleAction(value: unknown): value is PuzzleActionV1 {
  return typeof value === 'string' && VALID_ACTIONS.has(value as PuzzleActionV1);
}

export function isPuzzleWorkerRequest(value: unknown): value is PuzzleWorkerRequest {
  if (typeof value !== 'object' || value === null) return false;
  const req = value as Record<string, unknown>;
  if (typeof req.type !== 'string') return false;

  switch (req.type) {
    case 'load': {
      if (typeof req.puzzle !== 'object' || req.puzzle === null) return false;
      try {
        parsePublishedPuzzleStructureV1(req.puzzle);
      } catch {
        return false;
      }
      if (
        req.attemptGrantId !== undefined
        && req.attemptGrantId !== null
        && typeof req.attemptGrantId !== 'string'
      ) {
        return false;
      }
      return true;
    }
    case 'input':
      return isPuzzleInputState(req.inputState);
    case 'action':
      return isPuzzleAction(req.action);
    case 'pause':
    case 'resume':
    case 'restart':
    case 'dispose':
      return true;
    default:
      return false;
  }
}

export function assertPuzzleWorkerRequest(value: unknown): asserts value is PuzzleWorkerRequest {
  if (!isPuzzleWorkerRequest(value)) {
    const type = typeof value === 'object' && value !== null ? (value as any).type : typeof value;
    throw new Error(`Invalid puzzle worker request: ${String(type)}`);
  }
}

export function isPuzzleWorkerEvent(value: unknown): value is PuzzleWorkerEvent {
  if (typeof value !== 'object' || value === null) return false;
  const evt = value as Record<string, unknown>;
  if (typeof evt.type !== 'string') return false;

  switch (evt.type) {
    case 'ready':
      return (
        typeof evt.puzzleId === 'string'
        && evt.puzzleId.length > 0
        && typeof evt.initialSnapshot === 'object'
        && evt.initialSnapshot !== null
      );
    case 'snapshot':
      return typeof evt.snapshot === 'object' && evt.snapshot !== null;
    case 'finished':
      return (
        typeof evt.result === 'object'
        && evt.result !== null
        && typeof evt.claimedOutcome === 'object'
        && evt.claimedOutcome !== null
        && Array.isArray(evt.commands)
        && typeof evt.finalSnapshot === 'object'
        && evt.finalSnapshot !== null
      );
    case 'error':
      return typeof evt.message === 'string';
    default:
      return false;
  }
}

export function assertPuzzleWorkerEvent(value: unknown): asserts value is PuzzleWorkerEvent {
  if (!isPuzzleWorkerEvent(value)) {
    const type = typeof value === 'object' && value !== null ? (value as any).type : typeof value;
    throw new Error(`Invalid puzzle worker event: ${String(type)}`);
  }
}
