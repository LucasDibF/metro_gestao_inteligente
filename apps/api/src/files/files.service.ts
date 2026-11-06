import { Prisma } from '@prisma/client';
import { optionalText } from '../technical/technical-input';
import { requireFieldWrite } from '../auth/field-access';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { TechnicalService } from '../technical/technical.service';
import { expectedVersion, technicalInput, text } from '../technical/technical-input';
import { coordinateInput, photoDistance } from './coordinates';
import { closePrivateStorage, privateStorage } from './shared-storage';
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
@Injectable()
export class FilesService implements OnApplicationShutdown {
  constructor(
    @Inject(TenantDatabaseService) private readonly db: TenantDatabaseService,
    @Inject(TechnicalService) private readonly technical: TechnicalService,
  ) {}
  onApplicationShutdown(): void {
    closePrivateStorage();
  }
  list(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    transaction?: Prisma.TransactionClient,
  ) {
    return this.db.run(
      c,
      async (tx) => {
        const hole = await this.technical.visibleParent(tx, c, workId, boreholeId),
          where = { tenantId: c.tenantId, workId, boreholeId };
        const coordinates = await tx.boreholeCoordinate.findMany({
            where,
            orderBy: { kind: 'asc' },
          }),
          official = coordinates.find((v) => v.id === hole.officialCoordinateId);
        const photos = await tx.boreholePhoto.findMany({
          where: { ...where, deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 100,
          select: {
            id: true,
            caption: true,
            purpose: true,
            version: true,
            gpsLatitude: true,
            gpsLongitude: true,
            crop: true,
            processingState: true,
            width: true,
            height: true,
            mime: true,
            sizeBytes: true,
            createdAt: true,
          },
        });
        return {
          technicalVersion: hole.technicalVersion,
          officialCoordinateId: hole.officialCoordinateId,
          coordinates,
          photos: photos.map((photo) => {
            const distance =
              official && photo.gpsLatitude !== null && photo.gpsLongitude !== null
                ? photoDistance(official, photo.gpsLatitude, photo.gpsLongitude)
                : null;
            return {
              ...photo,
              distanceM: distance,
              gpsWarning: distance !== null && distance > 10,
            };
          }),
        };
      },
      transaction,
    );
  }
  coordinate(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    kind: 'PLANNED' | 'EXECUTED',
    body: unknown,
    transaction?: Prisma.TransactionClient,
  ) {
    const { version, ...data } = coordinateInput(body);
    return this.db.run(
      c,
      async (tx) => {
        const writableHole = await this.technical.parent(tx, c, workId, boreholeId);
        await requireFieldWrite(tx, c, writableHole.reviewState, workId, kind === 'PLANNED');
        const where = { tenantId: c.tenantId, workId, boreholeId, kind };
        const existing = await tx.boreholeCoordinate.findFirst({ where });
        if ((existing && version !== existing.version) || (!existing && version !== undefined))
          throw new ConflictException({
            code: 'RECORD_VERSION_CONFLICT',
            message: 'Coordinate changed',
          });
        const saved = existing
          ? await tx.boreholeCoordinate.update({
              where: { id: existing.id },
              data: { ...data, version: { increment: 1 } },
            })
          : await tx.boreholeCoordinate.create({ data: { ...where, ...data } });
        const hole = await tx.borehole.findUniqueOrThrow({ where: { id: boreholeId } });
        await tx.technicalEvent.create({
          data: {
            tenantId: c.tenantId,
            workId,
            boreholeId,
            actorId: c.userId,
            technicalVersion: hole.technicalVersion,
            action: 'COORDINATE_UPDATED',
            details: { coordinateId: saved.id, kind },
          },
        });
        return saved;
      },
      transaction,
    );
  }
  official(c: TenantContext, workId: string, boreholeId: string, body: unknown) {
    const v = technicalInput(body, ['coordinateId', 'technicalVersion']);
    const version = expectedVersion(v.technicalVersion);
    if (
      typeof v.coordinateId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.coordinateId)
    )
      throw new BadRequestException('Coordinate required');
    return this.db.run(c, async (tx) => {
      const hole = await this.technical.parent(tx, c, workId, boreholeId);
      await requireFieldWrite(tx, c, hole.reviewState, workId);
      if (hole.technicalVersion !== version)
        throw new ConflictException({
          code: 'RECORD_VERSION_CONFLICT',
          message: 'Technical data changed',
        });
      const coordinate = await tx.boreholeCoordinate.findFirst({
        where: { id: v.coordinateId as string, boreholeId, workId, tenantId: c.tenantId },
      });
      if (!coordinate) throw new NotFoundException('Coordinate unavailable');
      if (coordinate.kind === 'PLANNED')
        await requireFieldWrite(tx, c, hole.reviewState, workId, true);
      const updated = await tx.borehole.update({
        where: { id: boreholeId },
        data: { officialCoordinateId: coordinate.id, version: { increment: 1 } },
      });
      await tx.technicalEvent.create({
        data: {
          tenantId: c.tenantId,
          workId,
          boreholeId,
          actorId: c.userId,
          technicalVersion: updated.technicalVersion,
          action: 'OFFICIAL_COORDINATE_SELECTED',
          details: { coordinateId: coordinate.id },
        },
      });
      return updated;
    });
  }
  async upload(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    file: Express.Multer.File | undefined,
    caption: unknown,
    purpose?: unknown,
  ) {
    await this.db.run(c, async (tx) => {
      const hole = await this.technical.visibleParent(tx, c, workId, boreholeId);
      await requireFieldWrite(tx, c, hole.reviewState, workId);
    });
    const staged = await this.stagePhoto(c, workId, file, caption, purpose);
    try {
      return await this.db.run(c, (tx) => this.commitPhoto(tx, c, workId, boreholeId, staged));
    } catch (error) {
      throw await this.abandonPhoto(staged, error);
    }
  }
  /** Validates the image and writes it under a new key. Call outside any transaction. */
  async stagePhoto(
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
      throw await this.abandonPhoto(staged, error);
    }
    return staged;
  }
  /** Removes only the objects of this staged photo and returns the error for the client. */
  async abandonPhoto(staged: StagedPhoto, error?: unknown): Promise<unknown> {
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
  async commitPhoto(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    boreholeId: string,
    staged: StagedPhoto,
    id?: string,
  ): Promise<{ id: string; version: number }> {
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
  updatePhoto(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    id: string,
    body: unknown,
    deleted = false,
  ) {
    const v = technicalInput(
      body,
      deleted ? ['version'] : ['version', 'caption', 'crop', 'purpose'],
    );
    const version = expectedVersion(v.version);
    let crop: { x: number; y: number; width: number; height: number } | undefined;
    if (!deleted) {
      const raw = technicalInput(v.crop, ['x', 'y', 'width', 'height']);
      if (
        ['x', 'y', 'width', 'height'].some(
          (k) => typeof raw[k] !== 'number' || !Number.isFinite(raw[k]),
        )
      )
        throw new BadRequestException('Invalid crop');
      crop = raw as typeof crop;
      const r = crop!;
      if (
        r.x < 0 ||
        r.y < 0 ||
        r.width <= 0 ||
        r.height <= 0 ||
        r.x + r.width > 1 ||
        r.y + r.height > 1
      )
        throw new BadRequestException('Crop outside image');
    }
    const caption = deleted ? undefined : optionalText(v.caption, 500);
    const purpose = v.purpose === undefined ? undefined : photoPurpose(v.purpose);
    return this.db.run(c, async (tx) => {
      const writableHole = await this.technical.parent(tx, c, workId, boreholeId);
      await requireFieldWrite(tx, c, writableHole.reviewState, workId);
      const where = { id, workId, boreholeId, tenantId: c.tenantId, deletedAt: null };
      const changed = await tx.boreholePhoto.updateMany({
        where: { ...where, version },
        data: deleted
          ? { deletedAt: new Date(), version: { increment: 1 } }
          : { caption, crop, ...(purpose ? { purpose } : {}), version: { increment: 1 } },
      });
      if (!changed.count) {
        if (!(await tx.boreholePhoto.findFirst({ where })))
          throw new NotFoundException('Photo unavailable');
        throw new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Photo changed' });
      }
      return { id, version: version + 1 };
    });
  }
  async download(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    id: string,
    preview: boolean,
  ) {
    const photo = await this.db.run(c, async (tx) => {
      await this.technical.visibleParent(tx, c, workId, boreholeId);
      return tx.boreholePhoto.findFirst({
        where: { id, workId, boreholeId, tenantId: c.tenantId, deletedAt: null },
      });
    });
    if (!photo || photo.processingState !== 'READY')
      throw new NotFoundException('Photo unavailable');
    return {
      body: await privateStorage().get(
        preview ? photo.thumbnailKey : photo.objectKey,
        8 * 1024 * 1024,
      ),
      mime: preview ? 'image/jpeg' : photo.mime,
    };
  }
}

async function inspectPhoto(
  buffer: Buffer,
): Promise<{ mime: string; width: number; height: number }> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' })
      .timeout({ seconds: 5 })
      .metadata();
    if (
      !['jpeg', 'png'].includes(meta.format ?? '') ||
      !meta.width ||
      !meta.height ||
      (meta.pages && meta.pages > 1)
    )
      throw Error();
    return {
      mime: meta.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      width: meta.width,
      height: meta.height,
    };
  } catch {
    throw new BadRequestException(
      'Photo must be a valid single-frame JPEG or PNG, at most 25 megapixels',
    );
  }
}

function photoPurpose(value: unknown) {
  if (value === undefined || value === null || value === '') return 'OTHER';
  if (
    typeof value !== 'string' ||
    !['SITE', 'EXECUTION', 'SAMPLE_1', 'SAMPLE_2', 'OTHER'].includes(value)
  )
    throw new BadRequestException('Invalid photo purpose');
  return value;
}
