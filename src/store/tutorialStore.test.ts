import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import type { Tile } from '../core/types/Tile.ts';
import { loadWorld, tileIndex } from '../core/world.ts';
import { heroes, loadHeroes } from './heroStore.ts';
import { replaceStorageInventories, resourceInventory, resetResourceState } from './resourceStore.ts';
import { loadPopulation, resetClientPopulationState } from './clientPopulationStore.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';
import { selectedHeroId } from './uiStore.ts';
import { loadStoryProgression, setStoryProgressionForMission } from '../shared/story/progressionState.ts';
import { createEmptyProgressionMetrics, evaluateProgression } from '../shared/story/progression.ts';
import {
  getTutorialHintTaskKeysForStep,
  isTutorialPanelOpen,
  resetTutorialMapHintAnchorForTests,
  tutorialMapHints,
  tutorialSnapshot,
} from './tutorialStore.ts';

function tile(q: number, r: number, terrain: Tile['terrain'], options: Partial<Tile> = {}): Tile {
  return {
    id: `${q},${r}`,
    q,
    r,
    biome: terrain,
    terrain,
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: null,
    ...options,
  } satisfies Tile;
}

function setupRaiseHouseTutorial() {
  setStoryProgressionForMission(1);
  currentPlayerSettlementId.value = '0,0';
  isTutorialPanelOpen.value = true;
  resourceInventory.wood = 2;

  const hero: Hero = {
    id: 'hero-1',
    name: 'Guide',
    avatar: 'guide',
    q: 0,
    r: 0,
    stats: { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  };

  loadHeroes([hero]);
  selectedHeroId.value = hero.id;
  loadWorld([
    tile(0, 0, 'towncenter', { isBaseTile: false }),
    tile(0, 1, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(1, 0, 'plains'),
    tile(5, 0, 'plains'),
    tile(0, 2, 'forest'),
    tile(0, 3, 'forest'),
    tile(0, 4, 'forest'),
    tile(0, 5, 'forest'),
    tile(0, 6, 'forest'),
    tile(0, 7, 'forest'),
  ]);

  return heroes[0]!;
}

test.afterEach(() => {
  resetTutorialMapHintAnchorForTests();
  loadWorld([]);
  loadHeroes([]);
  resetResourceState();
  resetClientPopulationState();
  loadStoryProgression(null);
  currentPlayerSettlementId.value = null;
  selectedHeroId.value = null;
  isTutorialPanelOpen.value = true;
});

function setupMineRidgesTutorial(population: { current: number; beds: number }) {
  setStoryProgressionForMission(1);
  currentPlayerSettlementId.value = '0,0';
  isTutorialPanelOpen.value = true;
  resourceInventory.wood = 20;
  resourceInventory.grain = 4;
  resourceInventory.water = 1;

  loadPopulation({
    current: population.current,
    beds: population.beds,
    max: 15,
    hungerMs: 0,
    supportCapacity: 20,
    activeTileCount: 20,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  const hero: Hero = {
    id: 'hero-1',
    name: 'Guide',
    avatar: 'guide',
    q: 0,
    r: 0,
    stats: { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  };

  loadHeroes([hero]);
  selectedHeroId.value = hero.id;
  loadWorld([
    tile(0, 0, 'towncenter', { isBaseTile: false }),
    tile(0, 1, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(1, 0, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(1, 1, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(2, 0, 'water', { variant: 'water_dock_a' }),
    tile(2, 1, 'plains', { variant: 'plains_watchtower' }),
    tile(3, 0, 'grain', { variant: 'grain_granary' }),
    tile(3, 1, 'plains', { variant: 'plains_well' }),
    tile(0, 2, 'dirt', { variant: 'dirt_tilled' }),
    tile(0, 3, 'plains', { variant: 'road' }),
    tile(0, 4, 'plains', { variant: 'road' }),
    tile(0, 5, 'plains', { variant: 'road' }),
    tile(4, 0, 'mountain'),
    tile(5, 0, 'plains'),
  ]);

  return hero;
}

function setupStudyAndUpgradeTutorial() {
  currentPlayerSettlementId.value = '0,0';
  isTutorialPanelOpen.value = true;
  resourceInventory.wood = 30;
  resourceInventory.stone = 8;
  resourceInventory.ore = 6;
  resourceInventory.tools = 0;
  resourceInventory.grain = 4;
  resourceInventory.water = 1;

  loadPopulation({
    current: 5,
    beds: 6,
    max: 15,
    hungerMs: 0,
    supportCapacity: 24,
    activeTileCount: 20,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  loadStoryProgression(evaluateProgression({
    ...createEmptyProgressionMetrics(),
    population: 5,
    beds: 6,
    resourceStock: { wood: 30, stone: 8, ore: 6, grain: 4, water: 1 },
    buildingCounts: {
      house: 2,
      dock: 1,
      watchtower: 1,
      granary: 1,
      well: 1,
      quarry: 1,
      mine: 1,
      supplyDepot: 1,
    },
    operationalBuildingCounts: {
      mine: 1,
    },
    discoveredTerrains: ['water', 'grain', 'mountain'],
  }), '0,0');

  const hero: Hero = {
    id: 'hero-1',
    name: 'Guide',
    avatar: 'guide',
    q: 0,
    r: 0,
    stats: { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  };

  loadHeroes([hero]);
  selectedHeroId.value = hero.id;
  loadWorld([
    tile(0, 0, 'towncenter', { isBaseTile: false }),
    tile(0, 1, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(1, 0, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(1, 1, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(2, 0, 'water', { variant: 'water_dock_a' }),
    tile(2, 1, 'plains', { variant: 'plains_watchtower' }),
    tile(3, 0, 'grain', { variant: 'grain_granary' }),
    tile(3, 1, 'plains', { variant: 'plains_well' }),
    tile(0, 2, 'dirt', { variant: 'dirt_tilled' }),
    tile(0, 3, 'plains', { variant: 'road' }),
    tile(0, 4, 'plains', { variant: 'road' }),
    tile(0, 5, 'plains', { variant: 'road' }),
    tile(1, 2, 'plains', { variant: 'plains_depot' }),
    tile(4, 0, 'mountain', { variant: 'mountains_with_mine' }),
    tile(4, 1, 'mountain', { variant: 'mountains_with_quarry' }),
    tile(5, 0, 'plains'),
  ]);

  return hero;
}

test('tutorial hint routing sends waterless open-field starts to tree planting instead of docks', () => {
  const route = getTutorialHintTaskKeysForStep('build-dock', 'open_field');

  assert.deepEqual(route?.taskKeys, ['plantTrees', 'hunt', 'buildHuntersHut']);
  assert.equal(route?.scoutLabel, 'Find open land');
  assert.equal(route?.taskKeys.includes('buildDock'), false);
});

test('tutorial hint routing keeps shoreline and woodland early-food routes distinct', () => {
  assert.deepEqual(
    getTutorialHintTaskKeysForStep('build-dock', 'shoreline')?.taskKeys,
    ['buildDock'],
  );
  assert.deepEqual(
    getTutorialHintTaskKeysForStep('build-dock', 'woodland')?.taskKeys,
    ['hunt', 'buildHuntersHut'],
  );
});

test('tutorial hint routing prefers workshop before tool-gated library', () => {
  assert.deepEqual(
    getTutorialHintTaskKeysForStep('study-and-upgrade', 'shoreline')?.taskKeys,
    ['buildWorkshop', 'buildLibrary'],
  );
});

test('tutorial hint routing includes hospitality, trade, and house comfort routes', () => {
  assert.deepEqual(
    getTutorialHintTaskKeysForStep('raise-comfort', 'shoreline')?.taskKeys,
    ['buildPub', 'buildShop', 'upgradeHouseToStone', 'upgradeHouseToGlass', 'buildHarbor'],
  );
});

test('tutorial task hints stay anchored when the selected hero moves', () => {
  const hero = setupRaiseHouseTutorial();

  const firstHint = tutorialMapHints.value[0];
  assert.equal(firstHint?.taskKey, 'buildHouse');
  assert.equal(firstHint?.q, 1);
  assert.equal(firstHint?.r, 0);

  hero.q = 6;
  hero.r = 0;

  const movedHint = tutorialMapHints.value[0];
  assert.equal(movedHint?.taskKey, 'buildHouse');
  assert.equal(movedHint?.q, 1);
  assert.equal(movedHint?.r, 0);
});

test('tutorial task hints drop when their step is no longer needed', () => {
  setupRaiseHouseTutorial();

  assert.equal(tutorialMapHints.value[0]?.taskKey, 'buildHouse');

  loadWorld([
    tile(0, 0, 'towncenter', { isBaseTile: false }),
    tile(0, 1, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(1, 0, 'plains'),
    tile(5, 0, 'plains', { variant: 'plains_house' }),
    tile(0, 2, 'forest'),
    tile(0, 3, 'forest'),
    tile(0, 4, 'forest'),
    tile(0, 5, 'forest'),
    tile(0, 6, 'forest'),
    tile(0, 7, 'forest'),
  ]);

  assert.equal(tutorialMapHints.value.some((hint) => hint.taskKey === 'buildHouse'), false);
});

test('tutorial task hints move only after the anchored tile becomes invalid', () => {
  const hero = setupRaiseHouseTutorial();

  assert.equal(tutorialMapHints.value[0]?.q, 1);

  tileIndex['1,0']!.terrain = 'water';
  hero.q = 6;

  const nextHint = tutorialMapHints.value[0];
  assert.equal(nextHint?.taskKey, 'buildHouse');
  assert.equal(nextHint?.q, 5);
  assert.equal(nextHint?.r, 0);
});

test('mine-ridge hints do not ask to find mountains already discovered when population is blocked', () => {
  setupMineRidgesTutorial({ current: 4, beds: 4 });

  const hint = tutorialMapHints.value[0];
  assert.equal(hint?.taskKey, 'buildHouse');
  assert.equal(hint?.label, 'Build house');
});

test('study-and-upgrade hints build a workshop before a library when tools are missing', () => {
  setupStudyAndUpgradeTutorial();

  const hint = tutorialMapHints.value[0];
  assert.equal(hint?.taskKey, 'buildWorkshop');
  assert.equal(hint?.label, 'Build workshop');
});

test('tutorial progress uses the current settlement instead of aggregate world progress', () => {
  currentPlayerSettlementId.value = '10,0';
  selectedHeroId.value = 'own-hero';

  loadPopulation({
    current: 5,
    beds: 6,
    max: 20,
    hungerMs: 0,
    supportCapacity: 40,
    activeTileCount: 30,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 4,
        beds: 4,
        max: 10,
        hungerMs: 0,
        supportCapacity: 30,
        ownedTileCount: 14,
        activeTileCount: 14,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
      {
        settlementId: '10,0',
        current: 1,
        beds: 0,
        max: 10,
        hungerMs: 0,
        supportCapacity: 12,
        ownedTileCount: 2,
        activeTileCount: 2,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
    ],
  });

  loadHeroes([{
    id: 'own-hero',
    name: 'Guide',
    avatar: 'guide',
    q: 10,
    r: 0,
    stats: { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '10,0',
  }]);

  loadWorld([
    tile(0, 0, 'towncenter', { isBaseTile: false, ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    tile(0, 1, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(1, 0, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(1, 1, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(2, 0, 'water', { variant: 'water_dock_a' }),
    tile(2, 1, 'plains', { variant: 'plains_watchtower' }),
    tile(3, 0, 'grain', { variant: 'grain_granary' }),
    tile(3, 1, 'plains', { variant: 'plains_well' }),
    tile(4, 0, 'mountain', { variant: 'mountains_with_mine' }),
    tile(4, 1, 'mountain', { variant: 'mountains_with_quarry' }),
    tile(5, 0, 'plains', { variant: 'plains_workshop' }),
    tile(5, 1, 'plains', { variant: 'plains_pub' }),
    tile(6, 0, 'plains'),
    tile(10, 0, 'towncenter', { isBaseTile: false, ownerSettlementId: '10,0', controlledBySettlementId: '10,0' }),
    tile(10, 1, 'plains', { isBaseTile: false, ownerSettlementId: '10,0', controlledBySettlementId: '10,0' }),
  ]);
  replaceStorageInventories([
    {
      tileId: '0,0',
      kind: 'towncenter',
      capacity: 100,
      resources: { wood: 40, fish: 8, grain: 4, ore: 6, tools: 2 },
    },
  ]);

  assert.equal(tutorialSnapshot.value.currentStep?.id, 'scout-frontier');
  assert.equal(tutorialSnapshot.value.currentStep?.progressLabel, '2/10 tiles found');
  assert.equal(tutorialSnapshot.value.steps.find((step) => step.id === 'gather-wood')?.completed, false);
});

test('field guide completes founding a second hearth after two town centers exist', () => {
  currentPlayerSettlementId.value = '0,0';
  selectedHeroId.value = 'hero-1';
  resourceInventory.wood = 40;
  resourceInventory.grain = 4;
  resourceInventory.water = 1;
  resourceInventory.fish = 8;
  resourceInventory.ore = 6;
  resourceInventory.tools = 2;

  loadPopulation({
    current: 7,
    beds: 8,
    max: 30,
    hungerMs: 0,
    supportCapacity: 30,
    activeTileCount: 24,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  loadHeroes([{
    id: 'hero-1',
    name: 'Guide',
    avatar: 'guide',
    q: 0,
    r: 0,
    stats: { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  }]);

  loadWorld([
    tile(0, 0, 'towncenter', { isBaseTile: false }),
    tile(10, 0, 'towncenter', { isBaseTile: false, ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    tile(0, 1, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(0, 2, 'plains', { isBaseTile: false, variant: 'road' }),
    tile(1, 0, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(1, 1, 'plains', { isBaseTile: false, variant: 'plains_house' }),
    tile(2, 0, 'water', { variant: 'water_dock_a' }),
    tile(2, 1, 'plains', { variant: 'plains_watchtower' }),
    tile(3, 0, 'grain', { variant: 'grain_granary' }),
    tile(3, 1, 'plains', { variant: 'plains_well' }),
    tile(1, 2, 'plains', { variant: 'plains_depot' }),
    tile(4, 0, 'mountain', { variant: 'mountains_with_mine' }),
    tile(4, 1, 'mountain', { variant: 'mountains_with_quarry' }),
    tile(5, 0, 'plains', { variant: 'plains_workshop' }),
    tile(5, 1, 'plains', { variant: 'plains_pub' }),
    tile(6, 0, 'plains'),
  ]);

  const secondHearth = tutorialSnapshot.value.steps.find((step) => step.id === 'found-second-hearth');

  assert.equal(secondHearth?.progressLabel, '2/2 town centers');
  assert.equal(secondHearth?.completed, true);
});
