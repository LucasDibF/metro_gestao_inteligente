const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const configFile = path.join(repo, '.env.loadtest');
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}
function load() {
  const config = JSON.parse(
    fs.readFileSync(path.join(repo, 'load-test-results/current.json'), 'utf8'),
  );
  const env = require('dotenv').parse(fs.readFileSync(configFile));
  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL']) {
    const url = new URL(env[key]);
    if (url.hostname !== '127.0.0.1' || url.port !== '55470' || url.pathname !== '/spt_loadtest')
      throw Error('Refusing unsafe database target');
  }
  if (
    env.S3_BUCKET !== 'metro-loadtest-private' ||
    new URL(env.S3_ENDPOINT).hostname !== 'localhost' ||
    new URL(env.S3_ENDPOINT).port !== '59070'
  )
    throw Error('Refusing unsafe storage target');
  if (config.base !== 'http://127.0.0.1:34270/api/v1' || config.prefix !== 'metro-loadtest')
    throw Error('Refusing unsafe API target');
  return { config, env };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function save(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
module.exports = { fs, path, repo, run, load, sleep, save };
