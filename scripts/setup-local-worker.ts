import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
async function main() {
  const runtime = new URL(process.env.WORKER_DATABASE_URL ?? ''),
    admin = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
  if (
    !['localhost', '127.0.0.1'].includes(runtime.hostname) ||
    runtime.hostname !== admin.hostname ||
    runtime.port !== admin.port ||
    runtime.pathname !== admin.pathname ||
    decodeURIComponent(runtime.username) !== 'spt_worker' ||
    process.env.NODE_ENV === 'production'
  )
    throw Error('Local worker provisioning only');
  const password = decodeURIComponent(runtime.password).replaceAll("'", "''");
  if (!password) throw Error('Worker password required');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: admin.href }) });
  try {
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_worker') THEN CREATE ROLE spt_worker LOGIN;END IF;END $$`,
    );
    await db.$executeRawUnsafe(
      `ALTER ROLE spt_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    );
    const databaseName = decodeURIComponent(runtime.pathname.slice(1));
    await db.$executeRawUnsafe(
      'GRANT CONNECT ON DATABASE "' + databaseName.replaceAll('"', '""') + '" TO spt_worker',
    );
    await db.$executeRaw`GRANT USAGE ON SCHEMA public TO spt_worker`;
    await db.$executeRaw`GRANT EXECUTE ON FUNCTION claim_report_job(UUID),renew_report_job(UUID,UUID),fail_report_job(UUID,UUID,BOOLEAN),publish_report_job(UUID,UUID,TEXT,TEXT) TO spt_worker`;
    await db.$executeRaw`GRANT EXECUTE ON FUNCTION claim_photo_job(UUID),finish_photo_job(UUID,UUID,DOUBLE PRECISION,DOUBLE PRECISION),fail_photo_job(UUID,UUID,BOOLEAN) TO spt_worker`;
    console.log('Local worker role provisioned with queue functions only');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Local worker provisioning failed');
  process.exitCode = 1;
});
