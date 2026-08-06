import {
  ATTACK_TABLE,
  ARR_TICKS,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  CellValue,
  ActionType,
  GAME_TICK_RATE,
  GARBAGE_ARRIVAL_DELAY_TICKS,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  InputState,
  LOCK_DELAY_TICKS,
  LOCK_RESET_CAP,
  LANDING_FORECAST_TICKS,
  STICKY_LOCK_RESET_CAP,
  MatchEvent,
  PendingGarbagePacket,
  PendingShopEffect,
  PlayerState,
  HeldPiece,
  TetrisPiece,
  RotationState,
  SOFT_DROP_CELLS_PER_TICK,
  TetrominoType,
  POISON_LINE_CLEAR_PENALTY_MAX_RATIO,
} from '../../src/types.js';
import type { StepOptions, StepResult } from './stepTypes.js';
import {
  COMBO_BONUS_TABLE,
  CURTAIN_DURATION_TICKS,
  DAS_TICKS,
  GRAVITY_TICKS_PER_CELL,
  HORIZONTAL_SPEED_THRESHOLDS,
  NEXT_PREVIEW_COUNT,
  POISON_GENERATIONS,
  POISON_SPREAD_INTERVAL_TICKS,
  MAGNET_PERMANENT_MAX,
  MAGNET_PERMANENT_GRAVITY_STEP,
  MAGNET_PIECE_GRAVITY_STEP,
  MAGNET_GRAVITY_TICK_REDUCTION,
  MAGNET_MIN_GRAVITY_TICKS,
  SATELLITE_PACKET_DELAY_TICKS,
  SATELLITE_INCOMING_DELAY_TICKS,
  SATELLITE_DURATION_TICKS,
  BOMBER_BLAST_RADIUS,
  TECTONIC_SHIFT_STEP_TICKS,
  TECTONIC_SHIFT_MIN_DURATION_TICKS,
} from '../../src/constants.js';
import { getKickTests, PIECE_SEQUENCE, SHAPES } from './pieces.js';
import { createInitialPlayerShop, rollShopOnLineClear, tickPlayerShop } from '../../src/shop/playerShop.js';
import { pushFieldEffect } from '../../src/shop/fieldEffects.js';
import { MutableRng, RngChannels, ensureRngChannels, makeRng as makeSharedRng, rngNext } from '../../src/rng.js';

export type { MutableRng, RngChannels };

export function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));
}

export function createEmptyPoisonBoard(): number[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0));
}

/** Lazily ensure the parallel poison grid exists and matches board dimensions (legacy/replay safety). */
function ensurePoisonBoard(player: PlayerState): number[][] {
  if (!player.poisonBoard || player.poisonBoard.length !== player.board.length) {
    player.poisonBoard = createEmptyPoisonBoard();
  }
  return player.poisonBoard;
}

function shuffledBag(rng: MutableRng): TetrominoType[] {
  const bag = [...PIECE_SEQUENCE];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext(rng) * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function normalizeInput(input: InputState): InputState {
  return {
    left: !!input.left,
    right: !!input.right,
    softDrop: !!input.softDrop,
  };
}

export function makePlayer(id: string, rng: RngChannels | MutableRng): PlayerState {
  const channels = ensureRngChannels(rng);
  const bag = shuffledBag(channels.pieces);
  const nextQueue = [...bag];
  const player: PlayerState = {
    id,
    board: createEmptyBoard(),
    activePiece: null,
    landingForecastTicksRemaining: 0,
    holdPiece: null,
    canHold: true,
    nextQueue,
    bag: [],
    score: 0,
    linesCleared: 0,
    combo: -1,
    backToBack: false,
    inputState: { left: false, right: false, softDrop: false },
    actionQueue: [],
    shiftDirection: 0,
    dasCounter: 0,
    arrCounter: 0,
    gravityCounter: 0,
    lockDelayRemainingTicks: LOCK_DELAY_TICKS,
    lockResetsUsed: 0,
    lowestY: BOARD_HIDDEN_ROWS - 2,
    srsKickNonce: 0,
    lastSrsKick: null,
    lastActionWasRotate: false,
    pendingGarbage: [],
    topOut: false,
    swapCutoffRow: HOLD_SWAP_CUTOFF_VISIBLE_ROW,
    pendingShopEffects: [],
    activeEffects: [],
    poisonBoard: createEmptyPoisonBoard(),
    poisonSpread: null,
    poisonNextPiece: false,
    poisonNextVariant: undefined,
    holdFrozenUntilTick: undefined,
    pieceLockResetCap: undefined,
    stickyNextPiece: false,
    magnetPermanentStacks: 0,
    magnetPieceBoost: 0,
    pieceHasHardDropped: false,
    lastHardDropTick: -1,
    snagHardDropBlocked: false,
    snagNextPiece: false,
    satelliteArmed: false,
    satelliteDelayUntilTick: undefined,
    bomberNextPiece: false,
    tectonicShiftNextStepTick: null,
    tectonicShiftStartTick: null,
    tectonicShiftStepTicks: null,
    shop: createInitialPlayerShop(channels.shop),
  };
  ensureQueue(player, channels.pieces);
  player.activePiece = spawnNextPiece(player, channels.pieces);
  player.landingForecastTicksRemaining = player.activePiece ? LANDING_FORECAST_TICKS : 0;
  if (player.activePiece) player.lowestY = player.activePiece.y;
  return player;
}

function ensureQueue(player: PlayerState, rng: MutableRng): void {
  while (player.nextQueue.length < NEXT_PREVIEW_COUNT + 1) {
    if (player.bag.length === 0) {
      player.bag = shuffledBag(rng);
    }
    const next = player.bag.shift();
    if (next) player.nextQueue.push(next);
  }
}

function spawnNextPiece(player: PlayerState, rng: MutableRng) {
  ensureQueue(player, rng);
  const type = player.nextQueue.shift();
  if (!type) return null;
  ensureQueue(player, rng);
  // Consume a queued poison (purchase landed while no piece was active).
  const poisoned = !!player.poisonNextPiece;
  const poisonVariant = player.poisonNextVariant;
  player.poisonNextPiece = false;
  player.poisonNextVariant = undefined;
  const bomber = !!player.bomberNextPiece;
  player.bomberNextPiece = false;

  const customOffsets = player.customNextPieceOffsets;
  const customVariant = player.customNextPieceVariant;
  player.customNextPieceOffsets = undefined;
  player.customNextPieceVariant = undefined;
  player.customNextPieceSourceCells = undefined;

  let spawnX = 3;
  if (customOffsets) {
    const xs = customOffsets.map(([dx]) => dx);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const width = maxX - minX + 1;
    spawnX = Math.floor((BOARD_COLS - width) / 2) - minX;
  }

  return {
    type,
    rotation: 0 as RotationState,
    x: spawnX,
    y: BOARD_HIDDEN_ROWS - 2,
    poisoned: poisoned,
    poisonVariant: poisonVariant !== undefined ? poisonVariant : customVariant,
    bomber,
    customOffsets,
    isWildcard: customOffsets !== undefined,
  };
}

function getCells(piece: { type: TetrominoType; rotation: RotationState; x: number; y: number; customOffsets?: [number, number][] }) {
  if (piece.customOffsets) {
    return piece.customOffsets.map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }));
  }
  return SHAPES[piece.type][piece.rotation].map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }));
}

