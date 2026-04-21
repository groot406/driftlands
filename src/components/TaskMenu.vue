<template>
  <div v-if="tile" class="task-overlay" @pointerdown.stop.prevent @pointerup.stop>
    <!-- Backdrop (click to close) -->
    <div class="task-backdrop" @click.stop="close"></div>

    <div class="task-panel pointer-events-auto">
      <!-- Header -->
      <div class="task-header">
        <div class="task-header-copy">
          <p class="task-kicker pixel-font">{{ constructionTasks.length ? 'Frontier Orders' : 'Field Actions' }}</p>
          <h3 class="task-hero-title">{{ selectedTask?.label ?? 'Choose an order' }}</h3>
        </div>
        <button class="task-close" @click.stop.prevent="close" title="Close">✕</button>
      </div>

      <div v-if="showHeroAbilities" class="task-ability-bar">
        <span class="task-ability-charge">
          {{ selectedHeroForAbilities?.name }} · {{ selectedHeroCharges }}/3
        </span>
        <button
          v-for="ability in heroAbilityOptions"
          :key="ability.key"
          type="button"
          class="task-ability-button"
          :disabled="!canUseHeroAbility(ability.key)"
          :title="heroAbilityTitle(ability)"
          @click.stop.prevent="useHeroAbility(ability.key)"
        >
          <span class="task-ability-code">{{ ability.code }}</span>
          <span class="task-ability-label">{{ ability.label }}</span>
        </button>
      </div>

      <!-- Left / Right split body -->
      <div class="task-body">
        <!-- LEFT: scrollable task list -->
        <div class="task-list-pane">
          <div class="task-list-scroll">
            <!-- Build & Upgrade section -->
            <div v-if="constructionTasks.length" class="task-section">
              <div class="task-section-header">
                <span class="task-section-icon">🏗</span>
                <div class="task-section-row">
                  <div class="task-section-title">Build & Upgrade</div>
                  <div class="task-section-caption">
                    {{ constructionTasks.length }} {{ constructionTasks.length === 1 ? 'option' : 'options' }}
                  </div>
                </div>
              </div>

              <div class="task-list">
                <button
                  v-for="t in constructionTasks"
                  :key="t.key"
                  class="task-list-row"
                  :class="{
                    'task-list-row--selected': selectedTask?.key === t.key,
                    'task-list-row--locked': isTaskLocked(t),
                  }"
                  @click="handleTaskClick(t)"
                  @pointerenter="hoverTask(t)"
                  @pointerleave="unHoverTask(t)"
                >
                  <div class="task-list-row__info">
                    <p class="task-list-row__title">{{ t.label }}</p>
                    <p class="task-list-row__meta">{{ getBuildCategoryLabel(t) }}</p>
                  </div>
                  <span class="task-list-row__state" :class="getBuildStateTone(t)">
                    {{ getBuildStateLabel(t) }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Divider between sections -->
            <div v-if="constructionTasks.length && actionTasks.length" class="task-section-divider">
              <span class="task-section-divider__line"></span>
            </div>

            <!-- Actions section -->
            <div v-if="actionTasks.length" class="task-section">
              <div class="task-section-header">
                <span class="task-section-icon">⚡</span>
                <div class="task-section-row">
                  <div class="task-section-title">Actions</div>
                  <div class="task-section-caption">
                    {{ actionTasks.length }} {{ actionTasks.length === 1 ? 'command' : 'commands' }}
                  </div>
                </div>
              </div>

              <div class="task-list">
                <button
                  v-for="t in actionTasks"
                  :key="t.key"
                  class="task-list-row task-list-row--action"
                  :class="{
                    'task-list-row--selected': selectedTask?.key === t.key,
                    'task-list-row--locked': isTaskLocked(t),
                  }"
                  @click="handleTaskClick(t)"
                  @pointerenter="hoverTask(t)"
                  @pointerleave="unHoverTask(t)"
                >
                  <div class="task-list-row__info">
                    <p class="task-list-row__title">{{ t.label }}</p>
                    <p class="task-list-row__meta">{{ isTaskLocked(t) ? 'Locked action' : 'Available action' }}</p>
                  </div>
                  <span class="task-list-row__state" :class="getBuildStateTone(t)">
                    {{ isTaskLocked(t) ? 'Locked' : 'Ready' }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: scrollable detail pane -->
        <div class="task-detail-pane">
          <div class="task-detail-scroll">
            <template v-if="selectedTask">
              <!-- Detail header -->
              <div class="task-detail-top">
                <div>
                  <span class="task-badge">{{ getBuildCategoryLabel(selectedTask) }}</span>
                  <h4 class="task-detail-title">{{ selectedTask.label }}</h4>
                </div>
                <span class="task-detail-state" :class="getBuildStateTone(selectedTask)">
                  {{ getBuildStateLabel(selectedTask) }}
                </span>
              </div>

              <!-- Building preview image -->
              <section v-if="previewBuildingVisual" class="task-preview-card">
                <div class="task-preview-card__copy">
                  <p class="task-detail-block__label">Building Preview</p>
                  <p class="task-preview-card__hint">Shows the finished look on this tile.</p>
                </div>
                <div class="task-preview-stage">
                  <img
                    v-if="previewBuildingVisual.baseSrc"
                    :src="previewBuildingVisual.baseSrc"
                    :alt="`${selectedTask.label} base`"
                    class="task-preview-stage__layer task-preview-stage__layer--base"
                  >
                  <img
                    v-if="previewBuildingVisual.terrainOverlaySrc"
                    :src="previewBuildingVisual.terrainOverlaySrc"
                    :alt="`${selectedTask.label} terrain overlay`"
                    class="task-preview-stage__layer task-preview-stage__layer--terrain-overlay"
                    :style="previewBuildingVisual.terrainOverlayStyle"
                  >
                  <img
                    v-if="previewBuildingVisual.buildingOverlaySrc"
                    :src="previewBuildingVisual.buildingOverlaySrc"
                    :alt="`${selectedTask.label} building overlay`"
                    class="task-preview-stage__layer task-preview-stage__layer--building-overlay"
                    :style="previewBuildingVisual.buildingOverlayStyle"
                  >
                </div>
              </section>

              <!-- Description (works for both building and action tasks) -->
              <p class="task-detail-copy">{{ getTaskSummary(selectedTask) }}</p>
              <p v-if="getTaskLockHint(selectedTask)" class="task-lock-hint">{{ getTaskLockHint(selectedTask) }}</p>
              <p v-else-if="selectedTaskHint" class="task-lock-hint">{{ selectedTaskHint }}</p>

              <!-- Cost / economy / upgrade blocks (for buildings) -->
              <div v-if="isBuildingTask(selectedTask)" class="task-detail-grid">
                <section class="task-detail-block">
                  <p class="task-detail-block__label">Build Cost</p>
                  <div class="task-costs">
                    <span
                      v-for="resource in getBuildingCosts(selectedTask)"
                      :key="resource.type"
                      class="task-cost-chip"
                      :class="{ 'task-cost-chip-missing': isCostMissing(resource) }"
                    >
                      {{ resourceLabel(resource.type) }} {{ getWarehouseAmount(resource.type) }}/{{ resource.amount }}
                    </span>
                    <span
                      v-if="getPopulationRequirement(selectedTask)"
                      class="task-cost-chip"
                      :class="{ 'task-cost-chip-missing': !isPopulationMet(selectedTask) }"
                    >
                      Population {{ populationState.current }}/{{ getPopulationRequirement(selectedTask) }}
                    </span>
                    <span v-if="!getBuildingCosts(selectedTask).length && !getPopulationRequirement(selectedTask)" class="task-cost-chip">
                      No build cost
                    </span>
                  </div>
                </section>

                <section v-if="getBuildingWorkSummary(selectedTask) || getBuildingEconomyFlow(selectedTask).length" class="task-detail-block">
                  <p class="task-detail-block__label">Job Site</p>
                  <p v-if="getBuildingWorkSummary(selectedTask)" class="task-detail-block__copy">
                    {{ getBuildingWorkSummary(selectedTask) }}
                  </p>
                  <div class="task-flow-list">
                    <div
                      v-for="flow in getBuildingEconomyFlow(selectedTask)"
                      :key="`${selectedTask.key}:${flow.label}`"
                      class="task-flow-row"
                    >
                      <span class="task-flow-row__label">{{ flow.label }}</span>
                      <div class="task-costs">
                        <span v-for="resource in flow.resources" :key="resource.type" class="task-cost-chip">
                          {{ resourceLabel(resource.type) }} {{ resource.amount }}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <section v-if="getUpgradeEffectLabels(selectedTask).length" class="task-detail-block">
                  <p class="task-detail-block__label">Upgrade Effect</p>
                  <ul class="task-effect-list">
                    <li v-for="effect in getUpgradeEffectLabels(selectedTask)" :key="effect">{{ effect }}</li>
                  </ul>
                </section>
              </div>

              <!-- Confirm button inside detail pane -->
              <button
                class="task-confirm-btn"
                :class="{ 'task-confirm-btn--disabled': isTaskLocked(selectedTask) }"
                :disabled="isTaskLocked(selectedTask)"
                @click.stop="confirmTask"
              >
                {{ isTaskLocked(selectedTask) ? 'Locked' : `Send Hero — ${selectedTask.label}` }}
              </button>
            </template>

            <!-- Empty state when nothing selected -->
            <div v-else class="task-detail-empty">
              <div class="task-detail-empty__icon">📋</div>
              <p class="task-detail-empty__title">Select an order</p>
              <p class="task-detail-empty__hint">
                {{ isMobile ? 'Tap' : 'Hover over' }} a task to see its details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Tile } from '../core/types/Tile';
