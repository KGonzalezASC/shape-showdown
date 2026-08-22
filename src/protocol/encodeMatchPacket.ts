import { BOARD_COLS, BOARD_ROWS, BOARD_VISIBLE_ROWS } from '../constants.js';
import { BinaryWriter, toArrayBuffer } from './binary.js';
import {
  writeChrome,
  writeDirtyBoard,
  writeDirtyPoison,
  writeFullBoard,
  writeLocalMeta,
  writeLocalShop,
  writeOpponentMeta,
  writeTectonicMoves,
} from './codecShared.js';
import {
  DELTA_SECTION_CHROME,
  DELTA_SECTION_LOCAL_BOARD,
  DELTA_SECTION_LOCAL_META,
  DELTA_SECTION_LOCAL_POISON,
  DELTA_SECTION_LOCAL_SHOP,
  DELTA_SECTION_OPPONENT_BOARD,
  DELTA_SECTION_OPPONENT_META,
  DELTA_SECTION_OPPONENT_POISON,
  type SeatWireSnapshot,
  type TectonicCompleteWire,
  type TectonicStepWire,
} from './wireTypes.js';
import {
  GAME_PROTOCOL_VERSION,
  PACKET_HEADER_BYTES,
  PACKET_KIND_DELTA,
  PACKET_KIND_KEYFRAME,
  PACKET_KIND_TECTONIC_COMPLETE,
  PACKET_KIND_TECTONIC_STEP,
} from './version.js';

export interface PacketHeader {
  version: number;
  kind: number;
  sequence: number;
  baseGeneration: number;
  tick: number;
}

function writeHeader(
  writer: BinaryWriter,
  kind: number,
  sequence: number,
  baseGeneration: number,
  tick: number,
): void {
  writer.writeU8(GAME_PROTOCOL_VERSION);
  writer.writeU8(kind);
  writer.writeU32(sequence);
  writer.writeU32(baseGeneration);
  writer.writeU32(tick >>> 0);
}

export function encodeKeyframePacket(
  snapshot: SeatWireSnapshot,
  sequence: number,
  generation: number,
): ArrayBuffer {
  const writer = new BinaryWriter();
  writeHeader(writer, PACKET_KIND_KEYFRAME, sequence, generation, snapshot.tick);
  writeChrome(writer, snapshot.chrome);
  writeFullBoard(writer, snapshot.local.board, snapshot.local.poisonBoard, BOARD_ROWS);
  writeLocalMeta(writer, snapshot.local, true);
  writeLocalShop(writer, snapshot.local.shop);
  writeFullBoard(writer, snapshot.opponent.board, snapshot.opponent.poisonBoard, BOARD_VISIBLE_ROWS);
  writeOpponentMeta(writer, snapshot.opponent, true);
  return writer.finish();
}

