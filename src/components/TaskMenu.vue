<template>
  <div v-if="tile" class="task-overlay" @pointerdown.stop.prevent @pointerup.stop :style="menuStyle">
    <div class="task-container">
      <div ref="panelEl" class="task-panel pointer-events-auto">
        <div class="task-header">
          <div class="task-header-copy">
            <p class="task-kicker pixel-font">{{ constructionTasks.length ? 'Frontier Orders' : 'Field Actions' }}</p>
            <h3 class="task-hero-title">{{ previewTask?.label ?? 'Choose an order' }}</h3>
            <p class="task-header-summary">
              {{
                previewTask
                  ? getConstructionSummary(previewTask)
                  : 'Choose what your hero should do on this tile.'
              }}
            </p>
          </div>
          <button class="task-close" @click.stop.prevent="close" title="Close">
            ✕
          </button>
        </div>

        <div class="task-layout">
          <div class="task-list-pane">
            <div v-if="constructionTasks.length" class="task-section">
              <div class="task-section-row">
                <div class="task-section-title">Build & Upgrade</div>
                <div class="task-section-caption">
                  {{ constructionTasks.length }} {{ constructionTasks.length === 1 ? 'option' : 'options' }}
                </div>
              </div>

              <transition-group name="fade-task" tag="div" class="task-list">
                <button
                  v-for="t in constructionTasks"
                  :key="t.key"
                  class="task-list-row"
                  :class="{ 'task-list-row--active': previewTask?.key === t.key }"
                  @click="selectTask(t)"
                  @mouseover="hoverTask(t)"
                  @mouseleave="unHoverTask(t)"
                  @focus="hoverTask(t)"
                  @blur="unHoverTask(t)"
                >
                  <div class="min-w-0">
                    <p class="task-list-row__title">{{ t.label }}</p>
                    <p class="task-list-row__meta">{{ getBuildCategoryLabel(t) }}</p>
                  </div>
                  <span
                    class="task-list-row__state"
                    :class="getBuildStateTone(t)"
                  >
                    {{ getBuildStateLabel(t) }}
                  </span>
                </button>
              </transition-group>
            </div>

            <div v-if="actionTasks.length" class="task-section">
              <div class="task-section-row">
                <div class="task-section-title">Actions</div>
                <div class="task-section-caption">
                  {{ actionTasks.length }} {{ actionTasks.length === 1 ? 'command' : 'commands' }}
                </div>
              </div>

              <transition-group name="fade-task" tag="div" class="task-list">
                <button
                  v-for="t in actionTasks"
                  :key="t.key"
                  class="task-list-row task-list-row--action"
                  :class="{ 'task-list-row--active': previewTask?.key === t.key }"
                  @click="selectTask(t)"
                  @mouseover="hoverTask(t)"
                  @mouseleave="unHoverTask(t)"
                  @focus="hoverTask(t)"
                  @blur="unHoverTask(t)"
                >
                  <div class="min-w-0">
                    <p class="task-list-row__title">{{ t.label }}</p>
                    <p class="task-list-row__meta">{{ isTaskLocked(t) ? 'Locked action' : 'Available action' }}</p>
                  </div>
                  <span class="task-list-row__state" :class="getBuildStateTone(t)">
                    {{ isTaskLocked(t) ? 'Locked' : 'Ready' }}
                  </span>
                </button>
              </transition-group>
            </div>
          </div>

          <div v-if="previewTask" class="task-detail-pane">
            <div class="task-detail-top">
              <div>
                <span class="task-badge">{{ getBuildCategoryLabel(previewTask) }}</span>
                <h4 class="mt-3 text-lg font-semibold text-white">{{ previewTask.label }}</h4>
              </div>
              <span class="task-detail-state" :class="getBuildStateTone(previewTask)">
                {{ getBuildStateLabel(previewTask) }}
              </span>
            </div>

            <section v-if="previewBuildingVisual" class="task-preview-card">
              <div class="task-preview-card__copy">
                <p class="task-detail-block__label">Building Preview</p>
                <p class="task-preview-card__hint">Shows the finished look on this tile.</p>
              </div>
              <div class="task-preview-stage">
                <img
                  v-if="previewBuildingVisual.baseSrc"
                  :src="previewBuildingVisual.baseSrc"
                  :alt="`${previewTask.label} base`"
                  class="task-preview-stage__layer task-preview-stage__layer--base"
                >
                <img
                  v-if="previewBuildingVisual.terrainOverlaySrc"
                  :src="previewBuildingVisual.terrainOverlaySrc"
                  :alt="`${previewTask.label} terrain overlay`"
                  class="task-preview-stage__layer task-preview-stage__layer--terrain-overlay"
                  :style="previewBuildingVisual.terrainOverlayStyle"
                >
                <img
                  v-if="previewBuildingVisual.buildingOverlaySrc"
                  :src="previewBuildingVisual.buildingOverlaySrc"
                  :alt="`${previewTask.label} building overlay`"
                  class="task-preview-stage__layer task-preview-stage__layer--building-overlay"
                  :style="previewBuildingVisual.buildingOverlayStyle"
                >
              </div>
            </section>

            <p class="task-detail-copy">{{ getConstructionSummary(previewTask) }}</p>
            <p v-if="getTaskLockHint(previewTask)" class="task-lock-hint">{{ getTaskLockHint(previewTask) }}</p>
            <p v-else-if="previewTaskHint" class="task-lock-hint">{{ previewTaskHint }}</p>

            <div class="task-detail-grid">
              <section class="task-detail-block">
                <p class="task-detail-block__label">Build Cost</p>
                <div class="task-costs">
                  <span
                    v-for="resource in getBuildingCosts(previewTask)"
                    :key="resource.type"
                    class="task-cost-chip"
                    :class="{ 'task-cost-chip-missing': isCostMissing(resource) }"
                  >
                    {{ resourceLabel(resource.type) }} {{ getWarehouseAmount(resource.type) }}/{{ resource.amount }}
                  </span>
                  <span
                    v-if="getPopulationRequirement(previewTask)"
                    class="task-cost-chip"
                    :class="{ 'task-cost-chip-missing': !isPopulationMet(previewTask) }"
                  >
                    Population {{ populationState.current }}/{{ getPopulationRequirement(previewTask) }}
                  </span>
                  <span v-if="!getBuildingCosts(previewTask).length && !getPopulationRequirement(previewTask)" class="task-cost-chip">
                    No build cost
                  </span>
                </div>
              </section>

              <section v-if="getBuildingWorkSummary(previewTask) || getBuildingEconomyFlow(previewTask).length" class="task-detail-block">
                <p class="task-detail-block__label">Job Site</p>
                <p v-if="getBuildingWorkSummary(previewTask)" class="task-detail-block__copy">
                  {{ getBuildingWorkSummary(previewTask) }}
                </p>
                <div class="task-flow-list">
                  <div
                    v-for="flow in getBuildingEconomyFlow(previewTask)"
                    :key="`${previewTask.key}:${flow.label}`"
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

              <section v-if="getUpgradeEffectLabels(previewTask).length" class="task-detail-block">
                <p class="task-detail-block__label">Upgrade Effect</p>
                <ul class="task-effect-list">
                  <li v-for="effect in getUpgradeEffectLabels(previewTask)" :key="effect">{{ effect }}</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Tile } from '../core/types/Tile';
