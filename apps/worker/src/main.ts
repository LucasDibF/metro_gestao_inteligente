import { processNextPhoto } from './photo-worker';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { processNextReport } from './report-worker';
async function main() {
  const connectionString = process.env.WORKER_DATABASE_URL;
  if (!connectionString) throw Error('WORKER_DATABASE_URL is required');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000, max: 3 }),
  });
  let stopping = false;
  process.on('SIGTERM', () => {
    stopping = true;
  });
  process.on('SIGINT', () => {
    stopping = true;
  });
  try {
    const [role] = await db.$queryRaw<
      Array<{ safe: boolean }>
    >`SELECT (r.rolname='spt_worker' AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner=current_user)) AS safe FROM pg_roles r WHERE r.rolname=current_user`;
    if (!role?.safe) throw Error('Worker requires restricted spt_worker role');
    console.log(JSON.stringify({ event: 'worker_started' }));
    while (!stopping) {
      const photo = await processNextPhoto(db);
      if (!(await processNextReport(db)) && !photo)
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'worker_stopped_with_error' }));
  process.exitCode = 1;
});
