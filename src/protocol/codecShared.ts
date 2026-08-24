import { BOARD_COLS } from '../constants.js';
import type {
  ActiveFieldEffect,
  CellValue,
  HeldPiece,
  ItemPricingState,
  PendingGarbagePacket,
  PoisonSpreadState,
  GamePiece,
  ShapeType,
} from '../types.js';
import { BinaryReader, BinaryWriter } from './binary.js';
import {
  cellToNibble,
  nibbleToCell,
  nibbleToShape,
  packCellRow,
  packPoisonRow,
  shapeToNibble,
  unpackCellRow,
  unpackPoisonRow,
} from './cellCodec.js';
import {
  FIELD_EFFECT_KINDS,
  type DecodedLocalPlayerWire,
  type DecodedOpponentPlayerWire,
  type LocalPlayerWire,
  type MatchChromeWire,
  type OpponentPlayerWire,
  type PendingGarbageWire,
  SHOP_PHASE_TO_U8,
  type TectonicCellMove,
  U8_TO_END_REASON,
  U8_TO_MATCH_STATUS,
  U8_TO_SHOP_PHASE,
  MATCH_STATUS_TO_U8,
  END_REASON_TO_U8,
} from './wireTypes.js';

export function writeOptionalU32(writer: BinaryWriter, value: number | null | undefined): void {
  if (value === null || value === undefined) {
    writer.writeU8(0);
    return;
  }
  writer.writeU8(1);
  writer.writeU32(value);
}

export function readOptionalU32(reader: BinaryReader): number | null {
  return reader.readU8() === 0 ? null : reader.readU32();
}

export function writeShape(writer: BinaryWriter, type: ShapeType): void {
  writer.writeU8(shapeToNibble(type));
}

export function readShape(reader: BinaryReader): ShapeType {
  return nibbleToShape(reader.readU8());
}

export function writePiece(writer: BinaryWriter, piece: GamePiece | null): void {
  if (piece === null) {
    writer.writeU8(0);
    return;
  }
  writer.writeU8(1);
  writeShape(writer, piece.type);
  writer.writeU8(piece.rotation);
  writer.writeI16(piece.x);
  writer.writeI16(piece.y);
  writer.writeU8(
    (piece.poisoned ? 1 : 0)
    | (piece.bomber ? 2 : 0)
    | (piece.isWildcard ? 4 : 0),
  );
  writer.writeU8(piece.poisonVariant ?? 0);
  const offsets = piece.customOffsets ?? [];
  writer.writeU8(offsets.length);
  for (const [ox, oy] of offsets) {
    writer.writeI16(ox);
    writer.writeI16(oy);
  }
  writer.writeU8(piece.rotationBlockedNonce ?? 0);
}

export function readPiece(reader: BinaryReader): GamePiece | null {
  if (reader.readU8() === 0) return null;
  const type = readShape(reader);
  const rotation = reader.readU8() as GamePiece['rotation'];
  const x = reader.readI16();
  const y = reader.readI16();
  const flags = reader.readU8();
  const poisonVariant = reader.readU8();
  const offsetCount = reader.readU8();
  const customOffsets: [number, number][] = [];
  for (let i = 0; i < offsetCount; i += 1) {
    customOffsets.push([reader.readI16(), reader.readI16()]);
  }
  const rotationBlockedNonce = reader.readU8();
  return {
    type,
    rotation,
    x,
    y,
    ...(flags & 1 ? { poisoned: true, poisonVariant: poisonVariant || undefined } : {}),
    ...(flags & 2 ? { bomber: true } : {}),
    ...(flags & 4 ? { isWildcard: true, customOffsets } : {}),
    ...(rotationBlockedNonce > 0 ? { rotationBlockedNonce } : {}),
  };
}

export function writeHeldPiece(writer: BinaryWriter, held: HeldPiece | null): void {
  if (held === null) {
    writer.writeU8(0);
    return;
  }
  writer.writeU8(1);
  writeShape(writer, held.type);
  writer.writeU8(
    (held.poisoned ? 1 : 0)
    | (held.bomber ? 2 : 0),
  );
  writer.writeU8(held.poisonVariant ?? 0);
}

