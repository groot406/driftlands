import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { registerLooperlandsProxy } from './looperlandsProxy.ts';

const originalFetch = globalThis.fetch;
const originalTimeout = process.env.LOOPERLANDS_PROXY_TIMEOUT_MS;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (typeof originalTimeout === 'undefined') {
    delete process.env.LOOPERLANDS_PROXY_TIMEOUT_MS;
  } else {
    process.env.LOOPERLANDS_PROXY_TIMEOUT_MS = originalTimeout;
  }
});

test('verify proxy returns 504 instead of hanging when upstream stalls', async () => {
  process.env.LOOPERLANDS_PROXY_TIMEOUT_MS = '20';
  let upstreamCalled = false;
  globalThis.fetch = (() => {
    upstreamCalled = true;
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  const app = express();
  app.use(express.json());
  registerLooperlandsProxy(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/looperlands/web3/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'looperlands.io wants you to sign in with your Ethereum account:\n0xfe49e5c384f5fdddfc52e9610bfab3d49d86847d',
        signature: '0xsignature',
        network: 167000,
      }),
    });
    const body = await response.json() as { message?: string };

    assert.equal(upstreamCalled, true);
    assert.equal(response.status, 504);
    assert.match(body.message ?? '', /timed out/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('wallet loopers proxy returns 504 instead of hanging when upstream stalls', async () => {
  process.env.LOOPERLANDS_PROXY_TIMEOUT_MS = '20';
  let upstreamCalled = false;
  globalThis.fetch = ((input) => {
    upstreamCalled = String(input).includes('/game/wallet/0xfe49e5c384f5fdddfc52e9610bfab3d49d86847d:167000/loopers');
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  const app = express();
  app.use(express.json());
  registerLooperlandsProxy(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/looperlands/game/wallet/0xfe49e5c384f5fdddfc52e9610bfab3d49d86847d%3A167000/loopers`, {
      headers: {
        'Accept': 'application/json',
        'X-AUTH-WEB3TOKEN': 'test-token',
      },
    });
    const body = await response.json() as { message?: string };

    assert.equal(upstreamCalled, true);
    assert.equal(response.status, 504);
    assert.match(body.message ?? '', /timed out/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