import { requestHeroAbilityUse, requestHeroMovement, startTaskRequest } from '../core/heroService';
import { canStartTaskWhileCarrying, detachHeroFromCurrentTask, taskStore } from '../store/taskStore';
import { PathService } from '../core/PathService';
import { isWindowActive, WINDOW_IDS } from '../core/windowManager';
import { getSelectedHero } from '../store/uiStore';
import type { TaskDefinition } from '../core/types/Task.ts';
import type { ResourceAmount, ResourceType } from '../core/types/Resource.ts';
import {
  getBuildingDefinitionByKey,
  getBuildingDefinitionByTaskKey,
  getBuildingDefinitionForTile,
  resolveBuildingJobResources,
} from '../shared/buildings/registry';
import { getUpgradeDefinitionByTaskKey } from '../shared/buildings/upgrades.ts';
import { TERRAIN_DEFS } from '../core/terrainDefs';
import { resourceInventory } from '../store/resourceStore';
import { populationState } from '../store/clientPopulationStore';
import { currentPlayerId } from '../core/socket';
import { addNotification } from '../store/notificationStore';
import { canControlHero, getHeroOwnerName } from '../store/playerStore';
import { getTaskEconomyDistance } from '../shared/tasks/economy';
import {
  findNearestTaskAccessTile,
  getTaskAccessMode,
} from '../shared/tasks/taskAccess';
import { listTaskDefinitions } from '../shared/tasks/taskRegistry';
import { canStartTaskDefinition } from '../shared/tasks/taskAvailability.ts';
import { getTaskUnlockStatus } from '../shared/tasks/taskUnlocks.ts';
import { isTileWalkable } from '../shared/game/navigation';
import { getStorageCapacity } from '../shared/game/storage.ts';
import { getStoryTaskDescriptor } from '../shared/story/progression';
import { getScoutCancelMovementPathOptions } from '../shared/game/scoutResources';
import { getInventoryEntryDefinition } from '../shared/game/inventoryPresentation.ts';
import { runSnapshot } from '../store/runStore.ts';
import type { HeroAbilityKey } from '../shared/heroes/heroAbilities.ts';

interface Props {
  tile: Tile | null;
  availableTasks: TaskDefinition[];
  containerSize?: { width: number; height: number };
  visible?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'started', type: string, tile: Tile): void;
  (e: 'hover', task: null | TaskDefinition): void;
}>();