/**
 * Rotate a normalized custom polyomino inside its bounding box.
 * CW:  (dx, dy) -> (height - 1 - dy, dx)
 * CCW: (dx, dy) -> (dy, width - 1 - dx)
 */
function rotateCustomOffsets(offsets: [number, number][], dir: 1 | -1): [number, number][] {
  const maxX = Math.max(...offsets.map(([dx]) => dx));
  const maxY = Math.max(...offsets.map(([, dy]) => dy));
  const width = maxX + 1;
  const height = maxY + 1;
  const rotated = offsets.map(([dx, dy]) => {
    if (dir === 1) return [height - 1 - dy, dx] as [number, number];
    return [dy, width - 1 - dx] as [number, number];
  });
  const minX = Math.min(...rotated.map(([dx]) => dx));
  const minY = Math.min(...rotated.map(([, dy]) => dy));
  return rotated
    .map(([dx, dy]) => [dx - minX, dy - minY] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function collides(board: CellValue[][], piece: { type: TetrominoType; rotation: RotationState; x: number; y: number; customOffsets?: [number, number][] }): boolean {
  for (const cell of getCells(piece)) {
    if (cell.x < 0 || cell.x >= BOARD_COLS || cell.y >= BOARD_ROWS) return true;
    if (cell.y >= 0 && board[cell.y][cell.x] !== null) return true;
  }
  return false;
}

function tryMove(player: PlayerState, dx: number, dy: number): boolean {
  if (!player.activePiece) return false;
  const wasGrounded = isGrounded(player);
  const candidate = { ...player.activePiece, x: player.activePiece.x + dx, y: player.activePiece.y + dy };
  if (collides(player.board, candidate)) return false;
  player.activePiece = candidate;
  if (dx !== 0 && dy === 0) {
    // A horizontal shift breaks a T-Spin sequence (last action must be a rotation).
    player.lastActionWasRotate = false;
    if (wasGrounded && player.lockResetsUsed < lockResetCapFor(player)) {
      player.lockResetsUsed += 1;
      player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
    }
  }
  // Step down: only refill lock delay when the piece reaches a genuinely new lowest row.
  // Falling back to a previously-visited row (e.g. after a kick-up) does NOT refill,
  // preventing the kick-up→fall→free-timer infinite loop.
  if (dy > 0 && player.activePiece.y > player.lowestY) {
    player.lowestY = player.activePiece.y;
    player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
    // Sticky: do not refill move-reset budget when the piece slides to a new row.
    if (player.pieceLockResetCap === undefined) {
      player.lockResetsUsed = 0;
    }
  }
  return true;
}

function tryRotate(player: PlayerState, dir: 1 | -1): boolean {
  if (!player.activePiece) return false;
  const wasGrounded = isGrounded(player);
  const from = player.activePiece.rotation;
  const to = (((from + dir) % 4) + 4) % 4 as RotationState;

  if (player.activePiece.customOffsets) {
    const newOffsets = rotateCustomOffsets(player.activePiece.customOffsets, dir);
    // Bounding-box spin + simple wall kicks (no SRS tables — those assume tetrominoes).
    const kickTests: Array<[number, number]> = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [kx, ky] of kickTests) {
      const candidate = {
        ...player.activePiece,
        rotation: to,
        x: player.activePiece.x + kx,
        y: player.activePiece.y + ky,
        customOffsets: newOffsets,
      };
      if (!collides(player.board, candidate)) {
        player.activePiece = candidate;
        player.lastActionWasRotate = true;
        if (kx !== 0 || ky !== 0) {
          player.srsKickNonce += 1;
          player.lastSrsKick = { kx, ky };
        }
        if (wasGrounded && player.lockResetsUsed < lockResetCapFor(player)) {
          player.lockResetsUsed += 1;
          player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
        }
        return true;
      }
    }
    player.activePiece.rotationBlockedNonce = (player.activePiece.rotationBlockedNonce ?? 0) + 1;
    return false;
  }

  const tests = getKickTests(player.activePiece.type, from, to);
  for (const [kx, ky] of tests) {
    const candidate = { ...player.activePiece, rotation: to, x: player.activePiece.x + kx, y: player.activePiece.y - ky };
    if (!collides(player.board, candidate)) {
      player.activePiece = candidate;
      player.lastActionWasRotate = true;
      if (kx !== 0 || ky !== 0) {
        player.srsKickNonce += 1;
        player.lastSrsKick = { kx, ky };
      }
      // Count resets whenever the piece was grounded before the rotate, even if SRS kicks it airborne.
      if (wasGrounded && player.lockResetsUsed < lockResetCapFor(player)) {
        player.lockResetsUsed += 1;
        player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
      }
      return true;
    }
  }
  return false;
}

function isGrounded(player: PlayerState): boolean {
  if (!player.activePiece) return false;
  const test = { ...player.activePiece, y: player.activePiece.y + 1 };
  return collides(player.board, test);
}

function canHoldAtCurrentHeight(player: PlayerState): boolean {
  if (!player.activePiece) return false;
  const maxVisibleRow = Math.max(...getCells(player.activePiece).map((cell) => cell.y - BOARD_HIDDEN_ROWS));
  return maxVisibleRow < player.swapCutoffRow;
}

export function isHoldFrozen(player: PlayerState, tick: number): boolean {
  return player.holdFrozenUntilTick !== undefined && tick < player.holdFrozenUntilTick;
}

export function lockResetCapFor(player: PlayerState): number {
  return player.pieceLockResetCap ?? LOCK_RESET_CAP;
}

function clearPieceLockResetCap(player: PlayerState): void {
  player.pieceLockResetCap = undefined;
  player.stickyNextPiece = false;
  if (player.activeEffects) {
    player.activeEffects = player.activeEffects.filter((e) => e.kind !== 'sticky');
  }
}

export function magnetGravityLevel(player: PlayerState): number {
  const permanent = (player.magnetPermanentStacks ?? 0) * MAGNET_PERMANENT_GRAVITY_STEP;
  const piece = (player.magnetPieceBoost ?? 0) * MAGNET_PIECE_GRAVITY_STEP;
  return permanent + piece;
}

export function gravityTicksPerCellFor(player: PlayerState): number {
  const level = magnetGravityLevel(player);
  if (level <= 0) return GRAVITY_TICKS_PER_CELL;
  return Math.max(
    MAGNET_MIN_GRAVITY_TICKS,
    GRAVITY_TICKS_PER_CELL - level * MAGNET_GRAVITY_TICK_REDUCTION,
  );
}

function clearMagnetPieceBoost(player: PlayerState): void {
  player.magnetPieceBoost = 0;
}

function clearSnagHardDrop(player: PlayerState): void {
  player.snagHardDropBlocked = false;
  player.snagNextPiece = false;
}

export function isSnagBlockingHardDrop(player: PlayerState): boolean {
  return !!player.snagHardDropBlocked;
}

/**
 * Snag: block hard drop (and soft drop) on the current piece until lock/hold.
 * If they already hard-dropped this piece, also snag the next spawn from queue.
 */
export function applySnagToOpponent(opponent: PlayerState): void {
  if (opponent.activePiece) {
    opponent.snagHardDropBlocked = true;
    opponent.snagNextPiece = !!opponent.pieceHasHardDropped;
  } else {
    opponent.snagHardDropBlocked = false;
    opponent.snagNextPiece = true;
  }
}

/** Magnet shop item on opponent: permanent stack up to 3, then +1 on current piece until lock. */
export function applyMagnetToOpponent(opponent: PlayerState): void {
  const permanent = opponent.magnetPermanentStacks ?? 0;
  if (permanent < MAGNET_PERMANENT_MAX) {
    opponent.magnetPermanentStacks = permanent + 1;
  } else {
    opponent.magnetPieceBoost = (opponent.magnetPieceBoost ?? 0) + 1;
  }
}

/** Sticky shop item: cap lock-move resets on the opponent's current (or next) piece. */
export function applyStickyToActivePiece(player: PlayerState): void {
  if (player.activePiece) {
    player.pieceLockResetCap = STICKY_LOCK_RESET_CAP;
    player.stickyNextPiece = false;
    player.lockResetsUsed = 0;
  } else {
    player.stickyNextPiece = true;
  }
}

function satelliteExtraGarbageDelay(target: PlayerState, tick: number): number {
  if (target.satelliteDelayUntilTick !== undefined && tick < target.satelliteDelayUntilTick) {
    return SATELLITE_INCOMING_DELAY_TICKS;
  }
  return 0;
}

/** Activate armed Satellite once incoming garbage exists. */
export function tryActivateSatellite(buyer: PlayerState, tick: number): boolean {
  if (!buyer.satelliteArmed) return false;
  if (buyer.pendingGarbage.length === 0) return false;

  buyer.satelliteArmed = false;
  const until = tick + SATELLITE_DURATION_TICKS;
  buyer.satelliteDelayUntilTick = Math.max(buyer.satelliteDelayUntilTick ?? 0, until);
  for (const packet of buyer.pendingGarbage) {
    packet.arrivalTick += SATELLITE_PACKET_DELAY_TICKS;
  }
  return true;
}

/** Satellite (self): arm on purchase; lingers until garbage is queued, then delays it. */
export function armSatelliteToBuyer(buyer: PlayerState, tick: number): void {
  buyer.satelliteArmed = true;
  tryActivateSatellite(buyer, tick);
}

/** Bomber (self): arm the current piece or the next spawn. */
export function applyBomberToBuyer(buyer: PlayerState): void {
  if (buyer.activePiece) {
    buyer.activePiece.bomber = true;
    buyer.bomberNextPiece = false;
  } else {
    buyer.bomberNextPiece = true;
  }
}

/**
 * Bomber blast — circular radius around each locked cell. Holes only (no gravity, no score).
 */
export function detonateBomberBlast(player: PlayerState, centers: Array<{ x: number; y: number }>): void {
  const poison = ensurePoisonBoard(player);
  const r = BOMBER_BLAST_RADIUS;
  const rSq = r * r;
  const toClear = new Set<string>();

  for (const { x: cx, y: cy } of centers) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > rSq) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= BOARD_COLS || y < 0 || y >= BOARD_ROWS) continue;
        if (player.board[y][x] !== null) toClear.add(`${x},${y}`);
      }
    }
  }

  for (const key of toClear) {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    player.board[y][x] = null;
    poison[y][x] = 0;
  }
}

