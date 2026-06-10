#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

const desktopPort = process.env.DRIFTLANDS_DESKTOP_PORT || '3695';
const env = {
  ...process.env,
  DRIFTLANDS_BUILD_TARGET: 'steam-demo',
  DRIFTLANDS_DEMO_MODE: '1',
  SERVER_DEBUG_MODE: '0',
  SERVER_REQUIRE_LOOPERLANDS_AUTH: '0',
  SERVER_SETTLEMENT_START_MODE: 'free',
  SERVER_SPAWN_SAFETY: '1',
  VITE_DRIFTLANDS_BUILD_TARGET: 'steam-demo',
  VITE_SERVER_URL: `http://127.0.0.1:${desktopPort}`,
};

function commandName(command) {
  if (process.platform === 'win32') {
    return `${command}.cmd`;
  }

  return command;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      env,
      shell: false,
      stdio: 'inherit',
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
    });
  });
}

await run('npm', ['run', 'build']);
await run('esbuild', [
  'server/src/index.ts',
  '--bundle',
  '--platform=node',
  '--target=node20',
  '--format=esm',
  '--banner:js=import { createRequire } from \'node:module\'; const require = createRequire(import.meta.url);',
  '--outfile=dist-server/index.mjs',
]);
