import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDiscoveryPayload,
  buildLanServerUrls,
  buildServerUrl,
  getLanAddresses,
  normalizeDesktopWorldSettings,
  parseDiscoveryPayload,
} from './desktopNetworking.mjs';

const networkInterfaces = {
  lo0: [
    { family: 'IPv4', internal: true, address: '127.0.0.1' },
  ],
  en0: [
    { family: 'IPv4', internal: false, address: '192.168.1.42' },
    { family: 'IPv6', internal: false, address: 'fe80::1' },
  ],
  en1: [
    { family: 'IPv4', internal: false, address: '10.0.0.8' },
  ],
};

test('LAN address helpers ignore loopback and IPv6 interfaces', () => {
  assert.deepEqual(getLanAddresses(networkInterfaces), ['10.0.0.8', '192.168.1.42']);
  assert.equal(buildServerUrl('192.168.1.42', 3695), 'http://192.168.1.42:3695');
  assert.deepEqual(buildLanServerUrls(3695, networkInterfaces), [
    'http://10.0.0.8:3695',
    'http://192.168.1.42:3695',
  ]);
});

test('desktop world settings fall back to solo when required URLs are missing', () => {
  assert.deepEqual(normalizeDesktopWorldSettings({ mode: 'lan-host' }), {
    mode: 'lan-host',
    sharedServerUrl: '',
    joinServerUrl: '',
  });
  assert.deepEqual(normalizeDesktopWorldSettings({ mode: 'lan-join' }), {
    mode: 'solo',
    sharedServerUrl: '',
    joinServerUrl: '',
  });
  assert.deepEqual(normalizeDesktopWorldSettings({ mode: 'shared' }), {
    mode: 'solo',
    sharedServerUrl: '',
    joinServerUrl: '',
  });
  assert.deepEqual(normalizeDesktopWorldSettings({ mode: 'shared', sharedServerUrl: ' https://example.test/ ' }), {
    mode: 'shared',
    sharedServerUrl: 'https://example.test',
    joinServerUrl: '',
  });
});

test('desktop world settings use the default shared URL when the saved shared URL is blank', () => {
  assert.deepEqual(normalizeDesktopWorldSettings(
    { mode: 'solo', sharedServerUrl: '' },
    { sharedServerUrl: 'https://driftlands.ddns.net' },
  ), {
    mode: 'solo',
    sharedServerUrl: 'https://driftlands.ddns.net',
    joinServerUrl: '',
  });
  assert.deepEqual(normalizeDesktopWorldSettings(
    { mode: 'shared', sharedServerUrl: '' },
    { sharedServerUrl: 'https://driftlands.ddns.net' },
  ), {
    mode: 'shared',
    sharedServerUrl: 'https://driftlands.ddns.net',
    joinServerUrl: '',
  });
});

test('desktop world settings replace invalid shared defaults with the hosted default', () => {
  assert.deepEqual(normalizeDesktopWorldSettings(
    { mode: 'shared', sharedServerUrl: 'http://127.0.0.1:3695' },
    {
      sharedServerUrl: 'https://driftlands.ddns.net',
      invalidSharedServerUrls: ['http://127.0.0.1:3695'],
    },
  ), {
    mode: 'shared',
    sharedServerUrl: 'https://driftlands.ddns.net',
    joinServerUrl: '',
  });
});

test('LAN discovery payloads round trip with normalized server URLs', () => {
  const payload = buildDiscoveryPayload({
    worldName: 'Ada World',
    serverUrl: 'http://192.168.1.42:3695/',
  });
  const parsed = parseDiscoveryPayload(JSON.stringify(payload));

  assert.equal(parsed?.name, 'Ada World');
  assert.equal(parsed?.serverUrl, 'http://192.168.1.42:3695');
  assert.equal(parseDiscoveryPayload('not json'), null);
  assert.equal(parseDiscoveryPayload(JSON.stringify({ type: 'other' })), null);
});
