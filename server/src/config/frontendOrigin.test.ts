import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedFrontendOrigin } from './frontendOrigin.ts';

test('packaged app origins are allowed by default', () => {
  assert.equal(isAllowedFrontendOrigin('file://'), true);
  assert.equal(isAllowedFrontendOrigin('null'), true);
  assert.equal(isAllowedFrontendOrigin('capacitor://localhost'), true);
});

test('packaged app origins are allowed alongside a configured web frontend', () => {
  const configuredOrigins = ['https://looperlands.io'];

  assert.equal(isAllowedFrontendOrigin('https://looperlands.io', configuredOrigins), true);
  assert.equal(isAllowedFrontendOrigin('file://', configuredOrigins), true);
  assert.equal(isAllowedFrontendOrigin('null', configuredOrigins), true);
  assert.equal(isAllowedFrontendOrigin('capacitor://localhost', configuredOrigins), true);
});

test('unexpected public web origins remain blocked by default', () => {
  assert.equal(isAllowedFrontendOrigin('https://example.com'), false);
});
