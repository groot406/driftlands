#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rl = readline.createInterface({ input, output });
const isInteractive = Boolean(input.isTTY && output.isTTY);
const useColor = Boolean(output.isTTY && !process.env.NO_COLOR);
const useAnimation = Boolean(isInteractive && !process.env.CI && !process.env.DRIFTLANDS_TUI_NO_ANIMATION);
const defaultAdminWallets = '0xfE49e5c384f5FddDFc52e9610BfAB3d49D86847D';

const config = {
  image: process.env.DRIFTLANDS_IMAGE || 'driftlands:latest',
  network: process.env.DRIFTLANDS_DOCKER_NETWORK || 'driftlands-net',
  serverContainer: process.env.DRIFTLANDS_CONTAINER || 'driftlands',
  caddyContainer: process.env.DRIFTLANDS_CADDY_CONTAINER || 'driftlands-caddy',
  caddyDataVolume: process.env.DRIFTLANDS_CADDY_DATA_VOLUME || 'driftlands-caddy-data',
  configDir: process.env.DRIFTLANDS_CONFIG_DIR || '/config/driftlands',
  domain: process.env.DRIFTLANDS_DOMAIN || 'driftlands.example.com',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'https://<looperlands-platform-frontend-domain>',
  adminWallets: process.env.DRIFTLANDS_ADMIN_WALLETS || defaultAdminWallets,
  publishServerPort: process.env.DRIFTLANDS_PUBLISH_SERVER_PORT || '',
  frontendRepoPath: resolve(process.env.DRIFTLANDS_FRONTEND_REPO || '../looperlands-platform-frontend'),
  frontendDeployCommand: process.env.DRIFTLANDS_FRONTEND_DEPLOY_COMMAND || '',
  frontendCommitMessage: process.env.DRIFTLANDS_FRONTEND_COMMIT_MESSAGE || 'Update embedded Driftlands client',
  haosBundleDir: resolve(process.env.DRIFTLANDS_HAOS_BUNDLE_DIR || 'output/haos'),
  haosBundlePort: process.env.DRIFTLANDS_HAOS_BUNDLE_PORT || '8899',
  haosPublishPort: process.env.DRIFTLANDS_HAOS_PUBLISH_PORT || '3695',
  haosImagePlatform: process.env.DRIFTLANDS_HAOS_IMAGE_PLATFORM || 'linux/amd64',
  haosFrontendOrigin: process.env.DRIFTLANDS_HAOS_FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN || 'https://looperlands.io',
  haosSshHost: process.env.DRIFTLANDS_HAOS_SSH_HOST || 'haos',
  haosRemoteDir: process.env.DRIFTLANDS_HAOS_REMOTE_DIR || '/config/driftlands',
};

config.envFile = process.env.DRIFTLANDS_ENV_FILE || `${config.configDir}/.env`;
config.caddyfile = process.env.DRIFTLANDS_CADDYFILE || `${config.configDir}/Caddyfile`;
config.healthUrl = process.env.DRIFTLANDS_HEALTH_URL || `https://${config.domain}/health`;

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
};

const logo = [
  ' ____  ____  ___ _____ _____ _      _    _   _ ____  ____  ',
  '|  _ \\|  _ \\|_ _|  ___|_   _| |    / \\  | \\ | |  _ \\/ ___| ',
  '| | | | |_) || || |_    | | | |   / _ \\ |  \\| | | | \\___ \\ ',
  '| |_| |  _ < | ||  _|   | | | |__/ ___ \\| |\\  | |_| |___) |',
  '|____/|_| \\_\\___|_|     |_| |____/_/   \\_\\_| \\_|____/|____/ ',
];

const menuItems = [
  ['overview', 'Overview', 'Check containers, image, and platform frontend status.'],
  ['server-hosting', 'Server hosting', 'Build image and manage the Driftlands/Caddy Docker stack.'],
  ['haos', 'Home Assistant Docker', 'Build an image bundle and install it from HA WebSSH.'],
  ['server-config', 'Server config', 'Edit .env values such as debug mode, TPS, seed, auth, and origin.'],
  ['frontend', 'Frontend deployment', 'Copy Driftlands into platform, build, commit, push, and deploy.'],
  ['diagnostics', 'Diagnostics', 'Tail logs and check the public health endpoint.'],
  ['snippets', 'Commands and env snippets', 'Print Docker commands and platform frontend env vars.'],
  ['exit', 'Exit', 'Return to shell.'],
].map(([value, label, detail]) => ({ value, label, detail }));

const serverEnvFields = [
  {
    key: 'SERVER_DEBUG_MODE',
    label: 'Debug mode',
    type: 'boolean',
    defaultValue: '0',
    detail: 'Enables server debug affordances and advertises debug mode to clients.',
  },
  {
    key: 'SERVER_TPS',
    label: 'Ticks per second',
    type: 'number',
    defaultValue: '10',
    detail: 'Simulation tick rate. 10 is the hosting default.',
  },
  {
    key: 'SERVER_SETTLEMENT_START_MODE',
    label: 'Settlement starts',
    type: 'choice',
    choices: ['candidates', 'free'],
    defaultValue: 'candidates',
    detail: 'Candidate mode uses curated landing starts; free allows open placement.',
  },
  {
    key: 'SERVER_SPAWN_SAFETY',
    label: 'Spawn safety',
    type: 'boolean',
    defaultValue: '0',
    detail: 'Keeps starter terrain safer around founded settlements.',
  },
  {
    key: 'SERVER_REQUIRE_LOOPERLANDS_AUTH',
    label: 'Require Looperlands auth',
    type: 'boolean',
    defaultValue: '0',
    detail: 'Requires wallet/Web3 token validation before joining.',
  },
  {
    key: 'DRIFTLANDS_ADMIN_WALLETS',
    label: 'Admin wallets',
    type: 'text',
    defaultValue: config.adminWallets,
    detail: 'Comma-separated wallet allowlist for production admin controls. Casing does not matter.',
  },
  {
    key: 'SERVER_SEED',
    label: 'World seed',
    type: 'text',
    defaultValue: '',
    detail: 'Leave empty for a fresh random world on each server start.',
  },
  {
    key: 'LOOPERLANDS_API_URL',
    label: 'Looperlands API URL',
    type: 'text',
    defaultValue: 'https://api.looperlands.io/api',
    detail: 'Server-side Looperlands API endpoint.',
  },
  {
    key: 'FRONTEND_ORIGIN',
    label: 'Frontend origin',
    type: 'text',
    defaultValue: 'https://<looperlands-platform-frontend-domain>',
    detail: 'Allowed browser origin for CORS and Socket.IO.',
  },
  {
    key: 'HOST',
    label: 'Bind host',
    type: 'text',
    defaultValue: '0.0.0.0',
    detail: 'Container listen host.',
  },
  {
    key: 'PORT',
    label: 'Bind port',
    type: 'number',
    defaultValue: '3000',
    detail: 'Container listen port.',
  },
  {
    key: 'NODE_ENV',
    label: 'Node environment',
    type: 'choice',
    choices: ['production', 'development'],
    defaultValue: 'production',
    detail: 'Runtime mode for the Node server.',
  },
];

function color(text, ...styles) {
  if (!useColor) return text;
  return `${styles.join('')}${text}${ansi.reset}`;
}

function terminalWidth() {
  return Math.max(72, Math.min(output.columns || 88, 120));
}

function clearScreen() {
  if (isInteractive) {
    output.write('\x1b[2J\x1b[H');
  } else {
    console.log('');
  }
}

function hideCursor() {
  if (isInteractive) output.write('\x1b[?25l');
}

function showCursor() {
  if (isInteractive) output.write('\x1b[?25h');
}

function line(char = '-', width = terminalWidth()) {
  return char.repeat(width);
}

function section(title) {
  console.log(color(`\n[ ${title} ]`, ansi.bold, ansi.cyan));
  console.log(color(line('-', Math.min(terminalWidth(), 92)), ansi.gray));
}

function printLogo() {
  for (const row of logo) {
    console.log(color(row, ansi.bold, ansi.cyan));
  }
}

