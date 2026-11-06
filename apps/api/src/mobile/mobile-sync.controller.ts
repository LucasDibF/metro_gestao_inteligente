import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  Jsonified,
  MobileOperationLookup,
  MobileOperationReceipt,
  MobilePhotoReceipt,
} from '@spt/api-contracts';
import { AuthRequest } from '../auth/auth.guard';
import { isUuid } from '../common/uuid';
import { requireFieldWrite } from '../auth/field-access';
import { Roles } from '../auth/roles.guard';
import { TenantDatabaseService, TenantContext } from '../database/tenant-database.service';
import { TechnicalService } from '../technical/technical.service';
import { SptService } from '../spt/spt.service';
import { parseSpt } from '../spt/spt-input';
import { FilesService } from '../files/files.service';
import { technicalInput } from '../technical/technical-input';
import { MobileOperationResultRows, MobileReceiptRows, MobileSnapshotRows } from './mobile-rows';

@Roles('OPERATOR')
@Controller('obras/:workId/furos/:boreholeId/mobile')
export class MobileSyncController {
  constructor(
    @Inject(TenantDatabaseService) private readonly db: TenantDatabaseService,
    @Inject(TechnicalService) private readonly technical: TechnicalService,
    @Inject(SptService) private readonly spt: SptService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  private async requireAssignment(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    w: string,
  ): Promise<void> {
    // The mobile scope is always assignment-only, even for combined roles.
    if (
      !(await tx.workAssignment.findFirst({
        where: { workId: w, tenantId: c.tenantId, operatorId: c.userId, active: true },
      }))
    )
      throw new NotFoundException('Work unavailable');
  }
  private requestHash(id: unknown, request: unknown): string {
    if (!isUuid(id)) throw new BadRequestException('Invalid operation ID');
    return createHash('sha256').update(JSON.stringify(request)).digest('hex');
  }
  /** The stored receipt is the JSON response of the first request with this operation ID. */
  private async previousResponse<Receipt>(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    w: string,
    b: string,
    id: string,
    hash: string,
  ): Promise<{ response: Receipt } | null> {
    const rows = await tx.$queryRaw<
      Array<{ request_hash: string; response: Receipt; work_id: string; borehole_id: string }>
    >`SELECT request_hash,response,work_id,borehole_id FROM mobile_operations WHERE tenant_id=${c.tenantId}::uuid AND user_id=${c.userId}::uuid AND operation_id=${id}::uuid`;
    if (!rows.length) return null;
    const previous = rows[0];
    if (previous.request_hash !== hash || previous.work_id !== w || previous.borehole_id !== b)
      throw new ConflictException({
        code: 'OPERATION_REUSED',
        message: 'Operation ID reused with different data',
      });
    return { response: previous.response };
  }
  private async receipt<Result>(
    c: TenantContext,
    w: string,
    b: string,
    id: unknown,
    request: unknown,
    action: (tx: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Jsonified<Result>> {
    const hash = this.requestHash(id, request);
    const operationId = id as string;
    return this.db.run(c, async (tx) => {
      await this.requireAssignment(tx, c, w);
      await this.technical.parent(tx, c, w, b);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c.tenantId + ':' + c.userId + ':' + operationId}, 0))`;
      const previous = await this.previousResponse<Jsonified<Result>>(
        tx,
        c,
        w,
        b,
        operationId,
        hash,
      );
      if (previous) return previous.response;
      const result = await action(tx);
      const response = JSON.stringify(result);
      await tx.$executeRaw`INSERT INTO mobile_operations(tenant_id,user_id,operation_id,work_id,borehole_id,request_hash,response) VALUES(${c.tenantId}::uuid,${c.userId}::uuid,${operationId}::uuid,${w}::uuid,${b}::uuid,${hash},${response}::jsonb)`;
      // The parsed text is the JSON form of the result, exactly what a replay returns.
      return JSON.parse(response) as Jsonified<Result>;
    });
  }
  @Get('snapshot') snapshot(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
  ): Promise<MobileSnapshotRows> {
    return this.db.run(r.identity, async (tx) => {
      await this.requireAssignment(tx, r.identity, w);
      const technical = await this.technical.get(r.identity, w, b, tx);
      const files = await this.files.list(r.identity, w, b, tx);
      return {
        technical: {
          ...technical,
          events: [],
          hole: { ...technical.hole, reviewerName: null, reviewerRegistration: null },
        },
        files,
      };
    });
  }
  @Get('operacoes/:operationId') lookup(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Param('operationId', ParseUUIDPipe) id: string,
  ): Promise<MobileOperationLookup> {
    return this.db.run(r.identity, async (tx) => {
      await this.requireAssignment(tx, r.identity, w);
      await this.technical.visibleParent(tx, r.identity, w, b);
      const rows = await tx.$queryRaw<
        Array<{ response: MobileOperationReceipt | MobilePhotoReceipt }>
      >`SELECT response FROM mobile_operations WHERE tenant_id=${r.identity.tenantId}::uuid AND user_id=${r.identity.userId}::uuid AND operation_id=${id}::uuid AND work_id=${w}::uuid AND borehole_id=${b}::uuid`;
      return { receipt: rows[0]?.response ?? null };
    });
  }
  @Post('operacoes') apply(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() raw: unknown,
  ): Promise<MobileOperationReceipt> {
    const v = technicalInput(raw, [
      'operationId',
      'kind',
      'payload',
      'recordId',
      'expectedTechnicalVersion',
    ]);
    if (v.recordId !== undefined && !isUuid(v.recordId))
      throw new BadRequestException('Invalid record ID');
    return this.receipt(
      r.identity,
      w,
      b,
      v.operationId,
      v,
      async (tx): Promise<MobileReceiptRows<MobileOperationResultRows>> => {
        const current = await this.technical.parent(tx, r.identity, w, b);
        if (
          !Number.isSafeInteger(v.expectedTechnicalVersion) ||
          current.technicalVersion !== v.expectedTechnicalVersion
        )
          throw new ConflictException({
            code: 'RECORD_VERSION_CONFLICT',
            message: 'Field data changed',
          });
        let result: MobileOperationResultRows;
        switch (v.kind) {
          case 'METRE':
            result = await this.spt.save(
              r.identity,
              w,
              b,
              parseSpt(v.payload, Boolean(v.recordId)),
              v.recordId as string | undefined,
              tx,
            );
            break;
          case 'FIELDS':
            result = await this.technical.fields(r.identity, w, b, v.payload, tx);
            break;
          case 'COORDINATE':
            result = await this.files.coordinate(r.identity, w, b, 'EXECUTED', v.payload, tx);
            break;
          case 'SUBMIT':
            result = await this.technical.review(r.identity, w, b, v.payload, 'submit', tx);
            break;
          default:
            throw new BadRequestException('Invalid mobile operation');
        }
        const state = await this.technical.parent(tx, r.identity, w, b);
        return { result, technicalVersion: state.technicalVersion, reviewState: state.reviewState };
      },
    );
  }
  @Post('fotografias')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4 } }),
  )
  async photo(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() v: Record<string, unknown>,
  ): Promise<MobilePhotoReceipt> {
    if (!file) throw new BadRequestException('Photo required');
    technicalInput(v, ['operationId', 'caption', 'purpose', 'expectedTechnicalVersion']);
    const c = r.identity;
    const request = { ...v, sha256: createHash('sha256').update(file.buffer).digest('hex') };
    const hash = this.requestHash(v.operationId, request);
    const operationId = v.operationId as string;
    const staleVersion = (technicalVersion: number) =>
      !/^[1-9]\d*$/.test(String(v.expectedTechnicalVersion)) ||
      technicalVersion !== Number(v.expectedTechnicalVersion);
    const conflict = () =>
      new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Field data changed' });
    // A short read refuses or replays the request before any image work or storage write.
    const replay = await this.db.run(c, async (tx) => {
      await this.requireAssignment(tx, c, w);
      const hole = await this.technical.visibleParent(tx, c, w, b);
      const previous = await this.previousResponse<MobilePhotoReceipt>(
        tx,
        c,
        w,
        b,
        operationId,
        hash,
      );
      if (previous) return previous;
      if (staleVersion(hole.technicalVersion)) throw conflict();
      await requireFieldWrite(tx, c, hole.reviewState, w);
      return null;
    });
    if (replay) return replay.response;
    // Image validation and the upload stay outside the transaction that locks the work.
    const staged = await this.files.stagePhoto(c, w, file, v.caption, v.purpose);
    let referenced = false;
    try {
      const response = await this.receipt(c, w, b, operationId, request, async (tx) => {
        const current = await this.technical.parent(tx, c, w, b);
        if (staleVersion(current.technicalVersion)) throw conflict();
        const result = await this.files.commitPhoto(tx, c, w, b, staged, operationId);
        referenced = true;
        const state = await this.technical.parent(tx, c, w, b);
        return { result, technicalVersion: state.technicalVersion, reviewState: state.reviewState };
      });
      // A concurrent retry committed first: its receipt won and this object is an orphan.
      if (!referenced) await this.files.abandonPhoto(staged);
      return response;
    } catch (error) {
      throw await this.files.abandonPhoto(staged, error);
    }
  }
}