import { requestHeroMovement, startTaskRequest } from '../core/heroService';
import { detachHeroFromCurrentTask } from '../store/taskStore';
import { PathService } from '../core/PathService';
import { axialToPixel, camera } from '../core/camera';
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
import { canStartTaskWhileCarrying } from '../store/taskStore.ts';
import { isTileWalkable } from '../shared/game/navigation';
import { getStorageCapacity } from '../shared/game/storage.ts';

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
const panelEl = ref<HTMLElement | null>(null);
const panelSize = ref({ width: 460, height: 0 });

const resourceLabels: Record<ResourceType, string> = {
  wood: 'Wood',
  ore: 'Ore',
  stone: 'Stone',
  food: 'Food',
  crystal: 'Crystal',
  artifact: 'Artifact',
  water: 'Water',
  grain: 'Grain',
  water_lily: 'Water Lilies',
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
const previewTask = computed(() => {
  const hovered = hoveredTask.value;

  if (hovered && constructionTasks.value.some((task) => task.key === hovered.key)) {
    return hovered;
  }

  return constructionTasks.value[0] ?? null;
});
const previewTaskHint = computed(() => {
  const task = previewTask.value;
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
const panelWidth = computed(() => {
  const containerWidth = props.containerSize?.width ?? 0;

  if (containerWidth <= 0) {
    return 720;
  }

  return Math.min(760, Math.max(320, containerWidth - 32));
});
const panelEstimatedHeight = computed(() => {
  const listRows = constructionTasks.value.length + actionTasks.value.length;
  const baseHeight = 188 + Math.max(0, listRows - 1) * 58;
  const detailHeight = previewTask.value ? 260 : 0;
  return Math.max(320, Math.min(720, baseHeight + detailHeight));
});

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
  const task = previewTask.value;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function updatePanelSize() {
  const el = panelEl.value;

  if (!el) {
    return;
  }

  panelSize.value = {
    width: el.offsetWidth || panelWidth.value,
    height: el.offsetHeight || panelEstimatedHeight.value,
  };
}

function getBuildingMeta(def: TaskDefinition) {
  return getBuildingDefinitionByTaskKey(def.key);
}

function getUpgradeMeta(def: TaskDefinition) {
  return getUpgradeDefinitionByTaskKey(def.key);
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

function getConstructionSummary(def: TaskDefinition) {
  const building = getBuildingMeta(def);
  if (building) {
    return building.summary;
  }

  return getUpgradeMeta(def)?.summary ?? 'Choose what your hero should do on this tile.';
}

function getBuildCategoryLabel(def: TaskDefinition) {
  const building = getBuildingMeta(def);
  if (building) {
    return building.categoryLabel;
  }

  return getUpgradeMeta(def) ? 'Upgrade' : 'Construction';
}

function getBuildingCosts(def: TaskDefinition): ResourceAmount[] {
  if (!props.tile || (!getBuildingMeta(def) && !getUpgradeMeta(def))) return [];
  return def.requiredResources?.(getTaskEconomyDistance()) ?? [];
}

function getWarehouseAmount(type: ResourceType) {
  return resourceInventory[type] ?? 0;
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
    const missingAmount = Math.max(0, resource.amount - getWarehouseAmount(resource.type));
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
  emit('close');
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

  if (accessTile && hero.q === accessTile.q && hero.r === accessTile.r) {
    if (def.key !== 'walk') {
      startTaskRequest(hero.id, def.key, { q: props.tile.q, r: props.tile.r });
      emit('started', def.key, props.tile);
    }
  } else {
    const path = accessTile
      ? pathService.findWalkablePath(hero.q, hero.r, accessTile.q, accessTile.r)
      : [];
    if (path.length) {
      detachHeroFromCurrentTask(hero);
      requestHeroMovement(
        hero.id,
        path,
        accessTile ?? props.tile,
        def.key,
        accessMode !== 'tile' ? props.tile : undefined,
      );
      emit('started', def.key, props.tile);
    }
  }
  close();
}

const menuStyle = computed(() => {
  if (!props.tile) return {};
  const camPx = axialToPixel(camera.q, camera.r);
  const tilePx = axialToPixel(props.tile.q, props.tile.r);
  const w = props.containerSize?.width ?? 0;
  const h = props.containerSize?.height ?? 0;
  const menuWidth = panelSize.value.width || panelWidth.value;
  const menuHeight = panelSize.value.height || panelEstimatedHeight.value;
  const cx = w > 0 ? w / 2 : window.innerWidth / 2;
  const cy = h > 0 ? h / 2 : window.innerHeight / 2;
  const tileX = tilePx.x - camPx.x + cx;
  const tileY = tilePx.y - camPx.y + cy;
  const margin = 16;
  const horizontalOffset = 36;
  const verticalOffset = 24;
  const spaceRight = w > 0 ? w - tileX - margin : Number.POSITIVE_INFINITY;
  const spaceLeft = w > 0 ? tileX - margin : Number.POSITIVE_INFINITY;
  const spaceBelow = h > 0 ? h - tileY - margin : Number.POSITIVE_INFINITY;
  const spaceAbove = h > 0 ? tileY - margin : Number.POSITIVE_INFINITY;

  let left = tileX + horizontalOffset;
  let top = tileY + verticalOffset;

  if (w > 0 && spaceRight < menuWidth && spaceLeft > spaceRight) {
    left = tileX - menuWidth - horizontalOffset;
  }

  if (h > 0 && spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    top = tileY - menuHeight - verticalOffset;
  }

  if (w > 0) {
    left = clamp(left, margin, Math.max(margin, w - menuWidth - margin));
  }

  if (h > 0) {
    top = clamp(top, margin, Math.max(margin, h - menuHeight - margin));
  }

  return {
    position: 'absolute',
    left: left + 'px',
    top: top + 'px',
    '--task-panel-width': panelWidth.value + 'px',
  } as const;
});

function hoverTask(t: TaskDefinition) {
  hoveredTask.value = t;
  emit('hover', hoveredTask.value);
}

function unHoverTask(t: TaskDefinition) {
  if (hoveredTask.value === t) {
    hoveredTask.value = null;
    emit('hover', hoveredTask.value);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isWindowActive(WINDOW_IDS.TASK_MENU)) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

let listenerActive = false;
let panelResizeObserver: ResizeObserver | null = null;

watch(() => props.visible, (isVisible) => {
  if (isVisible && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!isVisible && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

watch(
  [
    () => props.visible,
    () => props.tile?.q,
    () => props.tile?.r,
    () => props.containerSize?.width,
    () => props.containerSize?.height,
    panelWidth,
    panelEstimatedHeight,
  ],
  async ([isVisible]) => {
    if (!isVisible) {
      return;
    }

    await nextTick();
    requestAnimationFrame(() => updatePanelSize());
  },
  { immediate: true },
);

watch(panelEl, (el, previousEl) => {
  if (previousEl && panelResizeObserver) {
    panelResizeObserver.unobserve(previousEl);
  }

  if (el && panelResizeObserver) {
    panelResizeObserver.observe(el);
    updatePanelSize();
  }
});

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    panelResizeObserver = new ResizeObserver(() => updatePanelSize());

    if (panelEl.value) {
      panelResizeObserver.observe(panelEl.value);
    }
  }
});

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }

  panelResizeObserver?.disconnect();
  panelResizeObserver = null;
});
</script>

<style scoped>
.task-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 40;
}

.task-container {
  position: relative;
  width: var(--task-panel-width, 460px);
  pointer-events: none;
}

.task-panel {
  position: relative;
  width: 100%;
  padding: 18px;
  border-radius: 28px;
  max-height: min(70vh, calc(100vh - 32px));
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 32%),
    radial-gradient(circle at 86% 18%, rgba(34, 211, 238, 0.16), transparent 26%),
    linear-gradient(180deg, rgba(7, 12, 24, 0.96), rgba(12, 18, 33, 0.92));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow:
    0 30px 60px rgba(2, 6, 23, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  backdrop-filter: blur(24px);
}

.task-panel::-webkit-scrollbar {
  width: 8px;
}

.task-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
}

