import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import type { Tile } from '../core/types/Tile.ts';
import { loadWorld, tileIndex } from '../core/world.ts';
import { heroes, loadHeroes } from './heroStore.ts';
import { resourceInventory, resetResourceState } from './resourceStore.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';
import { selectedHeroId } from './uiStore.ts';
import { loadStoryProgression, setStoryProgressionForMission } from '../shared/story/progressionState.ts';
import {
  getTutorialHintTaskKeysForStep,
  isTutorialPanelOpen,
  resetTutorialMapHintAnchorForTests,
  tutorialMapHints,
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
  loadStoryProgression(null);
  currentPlayerSettlementId.value = null;
  selectedHeroId.value = null;
  isTutorialPanelOpen.value = true;
});

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
