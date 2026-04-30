import { computed, ref, watch } from 'vue';
import { tiles, worldVersion } from '../core/world.ts';
import type { Hero } from '../core/types/Hero.ts';
import type { TaskType } from '../core/types/Task.ts';
import type { Tile } from '../core/types/Tile.ts';
import { resourceInventory, resourceVersion } from './resourceStore.ts';
import { populationState, populationVersion } from './clientPopulationStore.ts';
import { heroes } from './heroStore.ts';
import { selectedHeroId } from './uiStore.ts';
import { runSnapshot, runVersion } from './runStore.ts';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry.ts';
import { axialDistanceCoords } from '../shared/game/hex.ts';
import { listUndiscoveredFrontierTiles } from '../shared/game/explorationFrontier.ts';
import { getAvailableTasks } from '../shared/tasks/tasks.ts';
import { findNearestTaskAccessTile } from '../shared/tasks/taskAccess.ts';
import {
  evaluateTutorial,
  type TutorialMetrics,
  type TutorialStepId,
} from '../shared/tutorial/tutorialGuide.ts';
import { isPositionControlled } from './settlementSupportStore.ts';

const TUTORIAL_PANEL_STORAGE_KEY = 'driftlands-tutorial-panel-v1';

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

const TUTORIAL_TASK_LABELS: Partial<Record<TaskType, string>> = {
  chopWood: 'Chop wood',
  buildRoad: 'Build road',
  buildHouse: 'Build house',
  buildDock: 'Build dock',
  dig: 'Dig here',
  tillLand: 'Prepare land',
  seedGrain: 'Plant seeds',
  buildWatchtower: 'Build watchtower',
};

function getSelectedTutorialHero() {
  return selectedHeroId.value
    ? heroes.find((hero) => hero.id === selectedHeroId.value) ?? null
    : null;
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

  return {
    selectedHeroCount: selectedHero ? 1 : 0,
    discoveredTiles: tiles.filter((tile) => tile.discovered).length,
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

function findTutorialTaskHint(taskKeys: TaskType[], hero: Hero): TutorialMapHint | null {
  const candidates: Array<{ tile: Tile; taskKey: TaskType; priority: number }> = [];

  for (const tile of tiles) {
    if (!tile.discovered) {
      continue;
    }

    const availableTasks = getAvailableTasks(tile, hero);
    for (const [priority, taskKey] of taskKeys.entries()) {
      if (availableTasks.some((task) => task.key === taskKey)) {
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

function findTutorialHintForStep(stepId: TutorialStepId, hero: Hero): TutorialMapHint | null {
  switch (stepId) {
    case 'scout-frontier':
      return findTutorialScoutHint(hero);
    case 'gather-wood':
      return findTutorialTaskHint(['chopWood'], hero)
        ?? findTutorialScoutHint(hero, 'Find forest');
    case 'lay-road':
      return findTutorialTaskHint(['buildRoad'], hero);
    case 'raise-house':
      return findTutorialTaskHint(['buildHouse'], hero);
    case 'build-dock':
      return findTutorialTaskHint(['buildDock'], hero)
        ?? findTutorialScoutHint(hero, 'Find shore');
    case 'start-farming':
      return findTutorialTaskHint(['seedGrain', 'tillLand', 'dig'], hero);
    case 'secure-perimeter':
      return findTutorialTaskHint(['buildWatchtower'], hero);
    default:
      return null;
  }
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
    return [];
  }

  const hint = findTutorialHintForStep(step.id, hero);
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
  },
);
