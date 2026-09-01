import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  getR2ConfigFromEnv,
  R2ReplayStore,
  type R2Config,
} from './r2ReplayStore.js';
import { decodeReplayFile, encodeReplayFile } from '../../src/replayCodec.js';
import type { ReplayData, ReplayDataV2 } from '../../src/types.js';

describe('R2ReplayStore', () => {
  it('reads config from environment variables correctly', () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.R2_BUCKET_NAME;
      delete process.env.R2_ENDPOINT;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      delete process.env.R2_REGION;

      assert.equal(getR2ConfigFromEnv(), null);

      process.env.R2_BUCKET_NAME = 'test-bucket';
      assert.equal(getR2ConfigFromEnv(), null);

      process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
      assert.equal(getR2ConfigFromEnv(), null);

      process.env.R2_ACCESS_KEY_ID = 'test-access-key';
      assert.equal(getR2ConfigFromEnv(), null);

      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
      const config = getR2ConfigFromEnv();
      assert.ok(config);
      assert.equal(config.bucketName, 'test-bucket');
      assert.equal(config.endpoint, 'https://example.r2.cloudflarestorage.com');
      assert.equal(config.accessKeyId, 'test-access-key');
      assert.equal(config.secretAccessKey, 'test-secret-key');
      assert.equal(config.region, 'auto');

      process.env.R2_REGION = 'wnam';
      const customRegionConfig = getR2ConfigFromEnv();
      assert.equal(customRegionConfig?.region, 'wnam');
    } finally {
      process.env = originalEnv;
    }
  });

  it('reports unconfigured state when config is null', async () => {
    const store = new R2ReplayStore(null);
    assert.equal(store.isConfigured(), false);

    const result = await store.uploadReplay('replay_test.replay', new Uint8Array([1, 2, 3]));
    assert.equal(result.success, false);
  });

  it('dispatches PutObjectCommand with gzip compression and metadata', async () => {
    let capturedCommand: PutObjectCommand | null = null;

    const fakeClient = {
      send: async (command: PutObjectCommand) => {
        capturedCommand = command;
        return {};
      },
    } as unknown as S3Client;

    const testConfig: R2Config = {
      bucketName: 'shape-showdown-production-replays',
      endpoint: 'https://test.r2.cloudflarestorage.com',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    };

    const store = new R2ReplayStore(testConfig, fakeClient);
    assert.equal(store.isConfigured(), true);

    const sampleReplay: ReplayData = {
      version: 2,
      date: '2026-08-29_120000',
      seed: 42,
      initialState: {} as any,
      inputs: [],
      keyframes: [],
      events: [],
    };

    const compressed = await encodeReplayFile(sampleReplay);
    const result = await store.uploadReplay('replay_2026-08-29_120000.replay', compressed, {
      matchId: 'match-123',
    });

    assert.equal(result.success, true);
    assert.equal(result.key, 'replays/replay_2026-08-29_120000.replay');
    assert.equal(result.bucket, 'shape-showdown-production-replays');

    assert.ok(capturedCommand);
    const input = (capturedCommand as PutObjectCommand).input;
    assert.equal(input.Bucket, 'shape-showdown-production-replays');
    assert.equal(input.Key, 'replays/replay_2026-08-29_120000.replay');
    assert.equal(input.ContentType, 'application/json');
    assert.equal(input.ContentEncoding, 'gzip');
    assert.deepEqual(input.Metadata, { matchId: 'match-123' });

    // Verify the body decompresses back to original JSON
    const decompressed = await decodeReplayFile(input.Body as Uint8Array) as ReplayDataV2;
    assert.equal(decompressed.date, '2026-08-29_120000');
    assert.equal(decompressed.seed, 42);
  });

  it('isolates S3 failures and returns failure without throwing', async () => {
    const errorClient = {
      send: async () => {
        throw new Error('S3 503 Service Unavailable');
      },
    } as unknown as S3Client;

    const testConfig: R2Config = {
      bucketName: 'shape-showdown-production-replays',
      endpoint: 'https://test.r2.cloudflarestorage.com',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    };

    const store = new R2ReplayStore(testConfig, errorClient);
    const result = await store.uploadReplay('replay_fail.replay', new Uint8Array([1, 2, 3]));

    assert.equal(result.success, false);
    assert.equal(result.key, 'replays/replay_fail.replay');
    assert.ok(result.error instanceof Error);
    assert.equal((result.error as Error).message, 'S3 503 Service Unavailable');
  });
});
