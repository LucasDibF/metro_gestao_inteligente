import { PrismaClient } from '@prisma/client';
import { PrivateStorage } from '@spt/private-storage';
import sharp from 'sharp';
import exifr from 'exifr';
import { createHash } from 'node:crypto';
interface PhotoJob {
  id: string;
  tenantId: string;
  workId: string;
  leaseToken: string;
  objectKey: string;
  thumbnailKey: string;
  sha256: string;
}
export async function processNextPhoto(db: PrismaClient, onlyPhotoId?: string): Promise<boolean> {
  const [row] = await db.$queryRaw<
    Array<{ job: PhotoJob | null }>
  >`SELECT claim_photo_job(${onlyPhotoId ?? null}::uuid) AS job`;
  const job = row?.job;
  if (!job) return false;
  let storage: PrivateStorage | undefined,
    permanent = false;
  try {
    storage = new PrivateStorage();
    if (!job.objectKey.startsWith(job.tenantId + '/' + job.workId + '/photos/')) {
      permanent = true;
      throw Error();
    }
    const original = await storage.get(job.objectKey, 8 * 1024 * 1024);
    if (createHash('sha256').update(original).digest('hex') !== job.sha256) {
      permanent = true;
      throw Error();
    }
    let preview: Buffer;
    try {
      preview = await sharp(original, { limitInputPixels: 25000000, failOn: 'warning' })
        .timeout({ seconds: 5 })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      permanent = true;
      throw Error();
    }
    let latitude: number | null = null,
      longitude: number | null = null;
    try {
      const point = await exifr.gps(original);
      if (
        point &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        Math.abs(point.latitude) <= 90 &&
        Math.abs(point.longitude) <= 180
      ) {
        latitude = point.latitude;
        longitude = point.longitude;
      }
    } catch {
      /* GPS absence does not invalidate a photo. */
    }
    await storage.put(job.thumbnailKey, preview, 'image/jpeg');
    const stored = await storage.get(job.thumbnailKey, 8 * 1024 * 1024);
    if (!stored.equals(preview)) throw Error();
    await db.$queryRaw`SELECT finish_photo_job(${job.id}::uuid,${job.leaseToken}::uuid,${latitude}::double precision,${longitude}::double precision)`;
    console.log(
      JSON.stringify({ event: 'photo_job_finished', photoId: job.id, tenantId: job.tenantId }),
    );
  } catch {
    await db.$queryRaw`SELECT fail_photo_job(${job.id}::uuid,${job.leaseToken}::uuid,${permanent})`;
    console.error(JSON.stringify({ event: 'photo_job_failed', photoId: job.id, permanent }));
  } finally {
    storage?.close();
  }
  return true;
}
