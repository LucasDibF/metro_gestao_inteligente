import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';

type Role = 'ADMIN' | 'ENGINEER' | 'OPERATOR';
type Scoped = (
  userId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
) => Promise<unknown>;

interface Fixture {
  tenantId: string;
  workId: string;
  admin: string;
  engineer: string;
  operator: string;
  as: Scoped;
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
});
const runtime = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const worker = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.WORKER_DATABASE_URL }),
});
const scoped = new TenantDatabaseService(runtime);
const tenants: string[] = [];
const users: string[] = [];

async function member(tenantId: string, role: Role, additionalRoles: Role[] = []): Promise<string> {
  const user = await db.user.create({
    data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: 'not-a-login' },
  });
  users.push(user.id);
  await db.membership.create({ data: { tenantId, userId: user.id, role, additionalRoles } });
  return user.id;
}

async function fixture(): Promise<Fixture> {
  const tenant = await db.tenant.create({ data: { name: 'Correcoes ' + crypto.randomUUID() } });
  tenants.push(tenant.id);
  const work = await db.work.create({ data: { tenantId: tenant.id, name: 'Obra' } });
  const admin = await member(tenant.id, 'ADMIN');
  const engineer = await member(tenant.id, 'ENGINEER');
  const operator = await member(tenant.id, 'OPERATOR');
  await db.workAssignment.create({
    data: { workId: work.id, tenantId: tenant.id, operatorId: operator, assignedBy: admin },
  });
  return {
    tenantId: tenant.id,
    workId: work.id,
    admin,
    engineer,
    operator,
    as: (userId, operation) => scoped.run({ userId, tenantId: tenant.id }, operation),
  };
}

async function hole(
  f: Fixture,
  code = 'SP-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
): Promise<string> {
  const created = await db.borehole.create({
    data: { tenantId: f.tenantId, workId: f.workId, code },
  });
  return created.id;
}

function submit(f: Fixture, id: string, note: string | null = null): Promise<unknown> {
  return f.as(f.engineer, (tx) =>
    tx.borehole.update({ where: { id }, data: { reviewState: 'IN_REVIEW', reviewNote: note } }),
  );
}

async function approve(f: Fixture, id: string, note: string | null = null): Promise<void> {
  await submit(f, id);
  const { technicalVersion } = await db.borehole.findUniqueOrThrow({ where: { id } });
  await f.as(f.engineer, (tx) =>
    tx.borehole.update({
      where: { id },
      data: {
        reviewState: 'APPROVED',
        approvedVersion: technicalVersion,
        reviewedBy: f.engineer,
        reviewedAt: new Date(),
        reviewerName: 'Responsavel',
        reviewerRegistration: 'CREA-1',
        reviewNote: note,
      },
    }),
  );
}

function returnToField(f: Fixture, id: string, note: string): Promise<unknown> {
  return f.as(f.engineer, (tx) =>
    tx.borehole.update({ where: { id }, data: { reviewState: 'DRAFT', reviewNote: note } }),
  );
}

async function officialCoordinate(f: Fixture, boreholeId: string): Promise<string> {
  const coordinate = await db.boreholeCoordinate.create({
    data: {
      boreholeId,
      workId: f.workId,
      tenantId: f.tenantId,
      kind: 'EXECUTED',
      eastingM: 500000,
      northingM: 7000000,
      zone: 23,
      hemisphere: 'S',
      reference: 'Marco',
      latitude: -23,
      longitude: -45,
    },
  });
  await db.borehole.update({
    where: { id: boreholeId },
    data: { officialCoordinateId: coordinate.id },
  });
  return coordinate.id;
}

function sptInput(f: Fixture, boreholeId: string, actor: string, depthM: number) {
  return {
    boreholeId,
    workId: f.workId,
    tenantId: f.tenantId,
    depthM,
    advances: [],
    result: {},
    engineVersion: 'test',
    createdBy: actor,
    updatedBy: actor,
  };
}

async function photo(f: Fixture, boreholeId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.boreholePhoto.create({
    data: {
      id,
      boreholeId,
      workId: f.workId,
      tenantId: f.tenantId,
      objectKey: 'test/' + id,
      thumbnailKey: 'test/thumb-' + id,
      processingState: 'READY',
      sha256: 'a'.repeat(64),
      mime: 'image/jpeg',
      sizeBytes: 1,
      caption: 'Legenda',
      width: 1,
      height: 1,
    },
  });
  return id;
}