const pathService = new PathService();
const hoveredTask = ref<TaskDefinition | null>(null);
const tappedTask = ref<TaskDefinition | null>(null);
const isMobile = ref(false);

const heroAbilityOptions: Array<{ key: HeroAbilityKey; label: string; code: string; title: string }> = [
  { key: 'boostProduction', label: 'Boost', code: '+', title: 'Boost the staffed building on this tile for its next cycle.' },
  { key: 'instantTask', label: 'Rush', code: '>>', title: 'Add a burst of progress to an active task on this tile.' },
  { key: 'stabilizeTile', label: 'Hold', code: '||', title: 'Pause condition decay on this tile for a short time.' },
  { key: 'surveyBoost', label: 'Survey', code: '?', title: 'Complete surveying here immediately.' },
];

function checkMobile() {
  isMobile.value = window.matchMedia('(max-width: 640px)').matches || 'ontouchstart' in window;
}

const resourceLabels: Record<ResourceType, string> = {
  wood: getInventoryEntryDefinition('wood').label,
  ore: getInventoryEntryDefinition('ore').label,
  stone: getInventoryEntryDefinition('stone').label,
  tools: getInventoryEntryDefinition('tools').label,
  food: getInventoryEntryDefinition('food').label,
  crystal: getInventoryEntryDefinition('crystal').label,
  artifact: getInventoryEntryDefinition('artifact').label,
  sand: getInventoryEntryDefinition('sand').label,
  glass: getInventoryEntryDefinition('glass').label,
  water: getInventoryEntryDefinition('water').label,
  grain: getInventoryEntryDefinition('grain').label,
  water_lily: getInventoryEntryDefinition('water_lily').label,
};

const sortedTasks = computed(() => {
  const tile = props.tile;
  const hero = getSelectedHero();

  if (!tile || !hero) {
    return props.availableTasks ?? [];
  }

  const availableByKey = new Map((props.availableTasks ?? []).map((task) => [task.key, task]));
  const tasks = listTaskDefinitions().filter((task) =>
    canStartTaskDefinition(task, tile, hero)
    && canStartTaskWhileCarrying(hero, task, tile),
  ).map((task) => availableByKey.get(task.key) ?? task);

  if (tasks.length > 0 && isTileWalkable(tile) && !tasks.some((task) => task.key === 'walk')) {
    const walkTask = availableByKey.get('walk');
    if (walkTask) {
      tasks.push(walkTask);
    }
  }

  return tasks.sort((a, b) => {
    if (a.key === 'walk') return 1;
    if (b.key === 'walk') return -1;

    const aBuilding = getBuildingMeta(a) ?? getUpgradeMeta(a);
    const bBuilding = getBuildingMeta(b) ?? getUpgradeMeta(b);

    if (aBuilding && bBuilding) {
      return aBuilding.sortOrder - bBuilding.sortOrder || a.label.localeCompare(b.label);
    }

    if (aBuilding) return -1;
    if (bBuilding) return 1;

    return a.label.localeCompare(b.label);
  });
});
const constructionTasks = computed(() => sortedTasks.value.filter((task) => !!getBuildingMeta(task) || !!getUpgradeMeta(task)));
const actionTasks = computed(() => sortedTasks.value.filter((task) => !getBuildingMeta(task) && !getUpgradeMeta(task)));

// The "selected" task is the one shown in the detail pane.
// On desktop: hovering selects; on mobile: tapping selects.
// Nothing is preselected — the detail pane shows the empty state until the user interacts.
const selectedTask = computed(() => {
  if (hoveredTask.value) return hoveredTask.value;
  if (tappedTask.value) return tappedTask.value;
  return null;
});

const selectedTaskHint = computed(() => {
  const task = selectedTask.value;
  const tile = props.tile;
  const hero = getSelectedHero();

  if (!task || !tile) {
    return null;
  }

  const accessMode = getTaskAccessMode(task.key, tile);

  if (accessMode !== 'tile') {
    const accessTile = hero ? findNearestTaskAccessTile(task.key, tile, hero.q, hero.r) : null;
    const isWater = tile.terrain === 'water';
    if (!accessTile) {
      if (accessMode === 'adjacent_walkable') {
        return tile.controlledBySettlementId
          ? 'This water tile needs a neighboring walkable step first. Approach from shore or extend a lily path to reach it.'
          : 'This shoreline is outside live control. Reconnect the border before extending lily paths here.';
      }

      if (tile.controlledBySettlementId) {
        return isWater
          ? 'This shoreline is offline. Restore nearby support or bring an active shore tile next to it first.'
          : 'This mountain approach is offline. Restore nearby support or extend an active road, bridge, or tunnel up to it first.';
      }

      return isWater
        ? 'This shoreline is outside live control. Reconnect the border before issuing shore work here.'
        : 'This mountain pass is outside live control. Reconnect the border before carving farther into the ridge.';
    }

    if (accessMode === 'adjacent_walkable') {
      return 'Water work is done from a neighboring walkable tile, so shore and lily paths can extend step by step over the shallows.';
    }

    if (isWater) {
      return tile.activationState === 'inactive'
        ? 'This shoreline tile is offline, but crews can still work it from adjacent active shore.'
        : 'Shoreline work is done from adjacent active shore rather than standing in the water.';
    }

    return tile.activationState === 'inactive'
      ? 'This mountain tile is offline, but crews can still dig from an adjacent active approach.'
      : 'Tunnel work is done from an adjacent active approach rather than standing inside the cut.';
  }

  if (tile.activationState === 'inactive') {
    return tile.controlledBySettlementId
      ? 'Inactive tiles come back online automatically once support rises again.'
      : 'This tile is outside live control. Reconnect it before working here.';
  }

  return null;
});

const heroMethodsUnlocked = computed(() =>
  runSnapshot.value?.progression.unlockedNodeKeys.includes('hero_methods') ?? false,
);

const selectedHeroForAbilities = computed(() => getSelectedHero());