function lockPiece(player: PlayerState, tick: number): { lines: number; tSpin: 'full' | 'mini' | false; perfectClear: boolean; poisonedRatio: number } {
  if (!player.activePiece) return { lines: 0, tSpin: false, perfectClear: false, poisonedRatio: 0 };
  const poison = ensurePoisonBoard(player);
  const piece = player.activePiece;
  const wasPoisoned = !!piece.poisoned;
  const poisonVariant = piece.poisonVariant ?? 1;
  const lockCells = getCells(piece);
  for (const cell of lockCells) {
    if (cell.y >= 0 && cell.y < BOARD_ROWS && cell.x >= 0 && cell.x < BOARD_COLS) {
      player.board[cell.y][cell.x] = piece.isWildcard ? 'W' : piece.type;
      // Seed the locked cells with the event's variant (not a wave index).
      if (wasPoisoned && !piece.isWildcard) poison[cell.y][cell.x] = poisonVariant;
    }
  }
  if (piece.bomber) detonateBomberBlast(player, lockCells);
  // Start (or restart) the spread scheduler when a poisoned piece settles.
  if (wasPoisoned && !piece.isWildcard) {
    player.poisonSpread = {
      generationsRemaining: POISON_GENERATIONS - 1,
      nextSpreadTick: tick + POISON_SPREAD_INTERVAL_TICKS,
      variant: poisonVariant,
    };
  }
  return resolveBoardAfterLock(player, tick, piece, player.lastActionWasRotate);
}

