import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { logError, logInfo } from '../observability/logger.js';

export interface R2Config {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export interface ReplayUploadResult {
  success: boolean;
  key: string;
  bucket: string;
  error?: unknown;
}

export function getR2ConfigFromEnv(): R2Config | null {
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const region = process.env.R2_REGION?.trim() || 'auto';

  if (!bucketName || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { bucketName, endpoint, accessKeyId, secretAccessKey, region };
}

export class R2ReplayStore {
  private readonly client: S3Client | null = null;
  private readonly config: R2Config | null = null;

  constructor(config?: R2Config | null, client?: S3Client) {
    this.config = config !== undefined ? config : getR2ConfigFromEnv();
    if (client) {
      this.client = client;
    } else if (this.config) {
      this.client = new S3Client({
        region: this.config.region || 'auto',
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });
    }
  }

  public isConfigured(): boolean {
    return this.client !== null && this.config !== null;
  }

  public async uploadReplay(
    filename: string,
    compressedBytes: Uint8Array,
    metadata?: Record<string, string>,
  ): Promise<ReplayUploadResult> {
    if (!this.client || !this.config) {
      return { success: false, key: filename, bucket: '' };
    }

    const bucket = this.config.bucketName;
    const key = filename.startsWith('replays/') ? filename : `replays/${filename}`;

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: compressedBytes,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        Metadata: metadata,
      });

      await this.client.send(command);

      logInfo('r2_replay_uploaded', {
        bucket,
        key,
        bytes: compressedBytes.byteLength,
      });

      return { success: true, key, bucket };
    } catch (error) {
      logError('r2_replay_upload_failed', error, {
        bucket,
        key,
        bytes: compressedBytes.byteLength,
      });
      return { success: false, key, bucket, error };
    }
  }
}

let defaultR2Store: R2ReplayStore | null = null;

export function getDefaultR2ReplayStore(): R2ReplayStore {
  if (!defaultR2Store) {
    defaultR2Store = new R2ReplayStore();
  }
  return defaultR2Store;
}

export function setDefaultR2ReplayStoreForTests(store: R2ReplayStore | null): void {
  defaultR2Store = store;
}
