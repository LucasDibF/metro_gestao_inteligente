const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const testing = process.argv[2] === 'test';
const config = dotenv.parse(fs.readFileSync(path.join(root, testing ? '.env.test' : '.env')));
if (testing) {
  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL']) {
    const url = new URL(config[key]);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/spt_test')
      throw Error('O ambiente de testes exige o banco local spt_test.');
  }
  if (config.S3_BUCKET !== 'spt-test-private') throw Error('Bucket de testes inválido.');
}
const webPort = testing ? 4001 : 3001;
const apiPort = testing ? 4000 : 3000;
const env = { ...process.env, ...config, PORT: String(apiPort), SPT_API_TARGET: `http://127.0.0.1:${apiPort}` };
const processes = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of processes) child.kill('SIGTERM');
}
function run(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  processes.push(child);
  child.on('error', () => stop(1));
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
run(['apps/api/dist/main.js']);
run(['apps/worker/dist/main.js']);
run(['node_modules/vite/bin/vite.js', 'apps/web', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort']);
console.log(`${testing ? 'Testes' : 'Local'}: http://localhost:${webPort}`);