function resolveBoardAfterLock(
  player: PlayerState,
  tick: number,
  piece: TetrisPiece,
  lastActionWasRotate: boolean,
): { lines: number; tSpin: 'full' | 'mini' | false; perfectClear: boolean; poisonedRatio: number } {
  const poison = ensurePoisonBoard(player);
  const linesToClear: number[] = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    if (player.board[y].every((cell) => cell !== null)) linesToClear.push(y);
  }

  let poisonedCount = 0;
  for (const y of linesToClear) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poison[y][x] !== 0) poisonedCount++;
    }
  }
  const poisonedRatio = linesToClear.length > 0 ? (poisonedCount / (linesToClear.length * BOARD_COLS)) : 0;

  for (const y of linesToClear) {
    player.board.splice(y, 1);
    player.board.unshift(Array.from({ length: BOARD_COLS }, () => null));
    // Mirror onto the poison grid so poison rides line clears with its blocks.
    poison.splice(y, 1);
    poison.unshift(Array.from({ length: BOARD_COLS }, () => 0));
  }

  const lines = linesToClear.length;
  const tSpin = detectTSpinFor(player.board, piece, lastActionWasRotate);
  const perfectClear = player.board.every((row) => row.every((cell) => cell === null));
  player.linesCleared += lines;
  player.activePiece = null;
  player.landingForecastTicksRemaining = 0;
  player.canHold = true;
  player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
  player.lockResetsUsed = 0;
  player.lowestY = 0;
  player.lastSrsKick = null;
  player.lastActionWasRotate = false;
  if (lines > 0) {
    clearPieceLockResetCap(player);
  }
  clearMagnetPieceBoost(player);
  clearSnagHardDrop(player);
  return { lines, tSpin, perfectClear, poisonedRatio };
}

export function detectTSpinFor(
  board: CellValue[][],
  piece: TetrisPiece,
  lastActionWasRotate: boolean,
): 'full' | 'mini' | false {
  if (piece.type !== 'T' || !lastActionWasRotate) return false;
  const cx = piece.x + 1;
  const cy = piece.y + 1;
  // Corners indexed: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
  const corners = [
    [cx - 1, cy - 1],
    [cx + 1, cy - 1],
    [cx - 1, cy + 1],
    [cx + 1, cy + 1],
  ];
  const occupied = corners.map(([x, y]) =>
    x < 0 || x >= BOARD_COLS || y >= BOARD_ROWS || y < 0 || board[y][x] !== null,
  );
  const occupiedCount = occupied.filter(Boolean).length;
  if (occupiedCount < 3) return false;

  // Front corners = the two diagonals in the direction the T's stem points.
  // rotation 0 = stem north → front: top-left[0], top-right[1]
  // rotation 1 = stem east  → front: top-right[1], bottom-right[3]
  // rotation 2 = stem south → front: bottom-left[2], bottom-right[3]
  // rotation 3 = stem west  → front: top-left[0], bottom-left[2]
  const frontPairs: [number, number][] = [[0, 1], [1, 3], [2, 3], [0, 2]];
  const [f1, f2] = frontPairs[piece.rotation];
  const bothFrontOccupied = occupied[f1] && occupied[f2];
  return bothFrontOccupied ? 'full' : 'mini';
}

export function previewAttackFromClear(params: {
  lines: number;
  tSpin?: 'full' | 'mini' | false;
  perfectClear?: boolean;
  combo?: number;
  backToBack?: boolean;
}): number {
  const { lines, tSpin = false, perfectClear = false, combo = -1, backToBack = false } = params;
  if (lines === 0) return 0;

  let attack = 0;
  if (tSpin === 'full') {
    if (lines === 1) attack = ATTACK_TABLE.tSpinSingle;
    if (lines === 2) attack = ATTACK_TABLE.tSpinDouble;
    if (lines >= 3) attack = ATTACK_TABLE.tSpinTriple;
  } else if (tSpin === 'mini') {
    if (lines === 1) attack = ATTACK_TABLE.tSpinMiniSingle;
    if (lines >= 2) attack = ATTACK_TABLE.tSpinMiniDouble;
  } else {
    if (lines === 1) attack = ATTACK_TABLE.single;
    if (lines === 2) attack = ATTACK_TABLE.double;
    if (lines === 3) attack = ATTACK_TABLE.triple;
    if (lines >= 4) attack = ATTACK_TABLE.tetris;
  }

  const b2bAction = !!tSpin || lines >= 4;
  if (b2bAction && backToBack && attack > 0) {
    attack += ATTACK_TABLE.backToBackBonus;
  }

  const nextCombo = combo + 1;
  if (nextCombo >= 0) {
    const idx = Math.min(nextCombo, COMBO_BONUS_TABLE.length - 1);
    attack += COMBO_BONUS_TABLE[idx];
  }
  if (perfectClear) attack += ATTACK_TABLE.perfectClear;

  return attack;
}