const selectedHeroCharges = computed(() => {
  const hero = selectedHeroForAbilities.value;
  return Math.max(0, Math.min(3, Math.floor(hero?.abilityCharges ?? 0)));
});

const selectedTileTaskIds = computed(() => {
  const tile = props.tile;
  if (!tile) {
    return [];
  }

  return Object.values(taskStore.tasksByTile[tile.id] ?? {});
});

const selectedTaskInstanceId = computed(() => {
  const tile = props.tile;
  if (!tile) {
    return null;
  }

  const tileTasks = taskStore.tasksByTile[tile.id] ?? {};
  const preferredTaskKey = selectedTask.value?.key;
  if (preferredTaskKey && tileTasks[preferredTaskKey]) {
    return tileTasks[preferredTaskKey]!;
  }

  return selectedTileTaskIds.value[0] ?? null;
});

const showHeroAbilities = computed(() =>
  heroMethodsUnlocked.value
  && !!props.tile
  && !!selectedHeroForAbilities.value,
);

function canUseHeroAbility(ability: HeroAbilityKey) {
  const hero = selectedHeroForAbilities.value;
  const tile = props.tile;
  if (!hero || !tile || selectedHeroCharges.value <= 0 || !canControlHero(hero.id, currentPlayerId.value)) {
    return false;
  }

  switch (ability) {
    case 'boostProduction':
      return !!getBuildingDefinitionForTile(tile)?.jobSlots;
    case 'instantTask':
      return !!selectedTaskInstanceId.value;
    case 'surveyBoost':
      return tile.surveyed !== true;
    case 'stabilizeTile':
      return tile.activationState !== 'inactive';
    default:
      return false;
  }
}

function heroAbilityTitle(ability: { key: HeroAbilityKey; title: string }) {
  const hero = selectedHeroForAbilities.value;
  if (!hero) {
    return 'Select a hero first.';
  }

  if (!canControlHero(hero.id, currentPlayerId.value)) {
    return `${getHeroOwnerName(hero.id) ?? 'Another player'} is controlling ${hero.name}.`;
  }

  if (selectedHeroCharges.value <= 0) {
    return `${hero.name} has no ability charges.`;
  }

  return ability.title;
}

function useHeroAbility(ability: HeroAbilityKey) {
  const hero = selectedHeroForAbilities.value;
  const tile = props.tile;
  if (!hero || !tile || !canUseHeroAbility(ability)) {
    return;
  }

  requestHeroAbilityUse(hero.id, ability, {
    tileId: tile.id,
    taskId: selectedTaskInstanceId.value ?? undefined,
  });
}

interface TaskFlowGroup {
  label: string;
  resources: ResourceAmount[];
}

interface PreviewBuildingVisual {
  baseSrc: string | null;
  terrainOverlaySrc: string | null;
  buildingOverlaySrc: string | null;
  terrainOverlayStyle: { transform: string };
  buildingOverlayStyle: { transform: string };
}

const tileImageModules = import.meta.glob('../assets/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const tileImageSources = Object.fromEntries(
  Object.entries(tileImageModules).map(([path, url]) => {
    const match = path.match(/([^/]+)\.png$/);
    return [match?.[1] ?? path, url];
  }),
) as Record<string, string>;
const previewBuildingVisual = computed<PreviewBuildingVisual | null>(() => {
  const task = selectedTask.value;
  const tile = props.tile;
  if (!task || !tile) {
    return null;
  }

  const previewResult = resolveTaskPreviewResult(task, tile);
  if (!previewResult) {
    return null;
  }

  const terrainDef = TERRAIN_DEFS[previewResult.terrain];
  if (!terrainDef) {
    return null;
  }

  const variantDef = previewResult.variant
    ? terrainDef.variations?.find((variant) => variant.key === previewResult.variant) ?? null
    : null;
  const baseKey = variantDef?.assetKey ?? terrainDef.assetKey ?? previewResult.terrain;
  let terrainOverlayKey = terrainDef.overlayAssetKey ?? null;
  const terrainOverlayOffset = variantDef?.overlayOffset ?? terrainDef.overlayOffset ?? { x: 0, y: 0 };

  if (variantDef?.overlayAssetKey === false) {
    terrainOverlayKey = null;
  } else if (typeof variantDef?.overlayAssetKey === 'string') {
    terrainOverlayKey = variantDef.overlayAssetKey;
  }

  const buildingDefinition = previewResult.variant
    ? getBuildingDefinitionForTile({ variant: previewResult.variant } as Tile)
    : null;

  return {
    baseSrc: getTileImageSource(baseKey),
    terrainOverlaySrc: getTileImageSource(terrainOverlayKey),
    buildingOverlaySrc: getTileImageSource(buildingDefinition?.overlayAssetKey),
    terrainOverlayStyle: createOverlayStyle(terrainOverlayOffset),
    buildingOverlayStyle: createOverlayStyle(buildingDefinition?.overlayOffset ?? { x: 0, y: 0 }),
  };
});

function getBuildingMeta(def: TaskDefinition) {
  return getBuildingDefinitionByTaskKey(def.key);
}

function getUpgradeMeta(def: TaskDefinition) {
  return getUpgradeDefinitionByTaskKey(def.key);
}

function isBuildingTask(def: TaskDefinition) {
  return !!getBuildingMeta(def) || !!getUpgradeMeta(def);
}

function getTileImageSource(key: string | null | undefined) {
  if (!key) {
    return null;
  }

  return tileImageSources[key] ?? null;
}

function createOverlayStyle(offset: { x: number; y: number }) {
  return {
    transform: `translate(${offset.x}px, ${offset.y}px)`,
  };
}

function resolveTaskPreviewResult(def: TaskDefinition, tile: Tile) {
  const building = getBuildingMeta(def);
  if (building) {
    if (building.key === 'townCenter') {
      return { terrain: 'towncenter' as const, variant: null };
    }

    return {
      terrain: tile.terrain,
      variant: resolveBuildingPreviewVariant(building.variantKeys, tile.terrain),
    };
  }

  const upgrade = getUpgradeMeta(def);
  if (!upgrade) {
    return null;
  }

  return {
    terrain: tile.terrain,
    variant: upgrade.resolveToVariant(tile),
  };
}