export function readHeldPiece(reader: BinaryReader): HeldPiece | null {
  if (reader.readU8() === 0) return null;
  const type = readShape(reader);
  const flags = reader.readU8();
  const poisonVariant = reader.readU8();
  return {
    type,
    ...(flags & 1 ? { poisoned: true, poisonVariant: poisonVariant || undefined } : {}),
    ...(flags & 2 ? { bomber: true } : {}),
  };
}

export function writeEffects(writer: BinaryWriter, effects: readonly ActiveFieldEffect[]): void {
  writer.writeU8(effects.length);
  for (const effect of effects) {
    writer.writeString(effect.id);
    const kindIndex = FIELD_EFFECT_KINDS.indexOf(effect.kind);
    writer.writeU8(kindIndex < 0 ? 0 : kindIndex);
    writer.writeString(effect.label);
    writeOptionalU32(writer, effect.expiresAtTick);
    if (effect.icon) {
      writer.writeU8(1);
      writer.writeString(effect.icon);
    } else {
      writer.writeU8(0);
    }
  }
}

/** Relativizes absolute wire expiry ticks against the packet header tick. */
export function readEffects(reader: BinaryReader, headerTick: number): ActiveFieldEffect[] {
  const count = reader.readU8();
  const effects: ActiveFieldEffect[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = reader.readString();
    const kind = FIELD_EFFECT_KINDS[reader.readU8()] ?? 'retrim';
    const label = reader.readString();
    const expiresAtTickAbs = readOptionalU32(reader);
    const hasIcon = reader.readU8() === 1;
    const icon = hasIcon ? reader.readString() : undefined;
    effects.push({
      id,
      kind,
      label,
      ...(expiresAtTickAbs === null ? {} : { expiresAtTick: Math.max(0, expiresAtTickAbs - headerTick) }),
      ...(icon === undefined ? {} : { icon }),
    });
  }
  return effects;
}

export function writeGarbage(writer: BinaryWriter, packets: readonly PendingGarbageWire[]): void {
  writer.writeU8(packets.length);
  for (const packet of packets) {
    writer.writeU8(packet.lines);
    writeOptionalU32(writer, packet.arrivalTick ?? null);
  }
}

/** Relativizes absolute wire arrival ticks against the packet header tick. */
export function readGarbage(reader: BinaryReader, headerTick: number): PendingGarbagePacket[] {
  const count = reader.readU8();
  const packets: PendingGarbagePacket[] = [];
  for (let i = 0; i < count; i += 1) {
    const lines = reader.readU8();
    const arrivalTick = readOptionalU32(reader);
    packets.push({
      lines,
      ...(arrivalTick === null ? {} : { ticksUntilArrival: Math.max(0, arrivalTick - headerTick) }),
    });
  }
  return packets;
}

export function writePoisonSpread(writer: BinaryWriter, spread: PoisonSpreadState | null): void {
  if (spread === null) {
    writer.writeU8(0);
    return;
  }
  writer.writeU8(1);
  writer.writeU8(spread.generationsRemaining);
  writer.writeU32(spread.nextSpreadTick);
  writer.writeU8(spread.variant);
}

/** Relativizes the absolute wire spread tick against the packet header tick. */
export function readPoisonSpread(reader: BinaryReader, headerTick: number): PoisonSpreadState | null {
  if (reader.readU8() === 0) return null;
  const nextSpreadTickAbs = reader.readU32();
  return {
    generationsRemaining: reader.readU8(),
    nextSpreadTick: Math.max(0, nextSpreadTickAbs - headerTick),
    variant: reader.readU8(),
  };
}

