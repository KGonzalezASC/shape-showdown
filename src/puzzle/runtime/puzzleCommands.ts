import {
  canonicalEncode,
  parsePuzzleCommandStreamV1,
  type PuzzleCommandV1,
} from '../publishedPuzzle.js';
import type { ActionType, InputState } from '../../types.js';

/** Internal command form used after the published trace has crossed the boundary. */
export type PuzzleRuntimeCommand =
  | {
      kind: 'input';
      inputState: InputState;
    }
  | {
      kind: 'action';
      action: ActionType;
    };

/** Limits shared by browser attempts and bounded replay consumers. */
export const PUZZLE_TRACE_LIMITS = {
  maxCommands: 100_000,
  maxCommandsPerTick: 64,
  maxTicks: 90 * 60,
  maxEncodedBytes: 1_024 * 1_024,
} as const;

export function comparePuzzleCommands(
  left: Pick<PuzzleCommandV1, 'tick' | 'orderWithinTick'>,
  right: Pick<PuzzleCommandV1, 'tick' | 'orderWithinTick'>,
): number {
  return left.tick - right.tick || left.orderWithinTick - right.orderWithinTick;
}

/** Parse and validate a complete trace before it enters replay or storage. */
export function parsePuzzleCommandTrace(value: unknown): PuzzleCommandV1[] {
  const commands = parsePuzzleCommandStreamV1(value);
  assertPuzzleTraceLimits(commands);
  return commands;
}

export function assertPuzzleTraceLimits(commands: readonly PuzzleCommandV1[]): void {
  if (commands.length > PUZZLE_TRACE_LIMITS.maxCommands) {
    throw new Error(`puzzle trace exceeds ${PUZZLE_TRACE_LIMITS.maxCommands} commands`);
  }
  const encodedBytes = new TextEncoder().encode(canonicalEncode(commands)).byteLength;
  if (encodedBytes > PUZZLE_TRACE_LIMITS.maxEncodedBytes) {
    throw new Error(`puzzle trace exceeds ${PUZZLE_TRACE_LIMITS.maxEncodedBytes} encoded bytes`);
  }

  let currentTick: number | null = null;
  let commandsInTick = 0;
  for (const command of commands) {
    if (command.tick > PUZZLE_TRACE_LIMITS.maxTicks) {
      throw new Error(`puzzle trace exceeds ${PUZZLE_TRACE_LIMITS.maxTicks} ticks`);
    }
    if (command.tick !== currentTick) {
      currentTick = command.tick;
      commandsInTick = 0;
    }
    commandsInTick += 1;
    if (commandsInTick > PUZZLE_TRACE_LIMITS.maxCommandsPerTick) {
      throw new Error(
        `puzzle trace exceeds ${PUZZLE_TRACE_LIMITS.maxCommandsPerTick} commands in one tick`,
      );
    }
  }
}

export function toPuzzleRuntimeCommand(command: PuzzleCommandV1): PuzzleRuntimeCommand {
  switch (command.kind) {
    case 'input':
      return {
        kind: 'input',
        inputState: {
          left: command.left,
          right: command.right,
          softDrop: command.softDrop,
        },
      };
    case 'action':
      return { kind: 'action', action: command.action };
    default: {
      const _exhaustive: never = command;
      throw new Error(`Unsupported puzzle command: ${_exhaustive}`);
    }
  }
}

export function commandsForPuzzleTick(
  commands: readonly PuzzleCommandV1[],
  tick: number,
): PuzzleRuntimeCommand[] {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(`puzzle tick must be a non-negative safe integer, got ${tick}`);
  }
  return commands
    .filter((command) => command.tick === tick)
    .sort(comparePuzzleCommands)
    .map(toPuzzleRuntimeCommand);
}

export function assertRuntimeCommands(commands: readonly PuzzleRuntimeCommand[]): void {
  if (commands.length > PUZZLE_TRACE_LIMITS.maxCommandsPerTick) {
    throw new Error(
      `puzzle tick exceeds ${PUZZLE_TRACE_LIMITS.maxCommandsPerTick} commands`,
    );
  }
  for (const command of commands) {
    if (command.kind === 'input') {
      if (
        typeof command.inputState.left !== 'boolean'
        || typeof command.inputState.right !== 'boolean'
        || typeof command.inputState.softDrop !== 'boolean'
      ) {
        throw new Error('puzzle runtime input command must contain boolean held-input fields');
      }
      continue;
    }
    switch (command.action) {
      case 'rotateCW':
      case 'rotateCCW':
      case 'hardDrop':
      case 'hold':
        break;
      default: {
        const _exhaustive: never = command.action;
        throw new Error(`Unsupported puzzle runtime action: ${_exhaustive}`);
      }
    }
  }
}
