import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('publishing asset generation syncs the iOS app icon', async () => {
  const script = await readFile(new URL('./generate-publishing-assets.mjs', import.meta.url), 'utf8');

  assert.match(script, /ios\/App\/App\/Assets\.xcassets\/AppIcon\.appiconset/);
  assert.match(script, /ipad-app-icon-1024\.png/);
  assert.match(script, /AppIcon-512@2x\.png/);
  assert.match(script, /copyFileSync\(ipadIcon/);
});