function resolveBuildingPreviewVariant(variantKeys: string[], terrain: Tile['terrain']) {
  if (!variantKeys.length) {
    return null;
  }

  const preferredPrefix = terrain === 'mountain' ? 'mountains_' : `${terrain}_`;
  const terrainMatch = variantKeys.find((variantKey) => variantKey.startsWith(preferredPrefix));
  if (terrainMatch) {
    return terrainMatch;
  }

  const terrainVariants = new Set((TERRAIN_DEFS[terrain]?.variations ?? []).map((variant) => variant.key));
  const knownVariant = variantKeys.find((variantKey) => terrainVariants.has(variantKey));
  if (knownVariant) {
    return knownVariant;
  }

  return variantKeys[0] ?? null;
}

/** Get a description for any task — building, upgrade, or field action */
function getTaskSummary(def: TaskDefinition) {
  // Building summary
  const building = getBuildingMeta(def);
  if (building) {
    return building.summary;
  }

  // Upgrade summary
  const upgrade = getUpgradeMeta(def);
  if (upgrade) {
    return upgrade.summary;
  }

  // Action task — pull from story progression descriptors
  const descriptor = getStoryTaskDescriptor(def.key);
  if (descriptor?.description) {
    return descriptor.description;
  }

  return 'Send your hero to perform this action on the selected tile.';
}

function getBuildCategoryLabel(def: TaskDefinition) {
  const building = getBuildingMeta(def);
  if (building) {
    return building.categoryLabel;
  }

  if (getUpgradeMeta(def)) {
    return 'Upgrade';
  }

  return 'Action';
}

function getBuildingCosts(def: TaskDefinition): ResourceAmount[] {
  if (!props.tile || (!getBuildingMeta(def) && !getUpgradeMeta(def))) return [];
  return def.requiredResources?.(getTaskEconomyDistance()) ?? [];
}

function getWarehouseAmount(type: ResourceType) {
  return Math.floor(resourceInventory[type] ?? 0);
}

function isCostMissing(resource: ResourceAmount) {
  return getWarehouseAmount(resource.type) < resource.amount;
}

function taskHasMissingCosts(def: TaskDefinition) {
  return getBuildingCosts(def).some(isCostMissing);
}

function getPopulationRequirement(def: TaskDefinition): number | null {
  return getBuildingMeta(def)?.requiredPopulation ?? null;
}

function isPopulationMet(def: TaskDefinition): boolean {
  const req = getPopulationRequirement(def);
  if (req == null) return true;
  return populationState.current >= req;
}

function getBuildStateTone(def: TaskDefinition) {
  if (isTaskLocked(def)) {
    return 'task-state--locked';
  }

  if (!isPopulationMet(def) || taskHasMissingCosts(def)) {
    return 'task-state--blocked';
  }

  return 'task-state--ready';
}

function getBuildStateLabel(def: TaskDefinition) {
  const unlockStatus = getTaskUnlockStatus(def.key);
  if (!unlockStatus.unlocked) {
    return unlockStatus.lockingNode ? `Locked by ${unlockStatus.lockingNode.label}` : 'Locked';
  }

  if (!isPopulationMet(def)) {
    const requirement = getPopulationRequirement(def);
    return requirement ? `Need ${requirement} settlers` : 'Need settlers';
  }

  const costs = getBuildingCosts(def);
  const missing = costs.filter(isCostMissing);

  if (!missing.length) {
    return 'Ready';
  }

  if (missing.length === 1) {
    const [resource] = missing;
    const missingAmount = Math.floor(Math.max(0, resource.amount - getWarehouseAmount(resource.type)));
    return `Need ${missingAmount} ${resourceLabel(resource.type).toLowerCase()}`;
  }

  return `Need ${missing.length} resources`;
}

function isTaskLocked(def: TaskDefinition) {
  return !getTaskUnlockStatus(def.key).unlocked;
}

function getTaskLockHint(def: TaskDefinition) {
  const unlockStatus = getTaskUnlockStatus(def.key);
  if (unlockStatus.unlocked || !unlockStatus.lockingNode) {
    return null;
  }

  const unmetRequirement = unlockStatus.lockingNode.requirements.find((requirement) => !requirement.satisfied);
  if (!unmetRequirement) {
    return `${unlockStatus.lockingNode.label} has not been reached yet.`;
  }

  return `${unlockStatus.lockingNode.label}: ${unmetRequirement.label} (${unmetRequirement.currentLabel}).`;
}

function resourceLabel(type: ResourceType) {
  return resourceLabels[type] ?? type;
}

function formatWorkerCount(count: number, label: string) {
  if (count <= 1) {
    return `1 ${label}`;
  }

  return `${count} ${label}s`;
}

