import type { BotDecisionTrace, CellValue, PlayerState, ReplayDataV2 } from './types';

export interface ReplayDecisionOutcome {
  decisionTick: number;
  lockTick: number | null;
  snapshotTick: number | null;
  scoreDelta: number | null;
  linesCleared: number;
  attackSent: number;
  garbageApplied: number;
  maxHeightBefore: number | null;
  maxHeightAfter: number | null;
  maxHeightDelta: number | null;
}

function maxHeight(board: CellValue[][] | undefined): number | null {
  if (!board || board.length === 0) return null;
  let tallest = 0;
  for (let x = 0; x < (board[0]?.length ?? 0); x += 1) {
    const firstFilledRow = board.findIndex((row) => row[x] !== null);
    if (firstFilledRow >= 0) tallest = Math.max(tallest, board.length - firstFilledRow);
  }
  return tallest;
}

function playerAtOrBefore(
  replay: ReplayDataV2,
  playerId: string,
  tick: number,
): PlayerState | null {
  let nearest: PlayerState | null = null;
  for (const frame of replay.keyframes) {
    if (frame.tick > tick) break;
    nearest = frame.players[playerId] ?? nearest;
  }
  return nearest;
}

function lockSnapshotAfter(
  replay: ReplayDataV2,
  trace: BotDecisionTrace,
): { lockTick: number; snapshotTick: number; player: PlayerState } | null {
  const decisionTick = trace.replayTick ?? trace.tick;
  for (const frame of replay.keyframes) {
    if (frame.tick < decisionTick) continue;
    const player = frame.players[trace.playerId];
    const lastLockTick = player?.lastLockTick;
    const lastHardDropTick = player?.lastHardDropTick;
    const lockTick = lastLockTick ?? lastHardDropTick;
    if (player && lockTick !== undefined && lockTick >= decisionTick) {
      return {
        lockTick,
        snapshotTick: frame.tick,
        player,
      };
    }
  }
  return null;
}

/**
 * Summarizes recorded consequences through the first lock after a solver decision.
 * This is observed replay evidence, not a claim that the placement caused every
 * later event in the interval.
 */
export function deriveReplayDecisionOutcome(
  replay: ReplayDataV2,
  trace: BotDecisionTrace,
): ReplayDecisionOutcome {
  const decisionTick = trace.replayTick ?? trace.tick;
  const decisionPlayer = playerAtOrBefore(replay, trace.playerId, decisionTick);
  const beforeHeight = trace.decisionBoard
    ? maxHeight(trace.decisionBoard)
    : trace.maxHeight ?? maxHeight(decisionPlayer?.board);
  const lock = lockSnapshotAfter(replay, trace);

  if (!lock) {
    return {
      decisionTick,
      lockTick: null,
      snapshotTick: null,
      scoreDelta: null,
      linesCleared: 0,
      attackSent: 0,
      garbageApplied: 0,
      maxHeightBefore: beforeHeight,
      maxHeightAfter: null,
      maxHeightDelta: null,
    };
  }

  const events = replay.events.filter(
    (event) => event.playerId === trace.playerId && event.tick >= decisionTick && event.tick <= lock.lockTick,
  );
  const linesCleared = events.reduce(
    (total, event) => total + (event.type === 'lineClear' ? event.lines : 0),
    0,
  );
  const attackSent = events.reduce(
    (total, event) => total + (event.type === 'attackSent' ? event.lines : 0),
    0,
  );
  const garbageApplied = events.reduce(
    (total, event) => total + (event.type === 'garbageApplied' ? event.lines : 0),
    0,
  );
  const beforeScore = trace.decisionScore ?? decisionPlayer?.score;
  const scoreDelta = beforeScore === undefined ? null : lock.player.score - beforeScore;
  const afterHeight = maxHeight(lock.player.board);

  return {
    decisionTick,
    lockTick: lock.lockTick,
    snapshotTick: lock.snapshotTick,
    scoreDelta,
    linesCleared,
    attackSent,
    garbageApplied,
    maxHeightBefore: beforeHeight,
    maxHeightAfter: afterHeight,
    maxHeightDelta: beforeHeight === null || afterHeight === null ? null : afterHeight - beforeHeight,
  };
}