function attackFromClear(
  lines: number,
  tSpin: 'full' | 'mini' | false,
  perfectClear: boolean,
  player: PlayerState,
  poisonedRatio: number,
): number {
  if (lines === 0) {
    player.combo = -1;
    return 0;
  }

  const attack = previewAttackFromClear({
    lines,
    tSpin,
    perfectClear,
    combo: player.combo,
    backToBack: player.backToBack,
  });

  player.backToBack = !!tSpin || lines >= 4;
  player.combo += 1;

  const baseScore = lines * 100 + attack * 10;
  const penalty = Math.round(baseScore * poisonedRatio * POISON_LINE_CLEAR_PENALTY_MAX_RATIO);
  player.score += baseScore - penalty;
  return attack;
}

function cancelOwnGarbage(player: PlayerState, lines: number): number {
  let remaining = lines;
  while (remaining > 0 && player.pendingGarbage.length > 0) {
    const packet = player.pendingGarbage[0];
    const cancel = Math.min(packet.lines, remaining);
    packet.lines -= cancel;
    remaining -= cancel;
    if (packet.lines <= 0) {
      player.pendingGarbage.shift();
    }
  }
  return remaining;
}

export function enqueueGarbage(
  target: PlayerState,
  lines: number,
  tick: number,
  extraDelayTicks = 0,
): void {
  if (lines <= 0) return;
  const packet: PendingGarbagePacket = {
    lines,
    arrivalTick:
      tick +
      GARBAGE_ARRIVAL_DELAY_TICKS +
      extraDelayTicks +
      satelliteExtraGarbageDelay(target, tick),
  };
  target.pendingGarbage.push(packet);
  tryActivateSatellite(target, tick);
}

function applyGarbageIfReady(player: PlayerState, tick: number, rng: MutableRng): number {
  let applied = 0;
  while (player.pendingGarbage.length > 0 && player.pendingGarbage[0].arrivalTick <= tick) {
    const packet = player.pendingGarbage.shift();
    if (!packet) break;
    // One shared hole column per packet — matching standard competitive behaviour
    // where garbage lines from a single attack share the same gap.
    const hole = Math.floor(rngNext(rng) * BOARD_COLS);
    const poison = ensurePoisonBoard(player);
    for (let i = 0; i < packet.lines; i++) {
      player.board.shift();
      const row = Array.from({ length: BOARD_COLS }, (_, x): CellValue => (x === hole ? null : 'G'));
      player.board.push(row);
      // Mirror: drop the top poison row, push a clean (unpoisoned) garbage row.
      poison.shift();
      poison.push(Array.from({ length: BOARD_COLS }, () => 0));
      applied += 1;
    }
  }
  return applied;
}

function applyLockResult(
  tick: number,
  player: PlayerState,
  garbageRng: MutableRng,
  matchEvents: MatchEvent[],
  clearResult: { lines: number; tSpin: 'full' | 'mini' | false; perfectClear: boolean; poisonedRatio: number },
): number {
  const attackLines = attackFromClear(
    clearResult.lines,
    clearResult.tSpin,
    clearResult.perfectClear,
    player,
    clearResult.poisonedRatio,
  );
  if (clearResult.lines > 0) {
    matchEvents.push({
      tick,
      type: 'lineClear',
      playerId: player.id,
      lines: clearResult.lines,
      tSpin: clearResult.tSpin,
    });
  }

  const remainingAttack = cancelOwnGarbage(player, attackLines);
  const applied = applyGarbageIfReady(player, tick, garbageRng);
  if (applied > 0) {
    matchEvents.push({
      tick,
      type: 'garbageApplied',
      playerId: player.id,
      lines: applied,
    });
  }
  return remainingAttack > 0 ? remainingAttack : 0;
}

function pieceWouldTopOut(player: PlayerState): boolean {
  if (!player.activePiece) return true;
  return collides(player.board, player.activePiece);
}

/** Snapshot piece-level flags into storage (type + poison/bomber). */
function toHeldPiece(piece: TetrisPiece): HeldPiece {
  const held: HeldPiece = { type: piece.type };
  if (piece.poisoned) {
    held.poisoned = true;
    if (piece.poisonVariant !== undefined) held.poisonVariant = piece.poisonVariant;
  }
  if (piece.bomber) held.bomber = true;
  return held;
}

/** Restore a held piece as a fresh active spawn (rotation/x/y reset). */
function activeFromHeld(held: HeldPiece): TetrisPiece {
  return {
    type: held.type,
    rotation: 0,
    x: 3,
    y: BOARD_HIDDEN_ROWS - 2,
    poisoned: held.poisoned,
    poisonVariant: held.poisonVariant,
    bomber: held.bomber,
  };
}

