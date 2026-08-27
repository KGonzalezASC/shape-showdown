import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeReplayFile, encodeReplayFile } from './replayCodec';
import type { ReplayDataV2 } from './types';

function sampleReplay(): ReplayDataV2 {
  return {
    version: 2,
    date: '2026-08-27',
    seed: 42,
    playerSlots: { p1: 0, p2: 1 },
    initialState: {} as ReplayDataV2['initialState'],
    inputs: [],
    keyframes: [
      { tick: 0, players: { p1: { id: 'p1', score: 0 } as never } },
      { tick: 10, players: { p1: { id: 'p1', score: 100 } as never } },
    ],
    events: [
      { tick: 10, type: 'topOut', playerId: 'p1' },
    ],
  };
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function withBom(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length + 3);
  out[0] = 0xef;
  out[1] = 0xbb;
  out[2] = 0xbf;
  out.set(bytes, 3);
  return out;
}

describe('replay file codec', () => {
  it('round-trips a v2 replay through encode then decode to the same object', async () => {
    const replay = sampleReplay();
    const encoded = await encodeReplayFile(replay);
    const decoded = await decodeReplayFile(encoded);
    assert.deepEqual(decoded, replay);
  });

  it('writes standard gzip bytes that are smaller than the UTF-8 JSON', async () => {
    const replay = sampleReplay();
    const encoded = await encodeReplayFile(replay);
    const utf8 = utf8Bytes(JSON.stringify(replay));

    assert.equal(encoded[0], 0x1f);
    assert.equal(encoded[1], 0x8b);
    assert.ok(encoded.length < utf8.length, 'gzip output should be smaller than UTF-8 JSON');
  });

  it('decodes legacy uncompressed JSON that starts with `{`', async () => {
    const replay = sampleReplay();
    const decoded = await decodeReplayFile(utf8Bytes(JSON.stringify(replay)));
    assert.deepEqual(decoded, replay);
  });

  it('decodes legacy uncompressed JSON that starts with a UTF-8 BOM', async () => {
    const replay = sampleReplay();
    const decoded = await decodeReplayFile(withBom(utf8Bytes(JSON.stringify(replay))));
    assert.deepEqual(decoded, replay);
  });

  it('rejects a truncated gzip stream', async () => {
    const encoded = await encodeReplayFile(sampleReplay());
    const truncated = encoded.subarray(0, Math.floor(encoded.length / 2));
    await assert.rejects(
      () => decodeReplayFile(truncated),
      /Invalid replay file/,
    );
  });

  it('rejects bytes that are neither gzip magic nor JSON', async () => {
    await assert.rejects(
      () => decodeReplayFile(utf8Bytes('not a replay at all')),
      /Invalid replay file/,
    );
  });

  it('rejects an empty buffer', async () => {
    await assert.rejects(
      () => decodeReplayFile(new Uint8Array(0)),
      /Invalid replay file/,
    );
  });

  it('rejects gzip that decompresses to non-JSON text', async () => {
    const gzipNonJson = new Uint8Array(
      await new Response(
        new Blob(['just some text']).stream().pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    );
    await assert.rejects(
      () => decodeReplayFile(gzipNonJson),
      /Invalid replay file/,
    );
  });
});