.task-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 22%),
    linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.14));
  opacity: 0.8;
}

.task-header,
.task-section {
  position: relative;
  z-index: 1;
}

.task-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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
  margin: 10px 0 0;
  font-size: clamp(1.15rem, 2vw, 1.55rem);
  font-weight: 700;
  line-height: 1.05;
  color: #f8fafc;
  text-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
}

.task-header-summary {
  margin: 8px 0 0;
  max-width: 56ch;
  font-size: 12.5px;
  line-height: 1.45;
  color: rgba(226, 232, 240, 0.78);
}

.task-close {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
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

.task-section {
  margin-top: 16px;
}

.task-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
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
}

.task-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
  gap: 16px;
  margin-top: 18px;
}

.task-list-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)),
    linear-gradient(135deg, rgba(56, 189, 248, 0.06), transparent 64%);
  text-align: left;
  transition: transform .15s, border-color .15s, background .15s, box-shadow .15s;
}

.task-list-row:hover,
.task-list-row:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.28);
  box-shadow: 0 14px 24px rgba(2, 6, 23, 0.24);
}

.task-list-row--active {
  border-color: rgba(250, 204, 21, 0.28);
  background:
    linear-gradient(180deg, rgba(40, 54, 98, 0.82), rgba(15, 23, 42, 0.96)),
    linear-gradient(135deg, rgba(251, 191, 36, 0.1), transparent 64%);
  box-shadow:
    inset 0 0 0 1px rgba(250, 204, 21, 0.08),
    0 16px 28px rgba(2, 6, 23, 0.3);
}

