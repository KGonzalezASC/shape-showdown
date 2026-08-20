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
  SeatWireSnapshot,
} from '../../src/protocol/wireTypes.js';

function ensurePoisonBoard(player: PlayerState): number[][] {
  if (player.poisonBoard) return player.poisonBoard;
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0));
}

function relativeGarbage(player: PlayerState, tick: number) {
  return (player.pendingGarbage ?? []).map((packet) => ({
    lines: packet.lines,
    ticksUntilArrival: packet.arrivalTick !== undefined
      ? Math.max(0, packet.arrivalTick - tick)
      : packet.ticksUntilArrival,
  }));
}

function relativeOptionalTick(value: number | null | undefined, tick: number): number | null {
  if (value === null || value === undefined) return value ?? null;
  return Math.max(0, value - tick);
}

function relativePoisonSpread(player: PlayerState, tick: number) {
  if (!player.poisonSpread) return null;
  return {
    ...player.poisonSpread,
    nextSpreadTick: Math.max(0, player.poisonSpread.nextSpreadTick - tick),
  };
}

function relativeEffects(player: PlayerState, tick: number) {
  return (player.activeEffects ?? []).map((effect) => ({
    ...effect,
    expiresAtTick: effect.expiresAtTick !== undefined
      ? Math.max(0, effect.expiresAtTick - tick)
      : undefined,
  }));
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
    landingForecastTicksRemaining: publicPlayer.landingForecastTicksRemaining,
    holdPiece: publicPlayer.holdPiece,
    canHold: publicPlayer.canHold,
    nextQueue: [...publicPlayer.nextQueue],
    score: publicPlayer.score,
    funds: publicPlayer.funds,
    linesCleared: publicPlayer.linesCleared,
    combo: publicPlayer.combo,
    backToBack: publicPlayer.backToBack,
    pendingGarbage: relativeGarbage(player, tick),
    activeEffects: relativeEffects(player, tick),
    topOut: publicPlayer.topOut,
    swapCutoffRow: publicPlayer.swapCutoffRow,
    curtainDefenseLevel: publicPlayer.curtainDefenseLevel ?? 0,
    poisonSpread: relativePoisonSpread(player, tick),
    customNextPieceSourceCells: publicPlayer.customNextPieceSourceCells
      ? [...publicPlayer.customNextPieceSourceCells]
      : undefined,
    holdFrozenUntilTick: relativeOptionalTick(publicPlayer.holdFrozenUntilTick, tick) ?? undefined,
    magnetPermanentStacks: publicPlayer.magnetPermanentStacks,
    magnetPieceBoost: publicPlayer.magnetPieceBoost,
    pieceHasHardDropped: publicPlayer.pieceHasHardDropped,
    lastHardDropTick: publicPlayer.lastHardDropTick !== undefined && publicPlayer.lastHardDropTick >= 0
      ? publicPlayer.lastHardDropTick
      : undefined,
    snagHardDropBlocked: publicPlayer.snagHardDropBlocked,
    satelliteArmed: publicPlayer.satelliteArmed,
    satelliteDelayUntilTick: relativeOptionalTick(publicPlayer.satelliteDelayUntilTick, tick) ?? undefined,
    tectonicShiftNextStepTick: relativeOptionalTick(publicPlayer.tectonicShiftNextStepTick ?? null, tick),
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
    pendingGarbage: relativeGarbage(player, tick),
    activeEffects: relativeEffects(player, tick),
    topOut: publicPlayer.topOut,
    swapCutoffRow: publicPlayer.swapCutoffRow,
    curtainDefenseLevel: publicPlayer.curtainDefenseLevel ?? 0,
    poisonSpread: relativePoisonSpread(player, tick),
    tectonicShiftNextStepTick: relativeOptionalTick(publicPlayer.tectonicShiftNextStepTick ?? null, tick),
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
