const { fs, path, repo, run, load, sleep, save } = require('./common.cjs');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashPassword } = require('../../apps/api/dist/auth/password.js');
const { evaluateSpt } = require('@spt/geotechnical-engine');
function packageVersion(name) {
  let dir = path.dirname(require.resolve(name));
  for (let i = 0; i < 8; i++) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const p = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (p.name === name) return p.version;
    }
    dir = path.dirname(dir);
  }
  throw Error('Cannot resolve package version: ' + name);
}
async function main() {
  const { config, env } = load();
  const destination = path.join(config.dir, 'actors-private.json');
  if (fs.existsSync(destination)) return finalize(config);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATION_DATABASE_URL }),
  });
  const password = randomBytes(24).toString('hex'),
    passwordHash = await hashPassword(password);
  const manifest = {
    runId: config.runId,
    tenants: [],
    actors: [],
    reportHoles: [],
    reportWork: null,
    password,
  };
  try {
    for (let i = 0; i < 3; i++)
      manifest.tenants.push(
        await db.tenant.create({ data: { name: `CARGA ${config.runId} empresa ${i + 1}` } }),
      );
    for (let i = 0; i < 50; i++) {
      const tenantId = manifest.tenants[Math.floor(i / 3) % 3].id,
        role = ['ENGINEER', 'OPERATOR', 'COMMERCIAL'][i % 3];
      const user = await db.user.create({
        data: { email: `${randomUUID()}@loadtest.invalid`, passwordHash },
      });
      await db.membership.create({ data: { userId: user.id, tenantId, role } });
      const work = await db.work.create({
        data: {
          tenantId,
          name: `CARGA usuário ${i + 1}`,
          clientName: 'Cliente sintético',
          city: 'Natal',
          state: 'RN',
        },
      });
      const folder = await db.folder.create({
        data: { tenantId, workId: work.id, name: 'Setor sintético' },
      });
      const hole = await db.borehole.create({
        data: {
          tenantId,
          workId: work.id,
          folderId: folder.id,
          code: 'SP-01',
          plannedDepthM: '4',
          executedDepthM: '4',
          waterLevelM: '1.5',
          fieldDate: new Date('2026-11-02T00:00:00Z'),
        },
      });
      const recordIds = [];
      for (let depth = 1; depth <= 4; depth++) {
        const advances =
          depth === 1 ? [] : [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 }));
        const result =
          depth === 1
            ? {
                ...evaluateSpt({ advances }),
                status: 'NOT_TESTED',
                reason: 'INITIAL_SOIL',
                nSpt: null,
              }
            : evaluateSpt({ advances });
        const record = await db.sptTest.create({
          data: {
            tenantId,
            workId: work.id,
            boreholeId: hole.id,
            depthM: String(depth),
            advances,
            result,
            engineVersion: '0.1.0',
            createdBy: user.id,
            updatedBy: user.id,
          },
        });
        recordIds.push(record.id);
      }
      await db.soilLayer.create({
        data: {
          tenantId,
          workId: work.id,
          boreholeId: hole.id,
          fromM: '0',
          toM: '4',
          soilType: 'Areia fina',
          description: 'Camada sintética para teste de carga',
          soilColor: 'marrom',
          soilMoisture: 'Úmida',
        },
      });
      const actor = {
        index: i,
        tenantId,
        userId: user.id,
        email: user.email,
        role,
        workId: work.id,
        folderId: folder.id,
        holeId: hole.id,
        recordIds,
        successfulSptEdits: 0,
        successfulFieldEdits: 0,
        successfulWorkCreates: 0,
      };
      manifest.actors.push(actor);
    }
    const owner = manifest.actors[0];
    const reportWork = await db.work.create({
      data: {
        tenantId: owner.tenantId,
        name: 'CARGA relatórios sintéticos',
        clientName: 'Cliente fictício',
      },
    });
    manifest.reportWork = reportWork.id;
    for (let i = 0; i < 15; i++) {
      const hole = await db.borehole.create({
        data: {
          tenantId: owner.tenantId,
          workId: reportWork.id,
          code: 'SP-' + String(i + 1).padStart(2, '0'),
          executedDepthM: String(4 + (i % 3)),
          waterLevelM: String(1 + i / 10),
          fieldDate: new Date('2026-11-02T00:00:00Z'),
        },
      });
      for (let d = 1; d <= 4 + (i % 3); d++) {
        const advances =
          d === 1 ? [] : [3 + i, 5 + i, 7 + i].map((blows) => ({ blows, penetrationMm: 150 }));
        const result =
          d === 1
            ? {
                ...evaluateSpt({ advances }),
                status: 'NOT_TESTED',
                reason: 'INITIAL_SOIL',
                nSpt: null,
              }
            : evaluateSpt({ advances });
        await db.sptTest.create({
          data: {
            tenantId: owner.tenantId,
            workId: reportWork.id,
            boreholeId: hole.id,
            depthM: String(d),
            advances,
            result,
            engineVersion: '0.1.0',
            createdBy: owner.userId,
            updatedBy: owner.userId,
          },
        });
      }
      await db.soilLayer.create({
        data: {
          tenantId: owner.tenantId,
          workId: reportWork.id,
          boreholeId: hole.id,
          fromM: '0',
          toM: String(4 + (i % 3)),
          soilType: i % 2 ? 'Argila arenosa' : 'Areia fina',
          description: 'Relatório exclusivamente sintético de desempenho',
        },
      });
      manifest.reportHoles.push(hole.id);
    }
    fs.writeFileSync(destination, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    finalize(config);
  } finally {
    await db.$disconnect();
  }
}
function finalize(config) {
  config.source.lockSha256 = createHash('sha256')
    .update(fs.readFileSync(path.join(repo, 'package-lock.json')))
    .digest('hex');
  config.source.mainEnvSha256Before = createHash('sha256')
    .update(fs.readFileSync(path.join(repo, '.env')))
    .digest('hex');
  config.images = Object.fromEntries(
    ['metro-readiness-worker:local', 'postgres:17-alpine', 'minio/minio:latest'].map((image) => [
      image,
      JSON.parse(run('docker', ['image', 'inspect', image]))[0].Id,
    ]),
  );
  const packages = ['@nestjs/core', '@prisma/client', 'pg', 'sharp', 'playwright'];
  config.dependenciesHost = Object.fromEntries(
    packages.map((name) => [name, packageVersion(name)]),
  );
  config.dependenciesContainer = JSON.parse(
    run('docker', [
      'exec',
      'metro-loadtest-api',
      'node',
      '-e',
      `const fs=require('fs'),path=require('path');${packageVersion.toString()};console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(packages)}.map(name=>[name,packageVersion(name)]))))`,
    ]),
  );
  if (JSON.stringify(config.dependenciesHost) !== JSON.stringify(config.dependenciesContainer))
    throw Error('Runtime dependencies differ; do not benchmark stale image');
  config.runtimeNode = run('docker', [
    'exec',
    'metro-loadtest-api',
    'node',
    '-p',
    'process.version',
  ]).trim();
  config.seedCounts = {
    tenants: 3,
    actors: 50,
    roles: ['ENGINEER', 'OPERATOR', 'COMMERCIAL'],
    works: 51,
    holes: 65,
    metreRecords: 275,
  };
  save(path.join(repo, 'load-test-results/current.json'), config);
  save(path.join(config.dir, 'config-public.json'), config);
  console.log(
    'Seeded 3 tenants, 50 users, 51 works and 65 holes; private manifest saved; dependency versions match',
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
