import { assertTestTarget } from './scripts/test-target';
import {config} from 'dotenv';
config({path:'.env.test',quiet:true});
config({quiet:true});
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4177', launchOptions: { executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined } },
  webServer: [
    { command: 'node --env-file-if-exists=.env apps/api/dist/main.js', url: 'http://127.0.0.1:34117/api/v1/health/ready', env: { PORT: '34117', DEV_AUTH_BYPASS: 'false' } },
    { command: 'npm run preview -w @spt/web -- --port 4177', url: 'http://127.0.0.1:4177', env: { SPT_API_TARGET: 'http://127.0.0.1:34117' } },
  ],
});
