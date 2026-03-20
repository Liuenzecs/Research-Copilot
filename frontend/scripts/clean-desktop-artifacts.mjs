import { rm } from 'node:fs/promises';
import path from 'node:path';

const targets = ['dist', '.next', 'tsconfig.tsbuildinfo'];
const root = process.cwd();

for (const target of targets) {
  const targetPath = path.join(root, target);
  await rm(targetPath, { recursive: true, force: true });
  console.log(`[clean] removed ${target}`);
}