export function writePricing(writer: BinaryWriter, pricing: Record<string, ItemPricingState>): void {
  const ids = Object.keys(pricing);
  writer.writeU8(ids.length);
  for (const itemId of ids) {
    const state = pricing[itemId];
    writer.writeString(itemId);
    writer.writeU8(state.level);
    writer.writeU8(state.purchasesInWindow);
    writeOptionalU32(writer, state.windowStartedAtTick);
    const closedBy = state.lastWindowClosedBy;
    if (closedBy === 'allowance') writer.writeU8(1);
    else if (closedBy === 'timer') writer.writeU8(2);
    else writer.writeU8(0);
  }
}

export function readPricing(reader: BinaryReader): Record<string, ItemPricingState> {
  const count = reader.readU8();
  const pricing: Record<string, ItemPricingState> = {};
  for (let i = 0; i < count; i += 1) {
    const itemId = reader.readString();
    const level = reader.readU8();
    const purchasesInWindow = reader.readU8();
    const windowStartedAtTick = readOptionalU32(reader);
    const closedFlag = reader.readU8();
    pricing[itemId] = {
      level,
      purchasesInWindow,
      windowStartedAtTick,
      ...(closedFlag === 1 ? { lastWindowClosedBy: 'allowance' as const } : {}),
      ...(closedFlag === 2 ? { lastWindowClosedBy: 'timer' as const } : {}),
    };
  }
  return pricing;
}

export function writeLocalShop(writer: BinaryWriter, shop: LocalPlayerWire['shop']): void {
  writer.writeU8(SHOP_PHASE_TO_U8[shop.phase]);
  writer.writeU8(shop.offerIds.length);
  for (const offerId of shop.offerIds) writer.writeString(offerId);
  writer.writeI16(shop.cycleIndex);
  if (shop.lastPurchasedItemId) {
    writer.writeU8(1);
    writer.writeString(shop.lastPurchasedItemId);
  } else {
    writer.writeU8(0);
  }
  writer.writeU8(shop.activeSynergySeeds.length);
  for (const seed of shop.activeSynergySeeds) writer.writeString(seed);
  writePricing(writer, shop.pricing);
}

export function readLocalShop(reader: BinaryReader): LocalPlayerWire['shop'] {
  const phase = U8_TO_SHOP_PHASE[reader.readU8()] ?? 'waiting';
  const offerCount = reader.readU8();
  const offerIds: string[] = [];
  for (let i = 0; i < offerCount; i += 1) offerIds.push(reader.readString());
  const cycleIndex = reader.readI16();
  const lastPurchasedItemId = reader.readU8() === 1 ? reader.readString() : null;
  const seedCount = reader.readU8();
  const activeSynergySeeds: string[] = [];
  for (let i = 0; i < seedCount; i += 1) activeSynergySeeds.push(reader.readString());
  const pricing = readPricing(reader);
  return {
    offerIds,
    phase,
    cycleIndex,
    lastPurchasedItemId,
    activeSynergySeeds,
    pricing,
  };
}

export function writeChrome(writer: BinaryWriter, chrome: MatchChromeWire): void {
  writer.writeU8(MATCH_STATUS_TO_U8[chrome.status]);
  writer.writeU32(Math.round(chrome.countdown * 1000));
  writer.writeU32(chrome.seed >>> 0);
  if (chrome.winnerId) {
    writer.writeU8(1);
    writer.writeString(chrome.winnerId);
  } else {
    writer.writeU8(0);
  }
  if (chrome.endReason) {
    writer.writeU8(1);
    writer.writeU8(END_REASON_TO_U8[chrome.endReason]);
  } else {
    writer.writeU8(0);
  }
  writer.writeBool(!!chrome.technicalVictory);
  writeOptionalU32(writer, chrome.restartTimer !== undefined ? Math.round(chrome.restartTimer * 1000) : null);
  if (chrome.pausePlayerId) {
    writer.writeU8(1);
    writer.writeString(chrome.pausePlayerId);
    writer.writeU32(chrome.pauseStartedAt ?? 0);
  } else {
    writer.writeU8(0);
  }
}

