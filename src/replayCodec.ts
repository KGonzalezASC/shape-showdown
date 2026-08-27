import type { ReplayData } from './types';

const GZIP_MAGIC_1 = 0x1f;
const GZIP_MAGIC_2 = 0x8b;
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

declare const Bun: {
  gzipSync: (data: string, options?: { level?: number }) => Uint8Array;
} | undefined;

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/** Gzip magic `1f 8b` marks a compressed `.replay` written by encodeReplayFile. */
function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_1 && bytes[1] === GZIP_MAGIC_2;
}

/** Legacy `.replay` files are uncompressed UTF-8 JSON starting with `{` (optionally after a BOM). */
function isLegacyJson(bytes: Uint8Array): boolean {
  let offset = 0;
  if (
    bytes.length >= UTF8_BOM.length
    && bytes[0] === UTF8_BOM[0]
    && bytes[1] === UTF8_BOM[1]
    && bytes[2] === UTF8_BOM[2]
  ) {
    offset = UTF8_BOM.length;
  }
  return bytes.length > offset && bytes[offset] === 0x7b; // '{'
}

function parseReplayJson(text: string): ReplayData {
  try {
    return JSON.parse(text) as ReplayData;
  } catch {
    throw new Error('Invalid replay file: content is not valid JSON.');
  }
}

/**
 * Encodes a replay into the on-disk `.replay` format: gzip-compressed UTF-8 JSON.
 * The first two bytes are the gzip magic `1f 8b`, which decodeReplayFile sniffs.
 *
 * Server-only in practice (GameManager capture); gzip-9 via Bun on the server,
 * falling back to the web-standard CompressionStream elsewhere. Returns a
 * promise so callers can chain it onto the existing async save path — gzip CPU
 * never runs inside the 60 Hz simulation tick.
 */
export async function encodeReplayFile(replay: ReplayData): Promise<Uint8Array> {
  const json = JSON.stringify(replay);
  if (typeof Bun !== 'undefined' && typeof Bun.gzipSync === 'function') {
    return Bun.gzipSync(json, { level: 9 });
  }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decodes `.replay` bytes written by encodeReplayFile, or legacy uncompressed
 * UTF-8 JSON (a file that starts with `{`, optionally after a UTF-8 BOM).
 *
 * Invalid gzip or invalid JSON is a failed load with a clear error, never a
 * silent partial object.
 */
export async function decodeReplayFile(bytes: Uint8Array | ArrayBuffer): Promise<ReplayData> {
  const data = toUint8Array(bytes);
  let text: string;
  if (isGzip(data)) {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } catch {
      throw new Error('Invalid replay file: gzip stream could not be decompressed.');
    }
  } else if (isLegacyJson(data)) {
    text = new TextDecoder().decode(data);
  } else {
    throw new Error('Invalid replay file: expected gzip magic (1f 8b) or JSON text starting with `{`.');
  }
  return parseReplayJson(text);
}