async function issuedReport(
  f: Pick<Fixture, 'tenantId' | 'workId' | 'engineer'>,
  snapshot: { holes?: string[]; photos?: string[] },
  issue: Partial<Prisma.ReportIssueUncheckedCreateInput> = {},
): Promise<{ reportId: string; issueId: string }> {
  const report = await db.report.create({
    data: {
      tenantId: f.tenantId,
      workId: f.workId,
      title: 'Relatorio',
      composition: {},
      issueCounter: 1,
    },
  });
  const issueId = crypto.randomUUID();
  const created = await db.reportIssue.create({
    data: {
      id: issueId,
      reportId: report.id,
      workId: f.workId,
      tenantId: f.tenantId,
      requestedBy: f.engineer,
      idempotencyKey: crypto.randomUUID(),
      requestHash: 'b'.repeat(64),
      compositionVersion: 1,
      issueNumber: 1,
      snapshot: {
        holes: (snapshot.holes ?? []).map((id) => ({ id })),
        photos: (snapshot.photos ?? []).map((id) => ({ id })),
      },
      snapshotHash: 'c'.repeat(64),
      state: 'READY',
      objectKey: 'test/' + issueId,
      pdfSha256: 'd'.repeat(64),
      finishedAt: new Date(),
      ...issue,
    },
  });
  if (created.state === 'READY')
    await db.report.update({ where: { id: report.id }, data: { currentIssueId: issueId } });
  return { reportId: report.id, issueId };
}

async function currentIssue(reportId: string): Promise<string | null> {
  return (await db.report.findUniqueOrThrow({ where: { id: reportId } })).currentIssueId;
}

test.after(async () => {
  await db.$executeRaw`DELETE FROM membership_events WHERE tenant_id=ANY(${tenants}::uuid[])`;
  await db.report.updateMany({
    where: { tenantId: { in: tenants } },
    data: { currentIssueId: null },
  });
  await db.reportIssue.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.report.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.technicalEvent.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.sptTest.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.boreholePhoto.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.borehole.updateMany({
    where: { tenantId: { in: tenants } },
    data: { officialCoordinateId: null },
  });
  await db.boreholeCoordinate.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.borehole.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.workAssignment.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.work.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.authSession.deleteMany({ where: { userId: { in: users } } });
  await db.membership.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.tenant.deleteMany({ where: { id: { in: tenants } } });
  await Promise.all([db.$disconnect(), runtime.$disconnect(), worker.$disconnect()]);
});

test('runtime and worker connections are restricted roles', async () => {
  for (const client of [runtime, worker]) {
    const [role] = await client.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });
  }
});

test('official coordinate change keeps DRAFT and never reopens the field after submission', async () => {
  const f = await fixture();
  const editCoordinate = (actor: string, id: string): Promise<unknown> =>
    f.as(
      actor,
      (tx) => tx.$executeRaw`UPDATE borehole_coordinates SET reference='Novo' WHERE id=${id}::uuid`,
    );

  const draft = await hole(f);
  const draftCoordinate = await officialCoordinate(f, draft);
  await returnToField(f, draft, 'Refazer leitura');
  const draftBefore = await db.borehole.findUniqueOrThrow({ where: { id: draft } });
  assert.equal(await editCoordinate(f.operator, draftCoordinate), 1);
  const draftAfter = await db.borehole.findUniqueOrThrow({ where: { id: draft } });
  assert.equal(draftAfter.reviewState, 'DRAFT');
  assert.equal(draftAfter.reviewNote, 'Refazer leitura');
  assert.equal(draftAfter.technicalVersion, draftBefore.technicalVersion + 1);
  assert.equal(draftAfter.version, draftBefore.version + 1);

  const inReview = await hole(f);
  const inReviewCoordinate = await officialCoordinate(f, inReview);
  await submit(f, inReview, 'Enviado');
  assert.equal(await editCoordinate(f.engineer, inReviewCoordinate), 1);
  const inReviewAfter = await db.borehole.findUniqueOrThrow({ where: { id: inReview } });
  assert.equal(inReviewAfter.reviewState, 'IN_REVIEW');
  assert.equal(inReviewAfter.reviewNote, null);

  const approved = await hole(f);
  const approvedCoordinate = await officialCoordinate(f, approved);
  await approve(f, approved, 'Aprovado');
  assert.equal(await editCoordinate(f.engineer, approvedCoordinate), 1);
  const approvedAfter = await db.borehole.findUniqueOrThrow({ where: { id: approved } });
  assert.equal(approvedAfter.reviewState, 'IN_REVIEW');
  assert.equal(approvedAfter.approvedVersion, null);
  assert.equal(approvedAfter.reviewedBy, null);
  assert.equal(approvedAfter.reviewerName, null);
  assert.equal(approvedAfter.reviewNote, null);
  assert.equal(await editCoordinate(f.operator, approvedCoordinate), 0);
});

