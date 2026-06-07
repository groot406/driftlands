#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cliPath = resolve(rootDir, 'src/shared/changelog/releaseGeneratorCli.ts');
const tsxBin = resolve(rootDir, 'node_modules/.bin/tsx');
const runner = existsSync(tsxBin) ? tsxBin : 'tsx';
const result = spawnSync(runner, [cliPath, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`[changelog] failed to start generator: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
