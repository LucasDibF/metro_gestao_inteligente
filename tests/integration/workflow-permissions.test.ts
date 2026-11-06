import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';
test('responsibilities separate administration, commerce and engineering; operator writes lock after submission and reopen only on return', async () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const scoped = new TenantDatabaseService(runtime);
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenant = await db.tenant.create({ data: { name: 'Workflow ' + crypto.randomUUID() } });
  const foreign = await db.tenant.create({ data: { name: 'Foreign workflow' } });
  const ids: string[] = [];
  const password = crypto.randomUUID() + '!';
  const hash = await hashPassword(password);
  try {
    const users = [];
    for (const role of ['ADMIN', 'ENGINEER', 'OPERATOR', 'COMMERCIAL'] as const) {
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: hash },
      });
      ids.push(user.id);
      await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role } });
      users.push(user);
    }
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1';
    const tokens = await Promise.all(
      users.map(async (user) => {
        const r = await fetch(base + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, password, tenantId: tenant.id }),
        });
        assert.equal(r.status, 200);
        return (await r.json()).accessToken;
      }),
    );
    const call = (index: number, path: string, body?: unknown, method = body ? 'POST' : 'GET') =>
      fetch(base + path, {
        method,
        headers: { Authorization: 'Bearer ' + tokens[index], 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const works = '/obras';
    const before = await db.work.count({ where: { tenantId: tenant.id } });
    assert.equal(
      (await call(3, works, { name: 'Invalid batch', initialBoreholeCount: 201 })).status,
      400,
    );
    assert.equal(await db.work.count({ where: { tenantId: tenant.id } }), before);
    assert.equal(
      (await call(2, works, { name: 'Forbidden batch', initialBoreholeCount: 2 })).status,
      403,
    );
    const batchResponse = await call(3, works, {
      name: 'Commercial batch',
      initialBoreholeCount: 3,
      initialFolderName: 'Campanha inicial',
    });
    assert.equal(batchResponse.status, 201);
    const batch = await batchResponse.json();
    await db.workAssignment.create({
      data: {
        workId: batch.id,
        tenantId: tenant.id,
        operatorId: users[2].id,
        assignedBy: users[3].id,
      },
    });
    const folder = await db.folder.findFirstOrThrow({
      where: { workId: batch.id, tenantId: tenant.id },
    });
    const initial = await db.borehole.findMany({
      where: { workId: batch.id, tenantId: tenant.id },
      orderBy: { code: 'asc' },
    });
    assert.deepEqual(
      initial.map((h) => h.code),
      ['SP-01', 'SP-02', 'SP-03'],
    );
    assert.ok(initial.every((h) => h.folderId === folder.id && h.reviewState === 'DRAFT'));
    assert.equal(
      (
        await call(
          3,
          `/obras/${batch.id}/furos/${initial[0].id}`,
          { code: 'Changed', version: 1 },
          'PUT',
        )
      ).status,
      403,
    );
    // A terminal 30/12 on row 5 ends at 4.12 m, not at its nominal row label.
    const partialPath = `/obras/${batch.id}/furos/${initial[0].id}`;
    let terminal;
    for (let metre = 1; metre <= 5; metre++) {
      const state = await db.borehole.findUniqueOrThrow({ where: { id: initial[0].id } });
      const response = await call(2, partialPath + '/ensaios', {
        depthM: String(metre),
        technicalVersion: state.technicalVersion,
        ...(metre === 1 ? { recordType: 'INITIAL_SOIL' } : {}),
        advances:
          metre === 1
            ? []
            : metre === 5
              ? [{ blows: 30, penetrationMm: 120 }]
              : [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
        ...(metre === 5 ? { interruptionReason: 'Encerramento de teste' } : {}),
        soil: { soilType: 'Argila arenosa', description: 'Texto do solo preservado' },
      });
      assert.equal(response.status, 201);
      if (metre === 5) terminal = await response.json();
    }
    let partialState = await db.borehole.findUniqueOrThrow({ where: { id: initial[0].id } });
    const tooShort = await call(
      2,
      partialPath + '/tecnico',
      {
        technicalVersion: partialState.technicalVersion,
        executedDepthM: '4.11',
        fieldDate: '2026-11-03',
      },
      'PUT',
    );
    assert.equal(tooShort.status, 400);
    assert.equal((await tooShort.json()).code, 'EXECUTED_DEPTH_EXCLUDES_DATA');
    const closed = await call(
      2,
      partialPath + '/tecnico',
      {
        technicalVersion: partialState.technicalVersion,
        executedDepthM: '4.12',
        waterLevelM: '1.5',
        fieldDate: '2026-11-03',
      },
      'PUT',
    );
    assert.equal(closed.status, 200);
    const finalSoil = await db.soilLayer.findFirstOrThrow({
      where: { boreholeId: initial[0].id },
      orderBy: { toM: 'desc' },
    });
    assert.equal(String(finalSoil.toM), '4.12');
    assert.equal(finalSoil.description, 'Texto do solo preservado');
    partialState = await db.borehole.findUniqueOrThrow({ where: { id: initial[0].id } });
    const editedPartial = await call(
      2,
      partialPath + '/ensaios/' + terminal.id,
      {
        depthM: '5',
        version: terminal.version,
        technicalVersion: partialState.technicalVersion,
        advances: [{ blows: 30, penetrationMm: 120 }],
        interruptionReason: 'Encerramento de teste',
        soil: { soilType: 'Argila arenosa', description: 'Texto do solo preservado' },
      },
      'PUT',
    );
    assert.equal(editedPartial.status, 200);
    partialState = await db.borehole.findUniqueOrThrow({ where: { id: initial[0].id } });
    assert.equal(
      (
        await call(2, partialPath + '/tecnico/enviar-revisao', {
          technicalVersion: partialState.technicalVersion,
          note: 'Conferência do encerramento parcial',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call(1, partialPath + '/tecnico/aprovar', {
          technicalVersion: partialState.technicalVersion,
          note: 'Conferido',
          reviewerName: 'Teste',
          reviewerRegistration: 'SEM VALIDADE',
        })
      ).status,
      201,
    );
    assert.deepEqual(
      (await db.sptTest.findUniqueOrThrow({ where: { id: terminal.id } })).advances,
      [{ blows: 30, penetrationMm: 120 }],
    );

    const rootResponse = await call(3, works, { name: 'No folder', initialBoreholeCount: 2 });
    assert.equal(rootResponse.status, 201);
    const root = await rootResponse.json();
    assert.equal(await db.folder.count({ where: { workId: root.id } }), 0);
    assert.equal(await db.borehole.count({ where: { workId: root.id, folderId: null } }), 2);

    assert.equal((await call(0, works, { name: 'Forbidden admin work' })).status, 403);
    assert.equal((await call(2, works, { name: 'Forbidden operator work' })).status, 403);
    const workResponse = await call(3, works, { name: 'Commercial work' });
    assert.equal(workResponse.status, 201);
    const work = await workResponse.json();
    await db.workAssignment.create({
      data: {
        workId: work.id,
        tenantId: tenant.id,
        operatorId: users[2].id,
        assignedBy: users[3].id,
      },
    });
    const clientResponse = await call(3, '/clientes', {
      name: 'Cliente de teste',
      email: 'cliente@example.invalid',
    });
    assert.equal(clientResponse.status, 201);
    const client = await clientResponse.json();
    assert.equal((await call(2, '/clientes')).status, 403);
    assert.equal((await call(0, '/clientes', { name: 'Admin is not commercial' })).status, 403);
    assert.equal(
      (
        await call(
          3,
          '/clientes/' + client.id,
          { name: 'Cliente atualizado', version: client.version },
          'PUT',
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(3, '/clientes/' + client.id, { name: 'Stale', version: client.version }, 'PUT'))
        .status,
      409,
    );
    const fieldFolder = await db.folder.create({
      data: { tenantId: tenant.id, workId: work.id, name: 'Field folder' },
    });
    const foreignWork = await db.work.create({
      data: { tenantId: foreign.id, name: 'Foreign work' },
    });
    const foreignFolder = await db.folder.create({
      data: { tenantId: foreign.id, workId: foreignWork.id, name: 'Foreign folder' },
    });
    await assert.rejects(
      scoped.run({ userId: users[2].id, tenantId: tenant.id }, (tx) =>
        tx.folder.update({ where: { id: fieldFolder.id }, data: { name: 'Forbidden rename' } }),
      ),
    );
    assert.equal(
      (await db.folder.findUniqueOrThrow({ where: { id: fieldFolder.id } })).name,
      'Field folder',
    );
    assert.equal(
      await scoped.run({ userId: users[2].id, tenantId: tenant.id }, (tx) =>
        tx.folder.count({ where: { id: foreignFolder.id } }),
      ),
      0,
    );
    const holeResponse = await call(1, `/obras/${work.id}/furos`, {
      code: 'SP-01',
      folderId: fieldFolder.id,
    });
    assert.equal(holeResponse.status, 201);
    const hole = await holeResponse.json();
    const path = `/obras/${work.id}/furos/${hole.id}`;
    for (const index of [0, 2, 3]) {
      assert.equal((await call(index, path + '/tecnico/analise')).status, 403);
      assert.equal((await call(index, path + '/tecnico/folha')).status, 403);
      assert.equal((await call(index, path + '/tecnico/camadas', {})).status, 403);
      assert.equal((await call(index, path + '/tecnico/aprovar', {})).status, 403);
      assert.equal((await call(index, path + '/tecnico/devolver', {})).status, 403);
    }
    assert.equal((await call(2, '/workspace/relatorios')).status, 403);
    assert.equal((await call(1, path + '/tecnico/analise')).status, 200);
    assert.equal(
      (await call(2, path, { code: 'Changed', version: hole.version }, 'PUT')).status,
      403,
    );
    assert.equal(
      (
        await call(
          2,
          path + '/arquivos/coordenadas/planejada',
          {
            eastingM: '500000',
            northingM: '9400000',
            zone: 25,
            hemisphere: 'S',
            datum: 'SIRGAS2000',
            reference: 'Planejamento',
          },
          'PUT',
        )
      ).status,
      403,
    );
    const adminMembership = await db.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenant.id, userId: users[0].id } },
    });
    assert.equal(
      (
        await call(
          0,
          '/acessos/' + users[0].id,
          {
            roles: ['ADMIN', 'OPERATOR'],
            active: true,
            canDownloadReports: true,
            version: adminMembership.version,
          },
          'PUT',
        )
      ).status,
      200,
    );
    const extraHole = await call(1, `/obras/${work.id}/furos`, { code: 'SP-02' });
    assert.equal(extraHole.status, 201);
    const extraId = (await extraHole.json()).id;
    // A combined administrator sees the work, but field execution needs an active assignment.
    assert.equal(
      (
        await call(0, `/obras/${work.id}/furos/${extraId}/ensaios`, {
          depthM: '1',
          advances: [1, 2, 3].map((blows) => ({ blows, penetrationMm: 150 })),
        })
      ).status,
      403,
    );
    const metre = {
      depthM: '1',
      advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
      soil: { soilType: 'Argila', description: 'Solo sintético.' },
      technicalVersion: 1,
    };
    const savedResponse = await call(2, path + '/ensaios', metre);
    assert.equal(savedResponse.status, 201);
    let saved = await savedResponse.json();
    let current = await db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(
      (
        await call(
          2,
          path + '/tecnico',
          {
            technicalVersion: current.technicalVersion,
            executedDepthM: '1',
            fieldDate: '2026-11-01',
          },
          'PUT',
        )
      ).status,
      200,
    );
    for (const [invalid, expectedCode] of [
      [{ executedDepthM: '0' }, 'EXECUTED_DEPTH_INVALID'],
      [{ executedDepthM: '0.5' }, 'EXECUTED_DEPTH_EXCLUDES_DATA'],
      [{ executedDepthM: '1', waterLevelM: '2' }, 'WATER_LEVEL_BELOW_DEPTH'],
      [{ fieldDate: '2026-02-30' }, 'FIELD_DATE_INVALID'],
    ] as const) {
      const state = await db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
      const response = await call(
        2,
        path + '/tecnico',
        Object.assign(
          {
            technicalVersion: state.technicalVersion,
            executedDepthM: '1',
            fieldDate: '2026-11-01',
          },
          invalid,
        ),
        'PUT',
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, expectedCode);
      assert.equal(
        (await db.borehole.findUniqueOrThrow({ where: { id: hole.id } })).technicalVersion,
        state.technicalVersion,
      );
    }
    current = await db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(
      (
        await call(2, path + '/tecnico/enviar-revisao', {
          technicalVersion: current.technicalVersion,
          note: 'Campo concluído.',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call(
          2,
          path + '/ensaios/' + saved.id,
          { ...metre, version: saved.version, technicalVersion: current.technicalVersion },
          'PUT',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          2,
          path + '/tecnico',
          {
            technicalVersion: current.technicalVersion,
            executedDepthM: '1',
            fieldDate: '2026-11-01',
          },
          'PUT',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(0, path + '/tecnico/aprovar', {
          technicalVersion: current.technicalVersion,
          note: 'Não autorizado',
          reviewerName: 'Admin',
          reviewerRegistration: '123',
        })
      ).status,
      403,
    );
    await assert.rejects(
      scoped.run({ userId: users[2].id, tenantId: tenant.id }, (tx) =>
        tx.sptTest.update({ where: { id: saved.id }, data: { advances: [] } }),
      ),
    );
    assert.equal(
      (
        await call(1, path + '/tecnico/devolver', {
          technicalVersion: current.technicalVersion,
          note: 'Conferir anotação do metro.',
        })
      ).status,
      201,
    );
    const corrected = await call(
      2,
      path + '/ensaios/' + saved.id,
      { ...metre, version: saved.version, technicalVersion: current.technicalVersion },
      'PUT',
    );
    assert.equal(corrected.status, 200);
    saved = await corrected.json();
    current = await db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    await call(2, path + '/tecnico/enviar-revisao', {
      technicalVersion: current.technicalVersion,
      note: 'Corrigido.',
    });
    const engineerEdit = await call(
      1,
      path + '/ensaios/' + saved.id,
      { ...metre, version: saved.version, technicalVersion: current.technicalVersion },
      'PUT',
    );
    assert.equal(engineerEdit.status, 200);
    assert.equal(
      (await db.borehole.findUniqueOrThrow({ where: { id: hole.id } })).reviewState,
      'IN_REVIEW',
    );
    assert.equal((await call(2, path + '/ensaios', { depthM: '2', advances: [] })).status, 403);
    assert.equal((await call(1, '/acessos')).status, 403);
    const listed = await call(0, '/acessos');
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).items.length, 4);
    const newMail = crypto.randomUUID() + '@example.invalid';
    const createdAccess = await call(0, '/acessos', {
      email: newMail,
      password,
      roles: ['COMMERCIAL'],
      canDownloadReports: false,
    });
    assert.equal(createdAccess.status, 201);
    const newId = (await createdAccess.json()).userId;
    ids.push(newId);
    assert.equal(
      (
        await call(0, '/acessos', {
          email: newMail,
          password,
          roles: ['OPERATOR'],
          canDownloadReports: true,
        })
      ).status,
      409,
    );
    const self = await db.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenant.id, userId: users[0].id } },
    });
    assert.equal(
      (
        await call(
          0,
          '/acessos/' + users[0].id,
          { roles: ['ENGINEER'], active: true, canDownloadReports: true, version: self.version },
          'PUT',
        )
      ).status,
      400,
    );
    // Combined role is an explicit administrator action, not a migration side effect.
    assert.equal(
      (
        await call(
          0,
          '/acessos/' + users[0].id,
          {
            roles: ['ADMIN', 'ENGINEER'],
            active: true,
            canDownloadReports: true,
            version: self.version,
          },
          'PUT',
        )
      ).status,
      200,
    );
    assert.deepEqual((await (await call(0, '/auth/me')).json()).additionalRoles, ['ENGINEER']);
    const member = await db.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenant.id, userId: users[3].id } },
    });
    assert.equal(
      (
        await call(
          0,
          '/acessos/' + users[3].id,
          {
            roles: ['COMMERCIAL'],
            active: false,
            canDownloadReports: false,
            version: member.version,
          },
          'PUT',
        )
      ).status,
      200,
    );
    assert.equal((await call(3, '/auth/me')).status, 401);
    const outsider = await db.user.create({
      data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: hash },
    });
    ids.push(outsider.id);
    await db.membership.create({
      data: { tenantId: foreign.id, userId: outsider.id, role: 'ADMIN' },
    });
    assert.equal(
      (
        await call(
          0,
          '/acessos/' + outsider.id,
          { roles: ['VIEWER'], active: true, canDownloadReports: true, version: 1 },
          'PUT',
        )
      ).status,
      404,
    );
  } finally {
    await app.close();
    await runtime.$disconnect();
    const tenantIds = [tenant.id, foreign.id];
    await db.$executeRaw`DELETE FROM membership_events WHERE tenant_id=ANY(${tenantIds}::uuid[])`;
    await db.technicalEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.soilLayer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.sptTest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.borehole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.folder.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.workAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.work.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.client.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.membership.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await db.$disconnect();
  }
});
