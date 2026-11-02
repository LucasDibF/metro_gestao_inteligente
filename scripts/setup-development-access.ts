import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { hashPassword } from '../apps/api/src/auth/password';

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString || !['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname))
    throw new Error('Local database required');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const password = process.env.DEV_AUTH_TEST_PASSWORD ?? randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(password);
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: 'dev-bypass@example.invalid' },
        create: {
          email: 'dev-bypass@example.invalid',
          passwordHash,
        },
        update: { passwordHash },
      });
      let membership = await tx.membership.findFirst({
        where: { userId: user.id },
        include: { tenant: true },
      });
      if (!membership) {
        const tenant = await tx.tenant.create({
          data: {
            name: 'Empresa de testes local',
            memberships: { create: { userId: user.id, role: 'ADMIN' } },
          },
        });
        membership = await tx.membership.findUniqueOrThrow({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
          include: { tenant: true },
        });
      }
      return { userId: user.id, tenantId: membership.tenantId };
    });
    await db.$executeRaw`CREATE OR REPLACE FUNCTION set_local_test_role(test_user UUID,test_tenant UUID,test_role TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
      IF test_user::text IS DISTINCT FROM current_setting('app.user_id',true) OR test_tenant::text IS DISTINCT FROM current_setting('app.tenant_id',true) OR test_role NOT IN ('ADMIN','ENGINEER','OPERATOR','COMMERCIAL','VIEWER') OR NOT EXISTS(SELECT 1 FROM public.users u JOIN public.memberships m ON m.user_id=u.id WHERE u.id=test_user AND u.email='dev-bypass@example.invalid' AND u.active AND m.tenant_id=test_tenant AND m.active) THEN RAISE EXCEPTION 'Development role unavailable'; END IF;
      UPDATE public.memberships SET additional_roles='{}',role=test_role::public."MembershipRole" WHERE user_id=test_user AND tenant_id=test_tenant;
    END $$`;
    await db.$executeRaw`REVOKE ALL ON FUNCTION set_local_test_role(UUID,UUID,TEXT) FROM PUBLIC`;
    await db.$executeRaw`GRANT EXECUTE ON FUNCTION set_local_test_role(UUID,UUID,TEXT) TO spt_runtime`;
    let env = await readFile('.env', 'utf8');
    for (const [key, value] of Object.entries({
      NODE_ENV: 'development',
      DEV_AUTH_BYPASS: 'true',
      DEV_AUTH_USER_ID: result.userId,
      DEV_AUTH_TENANT_ID: result.tenantId,
      DEV_AUTH_TEST_PASSWORD: password,
    })) {
      const expression = new RegExp('^' + key + '=.*$', 'm');
      env = expression.test(env)
        ? env.replace(expression, key + '=' + value)
        : env + String.fromCharCode(10) + key + '=' + value;
    }
    await writeFile('.env', env.trim() + String.fromCharCode(10));
    console.log('Local test account configured and DEV_AUTH_BYPASS enabled');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Development access setup failed');
  process.exitCode = 1;
});