function formatCycleTime(ms: number | null | undefined) {
  if (!ms || ms <= 0) {
    return null;
  }

  if (ms === 60_000) {
    return 'minute';
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  return `${seconds} seconds`;
}

function getBuildingWorkSummary(def: TaskDefinition) {
  const building = getBuildingMeta(def);
  if (building) {
    if (building.key === 'house') {
      return 'Adds 2 beds so the colony can take in more settlers.';
    }

    if (building.providesWarehouse) {
      return `Stores up to ${getStorageCapacity('depot')} resources for builders, haulers, and expansion crews.`;
    }

    if (building.providesWaterSource) {
      return 'Creates an inland water source for nearby farmland and dry dirt plots.';
    }

    if (building.key === 'watchtower') {
      return 'Reveals nearby frontier and helps the colony push construction farther out.';
    }

    if (building.key === 'campfire') {
      return 'Temporarily keeps a pocket of the frontier online while the colony expands.';
    }

    if (building.key === 'townCenter') {
      return 'Creates a new settlement anchor, storage hub, and support base deeper in the frontier.';
    }

    if (building.jobSlots) {
      const workerLabel = formatWorkerCount(building.jobSlots, building.jobLabel ?? 'worker');
      const cycleLabel = formatCycleTime(building.cycleMs);
      return cycleLabel
        ? `Needs ${workerLabel}. Once staffed, it works every ${cycleLabel}.`
        : `Needs ${workerLabel}.`;
    }

    return null;
  }

  const upgrade = getUpgradeMeta(def);
  if (!upgrade) {
    return null;
  }

  const baseBuilding = getBuildingDefinitionByKey(upgrade.baseBuildingKey);
  if (!baseBuilding) {
    return null;
  }

  if (baseBuilding.key === 'house') {
    return 'Turns a starter house into sturdier housing with more room for settlers.';
  }

  if (baseBuilding.providesWarehouse) {
    return `Upgrades a supply depot from ${getStorageCapacity('depot')} to ${getStorageCapacity('warehouse')} storage.`;
  }

  if (baseBuilding.jobSlots) {
    const workerLabel = formatWorkerCount(baseBuilding.jobSlots, baseBuilding.jobLabel ?? 'worker');
    return `Improves an existing ${baseBuilding.label.toLowerCase()} while keeping ${workerLabel} on the same site.`;
  }

  return `Improves an existing ${baseBuilding.label.toLowerCase()}.`;
}

function getBuildingEconomyFlow(def: TaskDefinition): TaskFlowGroup[] {
  const building = getBuildingMeta(def);
  if (!building) {
    const upgrade = getUpgradeMeta(def);
    if (!upgrade) {
      return [];
    }

    const baseBuilding = getBuildingDefinitionByKey(upgrade.baseBuildingKey);
    if (!baseBuilding?.jobSlots) {
      return [];
    }

    const jobResources = resolveBuildingJobResources(baseBuilding, props.tile, Math.max(1, baseBuilding.jobSlots));
    const groups: TaskFlowGroup[] = [];

    if (jobResources.consumes?.length) {
      groups.push({ label: 'Needs Each Cycle', resources: jobResources.consumes });
    }

    if (jobResources.produces?.length) {
      groups.push({ label: 'Produces Each Cycle', resources: jobResources.produces });
    }

    return groups;
  }

  if (!building.jobSlots) {
    return [];
  }

  const jobResources = resolveBuildingJobResources(building, props.tile, Math.max(1, building.jobSlots));
  const groups: TaskFlowGroup[] = [];

  if (jobResources.consumes?.length) {
    groups.push({ label: 'Needs Each Cycle', resources: jobResources.consumes });
  }

  if (jobResources.produces?.length) {
    groups.push({ label: 'Produces Each Cycle', resources: jobResources.produces });
  }

  return groups;
}

function getUpgradeEffectLabels(def: TaskDefinition) {
  const upgrade = getUpgradeMeta(def);
  if (!upgrade) {
    return [];
  }

  return upgrade.effects.map((effect) => {
    switch (effect.kind) {
      case 'house_beds_total':
        return `Raises house capacity to ${effect.value} beds.`;
      case 'storage_kind_override':
        return `Raises storage capacity to ${getStorageCapacity(effect.value)} resources.`;
      case 'job_output_multiplier':
        return `Boosts job-site output by ${Math.round((effect.value - 1) * 100)}%.`;
      default:
        return 'Improves this building.';
    }
  });
}

function close() {
  hoveredTask.value = null;
  tappedTask.value = null;
  emit('close');
}


function handleTaskClick(def: TaskDefinition) {
  if (isMobile.value) {
    // On mobile, first tap selects, second tap on same task confirms
    if (tappedTask.value?.key === def.key) {
      selectTask(def);
    } else {
      tappedTask.value = def;
      hoveredTask.value = null;
      emit('hover', def);
    }
  } else {
    selectTask(def);
  }
}

/** Confirm the currently selected task (used by the confirm button) */
function confirmTask() {
  if (selectedTask.value) {
    selectTask(selectedTask.value);
  }
}

function selectTask(def: TaskDefinition) {
  if (!props.tile) return;
  if (isTaskLocked(def)) return;
  const hero = getSelectedHero();
  if (!hero) return;
  const accessMode = getTaskAccessMode(def.key, props.tile);
  const accessTile = findNearestTaskAccessTile(def.key, props.tile, hero.q, hero.r);
  if (accessMode === 'adjacent_walkable' && !accessTile) {
    addNotification({
      type: 'run_state',
      title: 'No shoreline access',
      message: props.tile.controlledBySettlementId
        ? 'Reach this tile from neighboring shore, bridge, or a lily path first.'
        : 'Reconnect this shoreline before sending crews across the waterline.',
      duration: 3200,
    });
    close();
    return;
  }
  if (accessMode === 'adjacent_active' && !accessTile) {
    const isWater = props.tile.terrain === 'water';
    addNotification({
      type: 'run_state',
      title: props.tile.controlledBySettlementId
        ? (isWater ? 'Shoreline offline' : 'Approach offline')
        : 'Border disconnected',
      message: props.tile.controlledBySettlementId
        ? (isWater
          ? 'Bring support back to an adjacent shore tile, then issue the order again.'
          : 'Bring support back to an adjacent road, bridge, or tunnel approach, then issue the order again.')
        : (isWater
          ? 'Reconnect this shoreline to an active town center or watchtower chain first.'
          : 'Reconnect this mountain approach to an active town center or watchtower chain first.'),
      duration: 3200,
    });
    close();
    return;
  }
  if (!canControlHero(hero.id, currentPlayerId.value)) {
    addNotification({
      type: 'coop_state',
      title: `${hero.name} is occupied`,
      message: `${getHeroOwnerName(hero.id) ?? 'Another player'} has claimed this hero.`,
      duration: 3000,
    });
    close();
    return;
  }

  const movementTaskType = def.key === 'walk' ? undefined : def.key;

  if (accessTile && hero.q === accessTile.q && hero.r === accessTile.r) {
    if (def.key !== 'walk') {
      startTaskRequest(hero.id, def.key, { q: props.tile.q, r: props.tile.r });
      emit('started', def.key, props.tile);
    } else {
      requestHeroMovement(hero.id, [], accessTile);
      emit('started', def.key, props.tile);
    }
  } else {
    const path = accessTile
      ? pathService.findWalkablePath(
        hero.q,
        hero.r,
        accessTile.q,
        accessTile.r,
        getScoutCancelMovementPathOptions(hero, movementTaskType),
      )
      : [];
    if (path.length) {
      detachHeroFromCurrentTask(hero);
      requestHeroMovement(
        hero.id,
        path,
        accessTile ?? props.tile,
        movementTaskType,
        movementTaskType && accessMode !== 'tile' ? props.tile : undefined,
      );
      emit('started', def.key, props.tile);
    }
  }
  close();
}

function hoverTask(t: TaskDefinition) {
  if (!isMobile.value) {
    hoveredTask.value = t;
    emit('hover', t);
  }
}

function unHoverTask(t: TaskDefinition) {
  if (!isMobile.value && hoveredTask.value === t) {
    hoveredTask.value = null;
    emit('hover', null);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isWindowActive(WINDOW_IDS.TASK_MENU)) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

// Reset selection when tile changes
watch(() => props.tile, () => {
  hoveredTask.value = null;
  tappedTask.value = null;
});

let listenerActive = false;

watch(() => props.visible, (isVisible) => {
  if (isVisible && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!isVisible && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
  if (!isVisible) {
    hoveredTask.value = null;
    tappedTask.value = null;
  }
}, { immediate: true });

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);

  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
});
</script>

