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
import { BinaryReader, BinaryWriter, PacketSizeError } from './binary.js';
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
  EFFECT_ICON_INTERN,
  EFFECT_ICON_LITERAL,
  EFFECT_LABEL_INTERN,
  EFFECT_LABEL_TEMPLATE_BASE,
  EFFECT_STRING_LITERAL,
  FIELD_EFFECT_KINDS,
  SHOP_ITEM_ID_TO_U8,
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
  U8_TO_SHOP_ITEM_ID,
  U8_TO_SHOP_PHASE,
  END_REASON_TO_U8,
  MATCH_STATUS_TO_U8,
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

/**
 * Compact piece encoding for the dedicated piece delta sections: 4 bytes for a
 * plain piece (header byte packs present/shape/rotation, then x/y/flags as
 * I8/I8/U8) with optional tail bytes for poison variant, wildcard offsets, and
 * the rotation-blocked nonce. Decodes to exactly the same object shape as the
 * v3 meta-embedded piece encoding.
 */
export function writePieceCompact(writer: BinaryWriter, piece: GamePiece | null): void {
  if (piece === null) {
    writer.writeU8(0);
    return;
  }
  const shapeNibble = shapeToNibble(piece.type);
  if (shapeNibble > 0x0f) {
    throw new PacketSizeError(`Piece shape does not fit the wire nibble: ${piece.type}`);
  }
  // bit 7: present | bits 6-3: shape nibble | bits 2-1: rotation | bit 0: spare
  writer.writeU8(0x80 | (shapeNibble << 3) | ((piece.rotation & 0x03) << 1));
  writer.writeI8(piece.x);
  writer.writeI8(piece.y);
  const offsets = piece.customOffsets ?? [];
  writer.writeU8(
    (piece.poisoned ? 1 : 0)
    | (piece.bomber ? 2 : 0)
    | (piece.isWildcard ? 4 : 0)
    | (piece.poisoned && piece.poisonVariant ? 8 : 0)
    | (offsets.length > 0 ? 16 : 0)
    | (piece.rotationBlockedNonce ? 32 : 0),
  );
  if (piece.poisoned && piece.poisonVariant) writer.writeU8(piece.poisonVariant);
  if (offsets.length > 0) {
    writer.writeU8(offsets.length);
    for (const [ox, oy] of offsets) {
      writer.writeI8(ox);
      writer.writeI8(oy);
    }
  }
  if (piece.rotationBlockedNonce) writer.writeU8(piece.rotationBlockedNonce);
}

