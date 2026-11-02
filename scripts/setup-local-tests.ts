import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
async function main() {
  const development = parse(await readFile('.env', 'utf8'));
  const adminUrl = new URL(development.MIGRATION_DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(adminUrl.hostname) || adminUrl.pathname !== '/spt')
    throw Error('Test provisioning requires the local development database');
  let existing: Record<string, string> = {};
  try {
    existing = parse(await readFile('.env.test', 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const config: Record<string, string> = {
    ...development,
    ...existing,
    NODE_ENV: 'test',
    DEV_AUTH_BYPASS: 'false',
    S3_BUCKET: 'spt-test-private',
  };
  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL']) {
    const url = new URL(development[key]);
    url.pathname = '/spt_test';
    if (existing[key] && existing[key] !== url.href)
      throw Error('Existing test connection differs; configuration preserved');
    config[key] = url.href;
  }
  config.JWT_SECRET = existing.JWT_SECRET ?? randomBytes(32).toString('hex');
  config.MFA_ENCRYPTION_KEY = existing.MFA_ENCRYPTION_KEY ?? randomBytes(32).toString('hex');
  await writeFile(
    '.env.test',
    Object.entries(config)
      .map(([k, v]) => k + '=' + v)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl.href }) });
  try {
    const rows = await db.$queryRaw<
      Array<{ exists: boolean }>
    >`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='spt_test') AS exists`;
    if (!rows[0].exists) await db.$executeRaw`CREATE DATABASE spt_test`;
  } finally {
    await db.$disconnect();
  }
  for (const command of [
    'db:migrate',
    'db:setup:local',
    'worker:setup:local',
    'storage:setup:local',
  ])
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npm', ['run', command], {
        env: { ...process.env, ...config },
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(Error('Test provisioning failed')),
      );
    });
  console.log(
    'Dedicated local test database and private bucket configured; development data preserved',
  );
}
main().catch(() => {
  console.error('Local test setup failed');
  process.exitCode = 1;
});