<style scoped>
/* ── Overlay: covers the game viewport ───────────────── */
.task-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  padding: 0;
  pointer-events: none;
}

/* ── Backdrop: clickable transparent area to close ───── */
.task-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}

/* ── Panel: right-aligned modal with margin ──────────── */
.task-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 50vw;
  max-width: 50vw;
  height: 100%;
  pointer-events: auto;
  border-radius: 0;
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.1), transparent 40%),
    radial-gradient(circle at 86% 18%, rgba(34, 211, 238, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(7, 12, 24, 0.995), rgba(12, 18, 33, 0.99));
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow:
    -20px 0 60px rgba(2, 6, 23, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.02) inset;
  backdrop-filter: none;
}

.task-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 22%),
    linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.1));
  opacity: 0.8;
}

/* ── Header: pinned at top ───────────────────────────── */
.task-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 0;
  flex-shrink: 0;
}

.task-header-copy {
  flex: 1;
}

.task-kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(252, 211, 77, 0.82);
}

.task-hero-title {
  margin: 8px 0 0;
  font-size: clamp(1.1rem, 2vw, 1.4rem);
  font-weight: 700;
  line-height: 1.1;
  color: #f8fafc;
  text-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
}

.task-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
  color: rgba(248, 250, 252, 0.9);
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.task-close:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.32);
  background: rgba(15, 23, 42, 0.62);
}

.task-ability-bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.task-ability-bar::-webkit-scrollbar {
  display: none;
}

.task-ability-charge {
  flex: 0 0 auto;
  min-width: 88px;
  color: rgba(254, 243, 199, 0.9);
  font-size: 11px;
  font-weight: 800;
}

.task-ability-button {
  flex: 0 0 auto;
  min-width: 74px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid rgba(250, 204, 21, 0.24);
  border-radius: 6px;
  background: rgba(76, 46, 12, 0.58);
  color: rgba(255, 251, 235, 0.96);
  transition: background .15s, border-color .15s, transform .15s;
}

.task-ability-button:hover:not(:disabled) {
  border-color: rgba(250, 204, 21, 0.62);
  background: rgba(120, 73, 18, 0.78);
  transform: translateY(-1px);
}

.task-ability-button:disabled {
  opacity: 0.44;
  cursor: not-allowed;
}

.task-ability-code {
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.task-ability-label {
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

/* ── Body: two-column left/right split ───────────────── */
.task-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0; /* allow flex children to shrink & scroll */
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 0;
  padding: 16px 0 0;
}

/* ── Left pane: task list ────────────────────────────── */
.task-list-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid rgba(148, 163, 184, 0.1);
}

.task-list-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 16px 16px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
}

.task-list-scroll::-webkit-scrollbar {
  width: 5px;
}

.task-list-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
}

/* ── Right pane: detail ──────────────────────────────── */
.task-detail-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.task-detail-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 20px 16px 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
}

.task-detail-scroll::-webkit-scrollbar {
  width: 5px;
}

.task-detail-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
}

/* ── Section ─────────────────────────────────────────── */
.task-section {
  position: relative;
  z-index: 1;
  padding: 4px 0;
}

.task-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 2px;
}

.task-section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: rgba(56, 189, 248, 0.1);
  font-size: 13px;
  flex-shrink: 0;
}

.task-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.task-section-title {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.72);
}

.task-section-caption {
  font-size: 11px;
  color: rgba(191, 219, 254, 0.56);
  flex-shrink: 0;
}

/* ── Section divider ─────────────────────────────────── */
.task-section-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
}

.task-section-divider__line {
  display: block;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(148, 163, 184, 0.22) 20%,
    rgba(148, 163, 184, 0.22) 80%,
    transparent
  );
}

/* ── Task list rows ──────────────────────────────────── */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.task-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9));
  text-align: left;
  cursor: pointer;
  transition: transform .12s, border-color .12s, background .12s, box-shadow .12s;
}

.task-list-row:hover,
.task-list-row:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.24);
  box-shadow: 0 6px 14px rgba(2, 6, 23, 0.2);
}

.task-list-row--selected {
  border-color: rgba(250, 204, 21, 0.32) !important;
  background:
    linear-gradient(180deg, rgba(40, 54, 98, 0.82), rgba(15, 23, 42, 0.96)),
    linear-gradient(135deg, rgba(251, 191, 36, 0.1), transparent 64%);
  box-shadow:
    inset 0 0 0 1px rgba(250, 204, 21, 0.08),
    0 8px 18px rgba(2, 6, 23, 0.25);
}

.task-list-row--action {
  background:
    linear-gradient(180deg, rgba(17, 24, 39, 0.76), rgba(15, 23, 42, 0.92)),
    linear-gradient(135deg, rgba(34, 197, 94, 0.06), transparent 64%);
}

