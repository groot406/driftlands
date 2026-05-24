import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProgressionUnlockAnnouncementItems,
  dismissUnlockAnnouncement,
  queueUnlockAnnouncement,
  resetUnlockAnnouncements,
  activeUnlockAnnouncement,
} from './unlockAnnouncementStore.ts';
import {
  createEmptyProgressionMetrics,
  createInitialProgressionSnapshot,
  evaluateProgression,
} from '../shared/story/progression.ts';

test.afterEach(() => {
  resetUnlockAnnouncements();
});

test('progression unlock announcements explain newly available buildings and tasks', () => {
  const previous = createInitialProgressionSnapshot();
  const metrics = createEmptyProgressionMetrics();
  metrics.population = 2;
  metrics.beds = 2;
  metrics.buildingCounts.house = 1;
  metrics.discoveredTerrains = ['water'];

  const next = evaluateProgression(metrics, previous.unlockedNodeKeys);
  const items = buildProgressionUnlockAnnouncementItems(previous, next);

  const dock = items.find((item) => item.kind === 'building' && item.key === 'dock');
  const tillLand = items.find((item) => item.kind === 'task' && item.key === 'tillLand');

  assert.ok(dock);
  assert.match(dock.details.join(' '), /New task: Build Dock/);
  assert.match(dock.details.join(' '), /Build cost:/);
  assert.equal(dock.preview?.baseAssetKey, 'water-v2');
  assert.ok(tillLand);
  assert.match(tillLand.summary, /farm plots/i);
});

test('progression unlock announcements include walls unlocked by perimeter security', () => {
  const previous = createInitialProgressionSnapshot();
  const metrics = createEmptyProgressionMetrics();
  metrics.population = 4;
  metrics.resourceStock.meat = 4;
  metrics.resourceStock.fish = 4;

  const next = evaluateProgression(metrics, previous.unlockedNodeKeys);
  const items = buildProgressionUnlockAnnouncementItems(previous, next);
  const wall = items.find((item) => item.kind === 'building' && item.key === 'wall');

  assert.ok(wall);
  assert.equal(wall.label, 'Wall');
  assert.match(wall.details.join(' '), /Build Wall/);
  assert.equal(wall.preview?.baseAssetKey, 'plains');
});

test('unlock announcement previews carry building animation metadata', () => {
  const previous = createInitialProgressionSnapshot();
  const metrics = createEmptyProgressionMetrics();
  metrics.population = 3;
  metrics.beds = 4;
  metrics.discoveredTerrains = ['water', 'forest', 'dirt', 'grain'];
  metrics.resourceStock.grain = 10;

  const next = evaluateProgression(metrics, previous.unlockedNodeKeys);
  const items = buildProgressionUnlockAnnouncementItems(previous, next);
  const granary = items.find((item) => item.kind === 'building' && item.key === 'granary');

  assert.ok(granary);
  assert.equal(granary.preview?.buildingOverlayAssetKey, 'building_granary_overlay_animated');
  assert.deepEqual(granary.preview?.buildingOverlayAnimation, { frames: 8, frameMs: 90 });
});

test('unlock announcements queue and dismiss in order', () => {
  queueUnlockAnnouncement([
    {
      kind: 'task',
      key: 'hunt',
      label: 'Hunt',
      summary: 'Gather emergency food.',
      details: ['Select a forest tile.'],
    },
  ]);
  queueUnlockAnnouncement([
    {
      kind: 'task',
      key: 'dig',
      label: 'Dig',
      summary: 'Turn grass into dirt.',
      details: ['Select a grass tile.'],
    },
  ]);

  assert.equal(activeUnlockAnnouncement.value?.items[0]?.key, 'hunt');
  dismissUnlockAnnouncement();
  assert.equal(activeUnlockAnnouncement.value?.items[0]?.key, 'dig');
});
