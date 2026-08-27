import { MAX_PACKET_BYTES } from './version.js';

export function toArrayBuffer(payload: unknown): ArrayBuffer {
  if (payload instanceof ArrayBuffer) return payload;
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength,
    ) as ArrayBuffer;
  }
  throw new Error('Expected binary packet payload');
}

export class PacketSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacketSizeError';
  }
}

export class BinaryWriter {
  private buffer: Uint8Array;
  private offset = 0;

  constructor(capacity = 4096) {
    this.buffer = new Uint8Array(capacity);
  }

  get position(): number {
    return this.offset;
  }

  private ensure(bytes: number): void {
    if (this.offset + bytes > MAX_PACKET_BYTES) {
      throw new PacketSizeError(`Packet would exceed ${MAX_PACKET_BYTES} bytes`);
    }
    if (this.offset + bytes > this.buffer.length) {
      const next = new Uint8Array(Math.min(MAX_PACKET_BYTES, Math.max(this.buffer.length * 2, this.offset + bytes)));
      next.set(this.buffer.subarray(0, this.offset));
      this.buffer = next;
    }
  }

  writeU8(value: number): void {
    this.ensure(1);
    this.buffer[this.offset++] = value & 0xff;
  }

  writeU16(value: number): void {
    this.ensure(2);
    this.buffer[this.offset++] = value & 0xff;
    this.buffer[this.offset++] = (value >> 8) & 0xff;
  }

  writeU32(value: number): void {
    this.ensure(4);
    this.buffer[this.offset++] = value & 0xff;
    this.buffer[this.offset++] = (value >> 8) & 0xff;
    this.buffer[this.offset++] = (value >> 16) & 0xff;
    this.buffer[this.offset++] = (value >> 24) & 0xff;
  }

  writeI16(value: number): void {
    this.writeU16(value < 0 ? 0x10000 + value : value);
  }

  writeBool(value: boolean): void {
    this.writeU8(value ? 1 : 0);
  }

  writeI8(value: number): void {
    this.writeU8(value < 0 ? 0x100 + value : value);
  }

  /** Resets the write cursor so the writer can be reused as a scratch buffer. */
  reset(): void {
    this.offset = 0;
  }

  /** Unsigned LEB128 varint; rejects negative or >32-bit values. */
  writeVarint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new PacketSizeError(`Varint out of range: ${value}`);
    }
    let v = value;
    do {
      let byte = v % 0x80;
      v = Math.floor(v / 0x80);
      if (v > 0) byte |= 0x80;
      this.writeU8(byte);
    } while (v > 0);
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  writeString(value: string): void {
    const encoded = new TextEncoder().encode(value);
    if (encoded.length > 255) {
      throw new PacketSizeError(`String too long: ${value.length}`);
    }
    this.writeU8(encoded.length);
    this.writeBytes(encoded);
  }

  /** Returns an immutable copy of the written slice. */
  finish(): ArrayBuffer {
    return this.buffer.slice(0, this.offset).buffer;
  }
}

export class BinaryReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  private ensure(bytes: number): void {
    if (this.offset + bytes > this.view.byteLength) {
      throw new Error('Unexpected end of packet');
    }
  }

  readU8(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  readU16(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readU32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readI16(): number {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readI8(): number {
    const value = this.readU8();
    return value >= 0x80 ? value - 0x100 : value;
  }

  /** Unsigned LEB128 varint; mirrors {@link BinaryWriter.writeVarint}. */
  readVarint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (shift > 28) throw new Error('Varint too long');
      const byte = this.readU8();
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    if (result > 0xffffffff) throw new Error('Varint exceeds 32 bits');
    return result >>> 0;
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readBytes(length: number): Uint8Array {
    this.ensure(length);
    const slice = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return slice;
  }

  readString(): string {
    const length = this.readU8();
    return new TextDecoder().decode(this.readBytes(length));
  }
}
