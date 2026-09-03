import {
  type PublishedPuzzleManifestV1,
  type PublishedPuzzlePackV1,
  type PublishedPuzzleV1,
  encodeCanonicalBytes,
  encodeCanonicalJson,
  hashPuzzlePackBytesV1,
  hashPublishedPuzzlePayload,
  parsePublishedPuzzleManifestV1,
  parsePublishedPuzzlePackV1,
  parsePublishedPuzzleV1,
} from './publishedPuzzle.js';

export {
  type PublishedPuzzleManifestV1,
  type PublishedPuzzlePackRefV1,
  type PublishedPuzzlePackV1,
  type PublishedPuzzleV1,
  type PublishedPuzzlePayloadV1,
  type PublishedPuzzleBaselineV1,
  hashPublishedPuzzlePayload,
  hashPuzzlePackBytesV1,
} from './publishedPuzzle.js';

/**
 * Encode a published puzzle pack to canonical UTF-8 bytes.
 */
export function encodePublishedPuzzlePack(pack: PublishedPuzzlePackV1): Uint8Array {
  return encodeCanonicalBytes(pack);
}

/**
 * Encode a published puzzle manifest as formatted JSON.
 */
export function encodePublishedPuzzleManifest(manifest: PublishedPuzzleManifestV1): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Encode a single published puzzle as canonical JSON string.
 */
export function encodePublishedPuzzle(puzzle: PublishedPuzzleV1): string {
  return encodeCanonicalJson(puzzle as any);
}

/**
 * Hash published puzzle pack bytes using the domain prefix.
 */
export async function hashPublishedPuzzlePackBytes(bytes: Uint8Array): Promise<string> {
  return hashPuzzlePackBytesV1(bytes);
}

/**
 * Strictly decode and verify a published puzzle pack from raw bytes.
 * Validates the pack SHA-256 (if provided), pack structure, and recomputes
 * the contentHash of every embedded puzzle.
 */
export async function decodePublishedPuzzlePack(
  bytes: Uint8Array,
  expectedSha256?: string,
): Promise<PublishedPuzzlePackV1> {
  if (expectedSha256 !== undefined) {
    const computedSha256 = await hashPuzzlePackBytesV1(bytes);
    if (computedSha256 !== expectedSha256) {
      throw new Error(
        `published puzzle pack sha256 mismatch: claimed ${expectedSha256}, computed ${computedSha256}`,
      );
    }
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `failed to parse published puzzle pack JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return parsePublishedPuzzlePackV1(parsed);
}

/**
 * Strictly decode and verify a published puzzle manifest.
 */
export function decodePublishedPuzzleManifest(jsonText: string): PublishedPuzzleManifestV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `failed to parse published puzzle manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return parsePublishedPuzzleManifestV1(parsed);
}

/**
 * Strictly decode and verify a single published puzzle.
 */
export async function decodePublishedPuzzle(jsonText: string): Promise<PublishedPuzzleV1> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `failed to parse published puzzle JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return parsePublishedPuzzleV1(parsed);
}