.task-list-row--action {
  background:
    linear-gradient(180deg, rgba(17, 24, 39, 0.76), rgba(15, 23, 42, 0.92)),
    linear-gradient(135deg, rgba(34, 197, 94, 0.06), transparent 64%);
}

.task-list-row__title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.15;
  color: #f8fafc;
}

.task-list-row__meta {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(191, 219, 254, 0.62);
}

.task-list-row__state,
.task-detail-state {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.72);
}

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

.task-detail-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid rgba(125, 211, 252, 0.14);
  background:
    linear-gradient(180deg, rgba(11, 18, 32, 0.95), rgba(15, 23, 42, 0.84)),
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 34%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.task-detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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

.task-detail-copy {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.84);
}

.task-preview-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.72)),
    radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 54%);
}

.task-preview-card__copy {
  display: grid;
  gap: 4px;
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
  min-height: 144px;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 24%, rgba(34, 197, 94, 0.18), transparent 34%),
    radial-gradient(circle at 50% 78%, rgba(15, 118, 110, 0.2), transparent 38%),
    linear-gradient(180deg, rgba(8, 47, 73, 0.2), rgba(2, 6, 23, 0.48));
}

.task-preview-stage::before {
  content: '';
  position: absolute;
  inset: 16px;
  border-radius: 18px;
  border: 1px dashed rgba(148, 163, 184, 0.18);
  pointer-events: none;
}

