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
