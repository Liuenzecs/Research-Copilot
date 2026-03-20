import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = __dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
      'next/link': path.resolve(rootDir, 'src/desktop-shims/next-link.tsx'),
      'next/navigation': path.resolve(rootDir, 'src/desktop-shims/next-navigation.ts'),
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
