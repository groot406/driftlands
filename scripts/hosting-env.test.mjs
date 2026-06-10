import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('..', import.meta.url);

async function readRoot(path) {
  return readFile(fileURLToPath(new URL(path, rootUrl)), 'utf8');
}

test('deployment env examples include game analytics storage settings without token auth', async () => {
  for (const file of ['.env.example', '.env.external.example', '.env.hassio.example']) {
    const contents = await readRoot(file);
    assert.match(contents, /DRIFTLANDS_ANALYTICS_PATH=/, file);
    assert.match(contents, /DRIFTLANDS_ANALYTICS_RETENTION_DAYS=30/, file);
    assert.doesNotMatch(contents, /DRIFTLANDS_ADMIN_STATS_TOKEN/, file);
  }
});

test('hosting scripts expose analytics settings in generated env workflows', async () => {
  const tui = await readRoot('scripts/hosting-tui.mjs');
  const external = await readRoot('scripts/start-external.mjs');
  const dockerfile = await readRoot('Dockerfile');

  assert.match(tui, /DRIFTLANDS_ANALYTICS_PATH/);
  assert.match(tui, /DRIFTLANDS_ANALYTICS_RETENTION_DAYS/);
  assert.doesNotMatch(tui, /DRIFTLANDS_ADMIN_STATS_TOKEN/);
  assert.doesNotMatch(external, /DRIFTLANDS_ADMIN_STATS_TOKEN/);
  assert.match(dockerfile, /DRIFTLANDS_ANALYTICS_PATH=\/data\/analytics/);
});
