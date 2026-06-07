import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableClientVersion,
  checkForClientUpdate,
  clientUpdateRequired,
  currentClientVersion,
  resetClientUpdateStore,
} from './clientUpdateStore.ts';

test.afterEach(() => {
  resetClientUpdateStore();
});

test('checkForClientUpdate stays quiet when the manifest is missing', async () => {
  await checkForClientUpdate(async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  }) as Response, ['/driftlands-version.json']);

  assert.equal(clientUpdateRequired.value, false);
  assert.equal(availableClientVersion.value, null);
});

test('checkForClientUpdate opens update state when the remote release differs', async () => {
  await checkForClientUpdate(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      clientReleaseId: `${currentClientVersion.clientReleaseId}-next`,
      releasedAt: Date.now(),
      gitHead: 'next',
    }),
  }) as Response, ['/driftlands-version.json']);

  assert.equal(clientUpdateRequired.value, true);
  assert.equal(availableClientVersion.value?.clientReleaseId, `${currentClientVersion.clientReleaseId}-next`);
});

test('checkForClientUpdate ignores the same remote release', async () => {
  await checkForClientUpdate(async () => ({
    ok: true,
    status: 200,
    json: async () => currentClientVersion,
  }) as Response, ['/driftlands-version.json']);

  assert.equal(clientUpdateRequired.value, false);
  assert.equal(availableClientVersion.value, null);
});
