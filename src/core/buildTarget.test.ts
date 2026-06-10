import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBuildTarget,
  isNativeAppBuild,
  isSteamDemoBuild,
  shouldPreferNoWalletStart,
  shouldShowWalletExtras,
} from './buildTarget.ts';

test('build target defaults to web when no Vite env is provided', () => {
  assert.equal(getBuildTarget({}), 'web');
  assert.equal(isSteamDemoBuild({}), false);
  assert.equal(isNativeAppBuild({}), false);
});

test('steam demo build prefers no-wallet start and keeps wallet extras available', () => {
  const env = {
    VITE_DRIFTLANDS_BUILD_TARGET: 'steam-demo',
  };

  assert.equal(getBuildTarget(env), 'steam-demo');
  assert.equal(isSteamDemoBuild(env), true);
  assert.equal(isNativeAppBuild(env), true);
  assert.equal(shouldPreferNoWalletStart(env), true);
  assert.equal(shouldShowWalletExtras(env), true);
});

test('ipad build is native but does not inherit Steam demo behavior', () => {
  const env = {
    VITE_DRIFTLANDS_BUILD_TARGET: 'ipad',
  };

  assert.equal(getBuildTarget(env), 'ipad');
  assert.equal(isSteamDemoBuild(env), false);
  assert.equal(isNativeAppBuild(env), true);
  assert.equal(shouldPreferNoWalletStart(env), true);
});
