import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDiscoveryPayload,
  buildLanServerUrls,
  DEFAULT_SHARED_WORLD_URL,
  DESKTOP_DISCOVERY_INTERVAL_MS,
  DESKTOP_DISCOVERY_PORT,
  DESKTOP_WORLD_SETTINGS_FILE,
  getPrimaryLanServerUrl,
  normalizeDesktopWorldSettings,
  normalizeServerUrl,
  parseDiscoveryPayload,
} from './desktopNetworking.mjs';
import {
  buildSteamDemoServerEnv,
  getSteamDemoServerPort,
  resolveDesktopAssetPaths,
} from './steamRuntime.mjs';

let mainWindow = null;
let serverProcess = null;
let quitting = false;
let activeWorld = null;
let discoverySocket = null;
let discoveryBroadcastTimer = null;
const discoveredWorlds = new Map();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

function getTtsxCliPath(appRoot) {
  return path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
}

function getWorldSettingsPath() {
  return path.join(app.getPath('userData'), DESKTOP_WORLD_SETTINGS_FILE);
}

async function readWorldSettings() {
  const explicitSharedServerUrl = normalizeServerUrl(process.env.DRIFTLANDS_SHARED_WORLD_URL);
  const configuredDesktopServerUrl = normalizeServerUrl(process.env.DRIFTLANDS_DESKTOP_SERVER_URL);
  const configuredSharedServerUrl = explicitSharedServerUrl
    || (configuredDesktopServerUrl !== activeWorld?.serverUrl ? configuredDesktopServerUrl : '');
  const defaults = {
    mode: configuredSharedServerUrl ? 'shared' : 'solo',
    sharedServerUrl: configuredSharedServerUrl || DEFAULT_SHARED_WORLD_URL,
    invalidSharedServerUrls: [
      `http://127.0.0.1:${getSteamDemoServerPort()}`,
      `http://localhost:${getSteamDemoServerPort()}`,
      activeWorld?.serverUrl,
    ],
  };

  try {
    const raw = await readFile(getWorldSettingsPath(), 'utf8');
    return normalizeDesktopWorldSettings(JSON.parse(raw), defaults);
  } catch {
    return normalizeDesktopWorldSettings(defaults);
  }
}

async function writeWorldSettings(settings) {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(
    getWorldSettingsPath(),
    `${JSON.stringify(normalizeDesktopWorldSettings(settings), null, 2)}\n`,
    'utf8',
  );
}

function waitForHttpOk(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }

        retry();
      });

      req.on('error', retry);
      req.setTimeout(1_000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(attempt, 250);
    };

    attempt();
  });
}

function createServerProcess({ appRoot, paths, env }) {
  const args = paths.serverRunner === 'tsx'
    ? [getTtsxCliPath(appRoot), paths.serverEntry]
    : [paths.serverEntry];

  const child = spawn(process.execPath, args, {
    cwd: paths.serverCwd,
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[driftlands-server] ${chunk}`);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[driftlands-server] ${chunk}`);
  });
  child.once('exit', (code, signal) => {
    if (!quitting) {
      console.error(`[driftlands-server] exited unexpectedly code=${code ?? '-'} signal=${signal ?? '-'}`);
    }
  });

  return child;
}

function emitDesktopWorldUpdate() {
  mainWindow?.webContents.send('desktop:worlds-changed');
}

