import { computed, ref, watch } from 'vue';
import { tileIndex, tiles, worldVersion } from '../core/world.ts';
import type { Hero } from '../core/types/Hero.ts';
import type { TaskType } from '../core/types/Task.ts';
import type { Tile } from '../core/types/Tile.ts';
import { resourceInventory, resourceVersion } from './resourceStore.ts';
import { populationState, populationVersion } from './clientPopulationStore.ts';
import { heroes } from './heroStore.ts';
import { selectedHeroId } from './uiStore.ts';
import { runSnapshot, runVersion } from './runStore.ts';
import {
  getBuildingDefinitionByTaskKey,
  getBuildingDefinitionForTile,
} from '../shared/buildings/registry.ts';
import { axialDistanceCoords } from '../shared/game/hex.ts';
import { listUndiscoveredFrontierTiles } from '../shared/game/explorationFrontier.ts';
import { getSettlementTownCenterTile } from '../shared/game/settlement.ts';
import { getAvailableTasks } from '../shared/tasks/tasks.ts';
import { findNearestTaskAccessTile } from '../shared/tasks/taskAccess.ts';
import {
  evaluateTutorial,
  type TutorialMetrics,
  type TutorialStepId,
} from '../shared/tutorial/tutorialGuide.ts';
import { createLandingProfile, type LandingArchetype } from '../shared/story/landingProfile.ts';
import { isPositionControlled } from './settlementSupportStore.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';

const TUTORIAL_PANEL_STORAGE_KEY = 'driftlands-tutorial-panel-v1';
const RIDGE_INDUSTRY_REQUIRED_POPULATION = 5;
const LIBRARY_REQUIRED_TOOLS = 2;
const WORKSHOP_REQUIRED_ORE = 4;

function readStoredPanelOpen() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(TUTORIAL_PANEL_STORAGE_KEY);
    if (!raw) {
      return true;
    }

    const parsed = JSON.parse(raw) as { open?: unknown };
    return typeof parsed.open === 'boolean' ? parsed.open : true;
  } catch {
    return true;
  }
}

function persistPanelOpen(open: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TUTORIAL_PANEL_STORAGE_KEY, JSON.stringify({ open }));
  } catch {
  }
}

export const isTutorialPanelOpen = ref(readStoredPanelOpen());
export const browsedTutorialStepId = ref<TutorialStepId | null>(null);

export type TutorialMapHintAction = 'explore' | 'open-task-menu';

export interface TutorialMapHint {
  id: string;
  q: number;
  r: number;
  label: string;
  action: TutorialMapHintAction;
  taskKey?: TaskType;
}

interface AnchoredTutorialMapHint extends TutorialMapHint {
  stepId: TutorialStepId;
}

interface TutorialHintRoute {
  taskKeys: TaskType[];
  scoutLabel?: string;
  scoutTerrainKey?: string;
}

const TUTORIAL_TASK_LABELS: Partial<Record<TaskType, string>> = {
  chopWood: 'Chop wood',
  hunt: 'Hunt',
  plantTrees: 'Plant trees',
  buildRoad: 'Build road',
  buildHouse: 'Build house',
  buildDock: 'Build dock',
  buildHuntersHut: 'Build hunter hut',
  dig: 'Dig here',
  tillLand: 'Prepare land',
  seedGrain: 'Plant seeds',
  buildWatchtower: 'Build watchtower',
  buildGranary: 'Build granary',
  buildSupplyDepot: 'Build depot',
  buildWell: 'Build well',
  irregateDirtTask: 'Irrigate',
  buildMine: 'Build mine',
  buildQuarry: 'Build quarry',
  mineOre: 'Mine ore',
  buildLibrary: 'Build library',
  buildWorkshop: 'Build workshop',
  buildPub: 'Build pub',
  buildShop: 'Build shop',
  buildHarbor: 'Build harbor',
  upgradeHouseToStone: 'Upgrade house',
  upgradeHouseToGlass: 'Upgrade house',
  buildTownCenter: 'Build town',
};

let anchoredTutorialMapHint: AnchoredTutorialMapHint | null = null;

function getSelectedTutorialHero() {
  return selectedHeroId.value
    ? heroes.find((hero) => hero.id === selectedHeroId.value) ?? null
    : null;
}

function getCurrentSettlementOrigin() {
  const townCenter = getSettlementTownCenterTile(tiles, currentPlayerSettlementId.value);
  return townCenter ? { q: townCenter.q, r: townCenter.r } : { q: 0, r: 0 };
}

