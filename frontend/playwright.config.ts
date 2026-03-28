import { defineConfig } from '@playwright/test';

const frontendRoot = process.cwd();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File ..\\scripts\\run_backend_e2e.ps1',
      cwd: frontendRoot,
      url: 'http://127.0.0.1:8010/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File ..\\scripts\\run_frontend_e2e.ps1',
      cwd: frontendRoot,
      url: 'http://127.0.0.1:3101/',
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
