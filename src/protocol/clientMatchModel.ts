import type { PublicPlayerState } from '../state/publicSnapshots.js';
import { normalizeHeldPiece } from '../state/publicSnapshots.js';
import type { ClientMatchModel, LocalPlayerWire, OpponentPlayerWire, SeatWireSnapshot } from './wireTypes.js';
import { expandOpponentBoard } from './decodeMatchPacket.js';

function localToPublic(local: LocalPlayerWire): PublicPlayerState {
  return {
    id: local.id,
    board: local.board.map((row) => [...row]),
    activePiece: local.activePiece,
    landingForecastTicksRemaining: local.landingForecastTicksRemaining,
    holdPiece: normalizeHeldPiece(local.holdPiece),
    canHold: local.canHold,
    nextQueue: [...local.nextQueue],
    score: local.score,
    funds: local.funds,
    linesCleared: local.linesCleared,
    combo: local.combo,
    backToBack: local.backToBack,
    pendingGarbage: local.pendingGarbage.map((packet) => ({ ...packet })),
    activeEffects: local.activeEffects.map((effect) => ({ ...effect })),
    topOut: local.topOut,
    swapCutoffRow: local.swapCutoffRow,
    curtainDefenseLevel: local.curtainDefenseLevel,
    poisonBoard: local.poisonBoard.map((row) => [...row]),
    poisonSpread: local.poisonSpread ? { ...local.poisonSpread } : null,
    customNextPieceSourceCells: local.customNextPieceSourceCells
      ? [...local.customNextPieceSourceCells]
      : undefined,
    holdFrozenUntilTick: local.holdFrozenUntilTick,
    magnetPermanentStacks: local.magnetPermanentStacks,
    magnetPieceBoost: local.magnetPieceBoost,
    pieceHasHardDropped: local.pieceHasHardDropped,
    lastHardDropTick: local.lastHardDropTick,
    snagHardDropBlocked: local.snagHardDropBlocked,
    satelliteArmed: local.satelliteArmed,
    satelliteDelayUntilTick: local.satelliteDelayUntilTick,
    tectonicShiftNextStepTick: local.tectonicShiftNextStepTick,
    shop: {
      offerIds: [...local.shop.offerIds],
      phase: local.shop.phase,
      cycleIndex: local.shop.cycleIndex,
      lastPurchasedItemId: local.shop.lastPurchasedItemId,
      activeSynergySeeds: [...local.shop.activeSynergySeeds],
      pricing: JSON.parse(JSON.stringify(local.shop.pricing)),
    },
  };
}

function opponentToPublic(opponent: OpponentPlayerWire): PublicPlayerState {
  const expandedBoard = expandOpponentBoard(opponent.board);
  const hiddenPoisonRows = Array.from(
    { length: expandedBoard.length - opponent.poisonBoard.length },
    () => Array.from({ length: expandedBoard[0]?.length ?? 0 }, () => 0),
  );
  const expandedPoisonBoard = [
    ...hiddenPoisonRows,
    ...opponent.poisonBoard.map((row) => [...row]),
  ];
  return {
    id: opponent.id,
    board: expandedBoard,
    activePiece: opponent.activePiece,
    holdPiece: opponent.hasHold ? { type: 'I' } : null,
    canHold: false,
    nextQueue: [],
    score: opponent.score,
    funds: opponent.funds,
    linesCleared: opponent.linesCleared,
    combo: opponent.combo,
    backToBack: opponent.backToBack,
    pendingGarbage: opponent.pendingGarbage.map((packet) => ({ ...packet })),
    activeEffects: opponent.activeEffects.map((effect) => ({ ...effect })),
    topOut: opponent.topOut,
    swapCutoffRow: opponent.swapCutoffRow,
    curtainDefenseLevel: opponent.curtainDefenseLevel,
    poisonBoard: expandedPoisonBoard,
    poisonSpread: opponent.poisonSpread ? { ...opponent.poisonSpread } : null,
    tectonicShiftNextStepTick: opponent.tectonicShiftNextStepTick,
    magnetPermanentStacks: opponent.magnetPermanentStacks,
    magnetPieceBoost: opponent.magnetPieceBoost,
    opponentHasHold: opponent.hasHold,
    opponentHasPoison: opponent.hasPoison,
    shop: {
      offerIds: [],
      phase: 'waiting',
      cycleIndex: -1,
      lastPurchasedItemId: null,
      activeSynergySeeds: [],
      pricing: {},
    },
  };
}

export function seatSnapshotToClientModel(
  snapshot: SeatWireSnapshot,
  myId: string | null,
): ClientMatchModel {
  return {
    tick: snapshot.tick,
    seed: snapshot.chrome.seed,
    chrome: { ...snapshot.chrome },
    myId,
    myPlayer: localToPublic(snapshot.local),
    opponentPlayer: opponentToPublic(snapshot.opponent),
  };
}

export function cloneClientMatchModel(model: ClientMatchModel): ClientMatchModel {
  return JSON.parse(JSON.stringify(model)) as ClientMatchModel;
}
