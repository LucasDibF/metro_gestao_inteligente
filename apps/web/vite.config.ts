import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: { '/api': process.env.SPT_API_TARGET ?? 'http://127.0.0.1:3000' } },
  preview: { proxy: { '/api': process.env.SPT_API_TARGET ?? 'http://127.0.0.1:3000' } },
});