function buildTutorialMetrics(): TutorialMetrics {
  worldVersion.value;
  resourceVersion.value;
  populationVersion.value;
  runVersion.value;

  const terrainCounts: TutorialMetrics['terrainCounts'] = {};
  const variantCounts: TutorialMetrics['variantCounts'] = {};
  const buildingCounts: TutorialMetrics['buildingCounts'] = {};

  for (const tile of tiles) {
    if (!tile.discovered) {
      continue;
    }

    if (tile.terrain) {
      terrainCounts[tile.terrain] = (terrainCounts[tile.terrain] ?? 0) + 1;
    }

    if (tile.variant) {
      variantCounts[tile.variant] = (variantCounts[tile.variant] ?? 0) + 1;
    }

    const building = getBuildingDefinitionForTile(tile);
    if (building) {
      buildingCounts[building.key] = (buildingCounts[building.key] ?? 0) + 1;
    }
  }

  const selectedHero = getSelectedTutorialHero();
  const origin = getCurrentSettlementOrigin();
  const landingProfile = createLandingProfile(tiles, origin);

  return {
    selectedHeroCount: selectedHero ? 1 : 0,
    discoveredTiles: tiles.filter((tile) => tile.discovered).length,
    landingArchetype: landingProfile.archetype,
    terrainCounts,
    variantCounts,
    buildingCounts,
    resourceStock: { ...resourceInventory },
    population: {
      current: populationState.current,
      beds: populationState.beds,
      max: populationState.max,
      hungerMs: populationState.hungerMs,
      inactiveTileCount: populationState.inactiveTileCount,
    },
  };
}

export const tutorialMetrics = computed(buildTutorialMetrics);
export const tutorialSnapshot = computed(() => evaluateTutorial(tutorialMetrics.value));

export const visibleTutorialStep = computed(() => {
  const snapshot = tutorialSnapshot.value;
  if (browsedTutorialStepId.value) {
    return snapshot.steps.find((step) => step.id === browsedTutorialStepId.value) ?? snapshot.currentStep;
  }

  return snapshot.currentStep ?? snapshot.steps[snapshot.steps.length - 1] ?? null;
});

export const visibleTutorialStepNumber = computed(() => {
  const step = visibleTutorialStep.value;
  return step ? step.index + 1 : 0;
});

export const hasTutorial = computed(() => tutorialSnapshot.value.steps.length > 0);
export const isViewingCurrentTutorialStep = computed(() => {
  const current = tutorialSnapshot.value.currentStep;
  const visible = visibleTutorialStep.value;
  return !!current && !!visible && current.id === visible.id;
});

function compareTilesForHero(a: Tile, b: Tile, hero: Hero) {
  const heroDistanceDelta = axialDistanceCoords(hero.q, hero.r, a.q, a.r)
    - axialDistanceCoords(hero.q, hero.r, b.q, b.r);
  if (heroDistanceDelta !== 0) {
    return heroDistanceDelta;
  }

  const originDistanceDelta = axialDistanceCoords(0, 0, a.q, a.r)
    - axialDistanceCoords(0, 0, b.q, b.r);
  if (originDistanceDelta !== 0) {
    return originDistanceDelta;
  }

  return a.id.localeCompare(b.id);
}

function createTaskHint(taskKey: TaskType, tile: Tile): TutorialMapHint {
  return {
    id: `tutorial:${taskKey}:${tile.id}`,
    q: tile.q,
    r: tile.r,
    label: TUTORIAL_TASK_LABELS[taskKey] ?? 'Use here',
    action: 'open-task-menu',
    taskKey,
  };
}

function getCurrentPlayerPopulation() {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId
    ? populationState.settlements.find((settlement) => settlement.settlementId === settlementId) ?? populationState
    : populationState;
}

function isTutorialTaskReadyForHint(taskKey: TaskType) {
  const building = getBuildingDefinitionByTaskKey(taskKey);
  const requiredPopulation = building?.requiredPopulation ?? 0;
  if (getCurrentPlayerPopulation().current < requiredPopulation) {
    return false;
  }

  return taskKey !== 'buildLibrary' || metricResource('tools') >= LIBRARY_REQUIRED_TOOLS;
}

function findTutorialTaskHint(taskKeys: TaskType[], hero: Hero): TutorialMapHint | null {
  const candidates: Array<{ tile: Tile; taskKey: TaskType; priority: number }> = [];

  for (const tile of tiles) {
    if (!tile.discovered) {
      continue;
    }

    const availableTasks = getAvailableTasks(tile, hero);
    for (const [priority, taskKey] of taskKeys.entries()) {
      if (isTutorialTaskReadyForHint(taskKey) && availableTasks.some((task) => task.key === taskKey)) {
        candidates.push({ tile, taskKey, priority });
        break;
      }
    }
  }

  candidates.sort((a, b) => (
    a.priority - b.priority
    || compareTilesForHero(a.tile, b.tile, hero)
  ));

  const best = candidates[0];
  return best ? createTaskHint(best.taskKey, best.tile) : null;
}

