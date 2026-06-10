import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('steam demo server bundle is self-contained for moved macOS apps', async () => {
  const buildScript = await readFile(new URL('./build-steam-demo.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(buildScript, /--packages=external/);
  assert.match(buildScript, /--bundle/);
  assert.match(buildScript, /createRequire\(import\.meta\.url\)/);
  assert.match(buildScript, /--outfile=dist-server\/index\.mjs/);
});
