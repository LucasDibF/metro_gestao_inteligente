import 'dotenv/config';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
} from '@aws-sdk/client-s3';
async function main() {
  const endpoint = new URL(process.env.S3_ENDPOINT ?? '');
  if (
    !['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
    process.env.NODE_ENV === 'production'
  )
    throw Error('Local storage provisioning only');
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)
    throw Error('Storage configuration required');
  const s3 = new S3Client({
    endpoint: endpoint.href,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
  });
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        break;
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
          break;
        if (attempt === 9) throw e;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
        throw e;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    await s3.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: 'Enabled' },
      }),
    );
    console.log('Private local storage configured with object versioning');
  } finally {
    s3.destroy();
  }
}
main().catch(() => {
  console.error('Local storage provisioning failed');
  process.exitCode = 1;
});