test('report invalidation works for ADMIN under FORCE RLS and stays inside the tenant', async () => {
  const [security] = await db.$queryRaw<
    { prosecdef: boolean; proconfig: string[]; forced: boolean }[]
  >`SELECT p.prosecdef,p.proconfig,c.relforcerowsecurity AS forced FROM pg_proc p,pg_class c
    WHERE p.proname='invalidate_current_report' AND c.oid='public.reports'::regclass`;
  assert.equal(security.prosecdef, true);
  assert.equal(security.forced, true);
  assert.deepEqual(security.proconfig, ['search_path=pg_catalog, public']);

  const f = await fixture();
  const foreign = await fixture();
  const deleted = await hole(f);
  const other = await hole(f);
  const foreignHole = await hole(foreign);
  const affected = await issuedReport(f, { holes: [deleted] });
  const unrelated = await issuedReport(f, { holes: [other] });
  const foreignReport = await issuedReport(foreign, { holes: [foreignHole, deleted] });

  // The ADMIN policy on reports does not grant UPDATE: this only succeeds through the definer.
  assert.equal(
    await f
      .as(f.admin, (tx) => tx.report.updateMany({ data: { title: 'x' } }))
      .then((r) => (r as { count: number }).count),
    0,
  );
  await f.as(
    f.admin,
    (tx) => tx.$executeRaw`UPDATE boreholes SET deleted_at=now() WHERE id=${deleted}::uuid`,
  );
  assert.equal(await currentIssue(affected.reportId), null);
  assert.equal(await currentIssue(unrelated.reportId), unrelated.issueId);
  assert.equal(await currentIssue(foreignReport.reportId), foreignReport.issueId);

  // A field write on a returned borehole invalidates even though the operator cannot edit reports.
  const returned = await hole(f);
  const operatorReport = await issuedReport(f, { holes: [returned] });
  await f.as(f.operator, (tx) => tx.sptTest.create({ data: sptInput(f, returned, f.operator, 1) }));
  assert.equal(await currentIssue(operatorReport.reportId), null);

  // An update that changes neither technical version nor trash state keeps the current issue.
  const stable = await hole(f);
  const stableReport = await issuedReport(f, { holes: [stable] });
  await db.borehole.update({ where: { id: stable }, data: { plannedDepthM: 5 } });
  assert.equal(await currentIssue(stableReport.reportId), stableReport.issueId);
});

