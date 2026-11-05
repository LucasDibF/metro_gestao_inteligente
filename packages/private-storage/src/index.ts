import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
/** Any failed storage operation. The cause stays out of the message so it never reaches a client. */
export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Private storage unavailable', { cause });
    this.name = 'StorageUnavailableError';
  }
}
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw new StorageUnavailableError(cause);
  }
}
export class PrivateStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor() {
    const { S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } =
      process.env;
    if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
      throw new Error('Private storage is not configured');
    if (S3_ENDPOINT) {
      const endpoint = new URL(S3_ENDPOINT);
      if (
        endpoint.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          ['localhost', '127.0.0.1'].includes(endpoint.hostname)
        )
      )
        throw new Error('Storage endpoint must use HTTPS');
    }
    this.bucket = S3_BUCKET;
    this.client = new S3Client({
      region: S3_REGION ?? 'us-east-1',
      endpoint: S3_ENDPOINT,
      forcePathStyle: !!S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
      requestHandler: { requestTimeout: 15000, connectionTimeout: 3000 },
    });
  }
  async put(key: string, body: Buffer, mime: string) {
    await guarded(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: mime,
          Metadata: { sha256: createHash('sha256').update(body).digest('hex') },
        }),
      ),
    );
  }
  async get(key: string, maxBytes = 20 * 1024 * 1024) {
    return guarded(async () => {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body || !result.ContentLength || result.ContentLength > maxBytes)
        throw new Error('Invalid stored object size');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('Stored object limit exceeded');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    });
  }
  async head(key: string) {
    return guarded(() =>
      this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })),
    );
  }
  async remove(key: string) {
    await guarded(() =>
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
    );
  }
  close() {
    this.client.destroy();
  }
}
