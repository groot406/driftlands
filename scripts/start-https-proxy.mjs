#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envFile = resolve(rootDir, '.env.https');
const caddyfile = resolve(rootDir, '.caddy/Caddyfile');
const isInteractive = Boolean(input.isTTY && output.isTTY);

const defaults = {
  DRIFTLANDS_HTTPS_DOMAIN: '',
  DRIFTLANDS_HTTPS_CONTAINER: 'driftlands-https',
  DRIFTLANDS_HTTPS_TARGET: 'host.docker.internal:3000',
  DRIFTLANDS_HTTPS_EMAIL: '',
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
  return `${Object.keys(defaults).map((key) => `${key}=${values[key] ?? ''}`).join('\n')}\n`;
}

function domainLooksMissing(value) {
  return !value || value.includes('<') || value.includes('example.com') || value.startsWith('http://') || value.startsWith('https://');
}

async function ask(question, fallback = '') {
  const rl = readline.createInterface({ input, output });
  try {
    const suffix = fallback ? ` [${fallback}]` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || fallback;
  } finally {
    rl.close();
  }
}

async function loadOrCreateEnv() {
  const values = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8'))
    : { ...defaults };

  if (domainLooksMissing(values.DRIFTLANDS_HTTPS_DOMAIN)) {
    if (!isInteractive) {
      throw new Error(`Set DRIFTLANDS_HTTPS_DOMAIN in ${envFile} before starting HTTPS proxy mode.`);
    }

    console.log('\nDriftlands HTTPS proxy setup');
    console.log('Use a real DNS hostname, not the raw public IP. Example: driftlands.looperlands.io');
    console.log('Point that hostname at your public IP, then forward router ports 80 and 443 to this machine.\n');

    values.DRIFTLANDS_HTTPS_DOMAIN = await ask('Backend hostname');
    if (domainLooksMissing(values.DRIFTLANDS_HTTPS_DOMAIN)) {
      throw new Error('A plain hostname is required, for example driftlands.looperlands.io.');
    }
    values.DRIFTLANDS_HTTPS_EMAIL = await ask('Email for certificate notices (optional)', values.DRIFTLANDS_HTTPS_EMAIL);

    writeFileSync(envFile, serializeEnv(values));
    console.log(`\nSaved ${envFile}`);
  }

  return values;
}

function writeCaddyfile(values) {
  const emailLine = values.DRIFTLANDS_HTTPS_EMAIL
    ? `  email ${values.DRIFTLANDS_HTTPS_EMAIL}\n`
    : '';
  const contents = `${emailLine ? `{\n${emailLine}}\n\n` : ''}${values.DRIFTLANDS_HTTPS_DOMAIN} {
  reverse_proxy ${values.DRIFTLANDS_HTTPS_TARGET}
}
`;

  mkdirSync(dirname(caddyfile), { recursive: true });
  writeFileSync(caddyfile, contents);
  console.log(`Wrote ${caddyfile}`);
}

function run(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolveRun(code ?? 1));
    child.on('error', (error) => {
      console.error(`Failed to start ${command}: ${error.message}`);
      resolveRun(1);
    });
  });
}

async function startCaddy(values) {
  await run('docker', ['rm', '-f', values.DRIFTLANDS_HTTPS_CONTAINER]);
  const code = await run('docker', [
    'run',
    '-d',
    '--name',
    values.DRIFTLANDS_HTTPS_CONTAINER,
    '--restart',
    'unless-stopped',
    '-p',
    '80:80',
    '-p',
    '443:443',
    '-v',
    `${caddyfile}:/etc/caddy/Caddyfile:ro`,
    '-v',
    'driftlands-caddy-data:/data',
    '-v',
    'driftlands-caddy-config:/config',
    'caddy:2',
  ]);

  if (code === 0) {
    console.log(`\nHTTPS proxy starting at https://${values.DRIFTLANDS_HTTPS_DOMAIN}`);
    console.log(`Health check: https://${values.DRIFTLANDS_HTTPS_DOMAIN}/health`);
    console.log('\nFrontend env should use:');
    console.log(`VITE_DRIFTLANDS_SERVER_URL=https://${values.DRIFTLANDS_HTTPS_DOMAIN}`);
  }
}

try {
  const values = await loadOrCreateEnv();
  writeCaddyfile(values);
  await startCaddy(values);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
