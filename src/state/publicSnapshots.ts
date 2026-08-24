import {
  ActiveFieldEffect,
  CellValue,
  GameState,
  HeldPiece,
  MatchStatus,
  PendingGarbagePacket,
  PlayerShopState,
  PlayerState,
  PoisonSpreadState,
  GamePiece,
  ShapeType,
} from '../types';

/**
 * Local UI-facing player snapshot: simulation timers and bag internals stay out of
 * the React playfield seam. The Socket.IO wire still carries full `GameState`;
 * GameStateStore derives this projection for components.
 */
export interface PublicPlayerState {
  id: string;
  displayName?: string;
  board: CellValue[][];
  activePiece: GamePiece | null;
  landingForecastTicksRemaining?: number;
  holdPiece: HeldPiece | null;
  canHold: boolean;
  nextQueue: ShapeType[];
  score: number;
  funds: number;
  linesCleared: number;
  combo: number;
  backToBack: boolean;
  pendingGarbage: PendingGarbagePacket[];
  activeEffects?: ActiveFieldEffect[];
  topOut: boolean;
  swapCutoffRow: number;
  curtainDefenseLevel?: number;
  poisonBoard?: number[][];
  poisonSpread?: PoisonSpreadState | null;
  customNextPieceSourceCells?: [number, number][];
  holdFrozenUntilTick?: number;
  magnetPermanentStacks?: number;
  magnetPieceBoost?: number;
  pieceHasHardDropped?: boolean;
  lastHardDropTick?: number;
  snagHardDropBlocked?: boolean;
  satelliteArmed?: boolean;
  satelliteDelayUntilTick?: number;
  tectonicShiftNextStepTick?: number | null;
  shop: Pick<
    PlayerShopState,
    'offerIds' | 'phase' | 'cycleIndex' | 'lastPurchasedItemId' | 'activeSynergySeeds' | 'pricing'
  >;
  /** Opponent wire capability — not present on local player snapshots. */
  opponentHasHold?: boolean;
  opponentHasPoison?: boolean;
}

export interface PublicGameState {
  players: Record<string, PublicPlayerState>;
  status: MatchStatus;
  countdown: number;
  winnerId: string | null;
  restartTimer?: number;
  technicalVictory?: boolean;
  tick: number;
  seed: number;
}

const SHAPE_TYPES = new Set<ShapeType>(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);

/**
 * Normalize storage from the wire. Legacy servers sent a bare ShapeType string;
 * current servers send HeldPiece. Without this, `holdPiece.type` is undefined and
 * GameField crashes on Shift/hold.
 */
export function normalizeHeldPiece(
  hold: HeldPiece | ShapeType | null | undefined,
): HeldPiece | null {
  if (hold == null) return null;
  if (typeof hold === 'string') {
    return SHAPE_TYPES.has(hold) ? { type: hold } : null;
  }
  if (typeof hold === 'object' && SHAPE_TYPES.has(hold.type)) {
    return hold;
  }
  return null;
}

export function toPublicPlayerState(player: PlayerState): PublicPlayerState {
  return {
    id: player.id,
    displayName: player.displayName,
    board: player.board,
    activePiece: player.activePiece,
    landingForecastTicksRemaining: player.landingForecastTicksRemaining,
    holdPiece: normalizeHeldPiece(player.holdPiece as HeldPiece | ShapeType | null),
    canHold: player.canHold,
    nextQueue: player.nextQueue,
    score: player.score,
    funds: player.funds ?? player.score ?? 0,
    linesCleared: player.linesCleared,
    combo: player.combo,
    backToBack: player.backToBack,
    pendingGarbage: player.pendingGarbage,
    activeEffects: player.activeEffects,
    topOut: player.topOut,
    swapCutoffRow: player.swapCutoffRow,
    curtainDefenseLevel: player.curtainDefenseLevel ?? 0,
    poisonBoard: player.poisonBoard,
    poisonSpread: player.poisonSpread,
    customNextPieceSourceCells: player.customNextPieceSourceCells,
    holdFrozenUntilTick: player.holdFrozenUntilTick,
    magnetPermanentStacks: player.magnetPermanentStacks,
    magnetPieceBoost: player.magnetPieceBoost,
    pieceHasHardDropped: player.pieceHasHardDropped,
    lastHardDropTick: player.lastHardDropTick,
    snagHardDropBlocked: player.snagHardDropBlocked,
    satelliteArmed: player.satelliteArmed,
    satelliteDelayUntilTick: player.satelliteDelayUntilTick,
    tectonicShiftNextStepTick: player.tectonicShiftNextStepTick,
    shop: {
      offerIds: player.shop.offerIds,
      phase: player.shop.phase,
      cycleIndex: player.shop.cycleIndex,
      lastPurchasedItemId: player.shop.lastPurchasedItemId,
      activeSynergySeeds: player.shop.activeSynergySeeds,
      pricing: player.shop.pricing,
    },
  };
}

export function pendingGarbageTotal(packets: readonly PendingGarbagePacket[]): number {
  return packets.reduce((total, packet) => total + packet.lines, 0);
}

