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
  GameState,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  InputState,
  LOCK_DELAY_TICKS,
  LOCK_RESET_CAP,
  MatchEvent,
  PendingGarbagePacket,
  PlayerState,
  RotationState,
  SOFT_DROP_CELLS_PER_TICK,
  TetrominoType,
} from '../../src/types.js';
import {
  COMBO_BONUS_TABLE,
  DAS_TICKS,
  GRAVITY_TICKS_PER_CELL,
  HORIZONTAL_SPEED_THRESHOLDS,
  NEXT_PREVIEW_COUNT,
} from '../../src/constants.js';
import { getKickTests, PIECE_SEQUENCE, SHAPES } from './pieces.js';

type MutableRng = { seed: number };

export function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));
}

function rngNext(rng: MutableRng): number {
  let x = rng.seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  rng.seed = x | 0;
  return (x >>> 0) / 0xffffffff;
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

export function makePlayer(id: string, rng: MutableRng): PlayerState {
  const bag = shuffledBag(rng);
  const nextQueue = [...bag];
  const player: PlayerState = {
    id,
    board: createEmptyBoard(),
    activePiece: null,
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
  };
  ensureQueue(player, rng);
  player.activePiece = spawnNextPiece(player, rng);
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
  return { type, rotation: 0 as RotationState, x: 3, y: BOARD_HIDDEN_ROWS - 2 };
}

function getCells(piece: { type: TetrominoType; rotation: RotationState; x: number; y: number }) {
  return SHAPES[piece.type][piece.rotation].map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }));
}

function collides(board: CellValue[][], piece: { type: TetrominoType; rotation: RotationState; x: number; y: number }): boolean {
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
    if (wasGrounded && player.lockResetsUsed < LOCK_RESET_CAP) {
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
    player.lockResetsUsed = 0;
  }
  return true;
}

function tryRotate(player: PlayerState, dir: 1 | -1): boolean {
  if (!player.activePiece) return false;
  const wasGrounded = isGrounded(player);
  const from = player.activePiece.rotation;
  const to = (((from + dir) % 4) + 4) % 4 as RotationState;
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
      if (wasGrounded && player.lockResetsUsed < LOCK_RESET_CAP) {
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
  return maxVisibleRow < HOLD_SWAP_CUTOFF_VISIBLE_ROW;
}

function lockPiece(player: PlayerState): { lines: number; tSpin: 'full' | 'mini' | false; perfectClear: boolean } {
  if (!player.activePiece) return { lines: 0, tSpin: false, perfectClear: false };
  for (const cell of getCells(player.activePiece)) {
    if (cell.y >= 0 && cell.y < BOARD_ROWS && cell.x >= 0 && cell.x < BOARD_COLS) {
      player.board[cell.y][cell.x] = player.activePiece.type;
    }
  }

  const linesToClear: number[] = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    if (player.board[y].every((cell) => cell !== null)) linesToClear.push(y);
  }
  for (const y of linesToClear) {
    player.board.splice(y, 1);
    player.board.unshift(Array.from({ length: BOARD_COLS }, () => null));
  }

  const lines = linesToClear.length;
  const tSpin = detectTSpin(player);
  const perfectClear = player.board.every((row) => row.every((cell) => cell === null));
  player.linesCleared += lines;
  player.activePiece = null;
  player.canHold = true;
  player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
  player.lockResetsUsed = 0;
  player.lowestY = 0;
  player.lastSrsKick = null;
  player.lastActionWasRotate = false;
  return { lines, tSpin, perfectClear };
}