function findTutorialScoutHint(hero: Hero, label = 'Scout here'): TutorialMapHint | null {
  const candidates = listUndiscoveredFrontierTiles()
    .filter((tile) => (
      !tile.discovered
      && isPositionControlled(tile.q, tile.r)
      && !!findNearestTaskAccessTile('explore', tile, hero.q, hero.r, hero.settlementId ?? null)
    ))
    .sort((a, b) => compareTilesForHero(a, b, hero));

  const target = candidates[0];
  return target
    ? {
      id: `tutorial:scout:${target.id}`,
      q: target.q,
      r: target.r,
      label,
      action: 'explore',
      taskKey: 'explore',
    }
    : null;
}

function getTutorialHintTile(hint: TutorialMapHint): Tile | null {
  return tileIndex[`${hint.q},${hint.r}`] ?? null;
}

function isTutorialTaskHintValid(hint: TutorialMapHint, stepId: TutorialStepId, hero: Hero) {
  const route = getTutorialHintTaskKeysForStep(stepId, tutorialMetrics.value.landingArchetype);
  const tile = getTutorialHintTile(hint);
  return !!route
    && hint.action === 'open-task-menu'
    && !!hint.taskKey
    && route.taskKeys.includes(hint.taskKey)
    && !!tile
    && tile.discovered
    && isTutorialTaskReadyForHint(hint.taskKey)
    && getAvailableTasks(tile, hero).some((task) => task.key === hint.taskKey);
}

function isTutorialScoutHintValid(hint: TutorialMapHint, hero: Hero) {
  const tile = getTutorialHintTile(hint);
  return hint.action === 'explore'
    && !!tile
    && !tile.discovered
    && isPositionControlled(tile.q, tile.r)
    && !!findNearestTaskAccessTile('explore', tile, hero.q, hero.r, hero.settlementId ?? null);
}

function isAnchoredTutorialHintValid(hint: AnchoredTutorialMapHint, stepId: TutorialStepId, hero: Hero) {
  if (hint.stepId !== stepId) {
    return false;
  }

  return isTutorialTaskHintValid(hint, stepId, hero)
    || isTutorialScoutHintValid(hint, hero);
}

export function getTutorialHintTaskKeysForStep(
  stepId: TutorialStepId,
  archetype: LandingArchetype | undefined,
): TutorialHintRoute | null {
  switch (stepId) {
    case 'gather-wood':
      return { taskKeys: ['chopWood'], scoutLabel: 'Find forest', scoutTerrainKey: 'forest' };
    case 'lay-road':
      return { taskKeys: ['buildRoad'] };
    case 'raise-house':
      return { taskKeys: ['buildHouse'] };
    case 'build-dock':
      if (archetype === 'shoreline') {
        return { taskKeys: ['buildDock'], scoutLabel: 'Find shore', scoutTerrainKey: 'water' };
      }
      if (archetype === 'woodland') {
        return { taskKeys: ['hunt', 'buildHuntersHut'], scoutLabel: 'Find forest', scoutTerrainKey: 'forest' };
      }
      return { taskKeys: ['plantTrees', 'hunt', 'buildHuntersHut'], scoutLabel: 'Find open land', scoutTerrainKey: 'plains' };
    case 'start-farming':
      return { taskKeys: ['seedGrain', 'tillLand', 'dig'] };
    case 'secure-perimeter':
      return { taskKeys: ['buildWatchtower'] };
    case 'build-storage':
      return { taskKeys: ['buildGranary', 'buildSupplyDepot'] };
    case 'irrigate-fields':
      return { taskKeys: ['buildWell', 'irregateDirtTask'] };
    case 'run-job-sites':
      return { taskKeys: ['buildGranary', 'buildBakery', 'buildLumberCamp', 'buildHuntersHut', 'buildApiary'] };
    case 'mine-ridges':
      return { taskKeys: ['buildMine', 'buildQuarry'], scoutLabel: 'Find mountains', scoutTerrainKey: 'mountain' };
    case 'stage-logistics':
      return { taskKeys: ['buildSupplyDepot', 'buildRoad'] };
    case 'study-and-upgrade':
      return { taskKeys: ['buildWorkshop', 'buildLibrary'] };
    case 'raise-comfort':
      return { taskKeys: ['buildPub', 'buildShop', 'upgradeHouseToStone', 'upgradeHouseToGlass', 'buildHarbor'] };
    case 'found-second-hearth':
      return { taskKeys: ['buildTownCenter', 'buildRoad'] };
    default:
      return null;
  }
}

function shouldScoutForTutorialRoute(route: TutorialHintRoute) {
  if (!route.scoutLabel) {
    return false;
  }

  if (!route.scoutTerrainKey) {
    return true;
  }

  return (tutorialMetrics.value.terrainCounts[route.scoutTerrainKey] ?? 0) <= 0;
}

