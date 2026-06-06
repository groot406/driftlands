import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCpuUsageSample } from './performanceMonitor';

test('computeCpuUsageSample reports process CPU percent from elapsed wall time', () => {
  const sample = computeCpuUsageSample(
    { userMicros: 1_000_000, systemMicros: 500_000, observedAtMs: 1_000 },
    { userMicros: 1_250_000, systemMicros: 550_000, observedAtMs: 2_000 },
  );

  assert.deepEqual(sample, {
    elapsedMs: 1_000,
    userMs: 250,
    systemMs: 50,
    totalMs: 300,
    percentOfOneCore: 30,
  });
});
