export function assertTestTarget(env: Record<string, string | undefined> = process.env) {
  const urls = ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL'].map((key) => {
    if (!env[key]) throw Error('Configure o ambiente isolado com npm run test:setup:local.');
    return new URL(env[key]!);
  });
  const first = urls[0];
  if (
    urls.some(
      (url) =>
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.hostname !== first.hostname ||
        url.port !== first.port ||
        url.pathname !== first.pathname,
    )
  )
    throw Error('Os testes exigem conexões para o mesmo banco local isolado.');
  if (first.pathname !== '/spt_test' && !(env.CI && first.pathname === '/spt'))
    throw Error('Testes recusados no banco de desenvolvimento. Execute npm run test:setup:local.');
  if (!env.CI && env.S3_BUCKET !== 'spt-test-private')
    throw Error('Os testes exigem o bucket privado de testes.');
}