function processActions(player: PlayerState, tick: number): boolean {
  if (!player.activePiece) return false;
  while (player.actionQueue.length > 0) {
    const action = player.actionQueue.shift();
    if (!action) continue;
    if (action === 'rotateCW') tryRotate(player, 1);
    if (action === 'rotateCCW') tryRotate(player, -1);
    if (action === 'hold') {
      if (isHoldFrozen(player, tick)) continue;
      if (player.activePiece?.customOffsets) continue; // Block hold for custom pieces
      if (player.activePiece?.poisoned) continue; // Poisoned active pieces cannot be stored/swapped away
      if (!player.canHold || !player.activePiece || !canHoldAtCurrentHeight(player)) continue;
      player.lastSrsKick = null;
      const stored = toHeldPiece(player.activePiece);
      if (player.holdPiece) {
        player.activePiece = activeFromHeld(player.holdPiece);
        player.holdPiece = stored;
      } else {
        player.holdPiece = stored;
        player.activePiece = null;
      }
      player.landingForecastTicksRemaining = player.activePiece ? LANDING_FORECAST_TICKS : 0;
      player.canHold = false;
      player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
      player.lockResetsUsed = 0;
      player.lowestY = player.activePiece ? player.activePiece.y : 0;
      clearPieceLockResetCap(player);
      clearMagnetPieceBoost(player);
      clearSnagHardDrop(player);
    }
    if (action === 'hardDrop') {
      if (isSnagBlockingHardDrop(player)) continue;
      let dropped = 0;
      while (tryMove(player, 0, 1)) {
        dropped += 1;
      }
      // Guideline: 2 points per cell hard-dropped.
      player.score += dropped * 2;
      player.lockDelayRemainingTicks = 0;
      player.pieceHasHardDropped = true;
      player.lastHardDropTick = tick;
      // A hard drop is terminal for this piece. Discard actions queued after it
      // so hold cannot bypass or duplicate the lock effect in the same tick.
      player.actionQueue.length = 0;
      return true;
    }
  }
  return false;
}

function applyHorizontalInput(player: PlayerState): void {
  const input = normalizeInput(player.inputState);
  const dir: -1 | 0 | 1 = input.left === input.right ? 0 : input.left ? -1 : 1;

  if (dir === 0) {
    player.shiftDirection = 0;
    player.dasCounter = 0;
    player.arrCounter = 0;
    return;
  }

  const speedTier = [...HORIZONTAL_SPEED_THRESHOLDS]
    .reverse()
    .find((tier) => player.score >= tier.minScore);
  const dasTicks = speedTier?.dasTicks ?? DAS_TICKS;
  const arrTicks = speedTier?.arrTicks ?? ARR_TICKS;

  if (player.shiftDirection !== dir) {
    player.shiftDirection = dir;
    player.dasCounter = 0;
    player.arrCounter = 0;
    tryMove(player, dir, 0);
    return;
  }

  player.dasCounter += 1;
  if (player.dasCounter < dasTicks) return;

  if (arrTicks <= 1) {
    tryMove(player, dir, 0);
    return;
  }

  player.arrCounter += 1;
  if (player.arrCounter >= arrTicks) {
    player.arrCounter = 0;
    tryMove(player, dir, 0);
  }
}

/**
 * Wild Purge: remove every filled cell carrying the rolled poison variant.
 * Leaves floating holes (no gravity). Does not run line-clear logic or award score.
 * Also strips that variant from the active / queued piece.
 */
export function purgePoisonVariant(player: PlayerState, variant: number): void {
  const poison = ensurePoisonBoard(player);
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poison[y][x] === variant) {
        player.board[y][x] = null;
        poison[y][x] = 0;
      }
    }
  }
  if (player.activePiece?.poisonVariant === variant) {
    player.activePiece.poisoned = false;
    player.activePiece.poisonVariant = undefined;
  }
  if (player.holdPiece?.poisonVariant === variant) {
    player.holdPiece.poisoned = false;
    player.holdPiece.poisonVariant = undefined;
  }
  if (player.poisonNextVariant === variant) {
    player.poisonNextPiece = false;
    player.poisonNextVariant = undefined;
  }
  if (player.poisonSpread?.variant === variant) {
    player.poisonSpread = null;
  }
}

/**
 * One orthogonal BFS generation of poison onto filled neighbours.
 * Returns how many cells were newly poisoned.
 */
export function spreadPoisonWaveOnce(
  board: CellValue[][],
  poison: number[][],
  variant: number,
): number {
  const newlyPoisoned: Array<[number, number]> = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poison[y][x] !== 0) continue;
      if (board[y][x] === null) continue;
      const neighbourPoisoned =
        (y > 0 && poison[y - 1][x] !== 0) ||
        (y < BOARD_ROWS - 1 && poison[y + 1][x] !== 0) ||
        (x > 0 && poison[y][x - 1] !== 0) ||
        (x < BOARD_COLS - 1 && poison[y][x + 1] !== 0);
      if (neighbourPoisoned) newlyPoisoned.push([y, x]);
    }
  }
  for (const [y, x] of newlyPoisoned) poison[y][x] = variant;
  return newlyPoisoned.length;
}

/**
 * Advance a poison spread by one wave when its timer elapses. Each wave infects
 * every filled board cell (piece blocks AND garbage) orthogonally adjacent to an
 * already-poisoned cell, stamping the current generation index. After
 * POISON_GENERATIONS waves the scheduler stops, but poisoned cells stay poisoned
 * permanently (the poisonBoard marks are never cleared).
 */
function processPoisonSpread(player: PlayerState, tick: number): number {
  const spread = player.poisonSpread;
  if (!spread || tick < spread.nextSpreadTick) return 0;

  const poison = ensurePoisonBoard(player);
  const newly = spreadPoisonWaveOnce(player.board, poison, spread.variant);

  spread.generationsRemaining -= 1;
  if (spread.generationsRemaining <= 0 || newly === 0) {
    player.poisonSpread = null;
  } else {
    spread.nextSpreadTick = tick + POISON_SPREAD_INTERVAL_TICKS;
  }
  return newly;
}