export function encodeDeltaPacket(
  snapshot: SeatWireSnapshot,
  baseline: SeatWireSnapshot,
  sequence: number,
  generation: number,
): ArrayBuffer | null {
  let sections = 0;
  const writer = new BinaryWriter();
  const bodyStart = PACKET_HEADER_BYTES;
  writeHeader(writer, PACKET_KIND_DELTA, sequence, generation, snapshot.tick);

  if (JSON.stringify(snapshot.chrome) !== JSON.stringify(baseline.chrome)) {
    sections |= DELTA_SECTION_CHROME;
  }
  if (JSON.stringify(snapshot.local.board) !== JSON.stringify(baseline.local.board)) {
    sections |= DELTA_SECTION_LOCAL_BOARD;
  }
  if (JSON.stringify(snapshot.local.poisonBoard) !== JSON.stringify(baseline.local.poisonBoard)) {
    sections |= DELTA_SECTION_LOCAL_POISON;
  }
  const localMetaBaseline = { ...baseline.local, board: [], poisonBoard: [], shop: baseline.local.shop };
  const localMetaSnapshot = { ...snapshot.local, board: [], poisonBoard: [], shop: snapshot.local.shop };
  if (JSON.stringify(localMetaSnapshot) !== JSON.stringify({ ...localMetaBaseline, shop: snapshot.local.shop })) {
    sections |= DELTA_SECTION_LOCAL_META;
  }
  if (JSON.stringify(snapshot.local.shop) !== JSON.stringify(baseline.local.shop)) {
    sections |= DELTA_SECTION_LOCAL_SHOP;
  }
  if (JSON.stringify(snapshot.opponent.board) !== JSON.stringify(baseline.opponent.board)) {
    sections |= DELTA_SECTION_OPPONENT_BOARD;
  }
  if (JSON.stringify(snapshot.opponent.poisonBoard) !== JSON.stringify(baseline.opponent.poisonBoard)) {
    sections |= DELTA_SECTION_OPPONENT_POISON;
  }
  const oppMetaBaseline = { ...baseline.opponent, board: [] };
  const oppMetaSnapshot = { ...snapshot.opponent, board: [] };
  if (JSON.stringify(oppMetaSnapshot) !== JSON.stringify(oppMetaBaseline)) {
    sections |= DELTA_SECTION_OPPONENT_META;
  }

  if (sections === 0) return null;

  writer.writeU16(sections);
  if (sections & DELTA_SECTION_CHROME) writeChrome(writer, snapshot.chrome);
  if (sections & DELTA_SECTION_LOCAL_BOARD) {
    writeDirtyBoard(writer, snapshot.local.board, baseline.local.board, BOARD_ROWS);
  }
  if (sections & DELTA_SECTION_LOCAL_POISON) {
    writeDirtyPoison(writer, snapshot.local.poisonBoard, baseline.local.poisonBoard, BOARD_ROWS);
  }
  if (sections & DELTA_SECTION_LOCAL_META) writeLocalMeta(writer, snapshot.local, false);
  if (sections & DELTA_SECTION_LOCAL_SHOP) writeLocalShop(writer, snapshot.local.shop);
  if (sections & DELTA_SECTION_OPPONENT_BOARD) {
    writeDirtyBoard(writer, snapshot.opponent.board, baseline.opponent.board, BOARD_VISIBLE_ROWS);
  }
  if (sections & DELTA_SECTION_OPPONENT_POISON) {
    writeDirtyPoison(
      writer,
      snapshot.opponent.poisonBoard,
      baseline.opponent.poisonBoard,
      BOARD_VISIBLE_ROWS,
    );
  }
  if (sections & DELTA_SECTION_OPPONENT_META) writeOpponentMeta(writer, snapshot.opponent, false);

  if (writer.position <= bodyStart + 2) return null;
  return writer.finish();
}

export function encodeTectonicStepPacket(
  step: TectonicStepWire,
  sequence: number,
  generation: number,
  tick: number,
): ArrayBuffer {
  const writer = new BinaryWriter();
  writeHeader(writer, PACKET_KIND_TECTONIC_STEP, sequence, generation, tick);
  writer.writeString(step.playerId);
  writer.writeBool(step.advanced);
  writeTectonicMoves(writer, step.moves);
  return writer.finish();
}

export function encodeTectonicCompletePacket(
  complete: TectonicCompleteWire,
  sequence: number,
  generation: number,
  tick: number,
): ArrayBuffer {
  const writer = new BinaryWriter();
  writeHeader(writer, PACKET_KIND_TECTONIC_COMPLETE, sequence, generation, tick);
  writer.writeString(complete.playerId);
  writer.writeU8(complete.rowsCleared);
  return writer.finish();
}

export function readPacketHeader(buffer: ArrayBuffer | ArrayBufferView): PacketHeader {
  const view = new DataView(toArrayBuffer(buffer));
  return {
    version: view.getUint8(0),
    kind: view.getUint8(1),
    sequence: view.getUint32(2, true),
    baseGeneration: view.getUint32(6, true),
    tick: view.getUint32(10, true),
  };
}
