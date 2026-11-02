import { optionalText } from '../technical/technical-input';
import { requireFieldWrite } from '../auth/field-access';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrivateStorage } from '@spt/private-storage';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { TechnicalService } from '../technical/technical.service';
import { expectedVersion, technicalInput, text } from '../technical/technical-input';
import { coordinateInput, photoDistance } from './coordinates';
@Injectable()
export class FilesService {
  constructor(
    @Inject(TenantDatabaseService) private readonly db: TenantDatabaseService,
    @Inject(TechnicalService) private readonly technical: TechnicalService,
  ) {}
  private storage() {
    try {
      return new PrivateStorage();
    } catch {
      throw new ServiceUnavailableException('Private storage unavailable');
    }
  }
  list(c: TenantContext, workId: string, boreholeId: string) {
    return this.db.run(c, async (tx) => {
      const hole = await this.technical.parent(tx, c, workId, boreholeId),
        where = { tenantId: c.tenantId, workId, boreholeId };
      const coordinates = await tx.boreholeCoordinate.findMany({ where, orderBy: { kind: 'asc' } }),
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
          return { ...photo, distanceM: distance, gpsWarning: distance !== null && distance > 10 };
        }),
      };
    });
  }
  coordinate(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    kind: 'PLANNED' | 'EXECUTED',
    body: unknown,
  ) {
    const { version, ...data } = coordinateInput(body);
    return this.db.run(c, async (tx) => {
      const writableHole = await this.technical.parent(tx, c, workId, boreholeId);
      await requireFieldWrite(tx, c, writableHole.reviewState, kind === 'PLANNED');
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
    });
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
      await requireFieldWrite(tx, c, hole.reviewState);
      if (hole.technicalVersion !== version)
        throw new ConflictException({
          code: 'RECORD_VERSION_CONFLICT',
          message: 'Technical data changed',
        });
      const coordinate = await tx.boreholeCoordinate.findFirst({
        where: { id: v.coordinateId as string, boreholeId, workId, tenantId: c.tenantId },
      });
      if (!coordinate) throw new NotFoundException('Coordinate unavailable');
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
    const label = optionalText(caption, 500);
    const category = photoPurpose(purpose);
    if (!file || file.size < 1 || file.size > 8 * 1024 * 1024)
      throw new BadRequestException('Photo size limit is 8 MB');
    await this.db.run(c, (tx) => this.technical.parent(tx, c, workId, boreholeId));
    let mime: string, width: number, height: number;
    try {
      const meta = await sharp(file.buffer, { limitInputPixels: 25000000, failOn: 'warning' })
        .timeout({ seconds: 5 })
        .metadata();
      if (
        !['jpeg', 'png'].includes(meta.format ?? '') ||
        !meta.width ||
        !meta.height ||
        (meta.pages && meta.pages > 1)
      )
        throw Error();
      mime = meta.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      width = meta.width;
      height = meta.height;
    } catch {
      throw new BadRequestException(
        'Photo must be a valid single-frame JPEG or PNG, at most 25 megapixels',
      );
    }
    const id = randomUUID(),
      objectKey = `${c.tenantId}/${workId}/photos/${id}/original`,
      thumbnailKey = `${c.tenantId}/${workId}/photos/${id}/preview.jpg`,
      storage = this.storage();
    try {
      await storage.put(objectKey, file.buffer, mime);
      const saved = await this.db.run(c, async (tx) => {
        const writableHole = await this.technical.parent(tx, c, workId, boreholeId);
        await requireFieldWrite(tx, c, writableHole.reviewState);
        if (
          (await tx.boreholePhoto.count({
            where: { tenantId: c.tenantId, workId, boreholeId, deletedAt: null },
          })) >= 100
        )
          throw new BadRequestException('Photo limit reached');
        return tx.boreholePhoto.create({
          data: {
            id,
            tenantId: c.tenantId,
            workId,
            boreholeId,
            objectKey,
            thumbnailKey,
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
            mime,
            sizeBytes: file.size,
            caption: label,
            purpose: category,
            width,
            height,
          },
        });
      });
      return { id: saved.id, version: saved.version };
    } catch (e) {
      await Promise.allSettled([storage.remove(objectKey), storage.remove(thumbnailKey)]);
      throw e;
    } finally {
      storage.close();
    }
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
      await requireFieldWrite(tx, c, writableHole.reviewState);
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
      await this.technical.parent(tx, c, workId, boreholeId);
      return tx.boreholePhoto.findFirst({
        where: { id, workId, boreholeId, tenantId: c.tenantId, deletedAt: null },
      });
    });
    if (!photo || photo.processingState !== 'READY')
      throw new NotFoundException('Photo unavailable');
    const storage = this.storage();
    try {
      return {
        body: await storage.get(preview ? photo.thumbnailKey : photo.objectKey, 8 * 1024 * 1024),
        mime: preview ? 'image/jpeg' : photo.mime,
      };
    } finally {
      storage.close();
    }
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
