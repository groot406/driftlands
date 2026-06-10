import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  buildSteamDemoServerEnv,
  getConfiguredDesktopServerUrl,
  getSteamDemoServerPort,
  resolveDesktopAssetPaths,
} from './steamRuntime.mjs';

test('steam demo server env disables debug and writes saves under user data', () => {
  const env = buildSteamDemoServerEnv({
    baseEnv: {
      SERVER_DEBUG_MODE: '1',
      SERVER_REQUIRE_LOOPERLANDS_AUTH: '1',
      PORT: '3000',
    },
    port: 32123,
    userDataPath: path.join('/tmp', 'Driftlands Demo'),
  });

  assert.equal(env.DRIFTLANDS_BUILD_TARGET, 'steam-demo');
  assert.equal(env.DRIFTLANDS_DEMO_MODE, '1');
  assert.equal(env.SERVER_DEBUG_MODE, '0');
  assert.equal(env.SERVER_REQUIRE_LOOPERLANDS_AUTH, '0');
  assert.equal(env.SERVER_SETTLEMENT_START_MODE, 'free');
  assert.equal(env.SERVER_SPAWN_SAFETY, '1');
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.PORT, '32123');
  assert.equal(env.FRONTEND_ORIGIN, '*');
  assert.equal(env.SERVER_SAVE_PATH, path.join('/tmp', 'Driftlands Demo', 'world-save.json'));
});

test('steam demo server env can bind to the local network for LAN hosting', () => {
  const env = buildSteamDemoServerEnv({
    baseEnv: {},
    port: 32123,
    userDataPath: path.join('/tmp', 'Driftlands Demo'),
    host: '0.0.0.0',
  });

  assert.equal(env.HOST, '0.0.0.0');
});

test('configured desktop server url enables hosted multiplayer mode', () => {
  assert.equal(getConfiguredDesktopServerUrl({}), '');
  assert.equal(
    getConfiguredDesktopServerUrl({ DRIFTLANDS_DESKTOP_SERVER_URL: ' https://driftlands.example.test/ ' }),
    'https://driftlands.example.test',
  );
});

test('steam demo server port uses a deterministic internal default', () => {
  assert.equal(getSteamDemoServerPort({}), 3695);
  assert.equal(getSteamDemoServerPort({ DRIFTLANDS_DESKTOP_PORT: '41234' }), 41234);
  assert.equal(getSteamDemoServerPort({ DRIFTLANDS_DESKTOP_PORT: 'not-a-port' }), 3695);
});

test('desktop asset paths distinguish development and packaged layouts', () => {
  const devPaths = resolveDesktopAssetPaths({
    appRoot: '/repo',
    resourcesPath: '/repo',
    packaged: false,
  });

  assert.equal(devPaths.clientUrl, 'http://localhost:5173');
  assert.equal(devPaths.serverEntry, path.join('/repo', 'server', 'src', 'index.ts'));
  assert.equal(devPaths.serverCwd, '/repo');
  assert.equal(devPaths.serverRunner, 'tsx');

  const packagedPaths = resolveDesktopAssetPaths({
    appRoot: '/Applications/Driftlands.app/Contents/Resources/app.asar',
    resourcesPath: '/Applications/Driftlands.app/Contents/Resources',
    packaged: true,
  });

  assert.equal(
    packagedPaths.clientUrl,
    `file://${path.join('/Applications/Driftlands.app/Contents/Resources', 'app', 'dist', 'index.html')}`,
  );
  assert.equal(
    packagedPaths.serverEntry,
    path.join('/Applications/Driftlands.app/Contents/Resources', 'app', 'dist-server', 'index.mjs'),
  );
  assert.equal(
    packagedPaths.serverCwd,
    path.join('/Applications/Driftlands.app/Contents/Resources', 'app'),
  );
  assert.equal(packagedPaths.serverRunner, 'electron-node');
});
