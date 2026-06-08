import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const htmlPath = fileURLToPath(new URL('./index.html', import.meta.url));

test('perf monitor UI surfaces CPU in summary, trends, and insights', async () => {
  const html = await readFile(htmlPath, 'utf8');

  assert.match(html, /metricCard\('CPU'/);
  assert.match(html, /title: 'CPU load'/);
  assert.match(html, /current\.cpu/);
  assert.match(html, /formatPercent/);
});

test('perf monitor UI summarizes expensive systems, messages, and path cache health', async () => {
  const html = await readFile(htmlPath, 'utf8');

  assert.match(html, /Top Cumulative Systems/);
  assert.match(html, /Top Outbound Bytes/);
  assert.match(html, /Slow Paths by Source/);
  assert.match(html, /Path Cache Health/);
  assert.match(html, /Path Cache Layers/);
  assert.match(html, /summarizePathCache/);
  assert.match(html, /summarizePathCacheLayers/);
});

test('perf monitor defaults to the displayed ten second interval and lazy raw JSON', async () => {
  const html = await readFile(htmlPath, 'utf8');

  assert.match(html, /intervalSeconds: 10/);
  assert.match(html, /value="10"/);
  assert.match(html, /renderRawJsonIfOpen/);
  assert.match(html, /toggle/);
});