.task-preview-stage__layer {
  position: absolute;
  width: 96px;
  height: 96px;
  image-rendering: pixelated;
  object-fit: contain;
}

.task-preview-stage__layer--base {
  filter: drop-shadow(0 12px 22px rgba(2, 6, 23, 0.42));
}

.task-preview-stage__layer--terrain-overlay,
.task-preview-stage__layer--building-overlay {
  filter: drop-shadow(0 12px 22px rgba(2, 6, 23, 0.32));
}

.task-detail-grid {
  display: grid;
  gap: 12px;
}

.task-detail-block {
  display: grid;
  gap: 8px;
  padding: 12px 13px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.12);
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
  gap: 6px;
}

.task-lock-hint {
  font-size: 11px;
  line-height: 1.45;
  color: rgba(253, 230, 138, 0.9);
}

.task-cost-chip {
  display: flex;
  align-items: center;
  padding: 4px 8px;
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

.fade-task-enter-active,
.fade-task-leave-active {
  transition: opacity .16s ease, transform .16s ease;
}

.fade-task-enter-from,
.fade-task-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 640px) {
  .task-panel {
    padding: 16px;
    border-radius: 24px;
  }

  .task-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .task-header-summary {
    max-width: none;
  }

  .task-detail-pane {
    padding: 14px;
  }
}
</style>