function toPublicGameState(state: GameState): PublicGameState {
  const players: Record<string, PublicPlayerState> = {};
  for (const id of Object.keys(state.players)) {
    players[id] = toPublicPlayerState(state.players[id]);
  }
  return {
    players,
    status: state.status,
    countdown: state.countdown,
    winnerId: state.winnerId,
    restartTimer: state.restartTimer,
    technicalVictory: state.technicalVictory,
    tick: state.tick,
    seed: state.seed,
  };
}

function effectsEqual(a?: ActiveFieldEffect[], b?: ActiveFieldEffect[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ea = a[i];
    const eb = b[i];
    if (
      ea.id !== eb.id ||
      ea.kind !== eb.kind ||
      ea.label !== eb.label ||
      ea.icon !== eb.icon ||
      ea.expiresAtTick !== eb.expiresAtTick
    ) {
      return false;
    }
  }
  return true;
}

function pieceEqual(a: GamePiece | null, b: GamePiece | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.x !== b.x ||
    a.y !== b.y ||
    a.rotation !== b.rotation ||
    a.type !== b.type ||
    !!a.poisoned !== !!b.poisoned ||
    a.poisonVariant !== b.poisonVariant ||
    !!a.bomber !== !!b.bomber ||
    a.rotationBlockedNonce !== b.rotationBlockedNonce ||
    !!a.isWildcard !== !!b.isWildcard
  ) {
    return false;
  }
  const oa = a.customOffsets;
  const ob = b.customOffsets;
  if (oa === ob) return true;
  if (!oa || !ob || oa.length !== ob.length) return false;
  for (let i = 0; i < oa.length; i += 1) {
    if (oa[i][0] !== ob[i][0] || oa[i][1] !== ob[i][1]) return false;
  }
  return true;
}

function heldEqual(a: HeldPiece | null, b: HeldPiece | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.type === b.type &&
    !!a.poisoned === !!b.poisoned &&
    a.poisonVariant === b.poisonVariant &&
    !!a.bomber === !!b.bomber
  );
}

function boardEqual(a: CellValue[][], b: CellValue[][]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let y = 0; y < a.length; y += 1) {
    const rowA = a[y];
    const rowB = b[y];
    if (rowA === rowB) continue;
    if (rowA.length !== rowB.length) return false;
    for (let x = 0; x < rowA.length; x += 1) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }
  return true;
}

function poisonEqual(a?: number[][], b?: number[][]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let y = 0; y < a.length; y += 1) {
    const rowA = a[y];
    const rowB = b[y];
    if (rowA === rowB) continue;
    if (rowA.length !== rowB.length) return false;
    for (let x = 0; x < rowA.length; x += 1) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }
  return true;
}

function sourceCellsEqual(a?: [number, number][], b?: [number, number][]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

function pricingEqual(
  a: PublicPlayerState['shop']['pricing'],
  b: PublicPlayerState['shop']['pricing'],
): boolean {
  const itemIds = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const itemId of itemIds) {
    const left = a[itemId];
    const right = b[itemId];
    if (!left || !right) return false;
    if (
      left.level !== right.level ||
      left.purchasesInWindow !== right.purchasesInWindow ||
      left.windowStartedAtTick !== right.windowStartedAtTick ||
      left.lastWindowClosedBy !== right.lastWindowClosedBy
    ) return false;
  }
  return true;
}

export function publicPlayersEqual(a: PublicPlayerState | null, b: PublicPlayerState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.id !== b.id ||
    a.displayName !== b.displayName ||
    a.canHold !== b.canHold ||
    a.score !== b.score ||
    a.funds !== b.funds ||
    a.linesCleared !== b.linesCleared ||
    a.combo !== b.combo ||
    a.backToBack !== b.backToBack ||
    pendingGarbageTotal(a.pendingGarbage) !== pendingGarbageTotal(b.pendingGarbage) ||
    a.topOut !== b.topOut ||
    a.landingForecastTicksRemaining !== b.landingForecastTicksRemaining ||
    a.swapCutoffRow !== b.swapCutoffRow ||
    a.curtainDefenseLevel !== b.curtainDefenseLevel ||
    a.holdFrozenUntilTick !== b.holdFrozenUntilTick ||
    a.magnetPermanentStacks !== b.magnetPermanentStacks ||
    a.magnetPieceBoost !== b.magnetPieceBoost ||
    a.pieceHasHardDropped !== b.pieceHasHardDropped ||
    a.lastHardDropTick !== b.lastHardDropTick ||
    a.snagHardDropBlocked !== b.snagHardDropBlocked ||
    a.tectonicShiftNextStepTick !== b.tectonicShiftNextStepTick ||
    a.shop.phase !== b.shop.phase ||
    a.shop.cycleIndex !== b.shop.cycleIndex ||
    a.shop.lastPurchasedItemId !== b.shop.lastPurchasedItemId ||
    !pricingEqual(a.shop.pricing, b.shop.pricing)
  ) {
    return false;
  }
  if (!heldEqual(a.holdPiece, b.holdPiece)) return false;
  if (!pieceEqual(a.activePiece, b.activePiece)) return false;
  if (!effectsEqual(a.activeEffects, b.activeEffects)) return false;
  if (!sourceCellsEqual(a.customNextPieceSourceCells, b.customNextPieceSourceCells)) return false;
  if (!boardEqual(a.board, b.board)) return false;
  if (!poisonEqual(a.poisonBoard, b.poisonBoard)) return false;
  return true;
}