function printHeader(subtitle = 'Docker hosting control deck') {
  clearScreen();
  printLogo();
  console.log(color(`\n${subtitle}`, ansi.bold, ansi.white));
  console.log(color(line('='), ansi.blue));
  printConfigGrid();
  console.log('');
}

function printConfigGrid() {
  const rows = [
    ['image', config.image],
    ['network', config.network],
    ['server', config.serverContainer],
    ['caddy', config.caddyContainer],
    ['config', config.configDir],
    ['domain', config.domain],
    ['health', config.healthUrl],
    ['frontend', config.frontendRepoPath],
  ];
  if (process.env.DOCKER_HOST) {
    rows.push(['docker', process.env.DOCKER_HOST]);
  }

  const left = rows.slice(0, Math.ceil(rows.length / 2));
  const right = rows.slice(Math.ceil(rows.length / 2));
  const width = terminalWidth();
  const colWidth = Math.max(32, Math.floor((width - 4) / 2));

  for (let index = 0; index < left.length; index += 1) {
    const first = formatKeyValue(left[index][0], left[index][1]).padEnd(colWidth);
    const second = right[index] ? formatKeyValue(right[index][0], right[index][1]) : '';
    console.log(`${first}  ${second}`);
  }
}

function formatKeyValue(key, value) {
  return `${color(key.padEnd(8), ansi.gray)} ${color(value, ansi.green)}`;
}

function printHint(text) {
  console.log(color(text, ansi.gray));
}

function printSuccess(text) {
  console.log(color(`[ok] ${text}`, ansi.green));
}

function printWarn(text) {
  console.log(color(`[warn] ${text}`, ansi.yellow));
}

function printError(text) {
  console.error(color(`[error] ${text}`, ansi.red));
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandLine(command, args) {
  return [command, ...args.map(shellQuote)].join(' ');
}

function printCommand(command, args) {
  section('Command');
  console.log(color(`$ ${commandLine(command, args)}`, ansi.bold, ansi.yellow));
  console.log('');
}

async function askText(question, fallback = '') {
  const suffix = fallback ? ` ${color(`[${fallback}]`, ansi.gray)}` : '';
  const answer = await rl.question(`${color('?', ansi.bold, ansi.yellow)} ${question}${suffix}: `);
  return (answer.trim() || fallback).trim();
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function bootAnimation() {
  if (!useAnimation) return;

  const frames = [
    'mapping wind lanes',
    'checking Docker compass',
    'warming Caddy lantern',
    'opening the hosting deck',
  ];

  hideCursor();
  for (let index = 0; index < frames.length; index += 1) {
    clearScreen();
    printLogo();
    console.log('');
    console.log(color(`[${'-\\|/'[index % 4]}] ${frames[index]}...`, ansi.bold, ansi.yellow));
    await sleep(180);
  }
  showCursor();
}

function run(command, args, options = {}) {
  printCommand(command, args);
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      stdio: options.stdio || 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      if (exitCode === 0) {
        printSuccess(`${command} finished`);
      } else {
        printError(`${command} exited with code ${exitCode}`);
      }
      resolveRun(exitCode);
    });
    child.on('error', (error) => {
      printError(`Failed to start ${command}: ${error.message}`);
      resolveRun(1);
    });
  });
}

function runShell(command, options = {}) {
  section('Command');
  console.log(color(`$ ${command}`, ansi.bold, ansi.yellow));
  console.log('');
  return new Promise((resolveRun) => {
    const child = spawn(command, {
      cwd: options.cwd || rootDir,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      if (exitCode === 0) {
        printSuccess('deploy command finished');
      } else {
        printError(`deploy command exited with code ${exitCode}`);
      }
      resolveRun(exitCode);
    });
    child.on('error', (error) => {
      printError(`Failed to start deploy command: ${error.message}`);
      resolveRun(1);
    });
  });
}

function capture(command, args, options = {}) {
  return new Promise((resolveCapture) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => resolveCapture({ code: code ?? 1, stdout, stderr }));
    child.on('error', (error) => resolveCapture({ code: 1, stdout, stderr: error.message }));
  });
}

async function withSpinner(label, task) {
  if (!useAnimation) return task();

  const frames = ['|', '/', '-', '\\'];
  let index = 0;
  output.write(color(`${frames[index]} ${label}`, ansi.yellow));
  const timer = setInterval(() => {
    index += 1;
    output.write(`\r${color(`${frames[index % frames.length]} ${label}`, ansi.yellow)}`);
  }, 90);

  try {
    return await task();
  } finally {
    clearInterval(timer);
    output.write(`\r${' '.repeat(label.length + 4)}\r`);
  }
}

async function pause() {
  console.log('');
  await rl.question(color('Press Enter to continue...', ansi.gray));
}

async function confirm(question) {
  const answer = (await rl.question(`${color('?', ansi.bold, ansi.yellow)} ${question} ${color('[y/N]', ansi.gray)} `))
    .trim()
    .toLowerCase();
  return answer === 'y' || answer === 'yes';
}

async function selectMenu(items, title, detail) {
  if (!isInteractive) {
    console.log(title);
    items.forEach((item, index) => console.log(`${index + 1}. ${item.label}`));
    const answer = await rl.question('Choose an action: ');
    const selected = Number(answer.trim()) - 1;
    return items[selected]?.value || 'exit';
  }

  let selected = 0;

  return new Promise((resolveSelection) => {
    const render = () => {
      printHeader(title);
      if (detail) printHint(detail);
      printHint('Use arrow keys or j/k. Enter selects. q exits.');
      console.log('');
      items.forEach((item, index) => {
        const active = index === selected;
        const marker = active ? '>' : ' ';
        const label = active ? color(item.label, ansi.bold, ansi.white, ansi.bgBlue) : color(item.label, ansi.white);
        const description = active ? color(item.detail, ansi.cyan) : color(item.detail, ansi.gray);
        console.log(`${color(marker, ansi.yellow)} ${String(index + 1).padStart(2, ' ')}  ${label}`);
        console.log(`     ${description}`);
      });
      console.log('');
    };

    const done = (value) => {
      input.off('keypress', onKeypress);
      if (input.isTTY) input.setRawMode(false);
      showCursor();
      resolveSelection(value);
    };

    const onKeypress = (_text, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        done('exit');
        return;
      }
      if (key.name === 'q' || key.name === 'escape') {
        done('exit');
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        selected = (selected - 1 + items.length) % items.length;
        render();
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        selected = (selected + 1) % items.length;
        render();
        return;
      }
      if (key.name === 'return') {
        done(items[selected].value);
        return;
      }
      if (/^[1-9]$/.test(key.sequence || '')) {
        const numeric = Number(key.sequence) - 1;
        if (items[numeric]) {
          done(items[numeric].value);
        }
      }
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    hideCursor();
    input.on('keypress', onKeypress);
    render();
  });
}

async function selectContainerAction(title, verb) {
  return selectMenu([
    { value: 'server', label: `${verb} server`, detail: config.serverContainer },
    { value: 'caddy', label: `${verb} Caddy`, detail: config.caddyContainer },
    { value: 'both', label: `${verb} both`, detail: `${config.serverContainer}, ${config.caddyContainer}` },
    { value: 'back', label: 'Back', detail: 'Return to the main menu.' },
  ], title, 'Choose the target container set.');
}

async function ensureNetwork() {
  const inspected = await withSpinner(`checking Docker network ${config.network}`, () => (
    capture('docker', ['network', 'inspect', config.network])
  ));
  if (inspected.code === 0) {
    printSuccess(`Docker network ${config.network} already exists.`);
    return 0;
  }
  return run('docker', ['network', 'create', config.network]);
}

