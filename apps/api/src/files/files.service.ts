import { Borehole, BoreholeCoordinate, Prisma } from '@prisma/client';
import type { PhotoReference } from '@spt/api-contracts';
import { optionalText } from '../technical/technical-input';
import { isUuid } from '../common/uuid';
import { requireFieldWrite } from '../auth/field-access';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { TechnicalService } from '../technical/technical.service';
import { expectedVersion, technicalInput, text } from '../technical/technical-input';
import { coordinateInput, photoDistance } from './coordinates';
import { BoreholeFilesRows, photoListSelect } from './files-rows';
import { photoPurpose } from './photo-inspection';
import { PhotoStagingService } from './photo-staging.service';
import { closePrivateStorage, privateStorage } from './shared-storage';
@Injectable()
export class FilesService implements OnApplicationShutdown {
  constructor(
    @Inject(TenantDatabaseService) private readonly db: TenantDatabaseService,
    @Inject(TechnicalService) private readonly technical: TechnicalService,
    @Inject(PhotoStagingService) private readonly staging: PhotoStagingService,
  ) {}
  onApplicationShutdown(): void {
    closePrivateStorage();
  }
  list(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<BoreholeFilesRows> {
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
          select: photoListSelect,
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
  ): Promise<BoreholeCoordinate> {
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
  official(c: TenantContext, workId: string, boreholeId: string, body: unknown): Promise<Borehole> {
    const v = technicalInput(body, ['coordinateId', 'technicalVersion']);
    const version = expectedVersion(v.technicalVersion);
    if (!isUuid(v.coordinateId)) throw new BadRequestException('Coordinate required');
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
  ): Promise<PhotoReference> {
    await this.db.run(c, async (tx) => {
      const hole = await this.technical.visibleParent(tx, c, workId, boreholeId);
      await requireFieldWrite(tx, c, hole.reviewState, workId);
    });
    const staged = await this.staging.stage(c, workId, file, caption, purpose);
    try {
      return await this.db.run(c, (tx) => this.staging.commit(tx, c, workId, boreholeId, staged));
    } catch (error) {
      throw await this.staging.abandon(staged, error);
    }
  }
  updatePhoto(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    id: string,
    body: unknown,
    deleted = false,
  ): Promise<PhotoReference> {
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
  ): Promise<{ body: Buffer; mime: string }> {
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