function detectTSpin(player: PlayerState): 'full' | 'mini' | false {
  const piece = player.activePiece;
  if (!piece || piece.type !== 'T' || !player.lastActionWasRotate) return false;
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
    x < 0 || x >= BOARD_COLS || y >= BOARD_ROWS || y < 0 || player.board[y][x] !== null,
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

function attackFromClear(lines: number, tSpin: 'full' | 'mini' | false, perfectClear: boolean, player: PlayerState): number {
  if (lines === 0) {
    player.combo = -1;
    return 0;
  }

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
  if (b2bAction && player.backToBack && attack > 0) {
    attack += ATTACK_TABLE.backToBackBonus;
  }
  player.backToBack = b2bAction;

  player.combo += 1;
  if (player.combo >= 0) {
    const idx = Math.min(player.combo, COMBO_BONUS_TABLE.length - 1);
    attack += COMBO_BONUS_TABLE[idx];
  }
  if (perfectClear) attack += ATTACK_TABLE.perfectClear;
  player.score += lines * 100 + attack * 10;
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

function enqueueGarbage(target: PlayerState, lines: number, tick: number): void {
  if (lines <= 0) return;
  const packet: PendingGarbagePacket = {
    lines,
    arrivalTick: tick + GARBAGE_ARRIVAL_DELAY_TICKS,
  };
  target.pendingGarbage.push(packet);
}

function applyGarbageIfReady(player: PlayerState, tick: number, rng: MutableRng): number {
  let applied = 0;
  while (player.pendingGarbage.length > 0 && player.pendingGarbage[0].arrivalTick <= tick) {
    const packet = player.pendingGarbage.shift();
    if (!packet) break;
    // One shared hole column per packet — matching standard competitive behaviour
    // where garbage lines from a single attack share the same gap.
    const hole = Math.floor(rngNext(rng) * BOARD_COLS);
    for (let i = 0; i < packet.lines; i++) {
      player.board.shift();
      const row = Array.from({ length: BOARD_COLS }, (_, x): CellValue => (x === hole ? null : 'G'));
      player.board.push(row);
      applied += 1;
    }
  }
  return applied;
}

function pieceWouldTopOut(player: PlayerState): boolean {
  if (!player.activePiece) return true;
  return collides(player.board, player.activePiece);
}

function processActions(player: PlayerState): void {
  if (!player.activePiece) return;
  while (player.actionQueue.length > 0) {
    const action = player.actionQueue.shift();
    if (!action) continue;
    if (action === 'rotateCW') tryRotate(player, 1);
    if (action === 'rotateCCW') tryRotate(player, -1);
    if (action === 'hold') {
      if (!player.canHold || !player.activePiece || !canHoldAtCurrentHeight(player)) continue;
      player.lastSrsKick = null;
      const current = player.activePiece.type;
      if (player.holdPiece) {
        player.activePiece = { type: player.holdPiece, rotation: 0, x: 3, y: BOARD_HIDDEN_ROWS - 2 };
        player.holdPiece = current;
      } else {
        player.holdPiece = current;
        player.activePiece = null;
      }
      player.canHold = false;
      player.lockDelayRemainingTicks = LOCK_DELAY_TICKS;
      player.lockResetsUsed = 0;
      player.lowestY = player.activePiece ? player.activePiece.y : 0;
    }
    if (action === 'hardDrop') {
      let dropped = 0;
      while (tryMove(player, 0, 1)) {
        dropped += 1;
      }
      // Guideline: 2 points per cell hard-dropped.
      player.score += dropped * 2;
      player.lockDelayRemainingTicks = 0;
    }
  }
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

export function stepPlayer(
  gameState: GameState,
  player: PlayerState,
  opponent: PlayerState | null,
  rng: MutableRng,
  matchEvents: MatchEvent[],
): void {
  if (!player.activePiece) {
    player.lastSrsKick = null;
    player.activePiece = spawnNextPiece(player, rng);
    if (player.activePiece) {
      player.lowestY = player.activePiece.y;
      player.lockResetsUsed = 0;
    }
    if (pieceWouldTopOut(player)) {
      player.topOut = true;
      matchEvents.push({ tick: gameState.tick, type: 'topOut', playerId: player.id });
      return;
    }
  }

  processActions(player);
  applyHorizontalInput(player);

  const isSoftDrop = !!player.inputState.softDrop;
  const dropSteps = isSoftDrop ? SOFT_DROP_CELLS_PER_TICK + 1 : 1;
  player.gravityCounter += 1;
  let movedDown = false;
  const shouldGravity = player.gravityCounter >= GRAVITY_TICKS_PER_CELL / dropSteps;
  if (shouldGravity) {
    movedDown = tryMove(player, 0, 1);
    // Guideline: 1 point per cell soft-dropped.
    if (movedDown && isSoftDrop) player.score += 1;
    player.gravityCounter = 0;
  }

  if (player.activePiece && !movedDown && isGrounded(player)) {
    player.lockDelayRemainingTicks -= 1;
    if (player.lockDelayRemainingTicks <= 0) {
      const clearResult = lockPiece(player);
      const attackLines = attackFromClear(clearResult.lines, clearResult.tSpin, clearResult.perfectClear, player);
      if (clearResult.lines > 0) {
        matchEvents.push({
          tick: gameState.tick,
          type: 'lineClear',
          playerId: player.id,
          lines: clearResult.lines,
          tSpin: clearResult.tSpin,
        });
      }

      const remainingAttack = cancelOwnGarbage(player, attackLines);
      if (remainingAttack > 0 && opponent) {
        enqueueGarbage(opponent, remainingAttack, gameState.tick);
        matchEvents.push({
          tick: gameState.tick,
          type: 'attackSent',
          playerId: player.id,
          lines: remainingAttack,
        });
      }

      const applied = applyGarbageIfReady(player, gameState.tick, rng);
      if (applied > 0) {
        matchEvents.push({
          tick: gameState.tick,
          type: 'garbageApplied',
          playerId: player.id,
          lines: applied,
        });
      }
    }
  }
}

export function initialSeed(): number {
  const now = Date.now();
  return (now ^ (now >>> 16)) | 0;
}

export function makeRng(seed: number): MutableRng {
  return { seed };
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
