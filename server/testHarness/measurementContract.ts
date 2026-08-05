import type { BoardPressureMetrics } from './boardPressure.js';
import type { ObservationMode } from './observationProjector.js';

export type EvidenceType =
  | 'deterministic in-process simulation'
  | 'live server/Socket.IO smoke evidence'
  | 'browser-visible behavior';

export type CostPolicy = 'mechanical-impact' | 'reference-price' | 'pricing';

export type ArmType = 'control' | 'treatment' | 'baseline';

export interface DriverCadenceMetrics {
  invalidActions: number;
  repeatedRotations: number;
  hardDropCadence: number;
  planInvalidations: number;
}

export interface ItemPurchaseRecord {
  tick: number;
  playerId: string;
  itemId: string;
  cost: number;
  accepted: boolean;
}

export interface ItemActivationRecord {
  tick: number;
  playerId: string;
  itemId: string;
  targetId: string;
  success: boolean;
  detail?: Record<string, unknown>;
}

export interface PlayerOutcomeSnapshot {
  playerId: string;
  score: number;
  linesCleared: number;
  piecesLocked: number;
  survivalTicks: number;
  toppedOut: boolean;
  spending: number;
  netWalletChange: number;
  availableFundsMedian: number;
  availableFundsMax: number;
  pressure: BoardPressureMetrics;
  cadence: DriverCadenceMetrics;
}

export interface RoleOutcomeDelta {
  buyerId: string;
  recipientId: string;
  directRecipientDelta: {
    holesDelta: number;
    aggregateHeightDelta: number;
    bumpinessDelta: number;
    poisonCellsDelta: number;
  };
  buyerOutcomeDelta: {
    scoreDelta: number;
    linesClearedDelta: number;
    survivalTicksDelta: number;
    toppedOutChange: boolean;
  };
  opponentOutcomeDelta: {
    scoreDelta: number;
    linesClearedDelta: number;
    survivalTicksDelta: number;
  };
  matchOutcomeDelta: {
    winnerChanged: boolean;
    durationTicksDelta: number;
  };
  economicCost: number;
}

export interface SingleRunTrace {
  evidenceType: EvidenceType;
  policyId: string;
  seed: number;
  observationMode: ObservationMode;
  costPolicy: CostPolicy;
  armType: ArmType;
  enableShop: boolean;
  enableGarbage: boolean;
  treatmentId?: string;
  controlId?: string;
  durationTicks: number;
  finalStatus: string;
  winnerId: string | null;
  players: Record<string, PlayerOutcomeSnapshot>;
  purchases: ItemPurchaseRecord[];
  activations: ItemActivationRecord[];
}

export function computeRoleOutcomeDelta(
  controlTrace: SingleRunTrace,
  treatmentTrace: SingleRunTrace,
  buyerId: string,
  recipientId: string,
): RoleOutcomeDelta {
  const ctrlBuyer = controlTrace.players[buyerId];
  const trtBuyer = treatmentTrace.players[buyerId];

  const ctrlRecipient = controlTrace.players[recipientId];
  const trtRecipient = treatmentTrace.players[recipientId];

  const opponentId = Object.keys(treatmentTrace.players).find((id) => id !== buyerId) ?? recipientId;
  const ctrlOpponent = controlTrace.players[opponentId];
  const trtOpponent = treatmentTrace.players[opponentId];

  if (!ctrlBuyer || !trtBuyer || !ctrlRecipient || !trtRecipient) {
    throw new Error(`Missing player outcome snapshots for buyer ${buyerId} or recipient ${recipientId}`);
  }

  const directRecipientDelta = {
    holesDelta: trtRecipient.pressure.holes - ctrlRecipient.pressure.holes,
    aggregateHeightDelta: trtRecipient.pressure.aggregateHeight - ctrlRecipient.pressure.aggregateHeight,
    bumpinessDelta: trtRecipient.pressure.bumpiness - ctrlRecipient.pressure.bumpiness,
    poisonCellsDelta: (trtRecipient.pressure.poisonCells ?? 0) - (ctrlRecipient.pressure.poisonCells ?? 0),
  };

  const buyerOutcomeDelta = {
    scoreDelta: trtBuyer.score - ctrlBuyer.score,
    linesClearedDelta: trtBuyer.linesCleared - ctrlBuyer.linesCleared,
    survivalTicksDelta: trtBuyer.survivalTicks - ctrlBuyer.survivalTicks,
    toppedOutChange: trtBuyer.toppedOut !== ctrlBuyer.toppedOut,
  };

  const opponentOutcomeDelta = {
    scoreDelta: (trtOpponent?.score ?? 0) - (ctrlOpponent?.score ?? 0),
    linesClearedDelta: (trtOpponent?.linesCleared ?? 0) - (ctrlOpponent?.linesCleared ?? 0),
    survivalTicksDelta: (trtOpponent?.survivalTicks ?? 0) - (ctrlOpponent?.survivalTicks ?? 0),
  };

  const matchOutcomeDelta = {
    winnerChanged: treatmentTrace.winnerId !== controlTrace.winnerId,
    durationTicksDelta: treatmentTrace.durationTicks - controlTrace.durationTicks,
  };

  const economicCost = trtBuyer.spending;

  return {
    buyerId,
    recipientId,
    directRecipientDelta,
    buyerOutcomeDelta,
    opponentOutcomeDelta,
    matchOutcomeDelta,
    economicCost,
  };
}
