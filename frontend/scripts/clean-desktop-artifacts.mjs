import { rm } from 'node:fs/promises';
import path from 'node:path';

const targets = [
  'dist',
  '.next',
  'tsconfig.tsbuildinfo',
  '.pyinstaller-desktop',
  path.join('src-tauri', 'target'),
  path.join('src-tauri', 'resources', 'backend-sidecar', 'research-copilot-backend'),
];
const root = process.cwd();

for (const target of targets) {
  const targetPath = path.join(root, target);
  await rm(targetPath, { recursive: true, force: true });
  console.log(`[clean] removed ${target}`);
}
