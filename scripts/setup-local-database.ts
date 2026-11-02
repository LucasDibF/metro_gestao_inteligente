import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  if (!url || !adminUrl) throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL are required');
  const runtime = new URL(url);
  if (runtime.hostname !== 'localhost' && runtime.hostname !== '127.0.0.1') {
    throw new Error('This provisioning script is restricted to local development');
  }
  if (decodeURIComponent(runtime.username) !== 'spt_runtime')
    throw new Error('Expected local spt_runtime role');
  const admin = new URL(adminUrl);
  if (
    admin.hostname !== runtime.hostname ||
    admin.port !== runtime.port ||
    admin.pathname !== runtime.pathname
  ) {
    throw new Error('Runtime and migration URLs must point to the same local database');
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
  try {
    // Password is escaped as a SQL literal and never logged; role name is constant.
    const password = decodeURIComponent(runtime.password).replaceAll("'", "''");
    if (!password) throw new Error('Runtime password is required');
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spt_runtime') THEN CREATE ROLE spt_runtime LOGIN; END IF; END $$`,
    );
    await db.$executeRawUnsafe(
      `ALTER ROLE spt_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    );
    const databaseName = decodeURIComponent(runtime.pathname.slice(1));
    await db.$executeRawUnsafe(
      'GRANT CONNECT ON DATABASE "' + databaseName.replaceAll('"', '""') + '" TO spt_runtime',
    );
    await db.$executeRaw`GRANT USAGE ON SCHEMA public TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT ON tenants, memberships, users TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON auth_sessions TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_credentials TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON works TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON folders, boreholes TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON spt_tests TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON soil_layers TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT ON technical_events TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON borehole_coordinates, borehole_photos TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT, UPDATE ON reports TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT ON report_issues TO spt_runtime`;
    await db.$executeRaw`REVOKE UPDATE ON borehole_photos FROM spt_runtime`;
    await db.$executeRaw`GRANT UPDATE(caption,crop,purpose,deleted_at,version,updated_at) ON borehole_photos TO spt_runtime`;
    await db.$executeRaw`GRANT SELECT, INSERT ON notification_reads TO spt_runtime`;
    console.log('Local runtime role provisioned with scoped application privileges');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Local database provisioning failed');
  process.exitCode = 1;
});
