const { fs, path, repo, run, sleep, save } = require('./common.cjs');
const { randomBytes, randomUUID } = require('node:crypto');
const writeEnv = (file, values) =>
  fs.writeFileSync(
    file,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
async function main() {
  if (process.argv.includes('--resume')) return resume();
  if (fs.existsSync(path.join(repo, '.env.loadtest')))
    throw Error(
      'Existing load-test environment preserved; inspect/clean it explicitly before preparing another',
    );
  const runId = 'local-' + new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(repo, 'load-test-results', runId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const certs = path.join(dir, 'certs');
  fs.mkdirSync(certs, { mode: 0o700 });
  const prefix = 'metro-loadtest';
  for (const name of [prefix + '-db', prefix + '-storage', prefix + '-api', prefix + '-worker']) {
    try {
      run('docker', ['inspect', name], { stdio: 'ignore' });
      throw Error('Existing dedicated container must be inspected before reuse: ' + name);
    } catch (e) {
      if (!e.status) throw e;
    }
  }
  run('docker', ['image', 'inspect', 'postgres:17-alpine'], { stdio: 'ignore' });
  run('docker', ['image', 'inspect', 'minio/minio:latest'], { stdio: 'ignore' });
  run('docker', ['image', 'inspect', 'metro-readiness-worker:local'], { stdio: 'ignore' });
  run(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-keyout',
      path.join(certs, 'private.key'),
      '-out',
      path.join(certs, 'public.crt'),
      '-subj',
      '/CN=metro-loadtest-storage',
      '-addext',
      'subjectAltName=DNS:metro-loadtest-storage,DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  fs.chmodSync(path.join(certs, 'private.key'), 0o600);
  const password = randomBytes(24).toString('hex');
  const hostEnv = {
    NODE_ENV: 'test',
    DEV_AUTH_BYPASS: 'false',
    PORT: '34270',
    DATABASE_URL: `postgresql://spt_runtime:${password}@127.0.0.1:55470/spt_loadtest?schema=public`,
    MIGRATION_DATABASE_URL: `postgresql://spt:${password}@127.0.0.1:55470/spt_loadtest?schema=public`,
    WORKER_DATABASE_URL: `postgresql://spt_worker:${password}@127.0.0.1:55470/spt_loadtest?schema=public`,
    JWT_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    S3_ENDPOINT: 'https://localhost:59070',
    S3_BUCKET: 'metro-loadtest-private',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'metro-loadtest-local',
    S3_SECRET_ACCESS_KEY: randomBytes(24).toString('hex'),
    NODE_EXTRA_CA_CERTS: path.join(certs, 'public.crt'),
    INPE_MAP_ENABLED: 'false',
    GOOGLE_MAPS_API_KEY: '',
    GOOGLE_MAPS_EMBED_API_KEY: '',
  };
  writeEnv(path.join(repo, '.env.loadtest'), hostEnv);
  const config = {
    runId,
    dir,
    certs,
    prefix,
    base: 'http://127.0.0.1:34270/api/v1',
    createdAt: new Date().toISOString(),
    isolation: {
      database: 'exclusive container/cluster',
      network:
        'dedicated Docker bridge; external map integrations disabled; no outbound firewall guarantee',
      bucket: 'exclusive MinIO instance',
      environment: '.env.loadtest only',
    },
    limits: {
      api: { cpu: 1, memoryMiB: 1024 },
      worker: { cpu: 1, memoryMiB: 2048 },
      db: { cpu: 1, memoryMiB: 512 },
      storage: { cpu: 1, memoryMiB: 512 },
    },
    source: {
      commit: run('git', ['rev-parse', 'HEAD']).trim(),
      status: run('git', ['status', '--short']).trim(),
    },
    host: {
      arch: process.arch,
      node: process.version,
      cpuCount: require('node:os').cpus().length,
      hostMemoryGiB: require('node:os').totalmem() / 2 ** 30,
      dockerMemoryBytes: Number(run('docker', ['info', '--format', '{{.MemTotal}}']).trim()),
    },
  };
  save(path.join(repo, 'load-test-results/current.json'), config);
  save(path.join(dir, 'config-public.json'), config);
  run('docker', ['network', 'create', prefix + '-net']);
  run('docker', [
    'run',
    '-d',
    '--name',
    prefix + '-db',
    '--label',
    'metro.loadtest=' + runId,
    '--network',
    prefix + '-net',
    '--cpus=1',
    '--memory=512m',
    '-p',
    '127.0.0.1:55470:5432',
    '-e',
    'POSTGRES_USER=spt',
    '-e',
    'POSTGRES_PASSWORD=' + password,
    '-e',
    'POSTGRES_DB=spt_loadtest',
    'postgres:17-alpine',
  ]);
  run('docker', [
    'run',
    '-d',
    '--name',
    prefix + '-storage',
    '--label',
    'metro.loadtest=' + runId,
    '--network',
    prefix + '-net',
    '--cpus=1',
    '--memory=512m',
    '-p',
    '127.0.0.1:59070:9000',
    '-e',
    'MINIO_ROOT_USER=' + hostEnv.S3_ACCESS_KEY_ID,
    '-e',
    'MINIO_ROOT_PASSWORD=' + hostEnv.S3_SECRET_ACCESS_KEY,
    '--mount',
    `type=bind,src=${certs},dst=/certs,readonly`,
    'minio/minio:latest',
    'server',
    '/data',
    '--certs-dir',
    '/certs',
  ]);
  for (let i = 0; i < 30; i++) {
    try {
      run('docker', ['exec', prefix + '-db', 'pg_isready', '-U', 'spt', '-d', 'spt_loadtest'], {
        stdio: 'ignore',
      });
      break;
    } catch {
      if (i === 29) throw Error('Dedicated PostgreSQL not ready');
      await sleep(1000);
    }
  }
  run('docker', [
    'exec',
    prefix + '-db',
    'psql',
    '-U',
    'spt',
    '-d',
    'spt_loadtest',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'CREATE ROLE spt_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;',
  ]);
  const commands = ['db:migrate', 'db:setup:local', 'worker:setup:local', 'storage:setup:local'];
  for (const command of commands) {
    const output = run('npm', ['run', command], { env: { ...process.env, ...hostEnv } });
    fs.writeFileSync(path.join(dir, command.replaceAll(':', '-') + '.log'), output);
    console.log('Prepared ' + command);
  }
  const runtime = {
    ...hostEnv,
    NODE_ENV: 'production',
    NODE_EXTRA_CA_CERTS: '/audit-ca/public.crt',
    S3_ENDPOINT: 'https://metro-loadtest-storage:9000',
    DATABASE_URL: hostEnv.DATABASE_URL.replace('127.0.0.1:55470', 'metro-loadtest-db:5432'),
    WORKER_DATABASE_URL: hostEnv.WORKER_DATABASE_URL.replace(
      '127.0.0.1:55470',
      'metro-loadtest-db:5432',
    ),
  };
  delete runtime.MIGRATION_DATABASE_URL;
  const runtimeFile = path.join(dir, 'runtime.env');
  writeEnv(runtimeFile, runtime);
  for (const service of ['api', 'worker']) {
    const limit = config.limits[service];
    const args = [
      'run',
      '-d',
      '--name',
      prefix + '-' + service,
      '--label',
      'metro.loadtest=' + runId,
      '--network',
      prefix + '-net',
      '--cpus=' + limit.cpu,
      '--memory=' + limit.memoryMiB + 'm',
      '--init',
      '--env-file',
      runtimeFile,
      '--mount',
      `type=bind,src=${certs},dst=/audit-ca,readonly`,
      '--mount',
      `type=bind,src=${repo}/apps,dst=/app/apps,readonly`,
      '--mount',
      `type=bind,src=${repo}/packages,dst=/app/packages,readonly`,
    ];
    if (service === 'api') args.push('-p', '127.0.0.1:34270:34270');
    args.push(
      '--entrypoint',
      'node',
      'metro-readiness-worker:local',
      `apps/${service}/dist/main.js`,
    );
    run('docker', args);
  }
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(config.base + '/health/ready');
      if (r.ok) {
        console.log('Isolated compiled API/worker ready: ' + runId);
        return;
      }
    } catch {}
    await sleep(500);
  }
  throw Error('Dedicated API failed to become ready; inspect only dedicated container logs');
}
async function resume() {
  const { config, env: hostEnv } = require('./common.cjs').load();
  const { dir, certs, prefix, runId } = config;
  config.isolation.network =
    'dedicated Docker bridge; external map integrations disabled; no outbound firewall guarantee';
  const inspected = JSON.parse(run('docker', ['network', 'inspect', prefix + '-net']))[0];
  if (inspected.Internal) {
    for (const service of ['db', 'storage']) {
      const name = prefix + '-' + service;
      const item = JSON.parse(run('docker', ['inspect', name]))[0];
      if (item.Config.Labels['metro.loadtest'] !== config.runId)
        throw Error('Container ownership mismatch');
      run('docker', ['network', 'disconnect', prefix + '-net', name]);
    }
    run('docker', ['network', 'rm', prefix + '-net']);
    run('docker', ['network', 'create', prefix + '-net']);
    for (const service of ['db', 'storage'])
      run('docker', ['network', 'connect', prefix + '-net', prefix + '-' + service]);
  }
  save(path.join(repo, 'load-test-results/current.json'), config);
  save(path.join(dir, 'config-public.json'), config);
  const commands = ['db:migrate', 'db:setup:local', 'worker:setup:local', 'storage:setup:local'];
  for (const command of commands) {
    const output = run('npm', ['run', command], { env: { ...process.env, ...hostEnv } });
    fs.writeFileSync(path.join(dir, command.replaceAll(':', '-') + '.log'), output);
    console.log('Prepared ' + command);
  }
  const runtime = {
    ...hostEnv,
    NODE_ENV: 'production',
    NODE_EXTRA_CA_CERTS: '/audit-ca/public.crt',
    S3_ENDPOINT: 'https://metro-loadtest-storage:9000',
    DATABASE_URL: hostEnv.DATABASE_URL.replace('127.0.0.1:55470', 'metro-loadtest-db:5432'),
    WORKER_DATABASE_URL: hostEnv.WORKER_DATABASE_URL.replace(
      '127.0.0.1:55470',
      'metro-loadtest-db:5432',
    ),
  };
  delete runtime.MIGRATION_DATABASE_URL;
  const runtimeFile = path.join(dir, 'runtime.env');
  writeEnv(runtimeFile, runtime);
  for (const service of ['api', 'worker']) {
    const limit = config.limits[service];
    const args = [
      'run',
      '-d',
      '--name',
      prefix + '-' + service,
      '--label',
      'metro.loadtest=' + runId,
      '--network',
      prefix + '-net',
      '--cpus=' + limit.cpu,
      '--memory=' + limit.memoryMiB + 'm',
      '--init',
      '--env-file',
      runtimeFile,
      '--mount',
      `type=bind,src=${certs},dst=/audit-ca,readonly`,
      '--mount',
      `type=bind,src=${repo}/apps,dst=/app/apps,readonly`,
      '--mount',
      `type=bind,src=${repo}/packages,dst=/app/packages,readonly`,
    ];
    if (service === 'api') args.push('-p', '127.0.0.1:34270:34270');
    args.push(
      '--entrypoint',
      'node',
      'metro-readiness-worker:local',
      `apps/${service}/dist/main.js`,
    );
    run('docker', args);
  }
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(config.base + '/health/ready');
      if (r.ok) {
        console.log('Isolated compiled API/worker ready: ' + runId);
        return;
      }
    } catch {}
    await sleep(500);
  }
  throw Error('Dedicated API failed to become ready; inspect only dedicated container logs');
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
