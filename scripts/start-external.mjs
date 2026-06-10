#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envFile = resolve(rootDir, '.env.external');
const isInteractive = Boolean(input.isTTY && output.isTTY);

const defaults = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: '3000',
  SERVER_DEBUG_MODE: '0',
  SERVER_TPS: '10',
  SERVER_SETTLEMENT_START_MODE: 'candidates',
  SERVER_SPAWN_SAFETY: '0',
  SERVER_REQUIRE_LOOPERLANDS_AUTH: '0',
  SERVER_SEED: '',
  SERVER_SAVE_PATH: '.driftlands/world-save.json',
  SERVER_SAVE_INTERVAL_MS: '5000',
  DRIFTLANDS_ANALYTICS_PATH: '.driftlands/analytics',
  DRIFTLANDS_ANALYTICS_RETENTION_DAYS: '30',
  LOOPERLANDS_API_URL: 'https://api.looperlands.io/api',
  FRONTEND_ORIGIN: '',
};

function parseEnv(contents) {
  const values = { ...defaults };

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return values;
}

function serializeEnv(values) {
  const keys = Object.keys(defaults);
  return `${keys.map((key) => `${key}=${values[key] ?? ''}`).join('\n')}\n`;
}

function frontendOriginLooksMissing(value) {
  return !value || value.includes('<') || value.includes('your-online-frontend-domain');
}

async function loadOrCreateEnv() {
  const values = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8'))
    : { ...defaults };

  if (frontendOriginLooksMissing(values.FRONTEND_ORIGIN)) {
    if (!isInteractive) {
      throw new Error(`Set FRONTEND_ORIGIN in ${envFile} before starting external mode.`);
    }

    const rl = readline.createInterface({ input, output });
    try {
      console.log('\nDriftlands external server setup');
      console.log('This is saved in .env.external, so you only need to answer once.\n');
      const answer = await rl.question('Online frontend origin, for example https://play.example.com: ');
      values.FRONTEND_ORIGIN = answer.trim();
      if (frontendOriginLooksMissing(values.FRONTEND_ORIGIN)) {
        throw new Error('FRONTEND_ORIGIN is required so browser requests are allowed by CORS.');
      }
    } finally {
      rl.close();
    }

    writeFileSync(envFile, serializeEnv(values));
    console.log(`\nSaved ${envFile}`);
  }

  return values;
}

function startServer(values) {
  const env = {
    ...process.env,
    ...values,
    DRIFTLANDS_ENV_FILE: envFile,
  };

  console.log(`\nStarting Driftlands external server on ${values.HOST}:${values.PORT}`);
  console.log(`Allowed frontend origin: ${values.FRONTEND_ORIGIN}`);
  console.log(`Config file: ${envFile}\n`);

  const child = spawn('npm', ['run', 'start:server'], {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  });

  child.on('close', (code) => {
    process.exitCode = code ?? 1;
  });
  child.on('error', (error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exitCode = 1;
  });
}

try {
  const values = await loadOrCreateEnv();
  startServer(values);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