export function readChrome(reader: BinaryReader): MatchChromeWire {
  const status = U8_TO_MATCH_STATUS[reader.readU8()] ?? 'waiting';
  const countdown = reader.readU32() / 1000;
  const seed = reader.readU32();
  const winnerId = reader.readU8() === 1 ? reader.readString() : null;
  const endReason = reader.readU8() === 1 ? U8_TO_END_REASON[reader.readU8()] : undefined;
  const technicalVictory = reader.readBool() || undefined;
  const restartMs = readOptionalU32(reader);
  const restartTimer = restartMs === null ? undefined : restartMs / 1000;
  let pausePlayerId: string | null = null;
  let pauseStartedAt: number | null = null;
  if (reader.readU8() === 1) {
    pausePlayerId = reader.readString();
    pauseStartedAt = expandWrappedTimestamp(reader.readU32());
  }
  return {
    status,
    countdown,
    seed,
    winnerId,
    endReason,
    technicalVictory,
    restartTimer,
    pausePlayerId,
    pauseStartedAt,
  };
}

const U32_RANGE = 0x1_0000_0000;

function expandWrappedTimestamp(wrappedTimestamp: number, now = Date.now()): number {
  const currentEpochBase = Math.floor(now / U32_RANGE) * U32_RANGE;
  let candidate = currentEpochBase + wrappedTimestamp;
  if (candidate - now > U32_RANGE / 2) candidate -= U32_RANGE;
  if (now - candidate > U32_RANGE / 2) candidate += U32_RANGE;
  return candidate;
}

export function writeFullBoard(
  writer: BinaryWriter,
  board: readonly (readonly CellValue[])[],
  poisonBoard: readonly (readonly number[])[] | undefined,
  rows: number,
): void {
  writer.writeU8(rows);
  for (let y = 0; y < rows; y += 1) {
    writer.writeBytes(packCellRow(board[y] ?? Array.from({ length: BOARD_COLS }, () => null)));
    writer.writeBytes(packPoisonRow(poisonBoard?.[y] ?? Array.from({ length: BOARD_COLS }, () => 0)));
  }
}

export function readFullBoard(
  reader: BinaryReader,
  cols: number,
): { board: CellValue[][]; poisonBoard: number[][] } {
  const rows = reader.readU8();
  const board: CellValue[][] = [];
  const poisonBoard: number[][] = [];
  for (let y = 0; y < rows; y += 1) {
    board.push(unpackCellRow(reader.readBytes(Math.ceil(cols / 2)), cols));
    poisonBoard.push(unpackPoisonRow(reader.readBytes(Math.ceil(cols / 2)), cols));
  }
  return { board, poisonBoard };
}

export function writeDirtyBoard(
  writer: BinaryWriter,
  board: readonly (readonly CellValue[])[],
  baseline: readonly (readonly CellValue[])[],
  rows: number,
): void {
  let rowMask = 0;
  const dirtyRows: { y: number; colMask: number; cells: number[] }[] = [];
  for (let y = 0; y < rows; y += 1) {
    let colMask = 0;
    const cells: number[] = [];
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const next = board[y]?.[x] ?? null;
      const prev = baseline[y]?.[x] ?? null;
      if (next !== prev) {
        colMask |= 1 << x;
        cells.push(cellToNibble(next));
      }
    }
    if (colMask !== 0) {
      rowMask |= 1 << y;
      dirtyRows.push({ y, colMask, cells });
    }
  }
  writer.writeU32(rowMask >>> 0);
  for (const row of dirtyRows) {
    writer.writeU8(row.y);
    writer.writeU16(row.colMask);
    for (const nibble of row.cells) writer.writeU8(nibble);
  }
}

export function applyDirtyBoard(
  board: CellValue[][],
  reader: BinaryReader,
): void {
  const rowMask = reader.readU32();
  for (let y = 0; y < 32; y += 1) {
    if ((rowMask & (1 << y)) === 0) continue;
    const rowY = reader.readU8();
    const colMask = reader.readU16();
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if ((colMask & (1 << x)) === 0) continue;
      const nibble = reader.readU8();
      if (!board[rowY]) board[rowY] = Array.from({ length: BOARD_COLS }, () => null);
      board[rowY][x] = nibbleToCell(nibble);
    }
  }
}