async function showStatus() {
  printHeader('Overview');
  section('Server Containers');
  const containers = await withSpinner('reading container status', () => capture('docker', [
    'ps',
    '-a',
    '--filter',
    `name=^/${config.serverContainer}$`,
    '--filter',
    `name=^/${config.caddyContainer}$`,
    '--format',
    'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}',
  ]));

  if (containers.code === 0 && containers.stdout.trim()) {
    console.log(containers.stdout.trim());
  } else if (containers.code === 0) {
    printWarn('No Driftlands containers found.');
  } else {
    printError(containers.stderr.trim() || 'Could not read container status.');
  }

  section('Server Image');
  const image = await withSpinner('reading image metadata', () => capture('docker', [
    'image',
    'inspect',
    config.image,
    '--format',
    'ID: {{.Id}}\nCreated: {{.Created}}\nSize: {{.Size}} bytes',
  ]));
  if (image.code === 0) {
    console.log(image.stdout.trim());
  } else {
    printWarn(`Image ${config.image} not found locally.`);
  }

  section('Platform Frontend');
  console.log(formatKeyValue('repo', config.frontendRepoPath));
  const frontendBranch = await capture('git', ['branch', '--show-current'], { cwd: config.frontendRepoPath });
  if (frontendBranch.code === 0) {
    console.log(formatKeyValue('branch', frontendBranch.stdout.trim() || '(detached)'));
  }
  const frontendStatus = await capture('git', ['status', '--short'], { cwd: config.frontendRepoPath });
  if (frontendStatus.code === 0 && frontendStatus.stdout.trim()) {
    console.log(frontendStatus.stdout.trim());
  } else if (frontendStatus.code === 0) {
    printSuccess('platform frontend worktree is clean');
  } else {
    printWarn('platform frontend status unavailable');
  }

  await pause();
}

async function buildImage() {
  printHeader('Build Docker Image');
  await run('docker', ['build', '-t', config.image, '.']);
  await pause();
}

