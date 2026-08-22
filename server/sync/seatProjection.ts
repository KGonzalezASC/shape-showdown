import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
} from '../../src/constants.js';
import type { GameState, PlayerState } from '../../src/types.js';
import { toPublicPlayerState } from '../../src/state/publicSnapshots.js';
import type {
  LocalPlayerWire,
  MatchChromeWire,
  OpponentPlayerWire,
  PendingGarbageWire,
  SeatWireSnapshot,
} from '../../src/protocol/wireTypes.js';

function ensurePoisonBoard(player: PlayerState): number[][] {
  if (player.poisonBoard) return player.poisonBoard;
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0));
}

/**
 * Wire garbage carries the ABSOLUTE arrival tick. Stable across ticks, so
 * deltas skip the meta section while garbage is merely in flight.
 */
function absoluteGarbage(player: PlayerState, tick: number): PendingGarbageWire[] {
  return (player.pendingGarbage ?? []).map((packet) => ({
    lines: packet.lines,
    ...(packet.arrivalTick !== undefined
      ? { arrivalTick: packet.arrivalTick }
      : packet.ticksUntilArrival !== undefined
        ? { arrivalTick: tick + packet.ticksUntilArrival }
        : {}),
  }));
}

/** Effect expiry ticks are stored absolute; pass through untouched. */
function absoluteEffects(player: PlayerState): PlayerState['activeEffects'] {
  return (player.activeEffects ?? []).map((effect) => ({ ...effect }));
}

/** Poison spread state stores absolute ticks; pass through untouched. */
function absolutePoisonSpread(player: PlayerState): PlayerState['poisonSpread'] {
  return player.poisonSpread ? { ...player.poisonSpread } : null;
}

function projectOpponentBoard(player: PlayerState): OpponentPlayerWire['board'] {
  const publicPlayer = toPublicPlayerState(player);
  const board: OpponentPlayerWire['board'] = Array.from(
    { length: BOARD_VISIBLE_ROWS },
    () => Array.from({ length: BOARD_COLS }, () => null),
  );

  for (let visibleY = 0; visibleY < BOARD_VISIBLE_ROWS; visibleY += 1) {
    const simY = BOARD_HIDDEN_ROWS + visibleY;
    for (let x = 0; x < BOARD_COLS; x += 1) {
      board[visibleY][x] = publicPlayer.board[simY]?.[x] ?? null;
    }
  }

  return board;
}

function projectOpponentPoisonBoard(player: PlayerState): OpponentPlayerWire['poisonBoard'] {
  const poison = ensurePoisonBoard(player);
  const poisonBoard: OpponentPlayerWire['poisonBoard'] = Array.from(
    { length: BOARD_VISIBLE_ROWS },
    (_, visibleY) => Array.from(
      { length: BOARD_COLS },
      (_, x) => poison[BOARD_HIDDEN_ROWS + visibleY]?.[x] ?? 0,
    ),
  );

  return poisonBoard;
}