export function stepPlayer(
  tick: number,
  player: PlayerState,
  rng: RngChannels | MutableRng,
  matchEvents: MatchEvent[],
  options?: StepOptions,
): StepResult {
  const channels = ensureRngChannels(rng);
  const enableShop = options?.enableShop ?? true;

  const result: StepResult = {
    linesClearedThisStep: 0,
    attackLinesQueued: 0,
    topOut: false,
    locked: false,
    shopRolled: false,
    tectonic: {
      active: false,
      advanced: false,
      completed: false,
      rowsCleared: 0,
    },
    poisonSpreadCells: 0,
  };
  const prevLines = player.linesCleared;

  if (player.activePiece) {
    player.landingForecastTicksRemaining = Math.max(
      0,
      (player.landingForecastTicksRemaining ?? 0) - 1,
    );
  } else {
    player.landingForecastTicksRemaining = 0;
  }

  // ── Clean up expired visual effect pills ──
  if (player.activeEffects && player.activeEffects.length > 0) {
    player.activeEffects = player.activeEffects.filter(
      (effect) => effect.expiresAtTick === undefined || tick < effect.expiresAtTick
    );
  }

  // ── Tectonic Shift cascade: pause piece / inputs until gravity + silent clears finish ──
  if (player.tectonicShiftNextStepTick != null) {
    const tec = advanceTectonicShift(player, tick);
    result.tectonic = tec;
    if (tec.advanced) {
      matchEvents.push({ tick, type: 'tectonicStep', playerId: player.id, advanced: true });
    }
    if (tec.completed) {
      matchEvents.push({ tick, type: 'tectonicComplete', playerId: player.id, rowsCleared: tec.rowsCleared });
    }
    if (enableShop) {
      tickPlayerShop(player, tick);
    }
    return result;
  }

  // ── Process any pending shop effects that have reached their activation tick ──
  if (player.pendingShopEffects.length > 0) {
    const remaining: PendingShopEffect[] = [];
    for (const effect of player.pendingShopEffects) {
      if (effect.activationTick <= tick) {
        if (effect.itemId === 'retrim') {
          player.swapCutoffRow = Math.max(0, player.swapCutoffRow - 1);
        } else if (effect.itemId === 'curtain') {
          pushFieldEffect(
            player,
            'curtain',
            tick,
            'Curtain',
            '🎭',
            tick + CURTAIN_DURATION_TICKS,
          );
        } else if (effect.itemId === 'vortex-step' && effect.poisonVariant) {
          purgePoisonVariant(player, effect.poisonVariant);
          pushFieldEffect(player, 'purge', tick, 'Purged', '🃏', tick + 120);
        }
      } else {
        remaining.push(effect);
      }
    }
    player.pendingShopEffects = remaining;
  }

  // ── Advance any in-progress poison spread ──
  const poisonCells = processPoisonSpread(player, tick);
  if (poisonCells > 0) {
    result.poisonSpreadCells = poisonCells;
    matchEvents.push({ tick, type: 'poisonSpread', playerId: player.id, newCells: poisonCells });
  }

  if (!player.activePiece) {
    player.lastSrsKick = null;
    player.activePiece = spawnNextPiece(player, channels.pieces);
    if (player.activePiece) {
      player.landingForecastTicksRemaining = LANDING_FORECAST_TICKS;
      player.pieceHasHardDropped = false;
      if (player.stickyNextPiece) {
        player.pieceLockResetCap = STICKY_LOCK_RESET_CAP;
        player.stickyNextPiece = false;
      }
      if (player.snagNextPiece) {
        player.snagHardDropBlocked = true;
        player.snagNextPiece = false;
      }
      player.lowestY = player.activePiece.y;
      player.lockResetsUsed = 0;
    }
    if (pieceWouldTopOut(player)) {
      player.topOut = true;
      result.topOut = true;
      matchEvents.push({ tick, type: 'topOut', playerId: player.id });
      return result;
    }
  }

  if (isSnagBlockingHardDrop(player)) {
    player.inputState.softDrop = false;
  }

  const hardDropped = processActions(player, tick);
  if (hardDropped) {
    const clearResult = lockPiece(player, tick);
    const attackSent = applyLockResult(tick, player, channels.garbage, matchEvents, clearResult);
    result.locked = true;
    result.linesClearedThisStep = clearResult.lines;
    result.attackLinesQueued = attackSent;
  } else {
    applyHorizontalInput(player);

    const isSoftDrop = !!player.inputState.softDrop;

    let movedDown = false;
    let cellsToDrop = 0;

    if (isSoftDrop) {
      cellsToDrop = Math.max(1, Math.floor(SOFT_DROP_CELLS_PER_TICK));
      player.gravityCounter = 0;
    } else {
      player.gravityCounter += 1;
      if (player.gravityCounter >= gravityTicksPerCellFor(player)) {
        cellsToDrop = 1;
        player.gravityCounter = 0;
      }
    }

    for (let i = 0; i < cellsToDrop; i++) {
      if (tryMove(player, 0, 1)) {
        movedDown = true;
        if (isSoftDrop) player.score += 1;
      } else {
        break;
      }
    }

    if (player.activePiece && !movedDown && isGrounded(player)) {
      player.lockDelayRemainingTicks -= 1;
      if (player.lockDelayRemainingTicks <= 0) {
        const clearResult = lockPiece(player, tick);
        const attackSent = applyLockResult(tick, player, channels.garbage, matchEvents, clearResult);
        result.locked = true;
        result.linesClearedThisStep = clearResult.lines;
        result.attackLinesQueued = attackSent;
      }
    }
  }

  // ── Shop orchestration: roll on line clear, advance cycle timer ──
  if (enableShop) {
    if (player.linesCleared > prevLines) {
      rollShopOnLineClear(player, channels.shop);
      result.shopRolled = true;
      matchEvents.push({
        tick,
        type: 'shopRoll',
        playerId: player.id,
        offerIds: [...player.shop.offerIds],
      });
    }
    tickPlayerShop(player, tick);
  }

  return result;
}