function listDiscoveredWorlds() {
  const staleBefore = Date.now() - 10_000;
  for (const [serverUrl, world] of discoveredWorlds.entries()) {
    if (world.lastSeenAt < staleBefore) {
      discoveredWorlds.delete(serverUrl);
    }
  }

  return [...discoveredWorlds.values()]
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

function startDiscoverySocket() {
  if (discoverySocket) {
    return;
  }

  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  discoverySocket.on('message', (message) => {
    const world = parseDiscoveryPayload(message);
    if (!world) {
      return;
    }

    const previous = discoveredWorlds.get(world.serverUrl);
    discoveredWorlds.set(world.serverUrl, {
      ...previous,
      ...world,
      lastSeenAt: Date.now(),
    });
    emitDesktopWorldUpdate();
  });
  discoverySocket.on('error', (error) => {
    console.warn('[desktop] LAN discovery failed:', error);
  });
  discoverySocket.bind(DESKTOP_DISCOVERY_PORT, () => {
    discoverySocket?.setBroadcast(true);
  });
}

function stopDiscoveryBroadcast() {
  if (discoveryBroadcastTimer) {
    clearInterval(discoveryBroadcastTimer);
    discoveryBroadcastTimer = null;
  }
}

function broadcastLanWorld() {
  if (!discoverySocket || activeWorld?.mode !== 'lan-host') {
    return;
  }

  const payload = Buffer.from(JSON.stringify(buildDiscoveryPayload({
    serverUrl: activeWorld.lanUrls[0] ?? activeWorld.serverUrl,
    worldName: 'Driftlands LAN World',
  })));
  discoverySocket.send(payload, 0, payload.length, DESKTOP_DISCOVERY_PORT, '255.255.255.255');
}

function startDiscoveryBroadcast() {
  stopDiscoveryBroadcast();
  broadcastLanWorld();
  discoveryBroadcastTimer = setInterval(broadcastLanWorld, DESKTOP_DISCOVERY_INTERVAL_MS);
}

async function startWorld(settings) {
  const appRoot = getAppRoot();
  const paths = resolveDesktopAssetPaths({
    appRoot,
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
  });
  const mode = settings.mode;

  if (mode === 'shared' || mode === 'lan-join') {
    const serverUrl = mode === 'shared' ? settings.sharedServerUrl : settings.joinServerUrl;
    stopDiscoveryBroadcast();
    activeWorld = {
      mode,
      clientUrl: paths.clientUrl,
      serverUrl,
      lanUrls: [],
      usingLocalServer: false,
    };
    return activeWorld;
  }

  const lanHost = mode === 'lan-host';
  const host = lanHost ? '0.0.0.0' : '127.0.0.1';
  const port = getSteamDemoServerPort();
  const userDataPath = app.getPath('userData');
  const env = buildSteamDemoServerEnv({
    baseEnv: process.env,
    port,
    userDataPath,
    host,
  });

  if (lanHost) {
    env.FRONTEND_ORIGIN = '*';
  }

  await mkdir(userDataPath, { recursive: true });
  serverProcess = createServerProcess({ appRoot, paths, env });
  await waitForHttpOk(`http://127.0.0.1:${port}/health`);

  const lanUrls = lanHost ? buildLanServerUrls(port) : [];
  activeWorld = {
    mode,
    clientUrl: paths.clientUrl,
    serverUrl: lanHost ? getPrimaryLanServerUrl(port) : `http://127.0.0.1:${port}`,
    lanUrls,
    usingLocalServer: true,
  };

  if (lanHost) {
    startDiscoveryBroadcast();
  } else {
    stopDiscoveryBroadcast();
  }

  return activeWorld;
}

function stopServer() {
  quitting = true;
  if (!serverProcess || serverProcess.killed) {
    return Promise.resolve();
  }

  const child = serverProcess;
  serverProcess.kill('SIGTERM');
  serverProcess = null;
  return new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 2_000);
  });
}

async function restartWorld(settings) {
  await stopServer();
  quitting = false;
  const world = await startWorld(settings);
  process.env.DRIFTLANDS_DESKTOP_SERVER_URL = world.serverUrl;
  emitDesktopWorldUpdate();
  return world;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0b1720',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[desktop] failed to load client code=${errorCode} description=${errorDescription}`);
  });

  const settings = await readWorldSettings();
  const world = await startWorld(settings);
  process.env.DRIFTLANDS_DESKTOP_SERVER_URL = world.serverUrl;
  await mainWindow.loadURL(world.clientUrl);
}

async function boot() {
  try {
    startDiscoverySocket();
    await createWindow();
  } catch (error) {
    console.error('[desktop] failed to start Driftlands', error);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Driftlands could not start',
      message: 'The local Driftlands server could not start.',
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
  }
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void boot();
  }
});

app.on('before-quit', () => {
  stopDiscoveryBroadcast();
  discoverySocket?.close();
  discoverySocket = null;
  stopServer();
});

ipcMain.handle('desktop:get-world-options', async () => {
  const settings = await readWorldSettings();
  return {
    settings,
    activeWorld,
    lanUrls: activeWorld?.lanUrls ?? [],
    discoveredWorlds: listDiscoveredWorlds(),
    discoveryPort: DESKTOP_DISCOVERY_PORT,
  };
});

ipcMain.handle('desktop:list-lan-worlds', () => listDiscoveredWorlds());

ipcMain.handle('desktop:refresh-lan-worlds', () => {
  startDiscoverySocket();
  return listDiscoveredWorlds();
});

ipcMain.handle('desktop:set-world-mode', async (_event, input = {}) => {
  const settings = normalizeDesktopWorldSettings({
    mode: input.mode,
    sharedServerUrl: input.sharedServerUrl,
    joinServerUrl: input.joinServerUrl,
  }, await readWorldSettings());

  await writeWorldSettings(settings);
  const world = await restartWorld(settings);
  return {
    settings,
    activeWorld: world,
    lanUrls: world.lanUrls ?? [],
    discoveredWorlds: listDiscoveredWorlds(),
  };
});