export function writeDirtyPoison(
  writer: BinaryWriter,
  poison: readonly (readonly number[])[],
  baseline: readonly (readonly number[])[],
  rows: number,
): void {
  let rowMask = 0;
  const dirtyRows: { y: number; colMask: number; cells: number[] }[] = [];
  for (let y = 0; y < rows; y += 1) {
    let colMask = 0;
    const cells: number[] = [];
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const next = poison[y]?.[x] ?? 0;
      const prev = baseline[y]?.[x] ?? 0;
      if (next !== prev) {
        colMask |= 1 << x;
        cells.push(next & 0x0f);
      }
    }
    if (colMask !== 0) {
      rowMask |= 1 << y;
      dirtyRows.push({ y, colMask, cells });
    }
  }
  writer.writeU32(rowMask >>> 0);
  for (const row of dirtyRows) {
    writer.writeU8(row.y);
    writer.writeU16(row.colMask);
    for (const nibble of row.cells) writer.writeU8(nibble);
  }
}

export function applyDirtyPoison(
  poison: number[][],
  reader: BinaryReader,
): void {
  const rowMask = reader.readU32();
  for (let y = 0; y < 32; y += 1) {
    if ((rowMask & (1 << y)) === 0) continue;
    const rowY = reader.readU8();
    const colMask = reader.readU16();
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if ((colMask & (1 << x)) === 0) continue;
      const nibble = reader.readU8();
      if (!poison[rowY]) poison[rowY] = Array.from({ length: BOARD_COLS }, () => 0);
      poison[rowY][x] = nibble;
    }
  }
}

export type LocalMetaDecoded = Omit<DecodedLocalPlayerWire, 'board' | 'poisonBoard' | 'shop'>;

export function writeLocalMeta(writer: BinaryWriter, local: LocalPlayerWire, includeId: boolean): void {
  if (includeId) writer.writeString(local.id);
  writePiece(writer, local.activePiece);
  writeOptionalU32(writer, local.landingForecastAtTick ?? null);
  writeHeldPiece(writer, local.holdPiece);
  writer.writeBool(local.canHold);
  writer.writeU8(local.nextQueue.length);
  for (const piece of local.nextQueue) writeShape(writer, piece);
  writer.writeU32(local.score >>> 0);
  writer.writeU32(local.funds >>> 0);
  writer.writeU32(local.linesCleared >>> 0);
  writer.writeU8(local.combo);
  writer.writeBool(local.backToBack);
  writeGarbage(writer, local.pendingGarbage);
  writeEffects(writer, local.activeEffects);
  writer.writeBool(local.topOut);
  writer.writeU8(local.swapCutoffRow);
  writer.writeU8(local.curtainDefenseLevel);
  writePoisonSpread(writer, local.poisonSpread);
  writeOptionalU32(writer, local.holdFrozenUntilTick ?? null);
  writeOptionalU32(writer, local.magnetPermanentStacks ?? null);
  writeOptionalU32(writer, local.magnetPieceBoost ?? null);
  writer.writeBool(!!local.pieceHasHardDropped);
  writeOptionalU32(writer, local.lastHardDropTick ?? null);
  writer.writeBool(!!local.snagHardDropBlocked);
  writer.writeBool(!!local.satelliteArmed);
  writeOptionalU32(writer, local.satelliteDelayUntilTick ?? null);
  writeOptionalU32(writer, local.tectonicShiftNextStepTick ?? null);
  const sources = local.customNextPieceSourceCells ?? [];
  writer.writeU8(sources.length);
  for (const [sx, sy] of sources) {
    writer.writeU8(sx);
    writer.writeU8(sy);
  }
}

/**
 * Decodes local meta relativized against `headerTick`. With `includeId` the
 * seat id is part of the payload (keyframes); otherwise it is omitted and the
 * caller's existing snapshot keeps its id.
 */