export function initialSeed(): number {
  const now = Date.now();
  return (now ^ (now >>> 16)) | 0;
}

export function makeRng(seed: number): MutableRng {
  return makeSharedRng(seed);
}

export function replayDateLabel() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hr = String(now.getHours()).padStart(2, '0');
  const mn = String(now.getMinutes()).padStart(2, '0');
  const sc = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hr}-${mn}-${sc}`;
}

export function tickSeconds() {
  return 1 / GAME_TICK_RATE;
}

/** One simultaneous gravity step: every unsupported cell drops one row. Returns true if anything moved. */
function tectonicGravityStep(player: PlayerState): boolean {
  const poison = ensurePoisonBoard(player);
  const moves: { x: number; y: number; value: CellValue; poisonVal: number }[] = [];
  for (let x = 0; x < BOARD_COLS; x++) {
    for (let y = BOARD_ROWS - 2; y >= 0; y--) {
      if (player.board[y][x] !== null && player.board[y + 1][x] === null) {
        moves.push({
          x,
          y,
          value: player.board[y][x],
          poisonVal: poison[y][x],
        });
      }
    }
  }
  if (moves.length === 0) return false;

  for (const m of moves) {
    player.board[m.y][m.x] = null;
    poison[m.y][m.x] = 0;
  }
  for (const m of moves) {
    player.board[m.y + 1][m.x] = m.value;
    poison[m.y + 1][m.x] = m.poisonVal;
  }
  return true;
}

/** Remove all currently full rows at once (silent: no score / garbage / shop via linesCleared). */
function silentClearFullRows(player: PlayerState): number {
  const poison = ensurePoisonBoard(player);
  const retainedBoard: CellValue[][] = [];
  const retainedPoison: number[][] = [];
  let cleared = 0;

  for (let y = 0; y < BOARD_ROWS; y++) {
    if (player.board[y].every((cell) => cell !== null)) {
      cleared += 1;
    } else {
      retainedBoard.push(player.board[y]);
      retainedPoison.push(poison[y]);
    }
  }

  if (cleared > 0) {
    const emptyRows = Array.from({ length: cleared }, () =>
      Array.from({ length: BOARD_COLS }, (): CellValue => null),
    );
    const emptyPoisonRows = Array.from({ length: cleared }, () =>
      Array.from({ length: BOARD_COLS }, () => 0),
    );
    player.board.splice(0, player.board.length, ...emptyRows, ...retainedBoard);
    poison.splice(0, poison.length, ...emptyPoisonRows, ...retainedPoison);
  }

  return cleared;
}

/** Max rows any cell must fall under full column packing (drives step pacing). */
function maxTectonicFallRows(player: PlayerState): number {
  let maxFall = 0;
  for (let x = 0; x < BOARD_COLS; x++) {
    const solidYs: number[] = [];
    for (let y = BOARD_ROWS - 1; y >= 0; y--) {
      if (player.board[y][x] !== null) solidYs.push(y);
    }
    for (let i = 0; i < solidYs.length; i++) {
      const toY = BOARD_ROWS - 1 - i;
      maxFall = Math.max(maxFall, toY - solidYs[i]);
    }
  }
  return maxFall;
}

function clearTectonicShiftState(player: PlayerState): void {
  player.tectonicShiftNextStepTick = null;
  player.tectonicShiftStartTick = null;
  player.tectonicShiftStepTicks = null;
}

function tectonicStepTicksFor(player: PlayerState): number {
  return Math.max(1, player.tectonicShiftStepTicks ?? TECTONIC_SHIFT_STEP_TICKS);
}

/** Begin Magical Tetris–style animated column gravity; piece stays paused until settle. */
export function startTectonicShift(player: PlayerState, tick: number): void {
  const fallRows = maxTectonicFallRows(player);
  // Pace so the fall itself spans ≥ min duration (short 1-row collapses stay readable).
  const paced = Math.ceil(TECTONIC_SHIFT_MIN_DURATION_TICKS / Math.max(1, fallRows));
  player.tectonicShiftStepTicks = Math.max(TECTONIC_SHIFT_STEP_TICKS, paced);
  player.tectonicShiftStartTick = tick;
  player.tectonicShiftNextStepTick = tick;
}

export interface TectonicAdvanceResult {
  active: boolean;
  advanced: boolean;
  completed: boolean;
  rowsCleared: number;
}

/**
 * Advance cascade when due. While `tectonicShiftNextStepTick` is set, the caller should
 * pause piece input/gravity. On settle, clears all full rows silently in one pass.
 */
export function advanceTectonicShift(player: PlayerState, tick: number): TectonicAdvanceResult {
  if (player.tectonicShiftNextStepTick == null) {
    return { active: false, advanced: false, completed: false, rowsCleared: 0 };
  }
  if (tick < player.tectonicShiftNextStepTick) {
    return { active: true, advanced: false, completed: false, rowsCleared: 0 };
  }

  const moved = tectonicGravityStep(player);
  if (moved) {
    player.tectonicShiftNextStepTick = tick + tectonicStepTicksFor(player);
    return { active: true, advanced: true, completed: false, rowsCleared: 0 };
  }

  const start = player.tectonicShiftStartTick ?? tick;
  const minEnd = start + TECTONIC_SHIFT_MIN_DURATION_TICKS;
  if (tick < minEnd) {
    player.tectonicShiftNextStepTick = minEnd;
    return { active: true, advanced: false, completed: false, rowsCleared: 0 };
  }

  const rowsCleared = silentClearFullRows(player);
  clearTectonicShiftState(player);
  return { active: false, advanced: false, completed: true, rowsCleared };
}

/** Instant settle (tests / tools): run gravity to completion then silent clear. */
export function applyTectonicShift(player: PlayerState): void {
  while (tectonicGravityStep(player)) {
    // collapse
  }
  silentClearFullRows(player);
  clearTectonicShiftState(player);
}
