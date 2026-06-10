import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./perf-monitor-server.mjs', import.meta.url));

test('perf monitor server proxies public game stats without bearer token plumbing', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /\/api\/stats/);
  assert.match(source, /statsTargetFromPerfTarget/);
  assert.match(source, /range/);
  assert.doesNotMatch(source, /DRIFTLANDS_ADMIN_STATS_TOKEN/);
  assert.doesNotMatch(source, /PERF_MONITOR_STATS_TOKEN/);
  assert.doesNotMatch(source, /stats-token/);
  assert.doesNotMatch(source, /Authorization/);
});
