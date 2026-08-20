import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS, BOARD_VISIBLE_ROWS } from '../constants.js';
import { BinaryReader } from './binary.js';
import {
  applyDirtyBoard,
  applyDirtyPoison,
  readChrome,
  readFullBoard,
  readLocalMeta,
  readLocalShop,
  readOpponentMeta,
  readTectonicMoves,
} from './codecShared.js';
import { readPacketHeader } from './encodeMatchPacket.js';
import {
  DELTA_SECTION_CHROME,
  DELTA_SECTION_LOCAL_BOARD,
  DELTA_SECTION_LOCAL_META,
  DELTA_SECTION_LOCAL_POISON,
  DELTA_SECTION_LOCAL_SHOP,
  DELTA_SECTION_OPPONENT_BOARD,
  DELTA_SECTION_OPPONENT_META,
  DELTA_SECTION_OPPONENT_POISON,
  type LocalPlayerWire,
  type OpponentPlayerWire,
  type SeatWireSnapshot,
  type TectonicCellMove,
  type TectonicCompleteWire,
  type TectonicStepWire,
} from './wireTypes.js';
import {
  GAME_PROTOCOL_VERSION,
  PACKET_KIND_DELTA,
  PACKET_KIND_KEYFRAME,
  PACKET_KIND_TECTONIC_COMPLETE,
  PACKET_KIND_TECTONIC_STEP,
} from './version.js';

export class PacketDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacketDecodeError';
  }
}

function emptyLocal(id: string): LocalPlayerWire {
  return {
    id,
    board: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null)),
    poisonBoard: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0)),
    activePiece: null,
    holdPiece: null,
    canHold: true,
    nextQueue: [],
    score: 0,
    funds: 0,
    linesCleared: 0,
    combo: 0,
    backToBack: false,
    pendingGarbage: [],
    activeEffects: [],
    topOut: false,
    swapCutoffRow: 10,
    curtainDefenseLevel: 0,
    poisonSpread: null,
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

function emptyOpponent(id: string): OpponentPlayerWire {
  return {
    id,
    board: Array.from({ length: BOARD_VISIBLE_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null)),
    poisonBoard: Array.from({ length: BOARD_VISIBLE_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0)),
    activePiece: null,
    score: 0,
    funds: 0,
    linesCleared: 0,
    combo: 0,
    backToBack: false,
    pendingGarbage: [],
    activeEffects: [],
    topOut: false,
    swapCutoffRow: 10,
    curtainDefenseLevel: 0,
    poisonSpread: null,
    hasHold: false,
    hasPoison: false,
  };
}

export function cloneSeatSnapshot(snapshot: SeatWireSnapshot): SeatWireSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as SeatWireSnapshot;
}

export function decodeKeyframePacket(buffer: ArrayBuffer): SeatWireSnapshot {
  const header = readPacketHeader(buffer);
  if (header.version !== GAME_PROTOCOL_VERSION || header.kind !== PACKET_KIND_KEYFRAME) {
    throw new PacketDecodeError('Not a keyframe packet');
  }
  const reader = new BinaryReader(buffer);
  reader.readU8();
  reader.readU8();
  reader.readU32();
  reader.readU32();
  reader.readU32();
  const chrome = readChrome(reader);
  const localBoard = readFullBoard(reader, BOARD_COLS);
  const localMeta = readLocalMeta(reader);
  const shop = readLocalShop(reader);
  const opponentBoard = readFullBoard(reader, BOARD_COLS);
  const opponentMeta = readOpponentMeta(reader);
  return {
    tick: header.tick,
    chrome,
    local: {
      ...localMeta,
      board: localBoard.board,
      poisonBoard: localBoard.poisonBoard,
      shop,
    },
    opponent: {
      ...opponentMeta,
      board: opponentBoard.board,
      poisonBoard: opponentBoard.poisonBoard,
    },
  };
}