.task-list-row--locked {
  opacity: 0.55;
}

.task-list-row__info {
  min-width: 0;
  flex: 1;
}

.task-list-row__title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.15;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-list-row__meta {
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.4;
  color: rgba(191, 219, 254, 0.58);
}

.task-list-row__state,
.task-detail-state {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.72);
  white-space: nowrap;
}

/* ── State tones ─────────────────────────────────────── */
.task-state--ready {
  color: rgba(167, 243, 208, 0.96);
  border-color: rgba(52, 211, 153, 0.22);
  background: rgba(6, 78, 59, 0.34);
}

.task-state--blocked {
  color: rgba(254, 202, 202, 0.96);
  border-color: rgba(248, 113, 113, 0.18);
  background: rgba(127, 29, 29, 0.28);
}

.task-state--locked {
  color: rgba(253, 230, 138, 0.96);
  border-color: rgba(245, 195, 92, 0.2);
  background: rgba(120, 53, 15, 0.28);
}


/* ── Detail header ───────────────────────────────────── */
.task-detail-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.task-detail-title {
  margin: 8px 0 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
  color: #f8fafc;
}

.task-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.14);
  color: rgba(186, 230, 253, 0.96);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ── Description ─────────────────────────────────────── */
.task-detail-copy {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.84);
}

.task-lock-hint {
  font-size: 11px;
  line-height: 1.45;
  color: rgba(253, 230, 138, 0.9);
}

/* ── Building preview card ───────────────────────────── */
.task-preview-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.7)),
    radial-gradient(circle at top, rgba(56, 189, 248, 0.1), transparent 54%);
}

.task-preview-card__copy {
  display: grid;
  gap: 3px;
}

.task-preview-card__hint {
  font-size: 11px;
  line-height: 1.45;
  color: rgba(191, 219, 254, 0.62);
}

.task-preview-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 110px;
  border-radius: 14px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 24%, rgba(34, 197, 94, 0.18), transparent 34%),
    radial-gradient(circle at 50% 78%, rgba(15, 118, 110, 0.2), transparent 38%),
    linear-gradient(180deg, rgba(8, 47, 73, 0.2), rgba(2, 6, 23, 0.48));
}

.task-preview-stage::before {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.18);
  pointer-events: none;
}

.task-preview-stage__layer {
  position: absolute;
  width: 80px;
  height: 80px;
  image-rendering: pixelated;
  object-fit: contain;
}

.task-preview-stage__layer--base {
  filter: drop-shadow(0 10px 18px rgba(2, 6, 23, 0.42));
}

.task-preview-stage__layer--terrain-overlay,
.task-preview-stage__layer--building-overlay {
  filter: drop-shadow(0 10px 18px rgba(2, 6, 23, 0.32));
}

/* ── Detail grid (costs, economy, upgrades) ──────────── */
.task-detail-grid {
  display: grid;
  gap: 10px;
}

.task-detail-block {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.5);
}

.task-detail-block__label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.84);
}

.task-detail-block__copy {
  font-size: 12px;
  line-height: 1.55;
  color: rgba(226, 232, 240, 0.84);
}

.task-costs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.task-cost-chip {
  display: flex;
  align-items: center;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.85);
  color: rgba(226, 232, 240, 0.9);
  font-size: 11px;
}

.task-cost-chip-missing {
  background: rgba(127, 29, 29, 0.4);
  color: rgba(254, 202, 202, 0.94);
}

.task-flow-list {
  display: grid;
  gap: 10px;
}

.task-flow-row {
  display: grid;
  gap: 7px;
}

.task-flow-row__label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(186, 230, 253, 0.88);
}

.task-effect-list {
  display: grid;
  gap: 6px;
  padding-left: 18px;
  color: rgba(226, 232, 240, 0.88);
  font-size: 12px;
  line-height: 1.55;
}

/* ── Confirm button ──────────────────────────────────── */
.task-confirm-btn {
  margin-top: auto;
  width: 100%;
  padding: 12px 16px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(6, 78, 59, 0.5), rgba(6, 78, 59, 0.7));
  color: rgba(167, 243, 208, 0.96);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  cursor: pointer;
  transition: transform .12s, background .12s, border-color .12s, box-shadow .12s;
}

.task-confirm-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(52, 211, 153, 0.44);
  box-shadow: 0 8px 18px rgba(6, 78, 59, 0.3);
}

.task-confirm-btn:active {
  transform: translateY(0);
}

.task-confirm-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.5);
  color: rgba(148, 163, 184, 0.6);
}

.task-confirm-btn--disabled:hover {
  transform: none;
  box-shadow: none;
}

/* ── Empty state ─────────────────────────────────────── */
.task-detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 140px;
  text-align: center;
  gap: 8px;
  opacity: 0.7;
}

.task-detail-empty__icon {
  font-size: 28px;
  margin-bottom: 4px;
}

.task-detail-empty__title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(191, 219, 254, 0.8);
}

.task-detail-empty__hint {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(148, 163, 184, 0.6);
  max-width: 24ch;
}

/* ── Mobile (≤ 640px): bottom sheet ──────────────────── */
@media (max-width: 640px) {
  .task-overlay {
    position: fixed;
    inset: 0;
    padding: 0;
    justify-content: stretch;
    align-items: stretch;
  }

  .task-backdrop {
    background: transparent;
  }

  .task-panel {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .task-header {
    padding: 16px 16px 0;
  }

  .task-body {
    grid-template-columns: 1fr;
    padding: 12px 0 0;
    overflow-y: auto;
    max-height: none;
  }

  .task-list-pane {
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .task-list-scroll {
    padding: 0 16px 12px;
    max-height: 36vh;
  }

  .task-detail-scroll {
    padding: 12px 16px 16px;
  }

  .task-confirm-btn {
    padding: 14px 16px;
    font-size: 14px;
    border-radius: 16px;
  }

  .task-preview-stage {
    min-height: 100px;
  }
}
</style>