function buildLocalWire(player: PlayerState, tick: number): LocalPlayerWire {
  const publicPlayer = toPublicPlayerState(player);
  return {
    id: player.id,
    board: publicPlayer.board.map((row) => [...row]),
    poisonBoard: ensurePoisonBoard(player).map((row) => [...row]),
    activePiece: publicPlayer.activePiece,
    landingForecastAtTick: publicPlayer.landingForecastTicksRemaining === undefined
      ? undefined
      : tick + publicPlayer.landingForecastTicksRemaining,
    holdPiece: publicPlayer.holdPiece,
    canHold: publicPlayer.canHold,
    nextQueue: [...publicPlayer.nextQueue],
    score: publicPlayer.score,
    funds: publicPlayer.funds,
    linesCleared: publicPlayer.linesCleared,
    combo: publicPlayer.combo,
    backToBack: publicPlayer.backToBack,
    pendingGarbage: absoluteGarbage(player, tick),
    activeEffects: absoluteEffects(player),
    topOut: publicPlayer.topOut,
    swapCutoffRow: publicPlayer.swapCutoffRow,
    curtainDefenseLevel: publicPlayer.curtainDefenseLevel ?? 0,
    poisonSpread: absolutePoisonSpread(player),
    customNextPieceSourceCells: publicPlayer.customNextPieceSourceCells
      ? [...publicPlayer.customNextPieceSourceCells]
      : undefined,
    holdFrozenUntilTick: publicPlayer.holdFrozenUntilTick,
    magnetPermanentStacks: publicPlayer.magnetPermanentStacks,
    magnetPieceBoost: publicPlayer.magnetPieceBoost,
    pieceHasHardDropped: publicPlayer.pieceHasHardDropped,
    lastHardDropTick: publicPlayer.lastHardDropTick !== undefined && publicPlayer.lastHardDropTick >= 0
      ? publicPlayer.lastHardDropTick
      : undefined,
    snagHardDropBlocked: publicPlayer.snagHardDropBlocked,
    satelliteArmed: publicPlayer.satelliteArmed,
    satelliteDelayUntilTick: publicPlayer.satelliteDelayUntilTick,
    tectonicShiftNextStepTick: publicPlayer.tectonicShiftNextStepTick ?? null,
    shop: {
      offerIds: [...player.shop.offerIds],
      phase: player.shop.phase,
      cycleIndex: player.shop.cycleIndex,
      lastPurchasedItemId: player.shop.lastPurchasedItemId,
      activeSynergySeeds: [...player.shop.activeSynergySeeds],
      pricing: JSON.parse(JSON.stringify(player.shop.pricing)),
    },
  };
}

function buildOpponentWire(player: PlayerState, tick: number): OpponentPlayerWire {
  const publicPlayer = toPublicPlayerState(player);
  const poison = ensurePoisonBoard(player);
  const hasPoison = poison.some((row, y) => y >= BOARD_HIDDEN_ROWS && row.some((cell) => cell > 0));
  return {
    id: player.id,
    board: projectOpponentBoard(player),
    poisonBoard: projectOpponentPoisonBoard(player),
    activePiece: publicPlayer.activePiece,
    score: publicPlayer.score,
    funds: publicPlayer.funds,
    linesCleared: publicPlayer.linesCleared,
    combo: publicPlayer.combo,
    backToBack: publicPlayer.backToBack,
    pendingGarbage: absoluteGarbage(player, tick),
    activeEffects: absoluteEffects(player),
    topOut: publicPlayer.topOut,
    swapCutoffRow: publicPlayer.swapCutoffRow,
    curtainDefenseLevel: publicPlayer.curtainDefenseLevel ?? 0,
    poisonSpread: absolutePoisonSpread(player),
    tectonicShiftNextStepTick: publicPlayer.tectonicShiftNextStepTick ?? null,
    magnetPermanentStacks: publicPlayer.magnetPermanentStacks,
    magnetPieceBoost: publicPlayer.magnetPieceBoost,
    hasHold: publicPlayer.holdPiece !== null,
    hasPoison,
  };
}

export function buildMatchChromeWire(gameState: GameState): MatchChromeWire {
  return {
    status: gameState.status,
    countdown: gameState.countdown,
    seed: gameState.seed,
    winnerId: gameState.winnerId,
    endReason: gameState.endReason,
    technicalVictory: gameState.technicalVictory,
    restartTimer: gameState.restartTimer,
    pausePlayerId: gameState.pause?.playerId ?? null,
    pauseStartedAt: gameState.pause?.startedAt ?? null,
  };
}

export function buildSeatWireSnapshot(
  gameState: GameState,
  localRuntimeId: string,
): SeatWireSnapshot | null {
  const opponentId = Object.keys(gameState.players).find((id) => id !== localRuntimeId);
  const local = gameState.players[localRuntimeId];
  if (!local || !opponentId) return null;
  const opponent = gameState.players[opponentId];
  if (!opponent) return null;
  return {
    tick: gameState.tick,
    chrome: buildMatchChromeWire(gameState),
    local: buildLocalWire(local, gameState.tick),
    opponent: buildOpponentWire(opponent, gameState.tick),
  };
}
