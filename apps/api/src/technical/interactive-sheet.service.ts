import { reportCompany } from '../reports/report-identity';
import { reportSoilDescription } from '../reports/report-soil-description';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  renderInteractiveProfile,
  TEMPLATE_VERSION,
  profileTermination,
  type ReportSnapshot,
} from '@spt/report-templates';
import { TenantDatabaseService, type TenantContext } from '../database/tenant-database.service';
import { TechnicalService } from './technical.service';
@Injectable()
export class InteractiveSheetService {
  constructor(
    @Inject(TenantDatabaseService) private readonly db: TenantDatabaseService,
    @Inject(TechnicalService) private readonly technical: TechnicalService,
  ) {}
  get(c: TenantContext, workId: string, boreholeId: string, renderSheet = true) {
    return this.db.run(c, async (tx) => {
      const hole = await this.technical.visibleParent(tx, c, workId, boreholeId);
      const work = await tx.work.findFirstOrThrow({
        where: { id: workId, tenantId: c.tenantId, deletedAt: null },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: c.tenantId } });
      const scope = { tenantId: c.tenantId, workId, boreholeId };
      const tests = await tx.sptTest.findMany({
        where: scope,
        orderBy: { depthM: 'asc' },
        take: 1001,
      });
      const layers = await tx.soilLayer.findMany({
        where: scope,
        orderBy: { fromM: 'asc' },
        take: 1001,
      });
      const coordinate = hole.officialCoordinateId
        ? await tx.boreholeCoordinate.findFirst({
            where: { ...scope, id: hole.officialCoordinateId },
          })
        : null;
      const photos = await tx.boreholePhoto.findMany({
        where: { ...scope, deletedAt: null },
        select: { id: true, caption: true, purpose: true, processingState: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      const extent =
        hole.executedDepthM === null
          ? Math.max(0, ...tests.map((t) => Number(t.depthM)), ...layers.map((l) => Number(l.toM)))
          : Number(hole.executedDepthM);
      if (extent > 1000 || tests.length + layers.length > 1000)
        throw new BadRequestException({
          code: 'INTERACTIVE_SHEET_LIMIT',
          message: 'Profile exceeds interactive view limit',
        });
      const warnings: string[] = [];
      if (hole.executedDepthM === null)
        warnings.push(
          'Profundidade executada não informada. O alcance visual usa apenas os registros disponíveis.',
        );
      if (!hole.fieldDate) warnings.push('Data de campo não informada.');
      if (!coordinate) warnings.push('Coordenada oficial ainda não definida.');
      if (hole.reviewState !== 'APPROVED' || hole.approvedVersion !== hole.technicalVersion)
        warnings.push('Furo ainda sem aprovação técnica válida para emissão.');
      const snapshot: ReportSnapshot = {
        schemaVersion: 1,
        templateVersion: TEMPLATE_VERSION,
        createdAt: new Date().toISOString(),
        issueNumber: 0,
        tenant: reportCompany(tenant),
        work: {
          id: work.id,
          name: work.name,
          clientName: work.clientName,
          city: work.city,
          state: work.state,
          address: work.address,
        },
        report: { id: hole.id, title: 'Conferência técnica do furo', notes: '', version: 0 },
        holes: [
          {
            id: hole.id,
            code: hole.code,
            technicalVersion: hole.technicalVersion,
            executedDepthM: String(extent),
            waterLevelM: hole.waterLevelM === null ? null : String(hole.waterLevelM),
            fieldDate: hole.fieldDate?.toISOString() ?? '',
            reviewerName: hole.reviewerName ?? 'Não aprovado',
            reviewerRegistration: hole.reviewerRegistration ?? '',
            reviewerTitle: hole.reviewerTitle,
            reviewedAt: hole.reviewedAt?.toISOString() ?? '',
            reviewNote: hole.reviewNote,
            officialCoordinate: coordinate
              ? JSON.parse(JSON.stringify(coordinate))
              : {
                  eastingM: '0',
                  northingM: '0',
                  zone: 0,
                  hemisphere: '',
                  datum: '',
                  latitude: 0,
                  longitude: 0,
                  reference: '',
                  altitudeM: null,
                },
            tests: JSON.parse(JSON.stringify(tests)),
            layers: layers.map((layer) => ({
              fromM: String(layer.fromM),
              toM: String(layer.toM),
              soilType: layer.soilType,
              description: reportSoilDescription(layer),
            })),
          },
        ],
        photos: [],
        map: { zone: 0, hemisphere: '', points: [] },
      };
      return {
        ...(renderSheet
          ? renderInteractiveProfile(snapshot, {
              coordinateMissing: !coordinate,
              fieldDateMissing: !hole.fieldDate,
            })
          : {}),
        technicalVersion: hole.technicalVersion,
        templateVersion: TEMPLATE_VERSION,
        termination: profileTermination(snapshot.holes[0]),
        warnings,
        hole,
        tests,
        layers,
        photos,
        coordinate,
      };
    });
  }
}
