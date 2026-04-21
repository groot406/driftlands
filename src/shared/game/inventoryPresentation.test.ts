import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerrainKey } from '../../core/terrainDefs.ts';
import type { ResourceType } from '../../core/types/Resource.ts';
import {
  cloneStoryProgression,
  createInitialProgressionSnapshot,
  type BuildingKey,
  type ProgressionNodeKey,
  type ProgressionSnapshot,
  type UpgradeKey,
} from '../story/progression.ts';
import { getVisibleInventoryEntries } from './inventoryPresentation.ts';

function visibleKeys(
  inventory: Partial<Record<ResourceType, number>> = {},
  progression: ProgressionSnapshot = createInitialProgressionSnapshot(),
) {
  return getVisibleInventoryEntries({ inventory, progression }).map((entry) => entry.key);
}

function visibleKeysByGroup(
  inventory: Partial<Record<ResourceType, number>> = {},
  progression: ProgressionSnapshot = createInitialProgressionSnapshot(),
) {
  const entries = getVisibleInventoryEntries({ inventory, progression });
  return {
    stocks: entries.filter((entry) => entry.group === 'stock').map((entry) => entry.key),
    items: entries.filter((entry) => entry.group === 'item').map((entry) => entry.key),
  };
}

function withUnlocked(
  options: {
    nodes?: ProgressionNodeKey[];
    terrains?: TerrainKey[];
    buildings?: BuildingKey[];
    tasks?: string[];
    upgrades?: UpgradeKey[];
  },
) {
  const progression = cloneStoryProgression(createInitialProgressionSnapshot());
  progression.unlockedNodeKeys = [...new Set([...progression.unlockedNodeKeys, ...(options.nodes ?? [])])];
  progression.unlocked.terrains = [...new Set([...progression.unlocked.terrains, ...(options.terrains ?? [])])];
  progression.unlocked.buildings = [...new Set([...progression.unlocked.buildings, ...(options.buildings ?? [])])];
  progression.unlocked.tasks = [...new Set([...progression.unlocked.tasks, ...(options.tasks ?? [])])];
  progression.unlocked.upgrades = [...new Set([...progression.unlocked.upgrades, ...(options.upgrades ?? [])])];
  return progression;
}

test('new runs show only the starting stock entries', () => {
  assert.deepEqual(visibleKeysByGroup(), {
    stocks: ['food', 'wood', 'stone', 'grain'],
    items: [],
  });
});

test('ore is hidden until mountain industry is relevant or stocked', () => {
  assert.equal(visibleKeys().includes('ore'), false);
  assert.equal(visibleKeys({}, withUnlocked({ terrains: ['mountain'] })).includes('ore'), true);
  assert.equal(visibleKeys({}, withUnlocked({ buildings: ['mine'] })).includes('ore'), true);
  assert.equal(visibleKeys({ ore: 1 }).includes('ore'), true);
});

test('sand is hidden until desert industry is relevant or stocked', () => {
  assert.equal(visibleKeys().includes('sand'), false);
  assert.equal(visibleKeys({}, withUnlocked({ terrains: ['dessert'] })).includes('sand'), true);
  assert.equal(visibleKeys({}, withUnlocked({ nodes: ['desert_industry'] })).includes('sand'), true);
  assert.equal(visibleKeys({ sand: 1 }).includes('sand'), true);
});

test('special items are hidden until relevant or stocked', () => {
  assert.deepEqual(visibleKeysByGroup().items, []);

  assert.equal(visibleKeys({}, withUnlocked({ tasks: ['harvestWaterLilies'] })).includes('water_lily'), true);
  assert.equal(visibleKeys({}, withUnlocked({ buildings: ['workshop'] })).includes('tools'), true);
  assert.equal(visibleKeys({}, withUnlocked({ upgrades: ['glass_house_upgrade'] })).includes('glass'), true);
  assert.deepEqual(visibleKeysByGroup({ water_lily: 1, tools: 2, glass: 3 }).items, [
    'water_lily',
    'tools',
    'glass',
  ]);
});

test('positive stock reveals entries even without progression relevance', () => {
  assert.deepEqual(visibleKeysByGroup({ ore: 2, sand: 2, water_lily: 2, tools: 2, glass: 2 }), {
    stocks: ['food', 'wood', 'stone', 'grain', 'ore', 'sand'],
    items: ['water_lily', 'tools', 'glass'],
  });
});
