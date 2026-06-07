import assert from 'node:assert/strict';
import { test } from 'node:test';

test('bundled effect sounds resolve locally when a backend origin is configured', async () => {
  const module = await import('./soundAssets.ts').catch(() => null);
  const resolveSoundAssetUrl = module?.resolveSoundAssetUrl as
    | undefined
    | ((soundPath: string, options?: { serverBaseUrl?: string }) => string);

  const resolved = resolveSoundAssetUrl?.('chopping.wav', {
    serverBaseUrl: 'https://driftlands.example.com',
  }) ?? 'missing resolver';

  assert.notEqual(resolved, 'https://driftlands.example.com/sounds/chopping.wav');
  assert.ok(
    resolved.endsWith('/src/assets/sounds/chopping.wav') || resolved.includes('/assets/chopping'),
    resolved,
  );
});
