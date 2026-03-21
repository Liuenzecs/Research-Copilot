import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const command = process.argv[2];

if (!command || !['dev', 'build'].includes(command)) {
  console.error('[desktop] usage: node ./scripts/run-tauri-with-build-metadata.mjs <dev|build>');
  process.exit(1);
}

function resolveGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

const buildTimestamp = new Date().toISOString();
const gitCommit = resolveGitCommit();
const buildMode = command === 'dev' ? 'desktop-dev' : 'desktop-build';

const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', `npx tauri ${command}`], {
      cwd: frontendRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        RC_BUILD_TIMESTAMP: buildTimestamp,
        RC_GIT_COMMIT: gitCommit,
        RC_BUILD_MODE: buildMode,
      },
    })
  : spawn('npx', ['tauri', command], {
      cwd: frontendRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        RC_BUILD_TIMESTAMP: buildTimestamp,
        RC_GIT_COMMIT: gitCommit,
        RC_BUILD_MODE: buildMode,
      },
    });

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