export function readPieceCompact(reader: BinaryReader): GamePiece | null {
  const header = reader.readU8();
  if (header === 0) return null;
  const type = nibbleToShape((header >> 3) & 0x0f);
  const rotation = ((header >> 1) & 0x03) as GamePiece['rotation'];
  const x = reader.readI8();
  const y = reader.readI8();
  const flags = reader.readU8();
  const hasVariant = (flags & 8) !== 0;
  const hasOffsets = (flags & 16) !== 0;
  const hasNonce = (flags & 32) !== 0;
  const poisonVariant = hasVariant ? reader.readU8() : 0;
  const customOffsets: [number, number][] = [];
  if (hasOffsets) {
    const offsetCount = reader.readU8();
    for (let i = 0; i < offsetCount; i += 1) {
      customOffsets.push([reader.readI8(), reader.readI8()]);
    }
  }
  const rotationBlockedNonce = hasNonce ? reader.readU8() : 0;
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

function writeEffectId(writer: BinaryWriter, id: string, kindName: string): void {
  // Runtime ids are `${kind}-${activationTick}` (see pushFieldEffect); encode
  // the structured form as a varint tick and fall back to a literal string.
  const match = new RegExp(`^${kindName}-(\\d+)$`).exec(id);
  if (match) {
    writer.writeU8(1);
    writer.writeVarint(Number(match[1]));
    return;
  }
  writer.writeU8(EFFECT_STRING_LITERAL);
  writer.writeString(id);
}

function readEffectId(reader: BinaryReader, kindName: string): string {
  if (reader.readU8() === 1) return `${kindName}-${reader.readVarint()}`;
  return reader.readString();
}

function writeEffectLabel(writer: BinaryWriter, label: string): void {
  const interned = EFFECT_LABEL_INTERN.indexOf(label);
  if (interned >= 0) {
    writer.writeU8(interned + 1);
    return;
  }
  let match = /^Curtain Def \+(\d+)$/.exec(label);
  if (match) {
    writer.writeU8(EFFECT_LABEL_TEMPLATE_BASE);
    writer.writeVarint(Number(match[1]));
    return;
  }
  match = /^Taxed \(-(\d+)\)$/.exec(label);
  if (match) {
    writer.writeU8(EFFECT_LABEL_TEMPLATE_BASE + 1);
    writer.writeVarint(Number(match[1]));
    return;
  }
  match = /^Siphoned \(\+(\d+)\)$/.exec(label);
  if (match) {
    writer.writeU8(EFFECT_LABEL_TEMPLATE_BASE + 2);
    writer.writeVarint(Number(match[1]));
    return;
  }
  match = /^Magnet \+(\d+)$/.exec(label);
  if (match) {
    writer.writeU8(EFFECT_LABEL_TEMPLATE_BASE + 3);
    writer.writeVarint(Number(match[1]));
    return;
  }
  match = /^Magnet ×(\d+) \(\+(\d+)\)$/.exec(label);
  if (match) {
    writer.writeU8(EFFECT_LABEL_TEMPLATE_BASE + 4);
    writer.writeVarint(Number(match[1]));
    writer.writeVarint(Number(match[2]));
    return;
  }
  writer.writeU8(EFFECT_STRING_LITERAL);
  writer.writeString(label);
}

function readEffectLabel(reader: BinaryReader): string {
  const code = reader.readU8();
  if (code === EFFECT_STRING_LITERAL) return reader.readString();
  if (code >= EFFECT_LABEL_TEMPLATE_BASE) {
    switch (code - EFFECT_LABEL_TEMPLATE_BASE) {
      case 0: return `Curtain Def +${reader.readVarint()}`;
      case 1: return `Taxed (-${reader.readVarint()})`;
      case 2: return `Siphoned (+${reader.readVarint()})`;
      case 3: return `Magnet +${reader.readVarint()}`;
      case 4: {
        const permanent = reader.readVarint();
        const pull = reader.readVarint();
        return `Magnet ×${permanent} (+${pull})`;
      }
      default: throw new Error(`Unknown effect label template code: ${code}`);
    }
  }
  const label = EFFECT_LABEL_INTERN[code - 1];
  if (label === undefined) throw new Error(`Unknown effect label code: ${code}`);
  return label;
}

export function writeEffects(writer: BinaryWriter, effects: readonly ActiveFieldEffect[]): void {
  writer.writeU8(effects.length);
  for (const effect of effects) {
    const kindIndex = FIELD_EFFECT_KINDS.indexOf(effect.kind);
    const resolvedIndex = kindIndex < 0 ? 0 : kindIndex;
    writer.writeU8(resolvedIndex);
    const kindName = FIELD_EFFECT_KINDS[resolvedIndex];
    writeEffectId(writer, effect.id, kindName);
    writeEffectLabel(writer, effect.label);
    if (effect.expiresAtTick === undefined) {
      writer.writeU8(0);
    } else {
      writer.writeU8(1);
      writer.writeVarint(effect.expiresAtTick);
    }
    if (!effect.icon) {
      writer.writeU8(0);
    } else {
      const iconIndex = EFFECT_ICON_INTERN.indexOf(effect.icon);
      if (iconIndex >= 0) {
        writer.writeU8(iconIndex + 1);
      } else {
        writer.writeU8(EFFECT_ICON_LITERAL);
        writer.writeString(effect.icon);
      }
    }
  }
}

/** Relativizes absolute wire expiry ticks against the packet header tick. */
export function readEffects(reader: BinaryReader, headerTick: number): ActiveFieldEffect[] {
  const count = reader.readU8();
  const effects: ActiveFieldEffect[] = [];
  for (let i = 0; i < count; i += 1) {
    const kindIndex = reader.readU8();
    const kind = FIELD_EFFECT_KINDS[kindIndex] ?? 'retrim';
    const id = readEffectId(reader, kind);
    const label = readEffectLabel(reader);
    const hasExpiry = reader.readU8() === 1;
    const expiresAtTickAbs = hasExpiry ? reader.readVarint() : null;
    const iconCode = reader.readU8();
    const icon = iconCode === 0
      ? undefined
      : iconCode === EFFECT_ICON_LITERAL
        ? reader.readString()
        : EFFECT_ICON_INTERN[iconCode - 1];
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
    if (packet.arrivalTick == null) {
      writer.writeU8(0);
    } else {
      writer.writeU8(1);
      writer.writeVarint(packet.arrivalTick);
    }
  }
}

/** Relativizes absolute wire arrival ticks against the packet header tick. */
export function readGarbage(reader: BinaryReader, headerTick: number): PendingGarbagePacket[] {
  const count = reader.readU8();
  const packets: PendingGarbagePacket[] = [];
  for (let i = 0; i < count; i += 1) {
    const lines = reader.readU8();
    const hasArrival = reader.readU8() === 1;
    const arrivalTick = hasArrival ? reader.readVarint() : null;
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
  writer.writeVarint(spread.nextSpreadTick);
  writer.writeU8(spread.variant);
}

/** Relativizes the absolute wire spread tick against the packet header tick. */
export function readPoisonSpread(reader: BinaryReader, headerTick: number): PoisonSpreadState | null {
  if (reader.readU8() === 0) return null;
  const nextSpreadTickAbs = reader.readVarint();
  return {
    generationsRemaining: reader.readU8(),
    nextSpreadTick: Math.max(0, nextSpreadTickAbs - headerTick),
    variant: reader.readU8(),
  };
}

function shopItemCode(itemId: string): number {
  const code = SHOP_ITEM_ID_TO_U8.get(itemId);
  if (code === undefined) {
    throw new PacketSizeError(`Shop item id is not in the wire catalog: ${itemId}`);
  }
  return code;
}

function shopItemIdFromCode(code: number): string {
  const itemId = U8_TO_SHOP_ITEM_ID[code];
  if (itemId === undefined) throw new Error(`Unknown shop item code on wire: ${code}`);
  return itemId;
}

export function writePricing(writer: BinaryWriter, pricing: Record<string, ItemPricingState>): void {
  const ids = Object.keys(pricing);
  writer.writeU8(ids.length);
  for (const itemId of ids) {
    const state = pricing[itemId];
    writer.writeU8(shopItemCode(itemId));
    writer.writeU8(state.level);
    writer.writeU8(state.purchasesInWindow);
    if (state.windowStartedAtTick == null) {
      writer.writeU8(0);
    } else {
      writer.writeU8(1);
      writer.writeVarint(state.windowStartedAtTick);
    }
    const closedBy = state.lastWindowClosedBy;
    if (closedBy === 'allowance') writer.writeU8(1);
    else if (closedBy === 'timer') writer.writeU8(2);
    else writer.writeU8(0);
    writer.writeU8(state.freePurchases ?? 0);
  }
}

export function readPricing(reader: BinaryReader): Record<string, ItemPricingState> {
  const count = reader.readU8();
  const pricing: Record<string, ItemPricingState> = {};
  for (let i = 0; i < count; i += 1) {
    const itemId = shopItemIdFromCode(reader.readU8());
    const level = reader.readU8();
    const purchasesInWindow = reader.readU8();
    const hasWindow = reader.readU8() === 1;
    const windowStartedAtTick = hasWindow ? reader.readVarint() : null;
    const closedFlag = reader.readU8();
    const freePurchases = reader.readU8();
    pricing[itemId] = {
      level,
      purchasesInWindow,
      windowStartedAtTick,
      ...(closedFlag === 1 ? { lastWindowClosedBy: 'allowance' as const } : {}),
      ...(closedFlag === 2 ? { lastWindowClosedBy: 'timer' as const } : {}),
      ...(freePurchases > 0 ? { freePurchases } : {}),
    };
  }
  return pricing;
}

export function writeLocalShop(writer: BinaryWriter, shop: LocalPlayerWire['shop']): void {
  writer.writeU8(SHOP_PHASE_TO_U8[shop.phase]);
  writer.writeU8(shop.offerIds.length);
  for (const offerId of shop.offerIds) writer.writeU8(shopItemCode(offerId));
  writer.writeI16(shop.cycleIndex);
  if (shop.lastPurchasedItemId) {
    writer.writeU8(1);
    writer.writeU8(shopItemCode(shop.lastPurchasedItemId));
  } else {
    writer.writeU8(0);
  }
  writer.writeU8(shop.activeSynergySeeds.length);
  for (const seed of shop.activeSynergySeeds) writer.writeU8(shopItemCode(seed));
  writePricing(writer, shop.pricing);
}

export function readLocalShop(reader: BinaryReader): LocalPlayerWire['shop'] {
  const phase = U8_TO_SHOP_PHASE[reader.readU8()] ?? 'waiting';
  const offerCount = reader.readU8();
  const offerIds: string[] = [];
  for (let i = 0; i < offerCount; i += 1) offerIds.push(shopItemIdFromCode(reader.readU8()));
  const cycleIndex = reader.readI16();
  const lastPurchasedItemId = reader.readU8() === 1 ? shopItemIdFromCode(reader.readU8()) : null;
  const seedCount = reader.readU8();
  const activeSynergySeeds: string[] = [];
  for (let i = 0; i < seedCount; i += 1) activeSynergySeeds.push(shopItemIdFromCode(reader.readU8()));
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
  poisonBoard: readonly (readonly number[])[],
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

/** Dirty-cell nibbles are packed two per byte (low nibble first). */
function writeDirtyNibbleRows(
  writer: BinaryWriter,
  dirtyRows: { y: number; colMask: number; cells: number[] }[],
): void {
  for (const row of dirtyRows) {
    writer.writeU8(row.y);
    writer.writeU16(row.colMask);
    const cells = row.cells;
    for (let i = 0; i < cells.length; i += 2) {
      writer.writeU8((cells[i] & 0x0f) | ((cells[i + 1] ?? 0) << 4));
    }
  }
}

/** Applies packed dirty nibble rows using the caller's per-cell setter. */
function applyDirtyNibbleRows(
  reader: BinaryReader,
  setValue: (rowY: number, x: number, nibble: number) => void,
): void {
  const rowMask = reader.readU32();
  for (let y = 0; y < 32; y += 1) {
    if ((rowMask & (1 << y)) === 0) continue;
    const rowY = reader.readU8();
    const colMask = reader.readU16();
    let pendingNibble = -1;
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if ((colMask & (1 << x)) === 0) continue;
      let nibble: number;
      if (pendingNibble >= 0) {
        nibble = pendingNibble;
        pendingNibble = -1;
      } else {
        const byte = reader.readU8();
        nibble = byte & 0x0f;
        pendingNibble = (byte >> 4) & 0x0f;
      }
      setValue(rowY, x, nibble);
    }
  }
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
  writeDirtyNibbleRows(writer, dirtyRows);
}

export function applyDirtyBoard(
  board: CellValue[][],
  reader: BinaryReader,
): void {
  applyDirtyNibbleRows(reader, (rowY, x, nibble) => {
    if (!board[rowY]) board[rowY] = Array.from({ length: BOARD_COLS }, () => null);
    board[rowY][x] = nibbleToCell(nibble);
  });
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
  writeDirtyNibbleRows(writer, dirtyRows);
}

export function applyDirtyPoison(
  poison: number[][],
  reader: BinaryReader,
): void {
  applyDirtyNibbleRows(reader, (rowY, x, nibble) => {
    if (!poison[rowY]) poison[rowY] = Array.from({ length: BOARD_COLS }, () => 0);
    poison[rowY][x] = nibble;
  });
}

export type LocalMetaDecoded = Omit<
  DecodedLocalPlayerWire,
  'board' | 'poisonBoard' | 'shop' | 'activePiece'
>;

/** Presence-mask bits for optional local meta fields (values are varints). */
const LOCAL_OPT_LANDING_FORECAST = 1 << 0;
const LOCAL_OPT_HOLD_FROZEN = 1 << 1;
const LOCAL_OPT_MAGNET_STACKS = 1 << 2;
const LOCAL_OPT_MAGNET_BOOST = 1 << 3;
const LOCAL_OPT_HARD_DROPPED = 1 << 4;
const LOCAL_OPT_LAST_HARD_DROP = 1 << 5;
const LOCAL_OPT_SNAG_BLOCKED = 1 << 6;
const LOCAL_OPT_SATELLITE_ARMED = 1 << 7;
const LOCAL_OPT_SATELLITE_DELAY = 1 << 8;
const LOCAL_OPT_TECTONIC = 1 << 9;
const LOCAL_OPT_CUSTOM_SOURCES = 1 << 10;

export function writeLocalMeta(writer: BinaryWriter, local: LocalPlayerWire, includeId: boolean): void {
  if (includeId) writer.writeString(local.id);
  writeHeldPiece(writer, local.holdPiece);
  writer.writeBool(local.canHold);
  writer.writeU8(local.nextQueue.length);
  for (const piece of local.nextQueue) writeShape(writer, piece);
  writer.writeVarint(local.score >>> 0);
  writer.writeVarint(local.funds >>> 0);
  writer.writeVarint(local.linesCleared >>> 0);
  writer.writeU8(local.combo);
  writer.writeBool(local.backToBack);
  writeGarbage(writer, local.pendingGarbage);
  writeEffects(writer, local.activeEffects);
  writer.writeBool(local.topOut);
  writer.writeU8(local.swapCutoffRow);
  writer.writeU8(local.curtainDefenseLevel);
  writePoisonSpread(writer, local.poisonSpread);

  let mask = 0;
  if (local.landingForecastAtTick != null) mask |= LOCAL_OPT_LANDING_FORECAST;
  if (local.holdFrozenUntilTick != null) mask |= LOCAL_OPT_HOLD_FROZEN;
  if (local.magnetPermanentStacks != null) mask |= LOCAL_OPT_MAGNET_STACKS;
  if (local.magnetPieceBoost != null) mask |= LOCAL_OPT_MAGNET_BOOST;
  if (local.pieceHasHardDropped) mask |= LOCAL_OPT_HARD_DROPPED;
  if (local.lastHardDropTick != null) mask |= LOCAL_OPT_LAST_HARD_DROP;
  if (local.snagHardDropBlocked) mask |= LOCAL_OPT_SNAG_BLOCKED;
  if (local.satelliteArmed) mask |= LOCAL_OPT_SATELLITE_ARMED;
  if (local.satelliteDelayUntilTick != null) mask |= LOCAL_OPT_SATELLITE_DELAY;
  if (local.tectonicShiftNextStepTick != null) mask |= LOCAL_OPT_TECTONIC;
  const sources = local.customNextPieceSourceCells ?? [];
  if (sources.length > 0) mask |= LOCAL_OPT_CUSTOM_SOURCES;
  writer.writeU16(mask);

  if (mask & LOCAL_OPT_LANDING_FORECAST) writer.writeVarint(local.landingForecastAtTick!);
  if (mask & LOCAL_OPT_HOLD_FROZEN) writer.writeVarint(local.holdFrozenUntilTick!);
  if (mask & LOCAL_OPT_MAGNET_STACKS) writer.writeVarint(local.magnetPermanentStacks!);
  if (mask & LOCAL_OPT_MAGNET_BOOST) writer.writeVarint(local.magnetPieceBoost!);
  if (mask & LOCAL_OPT_LAST_HARD_DROP) writer.writeVarint(local.lastHardDropTick!);
  if (mask & LOCAL_OPT_SATELLITE_DELAY) writer.writeVarint(local.satelliteDelayUntilTick!);
  if (mask & LOCAL_OPT_TECTONIC) writer.writeVarint(local.tectonicShiftNextStepTick!);
  if (mask & LOCAL_OPT_CUSTOM_SOURCES) {
    writer.writeU8(sources.length);
    for (const [sx, sy] of sources) {
      writer.writeU8(sx);
      writer.writeU8(sy);
    }
  }
}

/**
 * Decodes local meta relativized against `headerTick`. With `includeId` the
 * seat id is part of the payload (keyframes); otherwise it is omitted and the
 * caller's existing snapshot keeps its id. The active piece travels in its own
 * section since v4 and is not part of this payload.
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
  const holdPiece = readHeldPiece(reader);
  const canHold = reader.readBool();
  const queueCount = reader.readU8();
  const nextQueue: ShapeType[] = [];
  for (let i = 0; i < queueCount; i += 1) nextQueue.push(readShape(reader));
  const score = reader.readVarint();
  const funds = reader.readVarint();
  const linesCleared = reader.readVarint();
  const combo = reader.readU8();
  const backToBack = reader.readBool();
  const pendingGarbage = readGarbage(reader, headerTick);
  const activeEffects = readEffects(reader, headerTick);
  const topOut = reader.readBool();
  const swapCutoffRow = reader.readU8();
  const curtainDefenseLevel = reader.readU8();
  const poisonSpread = readPoisonSpread(reader, headerTick);
  const mask = reader.readU16();

  const landingForecastAbs = (mask & LOCAL_OPT_LANDING_FORECAST) !== 0 ? reader.readVarint() : null;
  const holdFrozenAbs = (mask & LOCAL_OPT_HOLD_FROZEN) !== 0 ? reader.readVarint() : null;
  const magnetPermanentStacks = (mask & LOCAL_OPT_MAGNET_STACKS) !== 0 ? reader.readVarint() : null;
  const magnetPieceBoost = (mask & LOCAL_OPT_MAGNET_BOOST) !== 0 ? reader.readVarint() : null;
  const lastHardDropTick = (mask & LOCAL_OPT_LAST_HARD_DROP) !== 0 ? reader.readVarint() : null;
  const satelliteDelayAbs = (mask & LOCAL_OPT_SATELLITE_DELAY) !== 0 ? reader.readVarint() : null;
  const tectonicShiftNextStepAbs = (mask & LOCAL_OPT_TECTONIC) !== 0 ? reader.readVarint() : null;
  let customNextPieceSourceCells: [number, number][] | undefined;
  if ((mask & LOCAL_OPT_CUSTOM_SOURCES) !== 0) {
    const sourceCount = reader.readU8();
    customNextPieceSourceCells = [];
    for (let i = 0; i < sourceCount; i += 1) {
      customNextPieceSourceCells.push([reader.readU8(), reader.readU8()]);
    }
  }

  return {
    ...(id === undefined ? {} : { id }),
    landingForecastTicksRemaining: landingForecastAbs === null
      ? undefined
      : Math.max(0, landingForecastAbs - headerTick),
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
    pieceHasHardDropped: (mask & LOCAL_OPT_HARD_DROPPED) !== 0 || undefined,
    lastHardDropTick: lastHardDropTick ?? undefined,
    snagHardDropBlocked: (mask & LOCAL_OPT_SNAG_BLOCKED) !== 0 || undefined,
    satelliteArmed: (mask & LOCAL_OPT_SATELLITE_ARMED) !== 0 || undefined,
    satelliteDelayUntilTick: satelliteDelayAbs === null ? undefined : Math.max(0, satelliteDelayAbs - headerTick),
    tectonicShiftNextStepTick: tectonicShiftNextStepAbs === null
      ? null
      : Math.max(0, tectonicShiftNextStepAbs - headerTick),
    customNextPieceSourceCells,
  };
}

export type OpponentMetaDecoded = Omit<DecodedOpponentPlayerWire, 'board' | 'poisonBoard' | 'activePiece'>;

/** Presence-mask bits for optional opponent meta fields (values are varints). */
const OPP_OPT_TECTONIC = 1 << 0;
const OPP_OPT_MAGNET_STACKS = 1 << 1;
const OPP_OPT_MAGNET_BOOST = 1 << 2;

export function writeOpponentMeta(writer: BinaryWriter, opponent: OpponentPlayerWire, includeId: boolean): void {
  if (includeId) writer.writeString(opponent.id);
  writer.writeVarint(opponent.score >>> 0);
  writer.writeVarint(opponent.funds >>> 0);
  writer.writeVarint(opponent.linesCleared >>> 0);
  writer.writeU8(opponent.combo);
  writer.writeBool(opponent.backToBack);
  writeGarbage(writer, opponent.pendingGarbage);
  writeEffects(writer, opponent.activeEffects);
  writer.writeBool(opponent.topOut);
  writer.writeU8(opponent.swapCutoffRow);
  writer.writeU8(opponent.curtainDefenseLevel);
  writePoisonSpread(writer, opponent.poisonSpread);

  let mask = 0;
  if (opponent.tectonicShiftNextStepTick != null) mask |= OPP_OPT_TECTONIC;
  if (opponent.magnetPermanentStacks != null) mask |= OPP_OPT_MAGNET_STACKS;
  if (opponent.magnetPieceBoost != null) mask |= OPP_OPT_MAGNET_BOOST;
  writer.writeU8(mask);
  if (mask & OPP_OPT_TECTONIC) writer.writeVarint(opponent.tectonicShiftNextStepTick!);
  if (mask & OPP_OPT_MAGNET_STACKS) writer.writeVarint(opponent.magnetPermanentStacks!);
  if (mask & OPP_OPT_MAGNET_BOOST) writer.writeVarint(opponent.magnetPieceBoost!);

  writer.writeBool(opponent.hasHold);
  writer.writeBool(opponent.hasPoison);
}

/**
 * Decodes opponent meta relativized against `headerTick`. With `includeId` the
 * seat id is part of the payload (keyframes); otherwise the caller's existing
 * snapshot keeps its id. The active piece travels in its own section since v4.
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
  const score = reader.readVarint();
  const funds = reader.readVarint();
  const linesCleared = reader.readVarint();
  const combo = reader.readU8();
  const backToBack = reader.readBool();
  const pendingGarbage = readGarbage(reader, headerTick);
  const activeEffects = readEffects(reader, headerTick);
  const topOut = reader.readBool();
  const swapCutoffRow = reader.readU8();
  const curtainDefenseLevel = reader.readU8();
  const poisonSpread = readPoisonSpread(reader, headerTick);
  const mask = reader.readU8();

  const tectonicShiftNextStepAbs = (mask & OPP_OPT_TECTONIC) !== 0 ? reader.readVarint() : null;
  const magnetPermanentStacks = (mask & OPP_OPT_MAGNET_STACKS) !== 0 ? reader.readVarint() : null;
  const magnetPieceBoost = (mask & OPP_OPT_MAGNET_BOOST) !== 0 ? reader.readVarint() : null;

  const hasHold = reader.readBool();
  const hasPoison = reader.readBool();
  return {
    ...(id === undefined ? {} : { id }),
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
