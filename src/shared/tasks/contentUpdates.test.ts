import test from 'node:test';
import assert from 'node:assert/strict';

import './taskDefinitions.ts';
import { getTaskDefinition } from './taskRegistry.ts';
import { canStartTaskDefinition } from './taskAvailability.ts';
import type { Hero } from '../../core/types/Hero.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { getBuildingDefinitionByKey, resolveBuildingJobResources } from '../buildings/registry.ts';
import { getUpgradeDefinitionByKey } from '../buildings/upgrades.ts';
import { resetStudyState } from '../../store/studyStore.ts';
import {
  consumeTileProductionBoost,
  getTileProductionBoostInputReduction,
  getTileProductionBoostMultiplier,
} from '../game/tileFeatures.ts';

const hero: Hero = {
  id: 'h-test',
  name: 'Tester',
  avatar: '',
  q: 0,
  r: 0,
  stats: { xp: 0, hp: 1, atk: 1, spd: 1 },
  facing: 'down',
};

function tile(overrides: Partial<Tile>): Tile {
  return {
    id: '0,0',
    q: 0,
    r: 0,
    biome: null,
    terrain: 'plains',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    ...overrides,
  };
}

test.afterEach(() => {
  resetStudyState();
});

test('gatherSand only starts on active desert tiles and respects sand-rich modifiers', () => {
  const def = getTaskDefinition('gatherSand');
  assert.ok(def);

  const desert = tile({ terrain: 'dessert' });
  const inactiveDesert = tile({ terrain: 'dessert', activationState: 'inactive' });
  const plains = tile({ terrain: 'plains' });
  const richDesert = tile({ terrain: 'dessert', modifier: 'sand_rich', modifierRevealed: true });

  assert.equal(canStartTaskDefinition(def, desert, hero), true);
  assert.equal(canStartTaskDefinition(def, inactiveDesert, hero), false);
  assert.equal(canStartTaskDefinition(def, plains, hero), false);
  assert.deepEqual(def.totalRewardedResources?.(0, richDesert), { type: 'sand', amount: 3 });
});

test('surveyTile reveals hidden modifiers and special markers once', () => {
  const def = getTaskDefinition('surveyTile');
  assert.ok(def);

  const target = tile({
    modifier: 'rich_soil',
    modifierRevealed: false,
    special: 'fertile_basin',
    specialRevealed: false,
    surveyed: false,
  });

  assert.equal(canStartTaskDefinition(def, target, hero), true);
  def.onComplete?.(target, {
    id: 'survey',
    type: 'surveyTile',
    tileId: target.id,
    progressXp: 0,
    requiredXp: 1,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: true,
  }, [hero]);

  assert.equal(target.surveyed, true);
  assert.equal(target.modifierRevealed, true);
  assert.equal(target.specialRevealed, true);
  assert.equal(canStartTaskDefinition(def, target, hero), false);
});

test('activateRuins is one-time and requires revealed ancient ruins', () => {
  const def = getTaskDefinition('activateRuins');
  assert.ok(def);

  const ruins = tile({ special: 'ancient_ruins', specialRevealed: true, specialActivated: false });
  assert.equal(canStartTaskDefinition(def, ruins, hero), true);

  def.onComplete?.(ruins, {
    id: 'ruins',
    type: 'activateRuins',
    tileId: ruins.id,
    progressXp: 0,
    requiredXp: 1,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: true,
  }, [hero]);

  assert.equal(ruins.specialActivated, true);
  assert.equal(canStartTaskDefinition(def, ruins, hero), false);
});

test('oven consumes sand and wood to produce glass', () => {
  const oven = getBuildingDefinitionByKey('oven');
  assert.ok(oven);

  const resources = resolveBuildingJobResources(oven, tile({ terrain: 'plains', variant: 'plains_oven' }), 1);
  assert.deepEqual(resources.consumes, [
    { type: 'sand', amount: 2 },
    { type: 'wood', amount: 1 },
  ]);
  assert.deepEqual(resources.produces, [{ type: 'glass', amount: 1 }]);
});

test('hunter hut builds on forest and produces steady food', () => {
  const buildHunterHut = getTaskDefinition('buildHuntersHut');
  const huntersHut = getBuildingDefinitionByKey('huntersHut');
  assert.ok(buildHunterHut);
  assert.ok(huntersHut);

  const forest = tile({ terrain: 'forest' });
  assert.equal(buildHunterHut.canStart(forest, hero), true);
  assert.equal(buildHunterHut.canStart(tile({ terrain: 'plains' }), hero), false);

  const resources = resolveBuildingJobResources(
    huntersHut,
    tile({ terrain: 'forest', variant: 'forest_hunters_hut' }),
    1,
  );
  assert.deepEqual(resources.produces, [{ type: 'food', amount: 1 }]);
});

test('glass house upgrade raises house beds to six', () => {
  const upgrade = getUpgradeDefinitionByKey('glass_house_upgrade');
  assert.ok(upgrade);

  assert.equal(upgrade.resolveToVariant(tile({ variant: 'plains_stone_house' })), 'plains_glass_house');
  assert.deepEqual(upgrade.effects, [{ kind: 'house_beds_total', value: 6 }]);
});

test('production boosts can last multiple cycles and reduce boosted inputs', () => {
  const boosted = tile({
    nextProductionBoostMultiplier: 1.75,
    nextProductionBoostCyclesRemaining: 2,
    nextProductionBoostInputReduction: 1,
  });

  assert.equal(getTileProductionBoostMultiplier(boosted), 1.75);
  assert.equal(getTileProductionBoostInputReduction(boosted), 1);
  assert.equal(consumeTileProductionBoost(boosted), true);
  assert.equal(boosted.nextProductionBoostCyclesRemaining, 1);
  assert.equal(getTileProductionBoostMultiplier(boosted), 1.75);
  assert.equal(consumeTileProductionBoost(boosted), true);
  assert.equal(boosted.nextProductionBoostMultiplier, null);
  assert.equal(boosted.nextProductionBoostInputReduction, null);
});