export function readLocalMeta(reader: BinaryReader, includeId: true, headerTick: number): LocalMetaDecoded;
export function readLocalMeta(
  reader: BinaryReader,
  includeId: false,
  headerTick: number,
): Omit<LocalMetaDecoded, 'id'>;
export function readLocalMeta(
  reader: BinaryReader,
  includeId: boolean,
  headerTick: number,
): LocalMetaDecoded | Omit<LocalMetaDecoded, 'id'> {
  const id = includeId ? reader.readString() : undefined;
  const activePiece = readPiece(reader);
  const landingForecastAtTick = readOptionalU32(reader);
  const holdPiece = readHeldPiece(reader);
  const canHold = reader.readBool();
  const queueCount = reader.readU8();
  const nextQueue: ShapeType[] = [];
  for (let i = 0; i < queueCount; i += 1) nextQueue.push(readShape(reader));
  const score = reader.readU32();
  const funds = reader.readU32();
  const linesCleared = reader.readU32();
  const combo = reader.readU8();
  const backToBack = reader.readBool();
  const pendingGarbage = readGarbage(reader, headerTick);
  const activeEffects = readEffects(reader, headerTick);
  const topOut = reader.readBool();
  const swapCutoffRow = reader.readU8();
  const curtainDefenseLevel = reader.readU8();
  const poisonSpread = readPoisonSpread(reader, headerTick);
  const holdFrozenAbs = readOptionalU32(reader);
  const magnetPermanentStacks = readOptionalU32(reader);
  const magnetPieceBoost = readOptionalU32(reader);
  const pieceHasHardDropped = reader.readBool() || undefined;
  const lastHardDropTick = readOptionalU32(reader) ?? undefined;
  const snagHardDropBlocked = reader.readBool() || undefined;
  const satelliteArmed = reader.readBool() || undefined;
  const satelliteDelayAbs = readOptionalU32(reader);
  const tectonicShiftNextStepAbs = readOptionalU32(reader);
  const sourceCount = reader.readU8();
  const customNextPieceSourceCells: [number, number][] = [];
  for (let i = 0; i < sourceCount; i += 1) {
    customNextPieceSourceCells.push([reader.readU8(), reader.readU8()]);
  }
  return {
    ...(id === undefined ? {} : { id }),
    activePiece,
    landingForecastTicksRemaining: landingForecastAtTick === null
      ? undefined
      : Math.max(0, landingForecastAtTick - headerTick),
    holdPiece,
    canHold,
    nextQueue,
    score,
    funds,
    linesCleared,
    combo,
    backToBack,
    pendingGarbage,
    activeEffects,
    topOut,
    swapCutoffRow,
    curtainDefenseLevel,
    poisonSpread,
    holdFrozenUntilTick: holdFrozenAbs === null ? undefined : Math.max(0, holdFrozenAbs - headerTick),
    magnetPermanentStacks: magnetPermanentStacks ?? undefined,
    magnetPieceBoost: magnetPieceBoost ?? undefined,
    pieceHasHardDropped,
    lastHardDropTick,
    snagHardDropBlocked,
    satelliteArmed,
    satelliteDelayUntilTick: satelliteDelayAbs === null ? undefined : Math.max(0, satelliteDelayAbs - headerTick),
    tectonicShiftNextStepTick: tectonicShiftNextStepAbs === null
      ? null
      : Math.max(0, tectonicShiftNextStepAbs - headerTick),
    customNextPieceSourceCells: sourceCount > 0 ? customNextPieceSourceCells : undefined,
  };
}

export type OpponentMetaDecoded = Omit<DecodedOpponentPlayerWire, 'board' | 'poisonBoard'>;

