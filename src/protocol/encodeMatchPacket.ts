import { BOARD_COLS, BOARD_ROWS, BOARD_VISIBLE_ROWS } from '../constants.js';
import type {
  ActiveFieldEffect,
  GamePiece,
  HeldPiece,
  ItemPricingState,
  PoisonSpreadState,
} from '../types.js';
import { BinaryWriter, toArrayBuffer } from './binary.js';
import {
  writeChrome,
  writeDirtyBoard,
  writeDirtyPoison,
  writeFullBoard,
  writeLocalMeta,
  writeLocalShop,
  writeOpponentMeta,
  writePieceCompact,
  writeTectonicMoves,
} from './codecShared.js';
import {
  DELTA_SECTION_CHROME,
  DELTA_SECTION_LOCAL_BOARD,
  DELTA_SECTION_LOCAL_META,
  DELTA_SECTION_LOCAL_PIECE,
  DELTA_SECTION_LOCAL_POISON,
  DELTA_SECTION_LOCAL_SHOP,
  DELTA_SECTION_OPPONENT_BOARD,
  DELTA_SECTION_OPPONENT_META,
  DELTA_SECTION_OPPONENT_PIECE,
  DELTA_SECTION_OPPONENT_POISON,
  type LocalPlayerWire,
  type MatchChromeWire,
  type OpponentPlayerWire,
  type PendingGarbageWire,
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

/** Allocation-free board/poison equality; avoids JSON.stringify on 10×N grids. */
function gridEquals<T>(
  a: readonly (readonly T[])[],
  b: readonly (readonly T[])[],
  rows: number,
): boolean {
  for (let y = 0; y < rows; y += 1) {
    const rowA = a[y];
    const rowB = b[y];
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }
  return true;
}

function stringArrayEquals(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function offsetsEquals(
  a: readonly [number, number][] | undefined,
  b: readonly [number, number][] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return !a && !b;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

function heldPieceEquals(a: HeldPiece | null, b: HeldPiece | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.type === b.type
    && a.poisoned === b.poisoned
    && a.poisonVariant === b.poisonVariant
    && a.bomber === b.bomber;
}

function poisonSpreadEquals(a: PoisonSpreadState | null, b: PoisonSpreadState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.generationsRemaining === b.generationsRemaining
    && a.nextSpreadTick === b.nextSpreadTick
    && a.variant === b.variant;
}

function garbageEquals(a: readonly PendingGarbageWire[], b: readonly PendingGarbageWire[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].lines !== b[i].lines || a[i].arrivalTick !== b[i].arrivalTick) return false;
  }
  return true;
}

function effectsEquals(a: readonly ActiveFieldEffect[], b: readonly ActiveFieldEffect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.kind !== right.kind
      || left.label !== right.label
      || left.icon !== right.icon
      || left.expiresAtTick !== right.expiresAtTick
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Piece dirtiness matches the compact wire fields so encode and dirty agree.
 * Field compare avoids allocating scratch buffers on every netcast.
 */
function pieceWireDiffers(a: GamePiece | null, b: GamePiece | null): boolean {
  if (a === b) return false;
  if (!a || !b) return true;
  return a.type !== b.type
    || a.rotation !== b.rotation
    || a.x !== b.x
    || a.y !== b.y
    || a.poisoned !== b.poisoned
    || a.poisonVariant !== b.poisonVariant
    || a.bomber !== b.bomber
    || a.isWildcard !== b.isWildcard
    || a.rotationBlockedNonce !== b.rotationBlockedNonce
    || !offsetsEquals(a.customOffsets, b.customOffsets);
}

function chromeDiffers(a: MatchChromeWire, b: MatchChromeWire): boolean {
  return a.status !== b.status
    || a.countdown !== b.countdown
    || a.seed !== b.seed
    || a.winnerId !== b.winnerId
    || a.endReason !== b.endReason
    || a.technicalVictory !== b.technicalVictory
    || a.restartTimer !== b.restartTimer
    || a.pausePlayerId !== b.pausePlayerId
    || a.pauseStartedAt !== b.pauseStartedAt;
}

function pricingEntryEquals(a: ItemPricingState, b: ItemPricingState): boolean {
  return a.level === b.level
    && a.purchasesInWindow === b.purchasesInWindow
    && a.windowStartedAtTick === b.windowStartedAtTick
    && a.lastWindowClosedBy === b.lastWindowClosedBy
    && a.freePurchases === b.freePurchases;
}

function shopDiffers(
  a: LocalPlayerWire['shop'],
  b: LocalPlayerWire['shop'],
): boolean {
  if (a.phase !== b.phase
    || a.cycleIndex !== b.cycleIndex
    || a.lastPurchasedItemId !== b.lastPurchasedItemId
    || !stringArrayEquals(a.offerIds, b.offerIds)
    || !stringArrayEquals(a.activeSynergySeeds, b.activeSynergySeeds)
  ) {
    return true;
  }
  const aKeys = Object.keys(a.pricing);
  const bKeys = Object.keys(b.pricing);
  if (aKeys.length !== bKeys.length) return true;
  for (const key of aKeys) {
    const left = a.pricing[key];
    const right = b.pricing[key];
    if (!right || !pricingEntryEquals(left, right)) return true;
  }
  return false;
}

/** Local meta excludes board / poison / shop / activePiece (own sections). */
function localMetaDiffers(a: LocalPlayerWire, b: LocalPlayerWire): boolean {
  return a.id !== b.id
    || a.landingForecastAtTick !== b.landingForecastAtTick
    || !heldPieceEquals(a.holdPiece, b.holdPiece)
    || a.canHold !== b.canHold
    || !stringArrayEquals(a.nextQueue, b.nextQueue)
    || a.score !== b.score
    || a.funds !== b.funds
    || a.linesCleared !== b.linesCleared
    || a.combo !== b.combo
    || a.backToBack !== b.backToBack
    || !garbageEquals(a.pendingGarbage, b.pendingGarbage)
    || !effectsEquals(a.activeEffects, b.activeEffects)
    || a.topOut !== b.topOut
    || a.swapCutoffRow !== b.swapCutoffRow
    || a.curtainDefenseLevel !== b.curtainDefenseLevel
    || !poisonSpreadEquals(a.poisonSpread, b.poisonSpread)
    || !offsetsEquals(a.customNextPieceSourceCells, b.customNextPieceSourceCells)
    || a.holdFrozenUntilTick !== b.holdFrozenUntilTick
    || a.magnetPermanentStacks !== b.magnetPermanentStacks
    || a.magnetPieceBoost !== b.magnetPieceBoost
    || a.pieceHasHardDropped !== b.pieceHasHardDropped
    || a.lastHardDropTick !== b.lastHardDropTick
    || a.snagHardDropBlocked !== b.snagHardDropBlocked
    || a.satelliteArmed !== b.satelliteArmed
    || a.satelliteDelayUntilTick !== b.satelliteDelayUntilTick
    || a.tectonicShiftNextStepTick !== b.tectonicShiftNextStepTick;
}

/** Opponent meta excludes board / poison / activePiece (own sections). */
function opponentMetaDiffers(a: OpponentPlayerWire, b: OpponentPlayerWire): boolean {
  return a.id !== b.id
    || a.score !== b.score
    || a.funds !== b.funds
    || a.linesCleared !== b.linesCleared
    || a.combo !== b.combo
    || a.backToBack !== b.backToBack
    || !garbageEquals(a.pendingGarbage, b.pendingGarbage)
    || !effectsEquals(a.activeEffects, b.activeEffects)
    || a.topOut !== b.topOut
    || a.swapCutoffRow !== b.swapCutoffRow
    || a.curtainDefenseLevel !== b.curtainDefenseLevel
    || !poisonSpreadEquals(a.poisonSpread, b.poisonSpread)
    || a.tectonicShiftNextStepTick !== b.tectonicShiftNextStepTick
    || a.magnetPermanentStacks !== b.magnetPermanentStacks
    || a.magnetPieceBoost !== b.magnetPieceBoost
    || a.hasHold !== b.hasHold
    || a.hasPoison !== b.hasPoison;
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
  writePieceCompact(writer, snapshot.local.activePiece);
  writeFullBoard(writer, snapshot.opponent.board, snapshot.opponent.poisonBoard, BOARD_VISIBLE_ROWS);
  writeOpponentMeta(writer, snapshot.opponent, true);
  writePieceCompact(writer, snapshot.opponent.activePiece);
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

  if (chromeDiffers(snapshot.chrome, baseline.chrome)) {
    sections |= DELTA_SECTION_CHROME;
  }
  if (!gridEquals(snapshot.local.board, baseline.local.board, BOARD_ROWS)) {
    sections |= DELTA_SECTION_LOCAL_BOARD;
  }
  if (!gridEquals(snapshot.local.poisonBoard, baseline.local.poisonBoard, BOARD_ROWS)) {
    sections |= DELTA_SECTION_LOCAL_POISON;
  }
  if (localMetaDiffers(snapshot.local, baseline.local)) {
    sections |= DELTA_SECTION_LOCAL_META;
  }
  if (shopDiffers(snapshot.local.shop, baseline.local.shop)) {
    sections |= DELTA_SECTION_LOCAL_SHOP;
  }
  if (pieceWireDiffers(snapshot.local.activePiece, baseline.local.activePiece)) {
    sections |= DELTA_SECTION_LOCAL_PIECE;
  }
  if (!gridEquals(snapshot.opponent.board, baseline.opponent.board, BOARD_VISIBLE_ROWS)) {
    sections |= DELTA_SECTION_OPPONENT_BOARD;
  }
  if (!gridEquals(snapshot.opponent.poisonBoard, baseline.opponent.poisonBoard, BOARD_VISIBLE_ROWS)) {
    sections |= DELTA_SECTION_OPPONENT_POISON;
  }
  if (opponentMetaDiffers(snapshot.opponent, baseline.opponent)) {
    sections |= DELTA_SECTION_OPPONENT_META;
  }
  if (pieceWireDiffers(snapshot.opponent.activePiece, baseline.opponent.activePiece)) {
    sections |= DELTA_SECTION_OPPONENT_PIECE;
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
  if (sections & DELTA_SECTION_LOCAL_PIECE) writePieceCompact(writer, snapshot.local.activePiece);
  if (sections & DELTA_SECTION_OPPONENT_PIECE) writePieceCompact(writer, snapshot.opponent.activePiece);

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