export function applyDeltaPacket(
  baseline: SeatWireSnapshot,
  buffer: ArrayBuffer,
): SeatWireSnapshot {
  const header = readPacketHeader(buffer);
  if (header.version !== GAME_PROTOCOL_VERSION || header.kind !== PACKET_KIND_DELTA) {
    throw new PacketDecodeError('Not a delta packet');
  }
  if (header.baseGeneration === 0) {
    throw new PacketDecodeError('Delta missing base generation');
  }
  const reader = new BinaryReader(buffer);
  reader.readU8();
  reader.readU8();
  reader.readU32();
  reader.readU32();
  reader.readU32();
  const sections = reader.readU16();
  const next = cloneSeatSnapshot(baseline);
  next.tick = header.tick;
  if (sections & DELTA_SECTION_CHROME) next.chrome = readChrome(reader);
  if (sections & DELTA_SECTION_LOCAL_BOARD) applyDirtyBoard(next.local.board, reader);
  if (sections & DELTA_SECTION_LOCAL_POISON) applyDirtyPoison(next.local.poisonBoard, reader);
  if (sections & DELTA_SECTION_LOCAL_META) {
    const meta = readLocalMeta(reader);
    next.local = { ...next.local, ...meta };
  }
  if (sections & DELTA_SECTION_LOCAL_SHOP) next.local.shop = readLocalShop(reader);
  if (sections & DELTA_SECTION_OPPONENT_BOARD) applyDirtyBoard(next.opponent.board, reader);
  if (sections & DELTA_SECTION_OPPONENT_POISON) applyDirtyPoison(next.opponent.poisonBoard, reader);
  if (sections & DELTA_SECTION_OPPONENT_META) {
    const meta = readOpponentMeta(reader);
    next.opponent = { ...next.opponent, ...meta };
  }
  return next;
}

export function decodeTectonicStepPacket(buffer: ArrayBuffer): TectonicStepWire & { tick: number } {
  const header = readPacketHeader(buffer);
  if (header.version !== GAME_PROTOCOL_VERSION || header.kind !== PACKET_KIND_TECTONIC_STEP) {
    throw new PacketDecodeError('Not a tectonic step packet');
  }
  const reader = new BinaryReader(buffer);
  reader.readU8();
  reader.readU8();
  reader.readU32();
  reader.readU32();
  reader.readU32();
  return {
    tick: header.tick,
    playerId: reader.readString(),
    advanced: reader.readBool(),
    moves: readTectonicMoves(reader),
  };
}

export function decodeTectonicCompletePacket(buffer: ArrayBuffer): TectonicCompleteWire & { tick: number } {
  const header = readPacketHeader(buffer);
  if (header.version !== GAME_PROTOCOL_VERSION || header.kind !== PACKET_KIND_TECTONIC_COMPLETE) {
    throw new PacketDecodeError('Not a tectonic complete packet');
  }
  const reader = new BinaryReader(buffer);
  reader.readU8();
  reader.readU8();
  reader.readU32();
  reader.readU32();
  reader.readU32();
  return {
    tick: header.tick,
    playerId: reader.readString(),
    rowsCleared: reader.readU8(),
  };
}

/** Pad opponent 10×18 wire board into 10×20 simulation coordinates. */
export function expandOpponentBoard(visibleBoard: readonly (readonly import('../types.js').CellValue[])[]): import('../types.js').CellValue[][] {
  const hidden = Array.from({ length: BOARD_HIDDEN_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, (): import('../types.js').CellValue => null),
  );
  const visible = visibleBoard.map((row) => [...row]);
  while (visible.length < BOARD_VISIBLE_ROWS) {
    visible.push(Array.from({ length: BOARD_COLS }, () => null));
  }
  return [...hidden, ...visible.slice(0, BOARD_VISIBLE_ROWS)];
}

export function applyTectonicMovesToBoard(
  board: import('../types.js').CellValue[][],
  poisonBoard: number[][],
  moves: readonly TectonicCellMove[],
): void {
  for (const move of moves) {
    if (board[move.fromY]?.[move.x] !== undefined) {
      board[move.fromY][move.x] = null;
      if (poisonBoard[move.fromY]) poisonBoard[move.fromY][move.x] = 0;
    }
    if (board[move.toY]) board[move.toY][move.x] = move.cell;
    if (poisonBoard[move.toY]) poisonBoard[move.toY][move.x] = move.poison;
  }
}

export function createEmptySeatSnapshot(localId: string, opponentId: string, seed: number): SeatWireSnapshot {
  return {
    tick: 0,
    chrome: {
      status: 'waiting',
      countdown: 0,
      seed,
      winnerId: null,
      pausePlayerId: null,
      pauseStartedAt: null,
    },
    local: emptyLocal(localId),
    opponent: emptyOpponent(opponentId),
  };
}