function findTutorialPopulationHint(hero: Hero): TutorialMapHint | null {
  const population = getCurrentPlayerPopulation();
  if (population.beds <= population.current) {
    return findTutorialTaskHint(['buildHouse'], hero);
  }

  return null;
}

function metricResource(type: keyof TutorialMetrics['resourceStock']) {
  return Math.max(0, Math.floor(tutorialMetrics.value.resourceStock[type] ?? 0));
}

function metricBuilding(key: string) {
  return Math.max(0, Math.floor(tutorialMetrics.value.buildingCounts[key] ?? 0));
}

function getStudyAndUpgradeHintTaskKeys(): TaskType[] {
  if (metricResource('tools') >= LIBRARY_REQUIRED_TOOLS) {
    return ['buildLibrary', 'buildWorkshop'];
  }

  if (metricBuilding('workshop') > 0) {
    return ['buildLibrary'];
  }

  if (metricResource('ore') < WORKSHOP_REQUIRED_ORE) {
    return metricBuilding('mine') > 0
      ? ['mineOre', 'buildWorkshop']
      : ['buildMine', 'mineOre', 'buildWorkshop'];
  }

  return ['buildWorkshop', 'buildLibrary'];
}

function findTutorialHintForStep(stepId: TutorialStepId, hero: Hero): TutorialMapHint | null {
  switch (stepId) {
    case 'scout-frontier':
      return findTutorialScoutHint(hero);
    case 'work-harsh-frontier':
      return findTutorialScoutHint(hero, 'Push outward');
    default:
      break;
  }

  if (stepId === 'mine-ridges' && getCurrentPlayerPopulation().current < RIDGE_INDUSTRY_REQUIRED_POPULATION) {
    return findTutorialPopulationHint(hero);
  }

  if (stepId === 'study-and-upgrade') {
    return findTutorialTaskHint(getStudyAndUpgradeHintTaskKeys(), hero);
  }

  const route = getTutorialHintTaskKeysForStep(stepId, tutorialMetrics.value.landingArchetype);
  if (!route) {
    return null;
  }

  return findTutorialTaskHint(route.taskKeys, hero)
    ?? (shouldScoutForTutorialRoute(route) ? findTutorialScoutHint(hero, route.scoutLabel) : null);
}

function getAnchoredTutorialHintForStep(stepId: TutorialStepId, hero: Hero): TutorialMapHint | null {
  const anchoredHint = anchoredTutorialMapHint;
  if (anchoredHint && isAnchoredTutorialHintValid(anchoredHint, stepId, hero)) {
    return anchoredHint;
  }

  const nextHint = findTutorialHintForStep(stepId, hero);
  anchoredTutorialMapHint = nextHint ? { ...nextHint, stepId } : null;
  return nextHint;
}

export function resetTutorialMapHintAnchorForTests() {
  anchoredTutorialMapHint = null;
}

export const tutorialMapHints = computed<TutorialMapHint[]>(() => {
  worldVersion.value;
  resourceVersion.value;
  populationVersion.value;
  runVersion.value;

  if (!isTutorialPanelOpen.value || !isViewingCurrentTutorialStep.value) {
    return [];
  }

  const step = visibleTutorialStep.value;
  const hero = getSelectedTutorialHero();
  if (!step || step.completed || !hero) {
    anchoredTutorialMapHint = null;
    return [];
  }

  const hint = getAnchoredTutorialHintForStep(step.id, hero);
  return hint ? [hint] : [];
});

export function openTutorialPanel() {
  isTutorialPanelOpen.value = true;
  persistPanelOpen(true);
}

export function closeTutorialPanel() {
  isTutorialPanelOpen.value = false;
  persistPanelOpen(false);
}

export function toggleTutorialPanel() {
  if (isTutorialPanelOpen.value) {
    closeTutorialPanel();
  } else {
    openTutorialPanel();
  }
}

export function showCurrentTutorialStep() {
  browsedTutorialStepId.value = null;
  openTutorialPanel();
}

export function showTutorialStep(stepId: TutorialStepId | null) {
  browsedTutorialStepId.value = stepId;
  openTutorialPanel();
}

export function showPreviousTutorialStep() {
  const visible = visibleTutorialStep.value;
  if (!visible || visible.index <= 0) {
    return;
  }

  showTutorialStep(tutorialSnapshot.value.steps[visible.index - 1]?.id ?? null);
}

export function showNextTutorialStep() {
  const visible = visibleTutorialStep.value;
  if (!visible || visible.index >= tutorialSnapshot.value.steps.length - 1) {
    return;
  }

  showTutorialStep(tutorialSnapshot.value.steps[visible.index + 1]?.id ?? null);
}

watch(
  () => runSnapshot.value?.seed ?? null,
  () => {
    browsedTutorialStepId.value = null;
    anchoredTutorialMapHint = null;
  },
);
