import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeServerUrl } from './desktopNetworking.mjs';

const DEFAULT_STEAM_DEMO_PORT = 3695;

export function getSteamDemoServerPort(env = process.env) {
  const rawPort = Number(env.DRIFTLANDS_DESKTOP_PORT);
  if (Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535) {
    return rawPort;
  }

  return DEFAULT_STEAM_DEMO_PORT;
}

export function getConfiguredDesktopServerUrl(env = process.env) {
  return normalizeServerUrl(env.DRIFTLANDS_DESKTOP_SERVER_URL);
}

export function buildSteamDemoServerEnv({ baseEnv = process.env, port, userDataPath, host = '127.0.0.1' }) {
  return {
    ...baseEnv,
    DRIFTLANDS_BUILD_TARGET: 'steam-demo',
    DRIFTLANDS_DEMO_MODE: '1',
    SERVER_DEBUG_MODE: '0',
    SERVER_REQUIRE_LOOPERLANDS_AUTH: '0',
    SERVER_SETTLEMENT_START_MODE: 'free',
    SERVER_SPAWN_SAFETY: '1',
    HOST: host,
    PORT: String(port),
    FRONTEND_ORIGIN: '*',
    SERVER_SAVE_PATH: path.join(userDataPath, 'world-save.json'),
  };
}

export function resolveDesktopAssetPaths({ appRoot, resourcesPath, packaged }) {
  if (!packaged) {
    return {
      clientUrl: 'http://localhost:5173',
      serverEntry: path.join(appRoot, 'server', 'src', 'index.ts'),
      serverCwd: appRoot,
      serverRunner: 'tsx',
    };
  }

  const appResourcesPath = path.join(resourcesPath, 'app');
  return {
    clientUrl: pathToFileURL(path.join(appResourcesPath, 'dist', 'index.html')).href,
    serverEntry: path.join(appResourcesPath, 'dist-server', 'index.mjs'),
    serverCwd: appResourcesPath,
    serverRunner: 'electron-node',
  };
}
