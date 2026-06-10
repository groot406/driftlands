import assert from 'node:assert/strict';
import test from 'node:test';
import { isStatsRequestAuthorized, normalizeStatsRange } from './analyticsRoutes';

test('stats endpoint authorization is public like the performance monitor', () => {
  assert.equal(isStatsRequestAuthorized({}, { debugMode: true, token: undefined }), true);
  assert.equal(isStatsRequestAuthorized({}, { debugMode: false, token: undefined }), true);
  assert.equal(isStatsRequestAuthorized({ authorization: 'Bearer wrong' }, { debugMode: false, token: 'secret' }), true);
});

test('stats range defaults to today for unsupported values', () => {
  assert.equal(normalizeStatsRange('today'), 'today');
  assert.equal(normalizeStatsRange('7d'), '7d');
  assert.equal(normalizeStatsRange('30d'), '30d');
  assert.equal(normalizeStatsRange('forever'), 'today');
});
