import assert from 'node:assert/strict';
import test from 'node:test';
import { getDriftlandsServerUrlFromEnv } from './driftlandsServerUrl.ts';

test('runtime shell server URL overrides build-time Vite env', () => {
  assert.equal(
    getDriftlandsServerUrlFromEnv(
      { DEV: false, VITE_SERVER_URL: 'https://hosted.example' },
      { serverUrl: 'http://127.0.0.1:3695' },
    ),
    'http://127.0.0.1:3695',
  );
});

test('development localhost keeps same-origin proxy behavior', () => {
  assert.equal(
    getDriftlandsServerUrlFromEnv(
      { DEV: true, VITE_SERVER_URL: 'https://hosted.example' },
      { hostname: 'localhost' },
    ),
    '',
  );
});

test('ipad build defaults to the hosted Driftlands server', () => {
  assert.equal(
    getDriftlandsServerUrlFromEnv({ VITE_DRIFTLANDS_BUILD_TARGET: 'ipad' }),
    'https://driftlands.ddns.net',
  );
});

test('runtime stored server URL overrides the ipad hosted default', () => {
  assert.equal(
    getDriftlandsServerUrlFromEnv(
      { VITE_DRIFTLANDS_BUILD_TARGET: 'ipad' },
      { storedServerUrl: ' https://custom.example/ ' },
    ),
    'https://custom.example',
  );
});