export function writeOpponentMeta(writer: BinaryWriter, opponent: OpponentPlayerWire, includeId: boolean): void {
  if (includeId) writer.writeString(opponent.id);
  writePiece(writer, opponent.activePiece);
  writer.writeU32(opponent.score >>> 0);
  writer.writeU32(opponent.funds >>> 0);
  writer.writeU32(opponent.linesCleared >>> 0);
  writer.writeU8(opponent.combo);
  writer.writeBool(opponent.backToBack);
  writeGarbage(writer, opponent.pendingGarbage);
  writeEffects(writer, opponent.activeEffects);
  writer.writeBool(opponent.topOut);
  writer.writeU8(opponent.swapCutoffRow);
  writer.writeU8(opponent.curtainDefenseLevel);
  writePoisonSpread(writer, opponent.poisonSpread);
  writeOptionalU32(writer, opponent.tectonicShiftNextStepTick ?? null);
  writeOptionalU32(writer, opponent.magnetPermanentStacks ?? null);
  writeOptionalU32(writer, opponent.magnetPieceBoost ?? null);
  writer.writeBool(opponent.hasHold);
  writer.writeBool(opponent.hasPoison);
}

/**
 * Decodes opponent meta relativized against `headerTick`. With `includeId` the
 * seat id is part of the payload (keyframes); otherwise the caller's existing
 * snapshot keeps its id.
 */
export function readOpponentMeta(reader: BinaryReader, includeId: true, headerTick: number): OpponentMetaDecoded;
export function readOpponentMeta(
  reader: BinaryReader,
  includeId: false,
  headerTick: number,
): Omit<OpponentMetaDecoded, 'id'>;
export function readOpponentMeta(
  reader: BinaryReader,
  includeId: boolean,
  headerTick: number,
): OpponentMetaDecoded | Omit<OpponentMetaDecoded, 'id'> {
  const id = includeId ? reader.readString() : undefined;
  const activePiece = readPiece(reader);
  const score = reader.readU32();
  const funds = reader.readU32();
  const linesCleared = reader.readU32();
  const combo = reader.readU8();
  const backToBack = reader.readBool();
  const pendingGarbage = readGarbage(reader, headerTick);
  const activeEffects = readEffects(reader, headerTick);
  const topOut = reader.readBool();
  const swapCutoffRow = reader.readU8();
  const curtainDefenseLevel = reader.readU8();
  const poisonSpread = readPoisonSpread(reader, headerTick);
  const tectonicShiftNextStepAbs = readOptionalU32(reader);
  const magnetPermanentStacks = readOptionalU32(reader);
  const magnetPieceBoost = readOptionalU32(reader);
  const hasHold = reader.readBool();
  const hasPoison = reader.readBool();
  return {
    ...(id === undefined ? {} : { id }),
    activePiece,
    score,
    funds,
    linesCleared,
    combo,
    backToBack,
    pendingGarbage,
    activeEffects,
    topOut,
    swapCutoffRow,
    curtainDefenseLevel,
    poisonSpread,
    tectonicShiftNextStepTick: tectonicShiftNextStepAbs === null
      ? null
      : Math.max(0, tectonicShiftNextStepAbs - headerTick),
    magnetPermanentStacks: magnetPermanentStacks ?? undefined,
    magnetPieceBoost: magnetPieceBoost ?? undefined,
    hasHold,
    hasPoison,
  };
}

export function writeTectonicMoves(writer: BinaryWriter, moves: readonly TectonicCellMove[]): void {
  writer.writeU16(moves.length);
  for (const move of moves) {
    writer.writeU8(move.x);
    writer.writeU8(move.fromY);
    writer.writeU8(move.toY);
    writer.writeU8(cellToNibble(move.cell));
    writer.writeU8(move.poison & 0x0f);
  }
}

export function readTectonicMoves(reader: BinaryReader): TectonicCellMove[] {
  const count = reader.readU16();
  const moves: TectonicCellMove[] = [];
  for (let i = 0; i < count; i += 1) {
    moves.push({
      x: reader.readU8(),
      fromY: reader.readU8(),
      toY: reader.readU8(),
      cell: nibbleToCell(reader.readU8()),
      poison: reader.readU8(),
    });
  }
  return moves;
}
