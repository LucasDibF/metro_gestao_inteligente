import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PhotoReference } from '@spt/api-contracts';
import { createHash, randomUUID } from 'node:crypto';
import { requireFieldWrite } from '../auth/field-access';
import { TenantContext } from '../database/tenant-database.service';
import { optionalText } from '../technical/technical-input';
import { TechnicalService } from '../technical/technical.service';
import { inspectPhoto, photoPurpose } from './photo-inspection';
import { privateStorage } from './shared-storage';

/** An object already written under its own new key, not yet referenced by any row. */
export interface StagedPhoto {
  objectKey: string;
  thumbnailKey: string;
  sha256: string;
  mime: string;
  sizeBytes: number;
  caption: string;
  purpose: string;
  width: number;
  height: number;
}

/**
 * A photo upload in three steps: stage writes the validated image under a new key outside any
 * transaction, commit references it from a row, and abandon removes the objects of a failed upload.
 */
@Injectable()
export class PhotoStagingService {
  constructor(@Inject(TechnicalService) private readonly technical: TechnicalService) {}
  /** Validates the image and writes it under a new key. Call outside any transaction. */
  async stage(
    c: TenantContext,
    workId: string,
    file: Express.Multer.File | undefined,
    caption: unknown,
    purpose?: unknown,
  ): Promise<StagedPhoto> {
    const label = optionalText(caption, 500);
    const category = photoPurpose(purpose);
    if (!file || file.size < 1 || file.size > 8 * 1024 * 1024)
      throw new BadRequestException('Photo size limit is 8 MB');
    const image = await inspectPhoto(file.buffer);
    // Never derived from client input: a repeated ID must not overwrite a stored object.
    const prefix = `${c.tenantId}/${workId}/photos/${randomUUID()}`;
    const staged: StagedPhoto = {
      ...image,
      objectKey: `${prefix}/original`,
      thumbnailKey: `${prefix}/preview.jpg`,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      sizeBytes: file.size,
      caption: label,
      purpose: category,
    };
    const storage = privateStorage();
    try {
      await storage.put(staged.objectKey, file.buffer, staged.mime);
    } catch (error) {
      throw await this.abandon(staged, error);
    }
    return staged;
  }
  /** Removes only the objects of this staged photo and returns the error for the client. */
  async abandon(staged: StagedPhoto, error?: unknown): Promise<unknown> {
    const storage = privateStorage();
    await Promise.allSettled([
      storage.remove(staged.objectKey),
      storage.remove(staged.thumbnailKey),
    ]);
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      ? new ConflictException({
          code: 'PHOTO_ID_CONFLICT',
          message: 'Photo identifier already used',
        })
      : error;
  }
  async commit(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    boreholeId: string,
    staged: StagedPhoto,
    id?: string,
  ): Promise<PhotoReference> {
    const hole = await this.technical.parent(tx, c, workId, boreholeId);
    await requireFieldWrite(tx, c, hole.reviewState, workId);
    if (
      (await tx.boreholePhoto.count({
        where: { tenantId: c.tenantId, workId, boreholeId, deletedAt: null },
      })) >= 100
    )
      throw new BadRequestException('Photo limit reached');
    const saved = await tx.boreholePhoto.create({
      data: { ...(id ? { id } : {}), tenantId: c.tenantId, workId, boreholeId, ...staged },
    });
    return { id: saved.id, version: saved.version };
  }
}