async function writeFileIfConfirmed(path, contents, label) {
  if (existsSync(path)) {
    const overwrite = await confirm(`${label} already exists at ${path}. Overwrite it?`);
    if (!overwrite) {
      printWarn(`Kept existing ${path}.`);
      return;
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  printSuccess(`Wrote ${path}.`);
}

async function writeConfigFiles() {
  printHeader('Write Templates');
  printWarn('This writes files on the machine where this TUI is running.');
  printHint('When using DOCKER_HOST=ssh://..., create /config/driftlands files on the remote host separately.');
  console.log('');

  const envExample = starterEnvContents();
  const caddyfile = `${config.domain} {\n  reverse_proxy ${config.serverContainer}:3000\n}\n`;

  if (await confirm(`Write env file and Caddyfile under ${config.configDir}?`)) {
    await writeFileIfConfirmed(config.envFile, envExample, 'Environment file');
    await writeFileIfConfirmed(config.caddyfile, caddyfile, 'Caddyfile');
  }

  await pause();
}

function starterEnvContents() {
  const contents = readFileSync(resolve(rootDir, '.env.hassio.example'), 'utf8')
    .replace('FRONTEND_ORIGIN=https://<looperlands-platform-frontend-domain>', `FRONTEND_ORIGIN=${config.frontendOrigin}`);
  return setEnvValue(contents, 'DRIFTLANDS_ADMIN_WALLETS', config.adminWallets);
}

function starterHaosEnvContents(frontendOrigin = config.haosFrontendOrigin, adminWallets = config.adminWallets) {
  const contents = readFileSync(resolve(rootDir, '.env.hassio.example'), 'utf8')
    .replace('FRONTEND_ORIGIN=https://<looperlands-platform-frontend-domain>', `FRONTEND_ORIGIN=${frontendOrigin}`);
  return setEnvValue(contents, 'DRIFTLANDS_ADMIN_WALLETS', adminWallets);
}

function parseEnvValues(contents) {
  const values = new Map();
  for (const lineText of contents.split(/\r?\n/)) {
    const match = lineText.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function setEnvValue(contents, key, value) {
  const lines = contents.split(/\r?\n/);
  let found = false;
  const nextLines = lines.map((lineText) => {
    if (!new RegExp(`^\\s*${key}\\s*=`).test(lineText)) {
      return lineText;
    }
    found = true;
    return `${key}=${value}`;
  });

  if (!found) {
    if (nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(`${key}=${value}`);
  }

  return nextLines.join('\n').replace(/\n{3,}$/g, '\n\n');
}

function normalizeBoolean(value, defaultValue) {
  const normalized = String(value || defaultValue).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return '1';
  if (['0', 'false', 'no', 'off'].includes(normalized)) return '0';
  return defaultValue;
}

function envDisplayValue(field, value) {
  if (field.type === 'boolean') {
    return normalizeBoolean(value, field.defaultValue) === '1' ? 'on' : 'off';
  }
  return value || color('(empty)', ansi.gray);
}

function loadEnvDraft() {
  const exists = existsSync(config.envFile);
  const contents = exists ? readFileSync(config.envFile, 'utf8') : starterEnvContents();
  const parsed = parseEnvValues(contents);
  const values = new Map();

  for (const field of serverEnvFields) {
    values.set(field.key, parsed.get(field.key) ?? field.defaultValue);
  }

  return { contents, exists, dirty: false, values };
}

function renderEnvItems(draft) {
  const fieldItems = serverEnvFields.map((field) => {
    const value = draft.values.get(field.key) ?? field.defaultValue;
    return {
      value: field.key,
      label: `${field.label}: ${envDisplayValue(field, value)}`,
      detail: `${field.key} - ${field.detail}`,
    };
  });

  return [
    ...fieldItems,
    {
      value: 'save-recreate',
      label: draft.dirty ? 'Save and recreate server' : 'Recreate server',
      detail: 'Write the env file, then recreate the Driftlands container so Docker reloads env.',
    },
    {
      value: 'save',
      label: draft.dirty ? 'Save env file' : 'Save env file anyway',
      detail: `Write ${config.envFile}.`,
    },
    {
      value: 'back',
      label: 'Back',
      detail: 'Return to the main menu.',
    },
  ];
}

async function editEnvField(field, draft) {
  const current = draft.values.get(field.key) ?? field.defaultValue;

  if (field.type === 'boolean') {
    const next = normalizeBoolean(current, field.defaultValue) === '1' ? '0' : '1';
    draft.values.set(field.key, next);
    draft.dirty = true;
    return;
  }

  if (field.type === 'choice') {
    const choice = await selectMenu([
      ...field.choices.map((choiceValue) => ({
        value: choiceValue,
        label: choiceValue === current ? `${choiceValue} (current)` : choiceValue,
        detail: `${field.key}=${choiceValue}`,
      })),
      { value: 'back', label: 'Back', detail: 'Keep the current value.' },
    ], field.label, field.detail);
    if (choice !== 'back') {
      draft.values.set(field.key, choice);
      draft.dirty = true;
    }
    return;
  }

  clearScreen();
  printHeader(field.label);
  console.log(formatKeyValue('key', field.key));
  console.log(formatKeyValue('current', current || '(empty)'));
  printHint(field.detail);
  console.log('');
  const answer = await rl.question(`${color('New value', ansi.bold, ansi.yellow)} ${color('(blank allowed)', ansi.gray)}: `);
  draft.values.set(field.key, answer.trim());
  draft.dirty = true;
}

function writeEnvDraft(draft) {
  let nextContents = draft.contents;
  for (const field of serverEnvFields) {
    nextContents = setEnvValue(nextContents, field.key, draft.values.get(field.key) ?? field.defaultValue);
  }

  mkdirSync(dirname(config.envFile), { recursive: true });
  writeFileSync(config.envFile, `${nextContents.replace(/\s+$/g, '')}\n`);
  draft.contents = nextContents;
  draft.exists = true;
  draft.dirty = false;
  printSuccess(`Wrote ${config.envFile}.`);
}

async function manageServerEnvironment() {
  let draft;
  try {
    draft = loadEnvDraft();
  } catch (error) {
    printHeader('Server Environment');
    printError(error instanceof Error ? error.message : String(error));
    await pause();
    return;
  }

  while (true) {
    const title = draft.exists ? 'Server Environment' : 'Server Environment (new file)';
    const detail = draft.exists
      ? `Editing ${config.envFile}. Recreate the server container after saving.`
      : `Starting from .env.hassio.example. Saving creates ${config.envFile}.`;
    const action = await selectMenu(renderEnvItems(draft), title, detail);

    if (action === 'back' || action === 'exit') {
      if (!draft.dirty || await confirm('Discard unsaved env changes?')) {
        break;
      }
      continue;
    }

    if (action === 'save' || action === 'save-recreate') {
      printHeader(action === 'save-recreate' ? 'Save and Recreate' : 'Save Server Environment');
      try {
        writeEnvDraft(draft);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        await pause();
        continue;
      }

      if (action === 'save-recreate' && await confirm(`Recreate ${config.serverContainer} now?`)) {
        await runServer({ skipPause: true, assumeConfirmed: true });
      }
      await pause();
      if (action === 'save-recreate') break;
      continue;
    }

    const field = serverEnvFields.find((candidate) => candidate.key === action);
    if (field) {
      await editEnvField(field, draft);
    }
  }
}

async function runServer(options = {}) {
  printHeader('Run Driftlands Server');
  printHint('This recreates the Driftlands server container.');
  console.log(formatKeyValue('env', config.envFile));
  if (!options.assumeConfirmed && !await confirm(`Remove and recreate ${config.serverContainer}?`)) {
    return;
  }

  await ensureNetwork();
  await run('docker', ['rm', '-f', config.serverContainer], { stdio: 'ignore' });

  const args = [
    'run',
    '-d',
    '--name',
    config.serverContainer,
    '--restart',
    'unless-stopped',
    '--network',
    config.network,
    '--env-file',
    config.envFile,
  ];

  if (config.publishServerPort) {
    args.push('-p', config.publishServerPort);
  }

  args.push(config.image);
  await run('docker', args);
  if (!options.skipPause) {
    await pause();
  }
}

function frontendDriftlandsPath() {
  return resolve(config.frontendRepoPath, 'src/pages/driftlands');
}

function assertFrontendRepo() {
  const packagePath = resolve(config.frontendRepoPath, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error(`No package.json found at ${config.frontendRepoPath}`);
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (packageJson.name !== 'looperlands-platform-frontend') {
    printWarn(`Expected looperlands-platform-frontend, found ${packageJson.name || 'unknown package'}.`);
  }
}

function walkFiles(startDir) {
  const files = [];
  for (const entry of readdirSync(startDir)) {
    const path = resolve(startDir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function shouldCopyClientFile(source) {
  const normalized = source.replaceAll('\\', '/');
  return !(
    normalized.includes('/node_modules/')
    || normalized.includes('/dist/')
    || normalized.includes('/.git/')
    || normalized.endsWith('.test.ts')
    || normalized.endsWith('.spec.ts')
    || normalized.endsWith('.test.tsx')
    || normalized.endsWith('.spec.tsx')
  );
}

function addTsNoCheck(path) {
  const contents = readFileSync(path, 'utf8');
  if (contents.includes('@ts-nocheck')) return;

  if (path.endsWith('.ts') && !path.endsWith('.d.ts')) {
    writeFileSync(path, `// @ts-nocheck\n${contents}`);
    return;
  }

  if (path.endsWith('.vue')) {
    const next = contents
      .replace('<script setup lang="ts">', '<script setup lang="ts">\n// @ts-nocheck')
      .replace('<script lang="ts">', '<script lang="ts">\n// @ts-nocheck');
    if (next !== contents) {
      writeFileSync(path, next);
    }
  }
}

function prepareEmbeddedApp() {
  const path = resolve(frontendDriftlandsPath(), 'App.vue');
  if (!existsSync(path)) return;

  let contents = readFileSync(path, 'utf8');
  if (!contents.includes('id="driftlands-game"')) {
    contents = contents
      .replace('<template>\n  <!-- Scene swap with fade -->\n  <Transition', '<template>\n  <!-- Scene swap with fade -->\n  <main id="driftlands-game">\n    <Transition')
      .replace(/\n\s*<\/Transition>\n<\/template>/, '\n    </Transition>\n  </main>\n</template>');
  }
  if (!contents.includes("import './style.css';")) {
    contents = contents.replace('// @ts-nocheck\n', "// @ts-nocheck\nimport './style.css';\n");
  }
  if (!contents.includes("import './core/socket';")) {
    contents = contents.replace("import './style.css';\n", "import './style.css';\nimport './core/socket';\n");
  }
  contents = contents
    .replace('    <Transition name="fade" mode="out-in">\n    <TitleScreen', '    <Transition name="fade" mode="out-in">\n      <TitleScreen')
    .replace('\n    <div v-else key="game" class="w-full h-screen relative">', '\n      <div v-else key="game" class="w-full h-screen relative">')
    .replace('\n      <Game />\n      <InGameMenu />\n    </div>\n    </Transition>', '\n        <Game />\n        <InGameMenu />\n      </div>\n    </Transition>');
  contents = contents.replace('body, html {', 'body:has(#driftlands-game), html:has(#driftlands-game) {');
  writeFileSync(path, contents);
}

function copyClientToFrontend() {
  assertFrontendRepo();
  const target = frontendDriftlandsPath();
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(resolve(rootDir, 'src'), target, {
    recursive: true,
    filter: shouldCopyClientFile,
  });

  for (const path of walkFiles(target)) {
    addTsNoCheck(path);
  }
  prepareEmbeddedApp();
}

async function showFrontendStatus() {
  printHeader('Frontend Deployment Status');
  console.log(formatKeyValue('repo', config.frontendRepoPath));
  console.log(formatKeyValue('route', frontendDriftlandsPath()));
  console.log(formatKeyValue('deploy', config.frontendDeployCommand || '(not configured)'));

  section('Git');
  const branch = await capture('git', ['branch', '--show-current'], { cwd: config.frontendRepoPath });
  if (branch.code === 0) {
    console.log(formatKeyValue('branch', branch.stdout.trim() || '(detached)'));
  }
  const status = await capture('git', ['status', '--short'], { cwd: config.frontendRepoPath });
  if (status.code === 0 && status.stdout.trim()) {
    console.log(status.stdout.trim());
  } else if (status.code === 0) {
    printSuccess('platform frontend worktree is clean');
  } else {
    printError(status.stderr.trim() || 'Could not read frontend git status.');
  }
  await pause();
}

async function copyFrontendClient() {
  printHeader('Copy Driftlands Client');
  console.log(formatKeyValue('from', resolve(rootDir, 'src')));
  console.log(formatKeyValue('to', frontendDriftlandsPath()));
  printWarn('This replaces the embedded platform Driftlands client directory.');
  if (!await confirm('Copy current Driftlands client into the platform frontend now?')) {
    return;
  }

  try {
    copyClientToFrontend();
    printSuccess('Copied Driftlands client into platform frontend.');
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
  }
  await pause();
}

async function buildFrontend() {
  printHeader('Build Platform Frontend');
  await run('npm', ['run', 'build'], { cwd: config.frontendRepoPath });
  await pause();
}

async function installFrontendDependencies() {
  printHeader('Install Platform Frontend Dependencies');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: config.frontendRepoPath });
  await pause();
}

async function commitFrontendChanges(options = {}) {
  printHeader('Commit Platform Frontend Changes');
  const status = await capture('git', ['status', '--short'], { cwd: config.frontendRepoPath });
  if (status.code !== 0) {
    printError(status.stderr.trim() || 'Could not read frontend git status.');
    if (!options.skipPause) await pause();
    return 1;
  }
  if (!status.stdout.trim()) {
    printSuccess('No frontend changes to commit.');
    if (!options.skipPause) await pause();
    return 0;
  }

  console.log(status.stdout.trim());
  console.log('');
  const defaultMessage = config.frontendCommitMessage;
  const answer = options.message || await rl.question(`${color('Commit message', ansi.bold, ansi.yellow)} ${color(`[${defaultMessage}]`, ansi.gray)}: `);
  const message = (answer || defaultMessage).trim();
  if (!options.assumeConfirmed && !await confirm(`Stage and commit frontend changes as "${message}"?`)) {
    return 1;
  }

  let code = await run('git', ['add', 'src/pages/driftlands', 'src/routes.ts', 'package.json', 'package-lock.json', 'README.md', '.env.example'], { cwd: config.frontendRepoPath });
  if (code !== 0) return code;
  code = await run('git', ['commit', '-m', message], { cwd: config.frontendRepoPath });
  if (!options.skipPause) await pause();
  return code;
}

async function pushFrontend(options = {}) {
  printHeader('Push Platform Frontend');
  const code = await run('git', ['push', 'origin', 'HEAD'], { cwd: config.frontendRepoPath });
  if (!options.skipPause) await pause();
  return code;
}

async function deployFrontend(options = {}) {
  printHeader('Deploy Platform Frontend');
  if (!config.frontendDeployCommand) {
    printWarn('No deploy command configured.');
    printHint('Set DRIFTLANDS_FRONTEND_DEPLOY_COMMAND, for example: npm run deploy');
    if (!options.skipPause) await pause();
    return 0;
  }
  const code = await runShell(config.frontendDeployCommand, { cwd: config.frontendRepoPath });
  if (!options.skipPause) await pause();
  return code;
}

async function fullFrontendPipeline(options = {}) {
  printHeader('Full Frontend Pipeline');
  printHint('Pipeline: copy current Driftlands client -> install deps -> build platform -> commit -> push -> deploy hook.');
  printHint(`Frontend repo: ${config.frontendRepoPath}`);
  if (!options.assumeConfirmed && !await confirm('Run the full frontend deployment pipeline?')) {
    return 0;
  }

  try {
    copyClientToFrontend();
    printSuccess('Copied Driftlands client.');
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    if (!options.skipPause) await pause();
    return 1;
  }

  if (await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: config.frontendRepoPath }) !== 0) {
    if (!options.skipPause) await pause();
    return 1;
  }
  if (await run('npm', ['run', 'build'], { cwd: config.frontendRepoPath }) !== 0) {
    if (!options.skipPause) await pause();
    return 1;
  }
  if (await commitFrontendChanges({
    skipPause: true,
    assumeConfirmed: options.assumeConfirmed,
    message: options.message,
  }) !== 0) {
    if (!options.skipPause) await pause();
    return 1;
  }
  if (await pushFrontend({ skipPause: true }) !== 0) {
    if (!options.skipPause) await pause();
    return 1;
  }
  const deployCode = await deployFrontend({ skipPause: true });
  if (!options.skipPause) await pause();
  return deployCode;
}

async function manageFrontendDeployment() {
  while (true) {
    const action = await selectMenu([
      { value: 'full', label: 'Guided full publish', detail: 'Copy current game, install deps, build, commit, push, then deploy hook.' },
      { value: 'copy', label: '1. Copy game into platform', detail: 'Replace src/pages/driftlands with the current Driftlands client.' },
      { value: 'install', label: '2. Install platform deps', detail: 'Run npm install in the platform frontend repo.' },
      { value: 'build', label: '3. Build platform', detail: 'Run npm run build in the platform frontend repo.' },
      { value: 'commit', label: '4. Commit platform changes', detail: 'Stage Driftlands/platform route files and commit them.' },
      { value: 'push', label: '5. Push platform branch', detail: 'Run git push origin HEAD.' },
      { value: 'deploy', label: '6. Run deploy hook', detail: config.frontendDeployCommand || 'Configure DRIFTLANDS_FRONTEND_DEPLOY_COMMAND first.' },
      { value: 'status', label: 'Frontend status', detail: 'Show platform frontend git status and deployment config.' },
      { value: 'back', label: 'Back to main menu', detail: 'Return to the main menu.' },
    ], 'Frontend Deployment', 'Deploy current Driftlands client code into looperlands-platform-frontend.');

    if (action === 'back' || action === 'exit') break;
    switch (action) {
      case 'status':
        await showFrontendStatus();
        break;
      case 'copy':
        await copyFrontendClient();
        break;
      case 'install':
        await installFrontendDependencies();
        break;
      case 'build':
        await buildFrontend();
        break;
      case 'commit':
        await commitFrontendChanges();
        break;
      case 'push':
        await pushFrontend();
        break;
      case 'deploy':
        await deployFrontend();
        break;
      case 'full':
        await fullFrontendPipeline();
        break;
      default:
        printWarn('Unknown frontend action.');
        await pause();
    }
  }
}

function normalizeDeployTarget(value) {
  const target = String(value || '').trim().toLowerCase();
  if (['frontend', 'front', 'client'].includes(target)) return 'frontend';
  if (['backend', 'server', 'haos'].includes(target)) return 'backend';
  if (['both', 'all', 'full'].includes(target)) return 'both';
  return '';
}

function deploysFrontend(target) {
  return target === 'frontend' || target === 'both';
}

function deploysBackend(target) {
  return target === 'backend' || target === 'both';
}

async function selectDeployTarget(targetArg) {
  const normalized = normalizeDeployTarget(targetArg);
  if (normalized) return normalized;

  return selectMenu([
    { value: 'both', label: 'Frontend + backend', detail: 'Run the platform frontend pipeline, then deploy the HAOS backend over SSH.' },
    { value: 'frontend', label: 'Frontend only', detail: 'Copy, install, build, commit, push, and run the frontend deploy hook.' },
    { value: 'backend', label: 'Backend only', detail: 'Build the Docker image and install it on HAOS through ssh haos.' },
    { value: 'exit', label: 'Cancel', detail: 'Do not deploy anything.' },
  ], 'Deploy', 'Choose what to deploy.');
}

function printDeployPlan(target) {
  printHeader('Deploy Plan');
  printWarn('Nothing has started yet. Review this plan before continuing.');

  if (deploysFrontend(target)) {
    section('Frontend');
    console.log(formatKeyValue('repo', config.frontendRepoPath));
    console.log(formatKeyValue('route', frontendDriftlandsPath()));
    console.log(formatKeyValue('commit', config.frontendCommitMessage));
    console.log(formatKeyValue('deploy', config.frontendDeployCommand || '(skipped; not configured)'));
    console.log('');
    console.log('Will run:');
    console.log('1. Replace the embedded Driftlands client in the platform frontend.');
    console.log('2. npm install --ignore-scripts --no-audit --no-fund');
    console.log('3. npm run build');
    console.log('4. Stage and commit platform changes when there are changes.');
    console.log('5. git push origin HEAD');
    console.log('6. Run the configured frontend deploy hook, when configured.');
  }

  if (deploysBackend(target)) {
    section('Backend');
    console.log(formatKeyValue('image', config.image));
    console.log(formatKeyValue('platform', config.haosImagePlatform));
    console.log(formatKeyValue('bundle', config.haosBundleDir));
    console.log(formatKeyValue('ssh', config.haosSshHost));
    console.log(formatKeyValue('remote', config.haosRemoteDir));
    console.log(formatKeyValue('hostport', config.haosPublishPort));
    console.log(formatKeyValue('origin', config.haosFrontendOrigin));
    console.log(formatKeyValue('admins', config.adminWallets || '(none)'));
    console.log('');
    console.log('Will run:');
    console.log('1. docker build and docker save on this machine.');
    console.log('2. Write driftlands.env and an SSH installer into output/haos.');
    console.log(`3. ssh ${config.haosSshHost} mkdir -p ${config.haosRemoteDir}`);
    console.log(`4. scp the image, env, and installer to ${config.haosSshHost}:${config.haosRemoteDir}/`);
    console.log('5. Run the installer over SSH, recreate the container, and wait for /health.');
  }
}

async function deploySelected(targetArg) {
  const target = await selectDeployTarget(targetArg);
  if (!target || target === 'exit') return;

  printDeployPlan(target);
  if (!await confirm('Start this deployment now?')) {
    return;
  }

  if (deploysFrontend(target)) {
    const code = await fullFrontendPipeline({
      assumeConfirmed: true,
      skipPause: true,
      message: config.frontendCommitMessage,
    });
    if (code !== 0) {
      process.exitCode = code;
      return;
    }
  }

  if (deploysBackend(target)) {
    const code = await deployHaosOverSsh();
    if (code !== 0) {
      process.exitCode = code;
      return;
    }
  }
}

async function runCaddy() {
  printHeader('Run Caddy');
  printHint('This recreates the Caddy HTTPS reverse proxy container.');
  console.log(formatKeyValue('file', config.caddyfile));
  if (!await confirm(`Remove and recreate ${config.caddyContainer}?`)) {
    return;
  }

  await ensureNetwork();
  await run('docker', ['rm', '-f', config.caddyContainer], { stdio: 'ignore' });
  await run('docker', [
    'run',
    '-d',
    '--name',
    config.caddyContainer,
    '--restart',
    'unless-stopped',
    '--network',
    config.network,
    '-p',
    '80:80',
    '-p',
    '443:443',
    '-v',
    `${config.caddyfile}:/etc/caddy/Caddyfile:ro`,
    '-v',
    `${config.caddyDataVolume}:/data`,
    'caddy:2',
  ]);
  await pause();
}

async function restartContainers() {
  const choice = await selectContainerAction('Restart Containers', 'Restart');
  const containers = selectedContainers(choice);
  if (containers.length > 0) {
    printHeader('Restart Containers');
    await run('docker', ['restart', ...containers]);
    await pause();
  }
}

async function stopContainers() {
  const choice = await selectContainerAction('Stop Containers', 'Stop');
  const containers = selectedContainers(choice);
  if (containers.length === 0) return;

  printHeader('Stop Containers');
  if (await confirm(`Stop ${containers.join(', ')}?`)) {
    await run('docker', ['stop', ...containers]);
  }
  await pause();
}

function selectedContainers(choice) {
  if (choice === 'server') return [config.serverContainer];
  if (choice === 'caddy') return [config.caddyContainer];
  if (choice === 'both') return [config.serverContainer, config.caddyContainer];
  return [];
}

async function tailLogs() {
  const choice = await selectMenu([
    { value: 'server', label: 'Server logs', detail: config.serverContainer },
    { value: 'caddy', label: 'Caddy logs', detail: config.caddyContainer },
    { value: 'back', label: 'Back', detail: 'Return to the main menu.' },
  ], 'Tail Logs', 'Choose a log stream. Ctrl+C returns to your shell.');

  if (choice === 'back') return;
  const container = choice === 'caddy' ? config.caddyContainer : config.serverContainer;
  printHeader('Tail Logs');
  printHint(`Tailing ${container}. Press Ctrl+C to return to your shell.`);
  await run('docker', ['logs', '-f', container]);
}

async function healthCheck() {
  printHeader('Health Check');
  console.log(formatKeyValue('url', config.healthUrl));
  try {
    const response = await withSpinner('waiting for health response', () => fetch(config.healthUrl));
    const body = await response.text();
    const ok = response.ok ? printSuccess : printWarn;
    ok(`HTTP ${response.status}`);
    console.log(body);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
  }
  await pause();
}

function localLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      addresses.push(entry.address);
    }
  }

  return addresses.sort((first, second) => {
    const score = (address) => address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2;
    return score(first) - score(second);
  });
}

function haosBundlePaths() {
  return {
    dir: config.haosBundleDir,
    imageTar: resolve(config.haosBundleDir, 'driftlands-image.tar'),
    envFile: resolve(config.haosBundleDir, 'driftlands.env'),
    installScript: resolve(config.haosBundleDir, 'install-driftlands-haos.sh'),
  };
}

function writeHaosInstallScript(baseUrl, publishPort = config.haosPublishPort) {
  const { installScript } = haosBundlePaths();
  const script = `#!/bin/sh
set -eu

BASE_URL="${baseUrl}"
CONFIG_DIR="/config/driftlands"
IMAGE_TAR="$CONFIG_DIR/driftlands-image.tar"
START_PUBLISH_PORT="${publishPort}"
PUBLISH_PORT="$START_PUBLISH_PORT"
MAX_PUBLISH_PORT=$((START_PUBLISH_PORT + 50))

echo "[driftlands] creating $CONFIG_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$CONFIG_DIR/state"

echo "[driftlands] downloading env"
curl -fsSL "$BASE_URL/driftlands.env" -o "$CONFIG_DIR/.env"
sed -i 's/^HOST=.*/HOST=0.0.0.0/' "$CONFIG_DIR/.env"
sed -i 's/^PORT=.*/PORT=3000/' "$CONFIG_DIR/.env"

echo "[driftlands] downloading image"
curl -fL "$BASE_URL/driftlands-image.tar" -o "$IMAGE_TAR"

echo "[driftlands] loading docker image"
docker load -i "$IMAGE_TAR"

echo "[driftlands] recreating container"
while [ "$PUBLISH_PORT" -le "$MAX_PUBLISH_PORT" ]; do
  docker stop driftlands >/dev/null 2>&1 || true
  docker rm driftlands >/dev/null 2>&1 || true
  echo "[driftlands] trying host port $PUBLISH_PORT"
  if docker run -d \\
    --name driftlands \\
    --restart unless-stopped \\
    --env-file "$CONFIG_DIR/.env" \\
    -v "$CONFIG_DIR/state:/data" \\
    -p "$PUBLISH_PORT:3000" \\
    driftlands:latest; then
    break
  fi

  PUBLISH_PORT=$((PUBLISH_PORT + 1))
done

if [ "$PUBLISH_PORT" -gt "$MAX_PUBLISH_PORT" ]; then
  echo "[driftlands] no free host port found between $START_PUBLISH_PORT and $MAX_PUBLISH_PORT" >&2
  exit 1
fi

echo "[driftlands] container status"
docker ps --filter name=driftlands
echo "[driftlands] selected host port: $PUBLISH_PORT"
echo "[driftlands] local health check"
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PUBLISH_PORT/health"; then
    echo
    exit 0
  fi
  echo "[driftlands] waiting for health check ($attempt/30)"
  sleep 1
done

echo "[driftlands] health check did not become ready; recent logs:" >&2
docker logs --tail=120 driftlands >&2 || true
exit 1
echo
`;

  writeFileSync(installScript, script);
  return installScript;
}

function writeHaosSshInstallScript(publishPort = config.haosPublishPort) {
  const { installScript } = haosBundlePaths();
  const script = `#!/bin/sh
set -eu

CONFIG_DIR="${config.haosRemoteDir}"
IMAGE_TAR="$CONFIG_DIR/driftlands-image.tar"
START_PUBLISH_PORT="${publishPort}"
PUBLISH_PORT="$START_PUBLISH_PORT"
MAX_PUBLISH_PORT=$((START_PUBLISH_PORT + 50))

echo "[driftlands] using $CONFIG_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$CONFIG_DIR/state"

if [ -f "$CONFIG_DIR/driftlands.env" ]; then
  echo "[driftlands] installing env"
  cp "$CONFIG_DIR/driftlands.env" "$CONFIG_DIR/.env"
fi

sed -i 's/^HOST=.*/HOST=0.0.0.0/' "$CONFIG_DIR/.env"
sed -i 's/^PORT=.*/PORT=3000/' "$CONFIG_DIR/.env"

echo "[driftlands] loading docker image"
docker load -i "$IMAGE_TAR"

echo "[driftlands] recreating container"
while [ "$PUBLISH_PORT" -le "$MAX_PUBLISH_PORT" ]; do
  docker stop driftlands >/dev/null 2>&1 || true
  docker rm driftlands >/dev/null 2>&1 || true
  echo "[driftlands] trying host port $PUBLISH_PORT"
  if docker run -d \\
    --name driftlands \\
    --restart unless-stopped \\
    --env-file "$CONFIG_DIR/.env" \\
    -v "$CONFIG_DIR/state:/data" \\
    -p "$PUBLISH_PORT:3000" \\
    driftlands:latest; then
    break
  fi

  PUBLISH_PORT=$((PUBLISH_PORT + 1))
done

if [ "$PUBLISH_PORT" -gt "$MAX_PUBLISH_PORT" ]; then
  echo "[driftlands] no free host port found between $START_PUBLISH_PORT and $MAX_PUBLISH_PORT" >&2
  exit 1
fi

echo "[driftlands] container status"
docker ps --filter name=driftlands
echo "[driftlands] selected host port: $PUBLISH_PORT"
echo "[driftlands] local health check"
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PUBLISH_PORT/health"; then
    echo
    exit 0
  fi
  echo "[driftlands] waiting for health check ($attempt/30)"
  sleep 1
done

echo "[driftlands] health check did not become ready; recent logs:" >&2
docker logs --tail=120 driftlands >&2 || true
exit 1
echo
`;

  writeFileSync(installScript, script);
  return installScript;
}

function serveHaosBundle(host, port) {
  const { dir } = haosBundlePaths();
  const allowedFiles = new Map([
    ['/driftlands-image.tar', { path: resolve(dir, 'driftlands-image.tar'), type: 'application/x-tar' }],
    ['/driftlands.env', { path: resolve(dir, 'driftlands.env'), type: 'text/plain; charset=utf-8' }],
    ['/install-driftlands-haos.sh', { path: resolve(dir, 'install-driftlands-haos.sh'), type: 'text/x-shellscript; charset=utf-8' }],
  ]);

  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    const file = allowedFiles.get(pathname);
    if (!file || !existsSync(file.path)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found\n');
      return;
    }

    response.writeHead(200, {
      'content-type': file.type,
      'cache-control': 'no-store',
    });
    createReadStream(file.path).pipe(response);
  });

  return new Promise((resolveServe, rejectServe) => {
    server.once('error', rejectServe);
    server.listen(Number(port), '0.0.0.0', () => {
      server.off('error', rejectServe);
      resolveServe({
        baseUrl: `http://${host}:${port}`,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}

async function prepareHaosBundle(options = {}) {
  printHeader('Prepare Home Assistant Docker Bundle');
  printHint('Builds the Driftlands Docker image, exports it, and writes an install script for Home Assistant WebSSH.');
  console.log(formatKeyValue('bundle', config.haosBundleDir));
  console.log(formatKeyValue('image', config.image));
  console.log('');

  const frontendOrigin = options.frontendOrigin ?? (
    options.assumeDefaults ? config.haosFrontendOrigin : await askText('Allowed frontend origin', config.haosFrontendOrigin)
  );
  const adminWallets = options.adminWallets ?? (
    options.assumeDefaults ? config.adminWallets : await askText('Admin wallet allowlist', config.adminWallets)
  );
  const imagePlatform = options.imagePlatform ?? (
    options.assumeDefaults ? config.haosImagePlatform : await askText('Home Assistant Docker platform', config.haosImagePlatform)
  );
  if (!options.assumeConfirmed && !await confirm('Build image and export Home Assistant bundle now?')) {
    return null;
  }

  mkdirSync(config.haosBundleDir, { recursive: true });

  const buildArgs = ['build', '-t', config.image];
  if (imagePlatform) {
    buildArgs.push('--platform', imagePlatform);
  }
  buildArgs.push('.');

  if (await run('docker', buildArgs) !== 0) {
    if (!options.skipPause) await pause();
    return null;
  }

  const { imageTar, envFile } = haosBundlePaths();
  if (await run('docker', ['save', '-o', imageTar, config.image]) !== 0) {
    if (!options.skipPause) await pause();
    return null;
  }

  writeFileSync(envFile, starterHaosEnvContents(frontendOrigin, adminWallets));
  printSuccess(`Wrote ${envFile}`);
  printSuccess(`Wrote ${imageTar}`);

  return { frontendOrigin, adminWallets, imagePlatform };
}

async function publishHaosBundle() {
  const prepared = await prepareHaosBundle();
  if (!prepared) return;

  const addresses = localLanAddresses();
  const defaultHost = process.env.DRIFTLANDS_HAOS_BUNDLE_HOST || addresses[0] || '127.0.0.1';
  const host = await askText('LAN address Home Assistant can reach on this Mac', defaultHost);
  const port = await askText('Temporary bundle server port', config.haosBundlePort);
  const publishPort = await askText('Home Assistant host port for Driftlands', config.haosPublishPort);
  const baseUrl = `http://${host}:${port}`;
  const installScript = writeHaosInstallScript(baseUrl, publishPort);

  let serverHandle;
  try {
    serverHandle = await serveHaosBundle(host, port);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    await pause();
    return;
  }

  printHeader('Home Assistant WebSSH Install');
  printSuccess(`Serving bundle from ${serverHandle.baseUrl}`);
  console.log(formatKeyValue('image tar', haosBundlePaths().imageTar));
  console.log(formatKeyValue('env', haosBundlePaths().envFile));
  console.log(formatKeyValue('script', installScript));

  section('Paste This In Home Assistant WebSSH');
  console.log(color(`curl -fsSL ${baseUrl}/install-driftlands-haos.sh | sh`, ansi.bold, ansi.yellow));

  section('After Install');
  console.log('In Nginx Proxy Manager, update the Driftlands proxy host to:');
  console.log(formatKeyValue('domain', 'driftlands.andredegroot.duckdns.org'));
  console.log(formatKeyValue('scheme', 'http'));
  console.log(formatKeyValue('forward', 'homeassistant.local'));
  console.log(formatKeyValue('port', publishPort));
  console.log(formatKeyValue('websockets', 'on'));
  console.log('');
  printHint('The installer starts at the selected port and tries the next 50 ports if Docker reports a port conflict.');
  printHint('Use the "[driftlands] selected host port" printed by WebSSH in Nginx Proxy Manager.');
  console.log('');
  console.log('Then test:');
  console.log(color('curl https://driftlands.andredegroot.duckdns.org/health', ansi.yellow));

  printWarn('Keep this TUI open until the WebSSH command finishes downloading the image.');
  await pause();
  await serverHandle.close();
}

async function deployHaosOverSsh() {
  printHeader('Deploy Backend To HAOS');
  printHint(`Builds locally, copies the bundle to ${config.haosSshHost}:${config.haosRemoteDir}, then installs over SSH.`);

  const prepared = await prepareHaosBundle({
    assumeConfirmed: true,
    assumeDefaults: true,
    skipPause: true,
  });
  if (!prepared) return 1;

  const { imageTar, envFile } = haosBundlePaths();
  const installScript = writeHaosSshInstallScript(config.haosPublishPort);
  const remoteDir = config.haosRemoteDir.replace(/\/+$/g, '');

  if (await run('ssh', [config.haosSshHost, `mkdir -p ${shellQuote(remoteDir)}`]) !== 0) {
    return 1;
  }

  if (await run('scp', ['-O', imageTar, envFile, installScript, `${config.haosSshHost}:${remoteDir}/`]) !== 0) {
    return 1;
  }

  const remoteInstallScript = `${remoteDir}/install-driftlands-haos.sh`;
  const remoteCommand = `chmod +x ${shellQuote(remoteInstallScript)} && ${shellQuote(remoteInstallScript)}`;
  return run('ssh', [config.haosSshHost, remoteCommand]);
}

async function showHaosRestartServerCommand(options = {}) {
  printHeader('Restart Home Assistant Server');
  printHint('Paste this command in Home Assistant WebSSH. It restarts only the Driftlands server container.');
  printHint('It automatically discovers the current mapped host port and waits for /health.');

  const script = [
    `CONTAINER="${config.serverContainer}"`,
    'echo "[driftlands] restarting $CONTAINER"',
    'docker restart "$CONTAINER" || exit 1',
    'PUBLISH_PORT="$(docker port "$CONTAINER" 3000/tcp | awk -F: "{print \\$NF; exit}")"',
    'docker ps --filter "name=^/$CONTAINER$"',
    'if [ -z "$PUBLISH_PORT" ]; then echo "[driftlands] could not discover host port for $CONTAINER" >&2; docker logs --tail=80 "$CONTAINER" >&2 || true; exit 1; fi',
    'echo "[driftlands] selected host port: $PUBLISH_PORT"',
    'for attempt in $(seq 1 30); do if curl -fsS "http://127.0.0.1:$PUBLISH_PORT/health"; then echo; exit 0; fi; echo "[driftlands] waiting for health check ($attempt/30)"; sleep 1; done',
    'echo "[driftlands] health check did not become ready; recent logs:" >&2',
    'docker logs --tail=120 "$CONTAINER" >&2 || true',
    'exit 1',
  ].join('; ');
  const command = `sh -c ${shellQuote(script)}`;

  section('Paste This In Home Assistant WebSSH');
  console.log(color(command, ansi.bold, ansi.yellow));
  console.log('');
  section('After Restart');
  console.log(color(`curl ${config.healthUrl}`, ansi.yellow));

  if (!options.skipPause) {
    await pause();
  }
}

async function manageHaosDeployment() {
  while (true) {
    const action = await selectMenu([
      { value: 'publish', label: 'Guided HA Docker publish', detail: 'Build image, serve bundle, and print a WebSSH install command.' },
      { value: 'restart-server', label: 'Restart server', detail: `Print a WebSSH command to restart ${config.serverContainer} and wait for /health.` },
      { value: 'bundle', label: 'Build bundle only', detail: 'Build image and write output/haos files without starting the bundle server.' },
      { value: 'back', label: 'Back to main menu', detail: 'Return to the main menu.' },
    ], 'Home Assistant Docker', 'Run Driftlands on the Home Assistant Docker host, like n8n.');

    if (action === 'back' || action === 'exit') break;
    switch (action) {
      case 'publish':
        await publishHaosBundle();
        break;
      case 'restart-server':
        await showHaosRestartServerCommand();
        break;
      case 'bundle':
        await prepareHaosBundle();
        await pause();
        break;
      default:
        printWarn('Unknown Home Assistant action.');
        await pause();
    }
  }
}

async function showDeploymentSnippets() {
  printHeader('Deployment Snippets');
  section('HAOS Docker Commands');
  console.log(color(`docker network create ${config.network}`, ansi.yellow));
  console.log('');
  console.log(color(`docker run -d \\
  --name ${config.serverContainer} \\
  --restart unless-stopped \\
  --network ${config.network} \\
  --env-file ${config.envFile} \\
  -v /config/driftlands/state:/data \\
  ${config.image}`, ansi.yellow));
  console.log('');
  console.log(color(`docker run -d \\
  --name ${config.caddyContainer} \\
  --restart unless-stopped \\
  --network ${config.network} \\
  -p 80:80 \\
  -p 443:443 \\
  -v ${config.caddyfile}:/etc/caddy/Caddyfile:ro \\
  -v ${config.caddyDataVolume}:/data \\
  caddy:2`, ansi.yellow));

  section('Platform Frontend Env');
  console.log(`VITE_DRIFTLANDS_SERVER_URL=https://${config.domain}`);
  console.log('VITE_DRIFTLANDS_LOOPERLANDS_API_URL=https://api.looperlands.io/api');
  console.log('VITE_DRIFTLANDS_WALLETCONNECT_PROJECT_ID=<reown-project-id>');
  await pause();
}

async function manageServerHosting() {
  while (true) {
    const action = await selectMenu([
      { value: 'status', label: 'Server status', detail: 'Inspect Driftlands/Caddy containers and image metadata.' },
      { value: 'build', label: '1. Build server image', detail: `Build ${config.image} from this checkout.` },
      { value: 'templates', label: '2. Write env/Caddy templates', detail: 'Create starter files for the Docker host.' },
      { value: 'network', label: '3. Create Docker network', detail: `Ensure ${config.network} exists.` },
      { value: 'server', label: '4. Run Driftlands server', detail: `Recreate ${config.serverContainer}.` },
      { value: 'caddy', label: '5. Run Caddy HTTPS proxy', detail: `Recreate ${config.caddyContainer}.` },
      { value: 'restart', label: 'Restart containers', detail: 'Restart server, Caddy, or both.' },
      { value: 'stop', label: 'Stop containers', detail: 'Stop server, Caddy, or both.' },
      { value: 'back', label: 'Back to main menu', detail: 'Return to the main menu.' },
    ], 'Server Hosting', 'Build and manage the Docker hosting stack.');

    if (action === 'back' || action === 'exit') break;
    switch (action) {
      case 'status':
        await showStatus();
        break;
      case 'build':
        await buildImage();
        break;
      case 'templates':
        await writeConfigFiles();
        break;
      case 'network':
        printHeader('Create Docker Network');
        await ensureNetwork();
        await pause();
        break;
      case 'server':
        await runServer();
        break;
      case 'caddy':
        await runCaddy();
        break;
      case 'restart':
        await restartContainers();
        break;
      case 'stop':
        await stopContainers();
        break;
      default:
        printWarn('Unknown server hosting action.');
        await pause();
    }
  }
}

async function manageDiagnostics() {
  while (true) {
    const action = await selectMenu([
      { value: 'overview', label: 'Overview', detail: 'Inspect containers, image, and frontend status.' },
      { value: 'logs', label: 'Tail logs', detail: 'Follow server or Caddy logs.' },
      { value: 'health', label: 'Check public health URL', detail: `Fetch ${config.healthUrl}.` },
      { value: 'back', label: 'Back to main menu', detail: 'Return to the main menu.' },
    ], 'Diagnostics', 'Check whether the hosted pieces are alive.');

    if (action === 'back' || action === 'exit') break;
    switch (action) {
      case 'overview':
        await showStatus();
        break;
      case 'logs':
        await tailLogs();
        break;
      case 'health':
        await healthCheck();
        break;
      default:
        printWarn('Unknown diagnostics action.');
        await pause();
    }
  }
}

async function mainMenu() {
  await bootAnimation();

  while (true) {
    const action = await selectMenu(menuItems, 'Main Menu', 'Choose the kind of work you want to do.');
    if (action === 'exit') break;

    switch (action) {
      case 'overview':
        await showStatus();
        break;
      case 'server-hosting':
        await manageServerHosting();
        break;
      case 'haos':
        await manageHaosDeployment();
        break;
      case 'server-config':
        await manageServerEnvironment();
        break;
      case 'frontend':
        await manageFrontendDeployment();
        break;
      case 'diagnostics':
        await manageDiagnostics();
        break;
      case 'snippets':
        await showDeploymentSnippets();
        break;
      default:
        printWarn('Unknown action.');
        await pause();
    }
  }
}

function printUsage() {
  console.log(`Driftlands hosting CLI

Usage:
  driftlands
  driftlands tui
  driftlands hosting
  driftlands deploy [frontend|backend|both]
  driftlands frontend
  driftlands publish-frontend
  driftlands haos
  driftlands haos-deploy
  driftlands haos-restart
  driftlands external
  driftlands https

Keys:
  up/down, j/k    move
  enter           select
  q               exit menu

Environment overrides:
  DRIFTLANDS_DOMAIN=driftlands.example.com
  DRIFTLANDS_CONFIG_DIR=/config/driftlands
  DRIFTLANDS_HEALTH_URL=https://driftlands.example.com/health
  DRIFTLANDS_FRONTEND_REPO=/path/to/looperlands-platform-frontend
  DRIFTLANDS_FRONTEND_DEPLOY_COMMAND="npm run deploy"
  DRIFTLANDS_ADMIN_WALLETS=0xabc...,0xdef...
  DRIFTLANDS_HAOS_BUNDLE_PORT=8899
  DRIFTLANDS_HAOS_PUBLISH_PORT=3695
  DRIFTLANDS_HAOS_SSH_HOST=haos
  DRIFTLANDS_HAOS_REMOTE_DIR=/config/driftlands
  DRIFTLANDS_HAOS_IMAGE_PLATFORM=linux/amd64
  DOCKER_HOST=ssh://root@<haos-host>
  DRIFTLANDS_TUI_NO_ANIMATION=1
`);
}

try {
  const command = process.argv[2] || 'tui';
  if (command === 'tui' || command === 'hosting') {
    await mainMenu();
  } else if (command === 'deploy') {
    await deploySelected(process.argv[3]);
  } else if (command === 'frontend') {
    await manageFrontendDeployment();
  } else if (command === 'publish-frontend') {
    await fullFrontendPipeline();
  } else if (command === 'haos' || command === 'homeassistant') {
    await manageHaosDeployment();
  } else if (command === 'haos-deploy' || command === 'publish-haos') {
    await publishHaosBundle();
  } else if (command === 'haos-restart' || command === 'restart-haos') {
    await showHaosRestartServerCommand({ skipPause: true });
  } else if (command === 'external' || command === 'start-external') {
    await run('node', ['scripts/start-external.mjs']);
  } else if (command === 'https' || command === 'external:https') {
    await run('node', ['scripts/start-https-proxy.mjs']);
  } else if (command === 'help' || command === '--help' || command === '-h') {
    printUsage();
  } else {
    printUsage();
    process.exitCode = 1;
  }
} finally {
  showCursor();
  rl.close();
}
