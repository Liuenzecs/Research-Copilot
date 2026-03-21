import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = __dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
