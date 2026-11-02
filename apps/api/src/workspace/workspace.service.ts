import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantDatabaseService, type TenantContext } from '../database/tenant-database.service';
import { statusFilter, workStatuses } from '../works/work-status';
@Injectable()
export class WorkspaceService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  summary(c: TenantContext) {
    return this.db.run(c, async (tx) => {
      const where = { tenantId: c.tenantId, deletedAt: null };
      const counts: Record<string, number> = {};
      for (const status of workStatuses)
        counts[status] = await tx.work.count({ where: { ...where, ...statusFilter(status) } });
      return { total: await tx.work.count({ where }), counts };
    });
  }
  reports(c: TenantContext, page: number, q: string, state: string) {
    if (state && !['UNISSUED', 'PENDING', 'PROCESSING', 'READY', 'FAILED'].includes(state))
      throw new BadRequestException('Invalid report state');
    return this.db.run(c, async (tx) => {
      const source = Prisma.sql`FROM reports r JOIN works w ON w.id=r.work_id AND w.tenant_id=r.tenant_id
    LEFT JOIN LATERAL (SELECT id,state,issue_number FROM report_issues WHERE report_id=r.id AND tenant_id=r.tenant_id ORDER BY issue_number DESC LIMIT 1) i ON true
    WHERE r.tenant_id=${c.tenantId}::uuid AND w.deleted_at IS NULL
    AND (${q}='' OR position(lower(${q}) in lower(r.title))>0 OR position(lower(${q}) in lower(w.name))>0 OR position(lower(${q}) in lower(coalesce(w.client_name,'')))>0)
    AND (${state}='' OR coalesce(i.state,'UNISSUED')=${state})`;
      const items = await tx.$queryRaw<
        Array<{
          id: string;
          title: string;
          workId: string;
          workName: string;
          clientName: string | null;
          state: string;
          issueId: string | null;
          issueNumber: number | null;
        }>
      >(
        Prisma.sql`SELECT r.id,r.title,r.work_id AS "workId",w.name AS "workName",w.client_name AS "clientName",coalesce(i.state,'UNISSUED') AS state,i.id AS "issueId",i.issue_number AS "issueNumber" ${source} ORDER BY r.updated_at DESC,r.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
      );
      const count = await tx.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT count(*) AS total ${source}`,
      );
      return { items, total: Number(count[0].total), page, pageSize: 20 };
    });
  }
  activity(c: TenantContext) {
    return this.db.run(c, async (tx) => {
      const [access] = await tx.$queryRaw<
        Array<{ engineering: boolean; field: boolean; reports: boolean }>
      >`
        SELECT app_has_role(ARRAY['ENGINEER','VIEWER']) AS engineering,
          app_has_role(ARRAY['OPERATOR']) AS field,
          app_has_role(ARRAY['ENGINEER','VIEWER','COMMERCIAL','ADMIN']) AS reports`;
      const events = await tx.technicalEvent.findMany({
        where: {
          tenantId: c.tenantId,
          action: {
            in: access.engineering
              ? ['REVIEW_SUBMIT', 'REVIEW_APPROVE', 'REVIEW_REJECT']
              : access.field
                ? ['REVIEW_APPROVE', 'REVIEW_REJECT']
                : [],
          },
          borehole: { deletedAt: null, work: { deletedAt: null } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        include: { borehole: { select: { code: true, work: { select: { name: true } } } } },
      });
      const reports = access.reports
        ? await tx.$queryRaw<
            Array<{
              id: string;
              workId: string;
              reportId: string;
              workName: string;
              title: string;
              state: string;
              createdAt: Date;
            }>
          >`SELECT i.id,i.work_id AS "workId",i.report_id AS "reportId",w.name AS "workName",r.title,i.state,i.finished_at AS "createdAt" FROM report_issues i JOIN reports r ON r.id=i.report_id AND r.tenant_id=i.tenant_id JOIN works w ON w.id=i.work_id AND w.tenant_id=i.tenant_id WHERE i.tenant_id=${c.tenantId}::uuid AND w.deleted_at IS NULL AND i.state IN ('READY','FAILED') AND i.finished_at IS NOT NULL ORDER BY i.finished_at DESC,i.id DESC LIMIT 50`
        : [];
      const items = [
        ...events.map((e) => ({
          key: `technical:${e.id}`,
          workId: e.workId,
          boreholeId: e.boreholeId,
          reportId: null as string | null,
          title: (
            {
              REVIEW_SUBMIT: 'Furo enviado para revisão',
              REVIEW_APPROVE: 'Furo aprovado',
              REVIEW_REJECT: 'Furo devolvido para correção',
            } as Record<string, string>
          )[e.action],
          context: `${e.borehole.work.name} · ${e.borehole.code}`,
          createdAt: e.createdAt,
        })),
        ...reports.map((r) => ({
          key: `report:${r.id}`,
          workId: r.workId,
          boreholeId: null as string | null,
          reportId: r.reportId,
          title: r.state === 'READY' ? 'PDF disponível' : 'Geração de PDF não concluída',
          context: `${r.workName} · ${r.title}`,
          createdAt: r.createdAt,
        })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.key.localeCompare(a.key))
        .slice(0, 50);
      const read = new Set(
        (
          await tx.notificationRead.findMany({
            where: {
              tenantId: c.tenantId,
              userId: c.userId,
              eventKey: { in: items.map((i) => i.key) },
            },
          })
        ).map((r) => r.eventKey),
      );
      return { items: items.map((i) => ({ ...i, read: read.has(i.key) })) };
    });
  }
  async read(c: TenantContext, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => k !== 'keys')
    )
      throw new BadRequestException('Invalid activity selection');
    const keys = (body as { keys: unknown }).keys;
    if (!Array.isArray(keys) || keys.length > 50 || keys.some((v) => typeof v !== 'string'))
      throw new BadRequestException('Invalid activity keys');
    const visible = new Set((await this.activity(c)).items.map((i) => i.key));
    if (keys.some((k) => !visible.has(k))) throw new BadRequestException('Activity unavailable');
    return this.db.run(c, (tx) =>
      tx.notificationRead.createMany({
        data: keys.map((key) => ({
          tenantId: c.tenantId,
          userId: c.userId,
          eventKey: key as string,
        })),
        skipDuplicates: true,
      }),
    );
  }
}