test('photo queue updates leave the current report while composition changes invalidate it', async () => {
  const f = await fixture();
  const boreholeId = await hole(f);
  const photoId = await photo(f, boreholeId);
  const { reportId, issueId } = await issuedReport(f, { photos: [photoId] });

  // PENDING and the claim share a transaction so no concurrent worker can take this photo.
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE borehole_photos SET processing_state='PENDING',available_at=now()-interval '1 second' WHERE id=${photoId}::uuid`;
    const [row] = await tx.$queryRaw<{ job: { leaseToken: string } }[]>`
      SELECT claim_photo_job(${photoId}::uuid) AS job`;
    return row.job;
  });
  assert.equal(await currentIssue(reportId), issueId);
  const [finished] = await worker.$queryRaw<{ done: boolean }[]>`
    SELECT finish_photo_job(${photoId}::uuid,${claim.leaseToken}::uuid,NULL,NULL) AS done`;
  assert.equal(finished.done, true);
  assert.equal(
    (await db.boreholePhoto.findUniqueOrThrow({ where: { id: photoId } })).processingState,
    'READY',
  );
  assert.equal(await currentIssue(reportId), issueId);

  const edits: [string, Prisma.BoreholePhotoUpdateInput][] = [
    ['caption', { caption: 'Nova legenda' }],
    ['crop', { crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }],
    ['deletedAt', { deletedAt: new Date() }],
    ['version', { version: { increment: 1 } }],
  ];
  for (const [field, data] of edits) {
    const id = await photo(f, boreholeId);
    const edited = await issuedReport(f, { photos: [id] });
    await f.as(f.engineer, (tx) => tx.boreholePhoto.updateMany({ where: { id }, data }));
    assert.equal(await currentIssue(edited.reportId), null, field);
  }
});

test('fail_report_job finishes definitive failures and keeps retries open', async () => {
  const f = await fixture();
  const leased = async (attempts: number): Promise<{ issueId: string; token: string }> => {
    const token = crypto.randomUUID();
    const { issueId } = await issuedReport(
      f,
      {},
      {
        state: 'PROCESSING',
        attempts,
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 60000),
        objectKey: null,
        pdfSha256: null,
        finishedAt: null,
      },
    );
    return { issueId, token };
  };
  const fail = async (issueId: string, token: string, permanent: boolean): Promise<void> => {
    const [row] = await worker.$queryRaw<{ done: boolean }[]>`
      SELECT fail_report_job(${issueId}::uuid,${token}::uuid,${permanent}) AS done`;
    assert.equal(row.done, true);
  };
  const read = (id: string) => db.reportIssue.findUniqueOrThrow({ where: { id } });

  const permanent = await leased(1);
  await fail(permanent.issueId, permanent.token, true);
  const permanentRow = await read(permanent.issueId);
  assert.equal(permanentRow.state, 'FAILED');
  assert.equal(permanentRow.errorCode, 'INVALID_SNAPSHOT');
  assert.ok(permanentRow.finishedAt);

  const exhausted = await leased(3);
  await fail(exhausted.issueId, exhausted.token, false);
  const exhaustedRow = await read(exhausted.issueId);
  assert.equal(exhaustedRow.state, 'FAILED');
  assert.equal(exhaustedRow.errorCode, 'GENERATION_FAILED');
  assert.ok(exhaustedRow.finishedAt);

  const retry = await leased(1);
  await fail(retry.issueId, retry.token, false);
  const retryRow = await read(retry.issueId);
  // Closed right away so a report worker running in a parallel test file cannot claim it.
  await db.reportIssue.update({ where: { id: retry.issueId }, data: { state: 'FAILED' } });
  assert.equal(retryRow.state, 'PENDING');
  assert.equal(retryRow.finishedAt, null);
  assert.equal(retryRow.leaseToken, null);
  assert.ok(retryRow.availableAt.getTime() > Date.now());
});

test('return note survives field writes in DRAFT and is cleared in IN_REVIEW and APPROVED', async () => {
  const f = await fixture();
  const returned = await hole(f);
  await submit(f, returned);
  await returnToField(f, returned, 'Corrigir golpes');
  const before = await db.borehole.findUniqueOrThrow({ where: { id: returned } });

  await f.as(f.operator, (tx) => tx.sptTest.create({ data: sptInput(f, returned, f.operator, 1) }));
  await f.as(f.operator, (tx) =>
    tx.borehole.update({ where: { id: returned }, data: { waterLevelM: 2 } }),
  );
  const after = await db.borehole.findUniqueOrThrow({ where: { id: returned } });
  assert.equal(after.reviewState, 'DRAFT');
  assert.equal(after.reviewNote, 'Corrigir golpes');
  assert.equal(after.technicalVersion, before.technicalVersion + 2);

  const cases: [string, 'submit' | 'approve', (id: string) => Promise<unknown>][] = [
    [
      'bump_technical_parent',
      'submit',
      (id) => f.as(f.engineer, (tx) => tx.sptTest.create({ data: sptInput(f, id, f.engineer, 1) })),
    ],
    [
      'bump_technical_parent',
      'approve',
      (id) => f.as(f.engineer, (tx) => tx.sptTest.create({ data: sptInput(f, id, f.engineer, 1) })),
    ],
    [
      'invalidate_technical_review',
      'submit',
      (id) =>
        f.as(f.engineer, (tx) => tx.borehole.update({ where: { id }, data: { waterLevelM: 3 } })),
    ],
    [
      'invalidate_technical_review',
      'approve',
      (id) =>
        f.as(f.engineer, (tx) => tx.borehole.update({ where: { id }, data: { waterLevelM: 3 } })),
    ],
  ];
  for (const [name, state, write] of cases) {
    const id = await hole(f);
    await (state === 'submit' ? submit(f, id, 'Nota') : approve(f, id, 'Nota'));
    await write(id);
    const row = await db.borehole.findUniqueOrThrow({ where: { id } });
    assert.equal(row.reviewState, 'IN_REVIEW', name + ' ' + state);
    assert.equal(row.reviewNote, null, name + ' ' + state);
  }
});

test('admin_member_update deactivates assignments of whoever stops being an active operator', async () => {
  const f = await fixture();
  const foreign = await fixture();
  const assign = async (
    tenantId: string,
    operatorId: string,
    assignedBy: string,
  ): Promise<string> => {
    const work = await db.work.create({ data: { tenantId, name: 'Obra ' + crypto.randomUUID() } });
    await db.workAssignment.create({
      data: { workId: work.id, tenantId, operatorId, assignedBy },
    });
    return work.id;
  };
  const update = async (uid: string, roles: Role[], enabled: boolean): Promise<void> => {
    const { version } = await db.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: f.tenantId, userId: uid } },
    });
    const list = '{' + roles.join(',') + '}';
    const [row] = (await f.as(
      f.admin,
      (tx) =>
        tx.$queryRaw`SELECT admin_member_update(${uid}::uuid,${list}::"MembershipRole"[],${enabled},true,${version}) AS done`,
    )) as { done: boolean }[];
    assert.equal(row.done, true);
  };
  const assignment = (workId: string) => db.workAssignment.findUniqueOrThrow({ where: { workId } });

  const removed = await member(f.tenantId, 'OPERATOR');
  const removedWork = await assign(f.tenantId, removed, f.admin);
  // The same person keeps working as an operator for another company.
  await db.membership.create({
    data: { tenantId: foreign.tenantId, userId: removed, role: 'OPERATOR' },
  });
  const foreignWork = await assign(foreign.tenantId, removed, foreign.admin);
  await update(removed, ['ENGINEER'], true);
  const removedRow = await assignment(removedWork);
  assert.equal(removedRow.active, false);
  assert.equal(removedRow.version, 2);
  assert.equal(removedRow.assignedBy, f.admin);
  assert.equal((await assignment(foreignWork)).active, true);
  // Giving the role back requires a new assignment.
  await update(removed, ['OPERATOR'], true);
  assert.equal((await assignment(removedWork)).active, false);

  const disabled = await member(f.tenantId, 'OPERATOR');
  const disabledWork = await assign(f.tenantId, disabled, f.admin);
  await update(disabled, ['OPERATOR'], false);
  assert.equal((await assignment(disabledWork)).active, false);

  const kept = await member(f.tenantId, 'ENGINEER', ['OPERATOR']);
  const keptWork = await assign(f.tenantId, kept, f.admin);
  await update(kept, ['ENGINEER', 'OPERATOR'], true);
  const keptRow = await assignment(keptWork);
  assert.equal(keptRow.active, true);
  assert.equal(keptRow.version, 1);
});

test('migrations leave no development function and create the query indexes', async () => {
  const [row] = await db.$queryRaw<{ fn: string | null }[]>`
    SELECT to_regprocedure('public.set_local_test_role(uuid,uuid,text)')::text AS fn`;
  assert.equal(row.fn, null);
  const indexes = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN (
      'reports_tenant_work_created_idx','borehole_photos_active_scope_idx',
      'borehole_photos_queue_idx','auth_sessions_active_family_idx') ORDER BY indexname`;
  assert.equal(indexes.length, 4);
  assert.match(indexes[0].indexdef, /WHERE \(\(revoked_at IS NULL\) AND \(rotated_at IS NULL\)\)/);
  assert.match(indexes[1].indexdef, /WHERE \(deleted_at IS NULL\)/);
  assert.match(indexes[2].indexdef, /processing_state/);
  assert.match(indexes[3].indexdef, /created_at DESC, id DESC/);
});
