<template>
  <div v-if="tile" class="task-overlay" @pointerdown.stop.prevent @pointerup.stop>
    <!-- Backdrop (click to close) -->
    <div class="task-backdrop" @click.stop="close"></div>

    <PanelModalShell
      as="div"
      class="task-panel pointer-events-auto"
      close-aria-label="Close build menu"
      :header-label="constructionTasks.length ? 'Frontier Orders' : 'Field Actions'"
      :header-title="panelHeaderTitle"
      header-icon="⚒"
      header-icon-variant="build"
      @close="close"
    >
      <div class="task-body" :class="{ 'task-body--mobile-detail': mobileDetailOpen }">
        <div class="task-list-pane" :class="{ 'task-list-pane--actions-only': !constructionTasks.length }">
          <div class="task-command-strip">
            <div>
              <p class="task-section-title">Command Deck</p>
              <p class="task-command-strip__caption">{{ commandDeckCaption }}</p>
            </div>
            <span class="task-command-strip__pulse">{{ readyTaskCount }} ready</span>
          </div>

          <div v-if="constructionTasks.length" class="task-category-rail" role="tablist" aria-label="Build categories">
            <button
              v-for="tab in buildCategoryTabs"
              :key="tab.key"
              type="button"
              class="task-category-tab"
              :class="{ 'task-category-tab--active': activeBuildCategory === tab.key }"
              :style="getCategoryTabStyle(tab)"
              role="tab"
              :aria-selected="activeBuildCategory === tab.key"
              @click.stop="setActiveBuildCategory(tab.key)"
            >
              <span class="task-category-tab__glyph">{{ tab.glyph }}</span>
              <span class="task-category-tab__label">{{ tab.label }}</span>
              <span class="task-category-tab__count">{{ tab.count }}</span>
            </button>
          </div>

          <div class="task-list-scroll">
            <div v-if="constructionTasks.length" class="task-section">
              <div class="task-section-header">
                <span class="task-section-icon">{{ activeBuildCategoryMeta.glyph }}</span>
                <div class="task-section-row">
                  <div class="task-section-title">{{ activeBuildCategoryMeta.label }}</div>
                  <div class="task-section-caption">
                    {{ visibleConstructionTaskItems.length }} {{ visibleConstructionTaskItems.length === 1 ? 'option' : 'options' }}
                  </div>
                </div>
              </div>

              <Transition name="task-stack" mode="out-in">
                <div :key="activeBuildCategory" class="task-list task-list--construction">
                  <TransitionGroup name="task-row">
                    <button
                      v-for="item in visibleConstructionTaskItems"
                      :key="item.task.key"
                      class="task-list-row"
                      :class="{
                        'task-list-row--selected': isTaskRowSelected(item.task),
                        'task-list-row--locked': item.locked,
                      }"
                      :style="getTaskRowStyle(item.task)"
                      @click="handleTaskClick(item.task)"
                      @pointerenter="hoverTask(item.task)"
                      @pointerleave="unHoverTask(item.task)"
                    >
                      <span class="task-list-row__glyph" :class="{ 'task-list-row__glyph--visual': item.previewVisual }">
                        <template v-if="item.previewVisual">
                          <img
                            v-if="item.previewVisual.baseSrc"
                            :src="item.previewVisual.baseSrc"
                            alt=""
                            class="task-list-row__icon-layer task-list-row__icon-layer--base"
                            aria-hidden="true"
                          >
                          <img
                            v-if="item.previewVisual.terrainOverlaySrc"
                            :src="item.previewVisual.terrainOverlaySrc"
                            alt=""
                            class="task-list-row__icon-layer"
                            :style="item.previewVisual.terrainOverlayStyle"
                            aria-hidden="true"
                          >
                          <img
                            v-if="item.previewVisual.buildingOverlaySrc"
                            :src="item.previewVisual.buildingOverlaySrc"
                            alt=""
                            class="task-list-row__icon-layer"
                            :style="item.previewVisual.buildingOverlayStyle"
                            aria-hidden="true"
                          >
                        </template>
                        <span v-else>{{ getTaskGlyph(item.task) }}</span>
                      </span>
                      <div class="task-list-row__info">
                        <div class="task-list-row__headline">
                          <p class="task-list-row__title">{{ item.task.label }}</p>
                        </div>
                        <p class="task-list-row__meta">{{ getTaskRowMeta(item) }}</p>
                        <div class="task-list-row__chips">
                          <span
                            v-for="chip in getTaskRowChips(item.task)"
                            :key="`${item.task.key}:${chip.label}`"
                            class="task-mini-chip"
                            :class="`task-mini-chip--${chip.tone}`"
                          >
                            {{ chip.label }}
                          </span>
                        </div>
                      </div>
                      <span class="task-list-row__state" :class="item.stateTone">
                        {{ item.stateLabel }}
                      </span>
                    </button>
                  </TransitionGroup>
                </div>
              </Transition>
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

              <TransitionGroup name="task-row" tag="div" class="task-list task-list--actions">
                <button
                  v-for="item in actionTaskItems"
                  :key="item.task.key"
                  class="task-list-row task-list-row--action"
                  :class="{
                    'task-list-row--selected': isTaskRowSelected(item.task),
                    'task-list-row--locked': item.locked,
                  }"
                  :style="getTaskRowStyle(item.task)"
                  @click="handleTaskClick(item.task)"
                  @pointerenter="hoverTask(item.task)"
                  @pointerleave="unHoverTask(item.task)"
                >
                  <span class="task-list-row__glyph" :class="{ 'task-list-row__glyph--visual': item.previewVisual }">
                    <template v-if="item.previewVisual">
                      <img
                        v-if="item.previewVisual.baseSrc"
                        :src="item.previewVisual.baseSrc"
                        alt=""
                        class="task-list-row__icon-layer task-list-row__icon-layer--base"
                        aria-hidden="true"
                      >
                      <img
                        v-if="item.previewVisual.terrainOverlaySrc"
                        :src="item.previewVisual.terrainOverlaySrc"
                        alt=""
                        class="task-list-row__icon-layer"
                        :style="item.previewVisual.terrainOverlayStyle"
                        aria-hidden="true"
                      >
                      <img
                        v-if="item.previewVisual.buildingOverlaySrc"
                        :src="item.previewVisual.buildingOverlaySrc"
                        alt=""
                        class="task-list-row__icon-layer"
                        :style="item.previewVisual.buildingOverlayStyle"
                        aria-hidden="true"
                      >
                    </template>
                    <span v-else>{{ getTaskGlyph(item.task) }}</span>
                  </span>
                  <div class="task-list-row__info">
                    <div class="task-list-row__headline">
                      <p class="task-list-row__title">{{ item.task.label }}</p>
                    </div>
                    <p class="task-list-row__meta">{{ getTaskRowMeta(item) }}</p>
                    <div class="task-list-row__chips">
                      <span
                        v-for="chip in getTaskRowChips(item.task)"
                        :key="`${item.task.key}:${chip.label}`"
                        class="task-mini-chip"
                        :class="`task-mini-chip--${chip.tone}`"
                      >
                        {{ chip.label }}
                      </span>
                    </div>
                  </div>
                  <span class="task-list-row__state" :class="item.stateTone">
                    {{ item.stateLabel }}
                  </span>
                </button>
              </TransitionGroup>
            </div>
          </div>
        </div>

        <div class="task-detail-pane">
          <div class="task-mobile-detail-nav">
            <button type="button" class="task-mobile-back" @click.stop="closeMobileDetail">
              <span aria-hidden="true">‹</span>
              Orders
            </button>
            <span v-if="selectedTaskUi" class="task-mobile-detail-state" :class="selectedTaskUi.stateTone">
              {{ selectedTaskUi.stateLabel }}
            </span>
          </div>
          <div class="task-detail-scroll">
            <Transition name="task-detail-swap" mode="out-in">
              <div v-if="selectedTask" :key="selectedTask.key" class="task-detail-content">
              <!-- Building preview image -->
              <section v-if="previewBuildingVisual" class="task-preview-card">
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
              <section class="task-detail-summary">
                <p class="task-detail-copy">{{ getTaskSummary(selectedTask) }}</p>
                <p v-if="selectedTaskUi?.lockHint" class="task-lock-hint">{{ selectedTaskUi.lockHint }}</p>
                <p v-else-if="selectedTaskHint" class="task-lock-hint">{{ selectedTaskHint }}</p>
              </section>

              <div v-if="!isBuildingTask(selectedTask) && getTaskRequiredResources(selectedTask).length" class="task-detail-grid">
                <section class="task-detail-block">
                  <p class="task-detail-block__label">Cost</p>
                  <div class="task-costs">
                    <span
                      v-for="resource in getTaskRequiredResources(selectedTask)"
                      :key="resource.type"
                      class="task-cost-chip"
                      :class="{ 'task-cost-chip-missing': isCostMissing(resource) }"
                    >
                      {{ resourceLabel(resource.type) }} {{ getRequirementWarehouseAmount(resource.type) }}/{{ resource.amount }}
                    </span>
                  </div>
                </section>
              </div>

              <!-- Cost / economy / upgrade blocks (for buildings) -->
              <div v-if="isBuildingTask(selectedTask)" class="task-detail-grid">
                <section class="task-detail-block">
                  <p class="task-detail-block__label">Cost</p>
                  <div class="task-costs">
                    <span
                      v-for="resource in getBuildingCosts(selectedTask)"
                      :key="resource.type"
                      class="task-cost-chip"
                      :class="{ 'task-cost-chip-missing': isCostMissing(resource) }"
                    >
                      {{ resourceLabel(resource.type) }} {{ getRequirementWarehouseAmount(resource.type) }}/{{ resource.amount }}
                    </span>
                    <span
                      v-if="getPopulationRequirement(selectedTask)"
                      class="task-cost-chip"
                      :class="{ 'task-cost-chip-missing': !isPopulationMet(selectedTask) }"
                    >
                      Population {{ playerPopulation.current }}/{{ getPopulationRequirement(selectedTask) }}
                    </span>
                    <span v-if="!getBuildingCosts(selectedTask).length && !getPopulationRequirement(selectedTask)" class="task-cost-chip">
                      No build cost
                    </span>
                  </div>
                </section>

                <section v-if="getBuildingEconomyFlow(selectedTask).length" class="task-detail-block">
                  <p class="task-detail-block__label">Work</p>
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
                  <p class="task-detail-block__label">Effect</p>
                  <ul class="task-effect-list">
                    <li v-for="effect in getUpgradeEffectLabels(selectedTask)" :key="effect">{{ effect }}</li>
                  </ul>
                </section>
              </div>

              </div>

              <div v-else key="empty" class="task-detail-empty">
                <div class="task-detail-empty__icon">◆</div>
                <p class="task-detail-empty__title">Select an order</p>
                <p class="task-detail-empty__hint">
                  {{ isMobile ? 'Tap' : 'Hover over' }} a task to see its details.
                </p>
              </div>
            </Transition>
          </div>

          <PanelActionButton
            v-if="selectedTask"
            class="task-confirm-btn task-confirm-btn--footer"
            variant="primary"
            size="large"
            full-width
            :disabled="selectedTaskUi?.locked ?? isTaskLocked(selectedTask)"
            @click.stop="confirmTask"
          >
            {{ (selectedTaskUi?.locked ?? isTaskLocked(selectedTask)) ? 'Locked' : `Send Hero — ${selectedTask.label}` }}
          </PanelActionButton>
        </div>
      </div>
    </PanelModalShell>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Tile } from '../core/types/Tile';
import { requestHeroMovement, startTaskRequest } from '../core/heroService';
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
import { getSettlementResourceInventory, resourceInventory, resourceVersion } from '../store/resourceStore';
import { populationState } from '../store/clientPopulationStore';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { getTileSettlementId } from '../shared/game/settlement';
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
import { getResourceRequirementStock } from '../shared/game/resourceDefinitions.ts';
import { getStoryTaskDescriptor } from '../shared/story/progression';
import { getScoutCancelMovementPathOptions } from '../shared/game/scoutResources';
import { getInventoryEntryDefinition } from '../shared/game/inventoryPresentation.ts';
import { runSnapshot } from '../store/runStore.ts';
import PanelModalShell from './ui/PanelModalShell.vue';
import PanelActionButton from './ui/PanelActionButton.vue';

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

const playerPopulation = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId
    ? populationState.settlements.find((settlement) => settlement.settlementId === settlementId) ?? populationState
    : populationState;
});

const playerInventory = computed(() => {
  resourceVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? getSettlementResourceInventory(settlementId) : resourceInventory;
});

const pathService = new PathService();
const hoveredTask = ref<TaskDefinition | null>(null);
const tappedTask = ref<TaskDefinition | null>(null);
const isMobile = ref(false);
const mobileDetailOpen = ref(false);
let hoverFrame = 0;
let pendingHoverTask: TaskDefinition | null = null;
const MOBILE_DOUBLE_TAP_MS = 260;
let pendingMobileDetailTaskKey: string | null = null;
let mobileDetailTimer = 0;

function canManageTile(tile: Tile | null | undefined) {
  const settlementId = currentPlayerSettlementId.value;
  if (!tile || !settlementId) {
    return false;
  }

  if (tile.terrain === 'towncenter') {
    return getTileSettlementId(tile) === settlementId;
  }

  if (tile.ownerSettlementId) {
    return tile.ownerSettlementId === settlementId;
  }

  return tile.controlledBySettlementId === settlementId;
}

function checkMobile() {
  const nextIsMobile = window.matchMedia('(max-width: 640px), (pointer: coarse) and (max-width: 900px)').matches;
  isMobile.value = nextIsMobile;
  if (!nextIsMobile) {
    clearMobileDetailTimer();
    mobileDetailOpen.value = false;
  }
}

const resourceLabels: Record<ResourceType, string> = {
  wood: getInventoryEntryDefinition('wood').label,
  ore: getInventoryEntryDefinition('ore').label,
  stone: getInventoryEntryDefinition('stone').label,
  tools: getInventoryEntryDefinition('tools').label,
  weapons: getInventoryEntryDefinition('weapons').label,
  food: getInventoryEntryDefinition('food').label,
  fish: getInventoryEntryDefinition('fish').label,
  bread: getInventoryEntryDefinition('bread').label,
  meat: getInventoryEntryDefinition('meat').label,
  beer: getInventoryEntryDefinition('beer').label,
  wine: getInventoryEntryDefinition('wine').label,
  sand: getInventoryEntryDefinition('sand').label,
  glass: getInventoryEntryDefinition('glass').label,
  water: getInventoryEntryDefinition('water').label,
  grain: getInventoryEntryDefinition('grain').label,
  hops: getInventoryEntryDefinition('hops').label,
  grapes: getInventoryEntryDefinition('grapes').label,
  water_lily: getInventoryEntryDefinition('water_lily').label,
};

const sortedTasks = computed(() => {
  const tile = props.tile;
  const hero = getSelectedHero();

  if (!tile || !hero) {
    return props.availableTasks ?? [];
  }

  if (!canManageTile(tile)) {
    return [];
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
const activeBuildCategory = ref('suggested');

type TaskTone = 'ready' | 'blocked' | 'locked' | 'neutral';

interface BuildCategoryMeta {
  label: string;
  glyph: string;
  accent: string;
  order: number;
}

interface BuildCategoryTab extends BuildCategoryMeta {
  key: string;
  count: number;
}

interface TaskRowChip {
  label: string;
  tone: TaskTone;
}

const DEFAULT_CATEGORY_META: BuildCategoryMeta = {
  label: 'Other',
  glyph: '◇',
  accent: '#94a3b8',
  order: 90,
};

const BUILD_CATEGORY_META: Record<string, BuildCategoryMeta> = {
  Suggested: { label: 'Suggested', glyph: '✦', accent: '#facc15', order: 0 },
  All: { label: 'All', glyph: '◎', accent: '#93c5fd', order: 1 },
  Settlement: { label: 'Settlement', glyph: '⌂', accent: '#f97316', order: 10 },
  Frontier: { label: 'Frontier', glyph: '⌁', accent: '#22d3ee', order: 11 },
  Logistics: { label: 'Logistics', glyph: '▤', accent: '#60a5fa', order: 20 },
  Harbor: { label: 'Harbor', glyph: '≈', accent: '#38bdf8', order: 21 },
  Utility: { label: 'Utility', glyph: '+', accent: '#2dd4bf', order: 22 },
  Food: { label: 'Food', glyph: '◌', accent: '#84cc16', order: 30 },
  Agriculture: { label: 'Agriculture', glyph: '⋯', accent: '#65a30d', order: 31 },
  Hospitality: { label: 'Hospitality', glyph: '☼', accent: '#fb7185', order: 32 },
  Industry: { label: 'Industry', glyph: '⚙', accent: '#f59e0b', order: 40 },
  Knowledge: { label: 'Knowledge', glyph: '?', accent: '#a78bfa', order: 50 },
  Defense: { label: 'Defense', glyph: '#', accent: '#f87171', order: 60 },
  Military: { label: 'Military', glyph: '▲', accent: '#ef4444', order: 61 },
  Upgrade: { label: 'Upgrade', glyph: '↑', accent: '#c084fc', order: 70 },
  Action: { label: 'Action', glyph: '→', accent: '#34d399', order: 80 },
};

interface TaskListItem {
  task: TaskDefinition;
  categoryLabel: string;
  stateLabel: string;
  stateTone: string;
  locked: boolean;
  lockHint: string | null;
  previewVisual: PreviewBuildingVisual | null;
}

const selectedTask = computed(() => {
  if (hoveredTask.value) return hoveredTask.value;
  if (tappedTask.value) return tappedTask.value;
  return visibleConstructionTaskItems.value[0]?.task ?? actionTaskItems.value[0]?.task ?? null;
});

const panelHeaderTitle = computed(() => {
  if (isMobile.value && !mobileDetailOpen.value) {
    return 'Choose an order';
  }

  return selectedTask.value?.label ?? 'Choose an order';
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
    const accessTile = hero ? findNearestTaskAccessTile(task.key, tile, hero.q, hero.r, hero.settlementId ?? null) : null;
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
  return task ? getTaskPreviewVisual(task) : null;
});

function getTaskPreviewVisual(task: TaskDefinition): PreviewBuildingVisual | null {
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
}

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
  if (!getBuildingMeta(def) && !getUpgradeMeta(def)) return [];
  return getTaskRequiredResources(def);
}

function getTaskRequiredResources(def: TaskDefinition): ResourceAmount[] {
  if (!props.tile) return [];
  return def.requiredResources?.(getTaskEconomyDistance(), props.tile) ?? [];
}

function getRequirementWarehouseAmount(type: ResourceType) {
  return Math.floor(getResourceRequirementStock(playerInventory.value, type));
}

function isCostMissing(resource: ResourceAmount) {
  return getRequirementWarehouseAmount(resource.type) < resource.amount;
}

function taskHasMissingCosts(def: TaskDefinition) {
  return getTaskRequiredResources(def).some(isCostMissing);
}

function getPopulationRequirement(def: TaskDefinition): number | null {
  return getBuildingMeta(def)?.requiredPopulation ?? null;
}

function isPopulationMet(def: TaskDefinition): boolean {
  const req = getPopulationRequirement(def);
  if (req == null) return true;
  return playerPopulation.value.current >= req;
}

function getBuildStateTone(def: TaskDefinition) {
  const unlockStatus = getTaskUnlockStatus(def.key, currentPlayerSettlementId.value);
  if (!unlockStatus.unlocked) {
    return 'task-state--locked';
  }

  if (!isPopulationMet(def) || taskHasMissingCosts(def)) {
    return 'task-state--blocked';
  }

  return 'task-state--ready';
}

function getBuildStateLabel(def: TaskDefinition) {
  const unlockStatus = getTaskUnlockStatus(def.key, currentPlayerSettlementId.value);
  if (!unlockStatus.unlocked) {
    return 'Locked';
  }

  if (!isPopulationMet(def)) {
    const requirement = getPopulationRequirement(def);
    return requirement ? `Need ${requirement} settlers` : 'Need settlers';
  }

  const costs = getTaskRequiredResources(def);
  const missing = costs.filter(isCostMissing);

  if (!missing.length) {
    return 'Ready';
  }

  if (missing.length === 1) {
    const resource = missing[0]!;
    const missingAmount = Math.floor(Math.max(0, resource.amount - getRequirementWarehouseAmount(resource.type)));
    return `Need ${missingAmount} ${resourceLabel(resource.type).toLowerCase()}`;
  }

  return `Need ${missing.length} resources`;
}

function isTaskLocked(def: TaskDefinition) {
  return !getTaskUnlockStatus(def.key, currentPlayerSettlementId.value).unlocked;
}

function getTaskLockHint(def: TaskDefinition) {
  const unlockStatus = getTaskUnlockStatus(def.key, currentPlayerSettlementId.value);
  if (!unlockStatus.lockingNode) {
    return null;
  }

  const unmetRequirement = unlockStatus.lockingNode.requirements.find((requirement) => !requirement.satisfied);
  if (unlockStatus.unlocked) {
    return null;
  }

  if (!unmetRequirement) {
    return `${unlockStatus.lockingNode.label} has not been reached yet.`;
  }

  return `${unlockStatus.lockingNode.label}: ${unmetRequirement.label} (${unmetRequirement.currentLabel}).`;
}

function buildTaskListItem(def: TaskDefinition): TaskListItem {
  const unlockStatus = getTaskUnlockStatus(def.key, currentPlayerSettlementId.value);
  const locked = !unlockStatus.unlocked;
  const categoryLabel = getBuildCategoryLabel(def);
  const populationMet = isPopulationMet(def);
  const missingCosts = taskHasMissingCosts(def);

  let stateLabel = 'Ready';
  if (locked) {
    stateLabel = 'Locked';
  } else if (!populationMet) {
    const requirement = getPopulationRequirement(def);
    stateLabel = requirement ? `Need ${requirement} settlers` : 'Need settlers';
  } else {
    const costs = getTaskRequiredResources(def);
    const missing = costs.filter(isCostMissing);
    if (missing.length === 1) {
      const resource = missing[0]!;
      const missingAmount = Math.floor(Math.max(0, resource.amount - getRequirementWarehouseAmount(resource.type)));
      stateLabel = `Need ${missingAmount} ${resourceLabel(resource.type).toLowerCase()}`;
    } else if (missing.length > 1) {
      stateLabel = `Need ${missing.length} resources`;
    }
  }

  let lockHint: string | null = null;
  if (locked && unlockStatus.lockingNode) {
    const unmetRequirement = unlockStatus.lockingNode.requirements.find((requirement) => !requirement.satisfied);
    lockHint = unmetRequirement
      ? `${unlockStatus.lockingNode.label}: ${unmetRequirement.label} (${unmetRequirement.currentLabel}).`
      : `${unlockStatus.lockingNode.label} has not been reached yet.`;
  }

  return {
    task: def,
    categoryLabel,
    stateLabel,
    stateTone: locked
      ? 'task-state--locked'
      : (!populationMet || missingCosts ? 'task-state--blocked' : 'task-state--ready'),
    locked,
    lockHint,
    previewVisual: getTaskPreviewVisual(def),
  };
}

const taskListItems = computed(() => sortedTasks.value.map(buildTaskListItem));
const constructionTaskItems = computed(() => taskListItems.value.filter((item) => !!getBuildingMeta(item.task) || !!getUpgradeMeta(item.task)));
const actionTaskItems = computed(() => taskListItems.value.filter((item) => !getBuildingMeta(item.task) && !getUpgradeMeta(item.task)));
const readyTaskCount = computed(() => taskListItems.value.filter((item) => !item.locked && item.stateTone === 'task-state--ready').length);
const commandDeckCaption = computed(() => {
  if (constructionTaskItems.value.length && actionTaskItems.value.length) {
    return `${constructionTaskItems.value.length} builds · ${actionTaskItems.value.length} actions`;
  }

  if (constructionTaskItems.value.length) {
    return `${constructionTaskItems.value.length} build options`;
  }

  return `${actionTaskItems.value.length} field actions`;
});
const suggestedConstructionTaskItems = computed(() => {
  const available = constructionTaskItems.value.filter((item) => !item.locked);
  const pool = available.length ? available : constructionTaskItems.value;
  return [...pool]
    .sort((a, b) => getSuggestedTaskScore(b) - getSuggestedTaskScore(a) || getTaskSortOrder(a.task) - getTaskSortOrder(b.task))
    .slice(0, 6);
});
const buildCategoryTabs = computed<BuildCategoryTab[]>(() => {
  if (!constructionTaskItems.value.length) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const item of constructionTaskItems.value) {
    counts.set(item.categoryLabel, (counts.get(item.categoryLabel) ?? 0) + 1);
  }

  const categoryTabs = [...counts.entries()]
    .map(([category, count]) => ({
      key: category,
      count,
      ...getCategoryMeta(category),
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  return [
    {
      key: 'suggested',
      count: suggestedConstructionTaskItems.value.length,
      ...getCategoryMeta('Suggested'),
    },
    {
      key: 'all',
      count: constructionTaskItems.value.length,
      ...getCategoryMeta('All'),
    },
    ...categoryTabs,
  ].filter((tab) => tab.count > 0);
});
const visibleConstructionTaskItems = computed(() => {
  if (activeBuildCategory.value === 'suggested') {
    return suggestedConstructionTaskItems.value;
  }

  if (activeBuildCategory.value === 'all') {
    return constructionTaskItems.value;
  }

  return constructionTaskItems.value.filter((item) => item.categoryLabel === activeBuildCategory.value);
});
const activeBuildCategoryMeta = computed(() => {
  const tab = buildCategoryTabs.value.find((entry) => entry.key === activeBuildCategory.value);
  return tab ?? getCategoryMeta('Suggested');
});
const selectedTaskUi = computed(() => {
  const task = selectedTask.value;
  if (!task) {
    return null;
  }

  return taskListItems.value.find((item) => item.task.key === task.key) ?? buildTaskListItem(task);
});

function resourceLabel(type: ResourceType) {
  return resourceLabels[type] ?? type;
}

function getCategoryMeta(category: string): BuildCategoryMeta {
  const meta = BUILD_CATEGORY_META[category];
  if (meta) {
    return meta;
  }

  return {
    ...DEFAULT_CATEGORY_META,
    label: category,
    glyph: category.slice(0, 1).toUpperCase(),
  };
}

function getCategoryTabStyle(tab: BuildCategoryTab) {
  return {
    '--task-accent': tab.accent,
  };
}

function setActiveBuildCategory(category: string) {
  if (activeBuildCategory.value === category) {
    return;
  }

  activeBuildCategory.value = category;
  clearMobileDetailTimer();
  hoveredTask.value = null;
  tappedTask.value = null;
  emit('hover', null);
}

function getTaskSortOrder(def: TaskDefinition) {
  return getBuildingMeta(def)?.sortOrder ?? getUpgradeMeta(def)?.sortOrder ?? 999;
}

function getSuggestedTaskScore(item: TaskListItem) {
  let score = 0;

  if (item.locked) {
    score -= 100;
  } else if (item.stateTone === 'task-state--ready') {
    score += 120;
  } else {
    score += 42;
  }

  const unlockStatus = getTaskUnlockStatus(item.task.key, currentPlayerSettlementId.value);
  if (unlockStatus.recommended) {
    score += 18;
  }

  switch (item.categoryLabel) {
    case 'Settlement':
      score += 18;
      break;
    case 'Frontier':
      score += 16;
      break;
    case 'Logistics':
      score += 14;
      break;
    case 'Food':
    case 'Agriculture':
      score += 12;
      break;
    case 'Upgrade':
      score += 10;
      break;
    default:
      score += 4;
  }

  return score - (getTaskSortOrder(item.task) / 100);
}

function getTaskAccent(def: TaskDefinition) {
  return getCategoryMeta(getBuildCategoryLabel(def)).accent;
}

function getTaskRowStyle(def: TaskDefinition) {
  return {
    '--task-accent': getTaskAccent(def),
  };
}

function isTaskRowSelected(def: TaskDefinition) {
  if (selectedTask.value?.key !== def.key) {
    return false;
  }

  return !isMobile.value || mobileDetailOpen.value || tappedTask.value?.key === def.key;
}

function getTaskGlyph(def: TaskDefinition) {
  const building = getBuildingMeta(def);
  if (building?.key === 'house') return '⌂';
  if (building?.key === 'townCenter') return '◎';
  if (building?.key === 'dock') return '≈';
  if (building?.key === 'well') return '+';
  if (building?.key === 'watchtower') return '▲';
  if (building?.key === 'wall') return '#';
  if (building?.providesWarehouse) return '▤';
  if (building?.jobSlots) return getCategoryMeta(building.categoryLabel).glyph;
  if (getUpgradeMeta(def)) return '↑';

  return getCategoryMeta(getBuildCategoryLabel(def)).glyph;
}

function getTaskRowMeta(item: TaskListItem) {
  if (item.locked) {
    return item.lockHint ?? 'Unlock this through frontier progress.';
  }

  const outcome = getTaskOutcomeLabel(item.task);
  if (outcome) {
    return outcome;
  }

  return getTaskSummary(item.task);
}

function getTaskOutcomeLabel(def: TaskDefinition) {
  const building = getBuildingMeta(def);
  if (building) {
    if (building.key === 'house') {
      return 'Raises population capacity by 2 beds.';
    }

    if (building.providesWarehouse) {
      return `Adds ${building.storageKind ? 'dedicated' : 'frontier'} storage for nearby work.`;
    }

    if (building.providesWaterSource) {
      return 'Hydrates nearby farmland and supports dry plots.';
    }

    const flow = getBuildingEconomyFlow(def).find((group) => group.label.includes('Produces'));
    if (flow?.resources.length) {
      return `Produces ${flow.resources.map(formatResourceAmount).join(', ')} each cycle.`;
    }
  }

  const upgrade = getUpgradeMeta(def);
  if (upgrade) {
    const baseBuilding = getBuildingDefinitionByKey(upgrade.baseBuildingKey);
    return baseBuilding
      ? `Improves this ${baseBuilding.label.toLowerCase()} without moving the site.`
      : upgrade.summary;
  }

  return null;
}

function formatResourceAmount(resource: ResourceAmount) {
  return `${resourceLabel(resource.type)} ${resource.amount}`;
}

function getTaskRowChips(def: TaskDefinition): TaskRowChip[] {
  if (isTaskLocked(def)) {
    return [];
  }

  const chips: TaskRowChip[] = [];

  const populationRequirement = getPopulationRequirement(def);
  if (populationRequirement) {
    chips.push({
      label: `Pop ${playerPopulation.value.current}/${populationRequirement}`,
      tone: isPopulationMet(def) ? 'ready' : 'blocked',
    });
  }

  for (const resource of getTaskRequiredResources(def)) {
    chips.push({
      label: `${resourceLabel(resource.type)} ${getRequirementWarehouseAmount(resource.type)}/${resource.amount}`,
      tone: isCostMissing(resource) ? 'blocked' : 'ready',
    });
  }

  return chips.slice(0, 2);
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
      case 'house_goods_capacity':
        return `Raises home-goods storage to ${effect.value} item${effect.value === 1 ? '' : 's'}.`;
      case 'house_comfort_happiness':
        return `Adds +${effect.value} home comfort when residents recover happiness.`;
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
  clearMobileDetailTimer();
  hoveredTask.value = null;
  tappedTask.value = null;
  mobileDetailOpen.value = false;
  emit('close');
}

function closeMobileDetail() {
  clearMobileDetailTimer();
  mobileDetailOpen.value = false;
}

function clearMobileDetailTimer() {
  if (mobileDetailTimer) {
    window.clearTimeout(mobileDetailTimer);
    mobileDetailTimer = 0;
  }
  pendingMobileDetailTaskKey = null;
}

function scheduleMobileDetail(def: TaskDefinition) {
  clearMobileDetailTimer();
  pendingMobileDetailTaskKey = def.key;
  mobileDetailTimer = window.setTimeout(() => {
    mobileDetailTimer = 0;
    if (pendingMobileDetailTaskKey === def.key && tappedTask.value?.key === def.key) {
      mobileDetailOpen.value = true;
    }
    pendingMobileDetailTaskKey = null;
  }, MOBILE_DOUBLE_TAP_MS);
}

function handleTaskClick(def: TaskDefinition) {
  if (isMobile.value) {
    if (pendingMobileDetailTaskKey === def.key && !isTaskLocked(def)) {
      clearMobileDetailTimer();
      tappedTask.value = def;
      hoveredTask.value = null;
      emit('hover', def);
      selectTask(def);
      return;
    }

    tappedTask.value = def;
    hoveredTask.value = null;
    emit('hover', def);

    if (isTaskLocked(def)) {
      clearMobileDetailTimer();
      mobileDetailOpen.value = true;
      return;
    }

    mobileDetailOpen.value = false;
    scheduleMobileDetail(def);
    return;
  }

  tappedTask.value = def;
  emit('hover', def);

  if (isTaskLocked(def)) {
    hoveredTask.value = def;
    return;
  }

  hoveredTask.value = def;

  selectTask(def);
}

/** Confirm the currently selected task (used by the confirm button) */
function confirmTask() {
  if (selectedTask.value) {
    selectTask(selectedTask.value);
  }
}

function selectTask(def: TaskDefinition) {
  if (!props.tile) return;
  if (!canManageTile(props.tile)) {
    addNotification({
      type: 'settlement',
      title: 'Foreign tile',
      message: 'You can inspect another settlement, but only its owner can issue orders there.',
      duration: 2800,
    });
    close();
    return;
  }

  if (isTaskLocked(def)) return;
  const hero = getSelectedHero();
  if (!hero) return;
  const accessMode = getTaskAccessMode(def.key, props.tile);
  const accessTile = findNearestTaskAccessTile(def.key, props.tile, hero.q, hero.r, hero.settlementId ?? null);
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
    pendingHoverTask = t;
    if (hoverFrame) {
      return;
    }
    hoverFrame = window.requestAnimationFrame(() => {
      hoverFrame = 0;
      if (hoveredTask.value?.key === pendingHoverTask?.key) {
        return;
      }
      hoveredTask.value = pendingHoverTask;
      emit('hover', pendingHoverTask);
    });
  }
}

function unHoverTask(t: TaskDefinition) {
  if (!isMobile.value && hoveredTask.value === t) {
    emit('hover', t);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isWindowActive(WINDOW_IDS.TASK_MENU)) {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile.value && mobileDetailOpen.value) {
      closeMobileDetail();
      return;
    }
    close();
  }
}

// Reset selection when tile changes
watch(() => props.tile, () => {
  clearMobileDetailTimer();
  hoveredTask.value = null;
  tappedTask.value = null;
  mobileDetailOpen.value = false;
  activeBuildCategory.value = 'suggested';
});

watch(() => buildCategoryTabs.value.map((tab) => tab.key).join('|'), () => {
  if (buildCategoryTabs.value.length && !buildCategoryTabs.value.some((tab) => tab.key === activeBuildCategory.value)) {
    activeBuildCategory.value = 'suggested';
  }
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
    clearMobileDetailTimer();
    hoveredTask.value = null;
    tappedTask.value = null;
    mobileDetailOpen.value = false;
  }
}, { immediate: true });

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
  if (hoverFrame) {
    window.cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
  }
  clearMobileDetailTimer();

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
  justify-content: center;
  align-items: center;
  padding: clamp(16px, 3vw, 38px);
  pointer-events: none;
  perspective: 1400px;
}

/* ── Backdrop: clickable transparent area to close ───── */
.task-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  background:
    radial-gradient(circle at 50% 52%, rgba(6, 78, 59, 0.03), rgba(2, 6, 23, 0.08) 68%, rgba(2, 6, 23, 0.16)),
    linear-gradient(180deg, rgba(2, 6, 23, 0.01), rgba(2, 6, 23, 0.08));
}

/* ── Panel: floating in-game command board ───────────── */
.task-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(980px, calc(100vw - 48px));
  max-width: 980px;
  height: min(720px, calc(100vh - 72px));
  max-height: 720px;
  pointer-events: auto;
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(94, 234, 212, 0.5) 0 30px, transparent 30px calc(100% - 30px), rgba(74, 222, 128, 0.42) calc(100% - 30px)) top / 100% 1px no-repeat,
    linear-gradient(90deg, rgba(74, 222, 128, 0.28) 0 26px, transparent 26px calc(100% - 26px), rgba(94, 234, 212, 0.24) calc(100% - 26px)) bottom / 100% 1px no-repeat,
    linear-gradient(180deg, rgba(94, 234, 212, 0.32) 0 26px, transparent 26px calc(100% - 26px), rgba(74, 222, 128, 0.26) calc(100% - 26px)) left / 1px 100% no-repeat,
    linear-gradient(180deg, rgba(74, 222, 128, 0.32) 0 26px, transparent 26px calc(100% - 26px), rgba(94, 234, 212, 0.24) calc(100% - 26px)) right / 1px 100% no-repeat,
    radial-gradient(circle at 18% 0%, rgba(20, 184, 166, 0.15), transparent 36%),
    radial-gradient(circle at 86% 10%, rgba(74, 222, 128, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(5, 26, 31, 0.58), rgba(3, 18, 24, 0.5));
  border: 0;
  box-shadow:
    0 58px 140px rgba(0, 0, 0, 0.7),
    0 22px 54px rgba(2, 6, 23, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.018) inset,
    0 0 44px rgba(16, 185, 129, 0.08);
  backdrop-filter: blur(16px) saturate(1.12) brightness(1.05);
  -webkit-backdrop-filter: blur(16px) saturate(1.12) brightness(1.05);
  transform-origin: center 58%;
  animation: task-panel-enter .42s cubic-bezier(.16, .86, .23, 1);
}

.task-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    repeating-linear-gradient(90deg, rgba(94, 234, 212, 0.026) 0 1px, transparent 1px 24px),
    repeating-linear-gradient(180deg, rgba(74, 222, 128, 0.02) 0 1px, transparent 1px 24px),
    linear-gradient(135deg, rgba(45, 212, 191, 0.08), transparent 20%, transparent 78%, rgba(74, 222, 128, 0.07)),
    linear-gradient(180deg, rgba(15, 23, 42, 0.035), rgba(2, 6, 23, 0.07));
  opacity: 0.98;
  box-shadow:
    inset 0 0 0 1px rgba(94, 234, 212, 0.1),
    inset 0 0 30px rgba(15, 23, 42, 0.72);
}

.task-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 0%, transparent 36%, rgba(255, 255, 255, 0.075) 48%, transparent 60%, transparent 100%);
  transform: translateX(-130%);
  animation: task-panel-sheen 8s ease-in-out 1.1s infinite;
  opacity: 0.65;
}

@keyframes task-panel-enter {
  from {
    opacity: 0;
    transform: translateY(24px) rotateX(4deg) scale(0.94);
    filter: saturate(0.72) blur(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0) rotateX(0deg) scale(1);
    filter: saturate(1) blur(0);
  }
}

@keyframes task-panel-sheen {
  0%,
  54% {
    transform: translateX(-130%);
  }

  74%,
  100% {
    transform: translateX(130%);
  }
}

/* ── Header: pinned at top ───────────────────────────── */
.task-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 0;
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
  color: rgba(167, 243, 208, 0.86);
}

.task-hero-title {
  margin: 8px 0 0;
  font-size: clamp(1.1rem, 2vw, 1.4rem);
  font-weight: 700;
  line-height: 1.1;
  color: #f8fafc;
  text-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
}

/* ── Body: two-column left/right split ───────────────── */
.task-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0; /* allow flex children to shrink & scroll */
  display: grid;
  grid-template-columns: minmax(0, 1.28fr) minmax(280px, 0.82fr);
  gap: 12px;
  padding: 16px 26px 26px;
}

/* ── Left pane: task list ────────────────────────────── */
.task-list-pane {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  column-gap: 14px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(94, 234, 212, 0.11);
  border-radius: 6px;
  padding: 12px 14px 12px 12px;
  background:
    linear-gradient(90deg, rgba(45, 212, 191, 0.16), transparent 18px) left / 2px 100% no-repeat,
    radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.1), transparent 34%),
    linear-gradient(180deg, rgba(6, 30, 34, 0.32), rgba(4, 20, 25, 0.36));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.016),
    inset 0 0 22px rgba(2, 6, 23, 0.38);
  backdrop-filter: blur(8px) saturate(1.08);
  -webkit-backdrop-filter: blur(8px) saturate(1.08);
}

.task-list-pane--actions-only {
  grid-template-columns: minmax(0, 1fr);
}

.task-list-pane--actions-only .task-list-scroll {
  grid-column: 1;
}

.task-command-strip {
  position: relative;
  z-index: 1;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(94, 234, 212, 0.1);
}

.task-command-strip__caption {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(209, 250, 229, 0.62);
}

.task-command-strip__pulse {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 3px 9px;
  border: 1px solid rgba(52, 211, 153, 0.24);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(6, 78, 59, 0.42), rgba(4, 47, 46, 0.5));
  color: rgba(167, 243, 208, 0.96);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: task-ready-pulse 2.8s ease-in-out infinite;
}

.task-category-rail {
  position: relative;
  z-index: 1;
  grid-column: 1;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  padding: 1px 8px 1px 2px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.22) transparent;
}

.task-category-rail::-webkit-scrollbar {
  width: 4px;
}

.task-category-rail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
}

.task-category-tab {
  --task-accent: #93c5fd;
  position: relative;
  flex: 0 0 auto;
  display: inline-grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  width: calc(100% - 2px);
  min-height: 38px;
  padding: 6px 8px 6px 7px;
  border: 1px solid rgba(94, 234, 212, 0.1);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(8, 47, 48, 0.32), rgba(5, 18, 28, 0.52)),
    linear-gradient(90deg, color-mix(in srgb, var(--task-accent) 18%, transparent), transparent 62%);
  color: rgba(226, 232, 240, 0.9);
  cursor: pointer;
  overflow: hidden;
  clip-path: polygon(0 0, calc(100% - 12px) 0, calc(100% - 3px) 50%, calc(100% - 12px) 100%, 0 100%);
  transition: transform .16s ease, border-color .16s ease, background .16s ease, color .16s ease;
}

.task-category-tab::after {
  content: '';
  position: absolute;
  inset: 7px auto 7px 4px;
  width: 2px;
  border-radius: 999px;
  background: var(--task-accent);
  opacity: 0;
  transform: scaleY(0.24);
  transition: opacity .16s ease, transform .16s ease;
}

.task-category-tab:hover,
.task-category-tab:focus-visible {
  transform: translateX(1px);
  border-color: color-mix(in srgb, var(--task-accent) 36%, rgba(74, 222, 128, 0.18));
  color: #fff;
}

.task-category-tab--active {
  border-color: color-mix(in srgb, var(--task-accent) 48%, rgba(74, 222, 128, 0.16));
  background:
    linear-gradient(180deg, rgba(13, 148, 136, 0.38), rgba(6, 26, 35, 0.58)),
    linear-gradient(90deg, color-mix(in srgb, var(--task-accent) 26%, transparent), transparent 72%);
  box-shadow:
    0 8px 18px rgba(2, 6, 23, 0.26),
    inset 0 0 0 1px rgba(255, 255, 255, 0.024);
}

.task-category-tab--active::after {
  opacity: 0.9;
  transform: scaleY(1);
}

.task-category-tab__glyph {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--task-accent) 20%, rgba(15, 23, 42, 0.7)), rgba(6, 10, 22, 0.74));
  color: color-mix(in srgb, var(--task-accent) 82%, white);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.task-category-tab__label {
  min-width: 0;
  max-width: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 800;
}

.task-category-tab__count {
  min-width: 19px;
  height: 19px;
  display: inline-grid;
  place-items: center;
  border-radius: 4px;
  background: rgba(2, 6, 23, 0.58);
  color: rgba(226, 232, 240, 0.78);
  font-size: 10px;
  font-weight: 800;
}

@keyframes task-ready-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
  }

  42% {
    box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.08);
  }
}

.task-list-scroll {
  grid-column: 2;
  grid-row: 2;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 4px 0 0;
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
  padding: 12px;
  border: 1px solid rgba(94, 234, 212, 0.1);
  border-radius: 6px;
  background:
    linear-gradient(90deg, transparent, rgba(94, 234, 212, 0.08) 50%, transparent) top / 100% 1px no-repeat,
    radial-gradient(circle at 50% 12%, rgba(34, 197, 94, 0.09), transparent 40%),
    linear-gradient(180deg, rgba(4, 22, 28, 0.32), rgba(3, 14, 20, 0.38));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.016),
    inset 0 0 24px rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(8px) saturate(1.08);
  -webkit-backdrop-filter: blur(8px) saturate(1.08);
}

.task-mobile-detail-nav {
  display: none;
}

.task-detail-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 4px 0 0;
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

.task-detail-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
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
  background: rgba(34, 197, 94, 0.1);
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
  color: rgba(209, 250, 229, 0.7);
}

.task-section-caption {
  font-size: 11px;
  color: rgba(187, 247, 208, 0.5);
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

.task-list--construction,
.task-list--actions {
  position: relative;
}

.task-list-row {
  --task-accent: #38bdf8;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  width: 100%;
  min-height: 72px;
  padding: 9px 10px;
  border-radius: 4px;
  border: 1px solid rgba(94, 234, 212, 0.08);
  background:
    linear-gradient(180deg, rgba(7, 36, 39, 0.3), rgba(7, 18, 28, 0.52)),
    linear-gradient(90deg, color-mix(in srgb, var(--task-accent) 14%, transparent), transparent 58%);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: transform .15s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease;
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--task-accent) 68%, transparent);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}

.task-list-row::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 0%, rgba(255, 255, 255, 0.08) 42%, transparent 58%);
  opacity: 0;
  transform: translateX(-60%);
  transition: opacity .15s ease, transform .36s ease;
  pointer-events: none;
}

.task-list-row:hover,
.task-list-row:focus-visible {
  transform: translateX(3px) translateY(-1px);
  border-color: color-mix(in srgb, var(--task-accent) 38%, rgba(125, 211, 252, 0.2));
  background:
    linear-gradient(180deg, rgba(13, 83, 70, 0.42), rgba(9, 25, 33, 0.62)),
    linear-gradient(90deg, color-mix(in srgb, var(--task-accent) 18%, transparent), transparent 64%);
  box-shadow:
    inset 3px 0 0 var(--task-accent),
    0 10px 22px rgba(2, 6, 23, 0.24);
}

.task-list-row:hover::before,
.task-list-row:focus-visible::before {
  opacity: 1;
  transform: translateX(60%);
}

.task-list-row--selected {
  border-color: color-mix(in srgb, var(--task-accent) 48%, rgba(74, 222, 128, 0.18)) !important;
  background:
    linear-gradient(180deg, rgba(13, 148, 136, 0.42), rgba(9, 28, 34, 0.64)),
    linear-gradient(105deg, color-mix(in srgb, var(--task-accent) 22%, transparent), transparent 70%);
  box-shadow:
    inset 3px 0 0 var(--task-accent),
    inset 0 0 0 1px rgba(74, 222, 128, 0.05),
    0 12px 26px rgba(2, 6, 23, 0.26);
}

.task-list-row--action {
  background:
    linear-gradient(180deg, rgba(8, 36, 34, 0.3), rgba(10, 22, 31, 0.52)),
    linear-gradient(135deg, rgba(34, 197, 94, 0.08), transparent 64%);
}

.task-list-row--locked {
  opacity: 0.55;
}

.task-list-row__glyph {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--task-accent) 32%, rgba(148, 163, 184, 0.14));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--task-accent) 18%, rgba(15, 23, 42, 0.72)), rgba(15, 23, 42, 0.78));
  color: color-mix(in srgb, var(--task-accent) 84%, white);
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  transition: transform .16s ease;
}

.task-list-row:hover .task-list-row__glyph,
.task-list-row:focus-visible .task-list-row__glyph,
.task-list-row--selected .task-list-row__glyph {
  transform: scale(1.06) rotate(-3deg);
}

.task-list-row__info {
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1;
}

.task-list-row__headline {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
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

.task-list-row__category {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  max-width: 13ch;
  min-height: 18px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.58);
  color: rgba(203, 213, 225, 0.72);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-list-row__meta {
  margin-top: 3px;
  font-size: 10px;
  line-height: 1.35;
  color: rgba(209, 250, 229, 0.5);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-list-row__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.task-mini-chip {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.55);
  color: rgba(226, 232, 240, 0.82);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.task-mini-chip--ready {
  color: rgba(187, 247, 208, 0.95);
  border-color: rgba(74, 222, 128, 0.22);
  background: rgba(20, 83, 45, 0.28);
}

.task-mini-chip--blocked {
  color: rgba(254, 202, 202, 0.96);
  border-color: rgba(248, 113, 113, 0.2);
  background: rgba(127, 29, 29, 0.26);
}

.task-mini-chip--locked {
  color: rgba(253, 230, 138, 0.96);
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(120, 53, 15, 0.26);
}

.task-mini-chip--neutral {
  color: rgba(204, 251, 241, 0.9);
  border-color: rgba(45, 212, 191, 0.16);
  background: rgba(13, 148, 136, 0.2);
}

.task-list-row__state,
.task-detail-state {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 15ch;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  border-radius: 8px;
  background: rgba(13, 148, 136, 0.18);
  color: rgba(204, 251, 241, 0.96);
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
  border-radius: 8px;
  border: 1px solid rgba(94, 234, 212, 0.1);
  background:
    linear-gradient(180deg, rgba(7, 36, 39, 0.22), rgba(15, 23, 42, 0.38)),
    linear-gradient(125deg, rgba(34, 197, 94, 0.1), transparent 54%);
  animation: task-card-lift .3s ease both;
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
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(150deg, rgba(34, 197, 94, 0.16), transparent 42%),
    linear-gradient(20deg, rgba(15, 118, 110, 0.2), transparent 46%),
    linear-gradient(180deg, rgba(8, 47, 73, 0.2), rgba(2, 6, 23, 0.48));
}

.task-preview-stage::before {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 8px;
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
  filter: none;
}

.task-preview-stage__layer--terrain-overlay,
.task-preview-stage__layer--building-overlay {
  filter: none;
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
  border-radius: 8px;
  border: 1px solid rgba(94, 234, 212, 0.09);
  background:
    linear-gradient(180deg, rgba(7, 36, 39, 0.2), rgba(15, 23, 42, 0.34));
  animation: task-card-lift .32s ease both;
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
  border-radius: 4px;
  border: 1px solid rgba(94, 234, 212, 0.08);
  background: rgba(16, 32, 39, 0.72);
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
  color: rgba(204, 251, 241, 0.86);
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
  --panel-action-button-color: #c9ffd0;
  --panel-action-button-hover-color: #e6ffe8;
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
  color: rgba(250, 204, 21, 0.78);
  animation: task-empty-drift 3.4s ease-in-out infinite;
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

.task-stack-enter-active,
.task-stack-leave-active,
.task-detail-swap-enter-active,
.task-detail-swap-leave-active {
  transition:
    opacity .2s ease,
    transform .22s cubic-bezier(.2, .8, .2, 1),
    filter .22s ease;
}

.task-stack-enter-from,
.task-detail-swap-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(.985);
  filter: blur(5px);
}

.task-stack-leave-to,
.task-detail-swap-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(.99);
  filter: blur(4px);
}

.task-row-move,
.task-row-enter-active,
.task-row-leave-active {
  transition:
    opacity .2s ease,
    transform .24s cubic-bezier(.2, .8, .2, 1),
    filter .2s ease;
}

.task-row-enter-from {
  opacity: 0;
  transform: translateX(-12px) scale(.98);
  filter: blur(4px);
}

.task-row-leave-to {
  opacity: 0;
  transform: translateX(12px) scale(.98);
  filter: blur(4px);
}

.task-row-leave-active {
  position: absolute;
  left: 0;
  right: 0;
}

@keyframes task-card-lift {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes task-empty-drift {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }

  50% {
    transform: translateY(-5px) rotate(8deg);
  }
}

/* ── Frontier order board skin ───────────────────────── */
.task-overlay {
  padding: clamp(20px, 3.2vw, 40px);
}

.task-backdrop {
  background:
    radial-gradient(circle at 50% 52%, rgba(7, 6, 3, 0.08), rgba(1, 5, 12, 0.36) 72%),
    rgba(1, 5, 12, 0.26);
}

.task-panel {
  box-sizing: border-box;
  --panel-modal-border-width: 22px;
  width: min(84rem, calc(100vw - 32px));
  max-width: 84rem;
  height: min(51rem, calc(100vh - 42px));
  max-height: 51rem;
  border: 22px solid transparent;
  border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 38px stretch;
  border-radius: 0;
  background:
    radial-gradient(circle at 70% 0%, rgba(84, 58, 33, 0.18), transparent 26rem),
    radial-gradient(circle at 18% 102%, rgba(47, 31, 20, 0.2), transparent 20rem),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.14) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #151819 0%, #0b0d0f 100%);
  box-shadow:
    0 42px 110px rgba(0, 0, 0, 0.68),
    0 0 0 1px rgba(209, 145, 58, 0.28),
    inset 0 0 72px rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(5px) saturate(0.86) brightness(0.86);
  -webkit-backdrop-filter: blur(5px) saturate(0.86) brightness(0.86);
}

.task-panel::before {
  border-radius: 0;
  background-image:
    radial-gradient(circle at 12% 24%, rgba(255, 228, 169, 0.11) 0 1px, transparent 1px),
    radial-gradient(circle at 74% 68%, rgba(255, 228, 169, 0.08) 0 1px, transparent 1px),
    radial-gradient(circle at 46% 44%, rgba(0, 0, 0, 0.42) 0 1px, transparent 1px);
  background-size: 13px 17px, 19px 23px, 11px 13px;
  opacity: 0.18;
  box-shadow: inset 0 0 34px rgba(0, 0, 0, 0.72);
}

.task-panel::after {
  display: none;
}

.task-banner-tab {
  position: absolute;
  top: -0.15rem;
  left: 1.2rem;
  z-index: 4;
  width: 3.9rem;
  height: 6.3rem;
}

.task-header {
  min-height: 4.95rem;
  padding: 1.15rem 4rem 0.72rem 6.45rem;
  border-bottom: 1px solid rgba(139, 93, 43, 0.5);
  background:
    radial-gradient(circle at 20% 0%, rgba(102, 71, 37, 0.16), transparent 18rem),
    linear-gradient(180deg, rgba(25, 20, 15, 0.34), rgba(8, 9, 10, 0.08));
}

.task-kicker,
.task-section-title,
.task-detail-block__label {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #c99a4b;
  text-shadow: 0 1px 0 #070706;
}

.task-hero-title {
  margin-top: 0.18rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.8rem, 2.75vw, 2.35rem);
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807, 0 0 10px rgba(216, 170, 83, 0.16);
}

.task-body {
  grid-template-columns: minmax(0, 1.55fr) minmax(19.5rem, 0.72fr);
  gap: 0.72rem;
  padding: 0.52rem 0.7rem 0.7rem;
}

.task-list-pane,
.task-detail-pane {
  border: 0;
  border-radius: 0;
  background:
    radial-gradient(circle at 20% 6%, rgba(255, 226, 161, 0.03), transparent 12rem),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, rgba(18, 20, 20, 0.34), rgba(9, 10, 11, 0.42));
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.task-list-pane {
  grid-template-columns: 12.6rem minmax(0, 1fr);
  column-gap: 0.68rem;
  padding: 0.42rem 0.52rem 0.45rem;
}

.task-list-pane--actions-only {
  grid-template-columns: minmax(0, 1fr);
}

.task-list-pane--actions-only .task-list-scroll {
  grid-column: 1 / -1;
}

.task-list-pane--actions-only .task-section {
  padding: 0;
}

.task-list-pane--actions-only .task-list--actions {
  display: flex;
  flex-direction: column;
  gap: 0.52rem;
}

.task-command-strip {
  min-height: 2.95rem;
  margin: 0 0 0.5rem;
  padding: 0.12rem 0.18rem 0.48rem;
  border: 0;
  border-bottom: 1px solid rgba(132, 94, 44, 0.24);
  background: transparent;
}

.task-command-strip__caption {
  margin-top: 0.18rem;
  color: #d7c8a7;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.9rem;
}

.task-command-strip__pulse,
.task-list-row__state,
.task-detail-state,
.task-cost-chip {
  border-radius: 0;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 6px stretch;
  border-width: 6px;
  border-style: solid;
  background: transparent;
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: 0.06em;
  text-shadow: 0 1px 0 #080706;
}

.task-command-strip__pulse,
.task-state--ready {
  color: #8fd879;
}

.task-category-rail {
  gap: 0.35rem;
  padding: 0 0.25rem 0 0;
  scrollbar-color: rgba(132, 94, 44, 0.38) transparent;
}

.task-category-tab {
  min-height: 2.55rem;
  grid-template-columns: 1.95rem minmax(0, 1fr) auto;
  gap: 0.48rem;
  padding: 0.25rem 0.38rem;
  border: 1px solid rgba(132, 94, 44, 0.18);
  border-radius: 0;
  background:
    linear-gradient(90deg, rgba(65, 45, 26, 0.11), rgba(15, 17, 18, 0.22)),
    rgba(13, 15, 16, 0.42);
  clip-path: none;
  color: #d7c8a7;
  box-shadow: none;
}

.task-category-tab::after {
  inset: 0;
  width: auto;
  border-radius: 0;
  border-left: 2px solid var(--task-accent);
  background: transparent;
}

.task-category-tab:hover,
.task-category-tab:focus-visible,
.task-category-tab--active {
  transform: none;
  border-color: rgba(202, 151, 69, 0.36);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--task-accent) 7%, rgba(78, 54, 28, 0.16)), rgba(18, 18, 17, 0.28)),
    rgba(15, 15, 15, 0.52);
  color: #fff0d2;
  box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.26);
}

.task-category-tab__glyph {
  width: 1.54rem;
  height: 1.54rem;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--task-accent) 78%, #f2c56b);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.08rem;
}

.task-category-tab__label,
.task-category-tab__count,
.task-list-row__title,
.task-list-row__category,
.task-list-row__meta,
.task-mini-chip,
.task-detail-title,
.task-detail-copy,
.task-lock-hint,
.task-detail-block__copy,
.task-preview-card__hint,
.task-flow-row__label,
.task-effect-list {
  font-family: Georgia, 'Times New Roman', serif;
}

.task-category-tab__label {
  font-size: 0.86rem;
  font-weight: 700;
  color: rgba(241, 223, 184, 0.88);
}

.task-category-tab__count {
  min-width: 1.16rem;
  height: 1.16rem;
  border: 1px solid rgba(132, 94, 44, 0.34);
  border-radius: 0.18rem;
  background: rgba(4, 5, 6, 0.62);
  color: #d7c8a7;
  font-size: 0.7rem;
}

.task-section-header {
  margin-bottom: 0.4rem;
  padding: 0.1rem 0.05rem;
  border: 0;
  background: transparent;
}

.task-section-icon {
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: #a7df76;
  font-size: 1.08rem;
}

.task-section-caption {
  color: #c9b894;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.88rem;
}

.task-list {
  gap: 0.34rem;
}

.task-list-row {
  display: grid;
  grid-template-columns: 3.55rem minmax(0, 1fr) minmax(4.8rem, 6.25rem);
  min-height: 4.72rem;
  gap: 0.72rem;
  padding: 0.42rem 0.58rem;
  border: 1px solid rgba(132, 94, 44, 0.18);
  border-radius: 0;
  background:
    linear-gradient(90deg, rgba(65, 45, 26, 0.13), rgba(15, 17, 18, 0.3)),
    rgba(13, 15, 16, 0.5);
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.3),
    inset 2px 0 0 color-mix(in srgb, var(--task-accent) 58%, transparent);
  clip-path: none;
}

.task-list-row--action {
  min-height: 4.65rem;
}

  .task-list-row::before {
    display: none;
  }

  .task-list-row::after {
    content: '›';
    position: absolute;
    right: 0.34rem;
    top: 50%;
    color: rgba(241, 201, 121, 0.72);
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.35rem;
    line-height: 1;
    transform: translateY(-52%);
    pointer-events: none;
  }

.task-list-row:hover,
.task-list-row:focus-visible,
.task-list-row--selected {
  transform: none;
  border-color: rgba(202, 151, 69, 0.68);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--task-accent) 13%, rgba(86, 59, 33, 0.22)), rgba(18, 20, 20, 0.36)),
    rgba(18, 20, 20, 0.68);
  box-shadow:
    inset 0 0 14px rgba(0, 0, 0, 0.34),
    inset 2px 0 0 var(--task-accent);
}

.task-list-row--locked {
  opacity: 0.58;
  filter: saturate(0.55);
}

.task-list-row__glyph {
  grid-column: 1;
  align-self: center;
  width: 3.55rem;
  height: 3.55rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #d9b563;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.75rem;
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.62));
  overflow: visible;
}

.task-list-row__glyph--visual {
  position: relative;
  display: grid;
  place-items: center;
}

.task-list-row__icon-layer {
  position: absolute;
  width: 3.55rem;
  height: 3.55rem;
  object-fit: contain;
  image-rendering: pixelated;
}

.task-list-row__icon-layer--base {
  filter: saturate(0.95) brightness(0.9);
}

.task-list-row:hover .task-list-row__glyph,
.task-list-row:focus-visible .task-list-row__glyph,
.task-list-row--selected .task-list-row__glyph {
  transform: none;
}

.task-list-row__headline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.46rem;
  align-items: baseline;
}

.task-list-row__title {
  font-size: 1.14rem;
  font-weight: 700;
  color: #fff0d2;
  text-shadow: 0 1px 0 #080706;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-list-row__category,
.task-badge {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: rgba(201, 154, 75, 0.78);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.task-list-row__meta {
  margin-top: 0.18rem;
  color: rgba(215, 200, 167, 0.68);
  font-size: 0.76rem;
  line-height: 1.18;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-list-row__chips {
  gap: 0.3rem;
  margin-top: 0.26rem;
}

.task-mini-chip,
.task-cost-chip {
  min-height: 1.24rem;
  padding: 0.08rem 0.34rem;
  border-color: rgba(132, 94, 44, 0.24);
  background: rgba(17, 18, 18, 0.5);
  color: #d7c8a7;
  font-size: 0.63rem;
  font-weight: 700;
  white-space: nowrap;
}

.task-mini-chip--ready {
  color: #b8f0a0;
  border-color: rgba(84, 153, 65, 0.5);
  background: rgba(28, 76, 35, 0.38);
}

.task-mini-chip--blocked,
.task-cost-chip-missing,
.task-state--blocked {
  color: #ffbaa3;
  border-color: rgba(166, 71, 49, 0.5);
  background: rgba(83, 24, 19, 0.44);
}

.task-mini-chip--locked,
.task-state--locked {
  color: #f5d082;
  border-color: rgba(167, 105, 38, 0.5);
  background: rgba(82, 49, 19, 0.42);
}

.task-list-row__state,
.task-detail-state {
  min-width: 4.8rem;
  min-height: 1.72rem;
  padding: 0.08rem 0.38rem;
  font-size: 0.64rem;
  font-weight: 700;
  white-space: normal;
  overflow: visible;
  text-align: center;
  line-height: 1.08;
  text-overflow: clip;
}

  .task-list-row__state {
    width: 100%;
    min-width: 0;
    max-width: none;
    margin-right: 0.62rem;
    align-self: center;
  }

.task-detail-state {
  min-width: 6.25rem;
  max-width: 11rem;
  white-space: nowrap;
}

.task-detail-pane {
  padding: 0.62rem 0.72rem 0.62rem 0.9rem;
  border-left: 1px solid rgba(132, 94, 44, 0.2);
  background:
    linear-gradient(180deg, rgba(14, 13, 12, 0.56), rgba(7, 8, 8, 0.66)),
    radial-gradient(circle at 50% 0%, rgba(150, 95, 34, 0.12), transparent 46%);
}

.task-detail-scroll {
  flex: 1;
  min-height: 0;
  gap: 0.78rem;
  padding-right: 0.5rem;
  scrollbar-color: rgba(132, 94, 44, 0.38) transparent;
}

.task-detail-content {
  gap: 0.72rem;
}

.task-detail-top {
  padding: 0.1rem 0.1rem 0.62rem;
  border: 0;
  border-bottom: 1px solid rgba(132, 94, 44, 0.24);
  background: transparent;
}

.task-detail-title {
  margin-top: 0.32rem;
  font-size: 1.45rem;
  font-weight: 700;
  color: #fff0d2;
}

.task-detail-summary {
  display: grid;
  gap: 0.52rem;
  padding: 0.72rem 0.82rem;
  border-left: 2px solid rgba(201, 154, 75, 0.34);
  background:
    linear-gradient(180deg, rgba(39, 32, 24, 0.58), rgba(15, 14, 12, 0.46)),
    radial-gradient(circle at 100% 0%, rgba(207, 144, 56, 0.12), transparent 52%);
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.34),
    0 1px 0 rgba(255, 219, 146, 0.05);
}

.task-detail-copy,
.task-lock-hint {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(255, 240, 210, 0.96);
  font-size: 1.02rem;
  line-height: 1.48;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.56);
}

.task-lock-hint {
  color: #f3c970;
  font-weight: 700;
}

.task-preview-card {
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.task-preview-card__hint {
  color: #d7c8a7;
  font-size: 0.94rem;
}

.task-preview-stage {
  min-height: 10.8rem;
  border: 1px solid rgba(170, 113, 52, 0.42);
  border-radius: 0;
  background:
    radial-gradient(circle at 50% 42%, rgba(82, 124, 45, 0.38), transparent 58%),
    linear-gradient(180deg, rgba(35, 58, 27, 0.68), rgba(8, 17, 10, 0.78));
  box-shadow:
    inset 0 0 28px rgba(0, 0, 0, 0.56),
    0 1px 0 rgba(255, 220, 148, 0.06);
}

.task-preview-stage::before {
  display: none;
}

.task-preview-stage__layer {
  width: 8.65rem;
  height: 8.65rem;
}

.task-detail-block {
  gap: 0.48rem;
  padding: 0.66rem 0.74rem;
  border: 0;
  border-top: 1px solid rgba(132, 94, 44, 0.2);
  border-radius: 0;
  background: rgba(9, 9, 8, 0.25);
  box-shadow: none;
}

.task-detail-block__label {
  margin-bottom: 0.08rem;
  color: #d7aa5f;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.task-detail-block__copy,
.task-flow-row__label,
.task-effect-list {
  color: #e2d3b2;
  font-size: 0.98rem;
  line-height: 1.42;
}

.task-confirm-btn {
  min-height: 3.15rem;
  margin-top: auto;
  --panel-action-button-color: #c9ffd0;
  --panel-action-button-hover-color: #e6ffe8;
}

.task-confirm-btn--footer {
  flex: 0 0 auto;
  margin-top: 0.7rem;
}

.task-detail-empty {
  border: 1px solid rgba(132, 94, 44, 0.28);
  background: rgba(12, 13, 14, 0.42);
  color: #d7c8a7;
}

.task-detail-empty__title {
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
}

.task-detail-empty__hint {
  color: #c9b894;
  font-family: Georgia, 'Times New Roman', serif;
}

@media (prefers-reduced-motion: reduce) {
  .task-panel,
  .task-panel::after,
  .task-command-strip__pulse,
  .task-preview-stage__layer,
  .task-detail-empty__icon,
  .task-preview-card,
  .task-detail-block {
    animation: none !important;
  }

  .task-list-row,
  .task-list-row::before,
  .task-list-row__glyph,
  .task-category-tab,
  .task-category-tab::after,
  .task-stack-enter-active,
  .task-stack-leave-active,
  .task-row-move,
  .task-row-enter-active,
  .task-row-leave-active,
  .task-detail-swap-enter-active,
  .task-detail-swap-leave-active {
    transition: none !important;
  }
}

@media (max-width: 1180px) and (min-width: 641px) {
  .task-panel {
    width: min(920px, calc(100vw - 32px));
    max-width: min(920px, calc(100vw - 32px));
    height: min(700px, calc(100vh - 48px));
  }

  .task-body {
    grid-template-columns: minmax(0, 1.2fr) minmax(270px, 0.8fr);
    gap: 12px;
    padding: 14px 22px 22px;
  }

  .task-list-pane {
    grid-template-columns: 150px minmax(0, 1fr);
    column-gap: 12px;
    padding: 12px;
  }

  .task-list-row__state {
    max-width: 13ch;
  }
}

@media (max-width: 900px) and (min-width: 641px) {
  .task-panel {
    width: min(820px, calc(100vw - 32px));
    height: min(760px, calc(100vh - 32px));
  }

  .task-body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(320px, 1fr) minmax(220px, 0.72fr);
    overflow: hidden;
  }

  .task-list-pane {
    border-right: none;
    border-bottom: 1px solid rgba(56, 189, 248, 0.16);
    padding: 12px;
  }

  .task-detail-pane {
    min-height: 0;
  }
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
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    border: 16px solid transparent;
    border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 28px stretch;
    border-radius: 0;
    box-shadow: none;
  }

  .task-header {
    padding: 13px 14px 0;
  }

  .task-kicker {
    font-size: 8px;
    letter-spacing: 0.16em;
  }

  .task-hero-title {
    margin-top: 5px;
    font-size: 1.05rem;
  }

  .task-command-strip {
    padding: 0 0 8px;
    margin-bottom: 8px;
  }

  .task-command-strip__caption {
    margin-top: 2px;
  }

  .task-command-strip__pulse {
    min-height: 23px;
    padding-inline: 7px;
    font-size: 9px;
  }

  .task-category-rail {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    flex-direction: row;
    gap: 6px;
    min-height: 2.9rem;
    max-height: none;
    margin-bottom: 8px;
    padding: 1px 6px 8px 2px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .task-category-rail::-webkit-scrollbar {
    display: none;
  }

  .task-category-tab {
    flex: 0 0 min(10rem, 74vw);
    min-height: 34px;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    padding: 5px 8px 5px 6px;
    width: auto;
  }

  .task-category-tab__label {
    max-width: none;
    font-size: 10px;
  }

  .task-category-tab__count {
    min-width: 17px;
    height: 17px;
    font-size: 9px;
  }

  .task-body {
    display: block;
    padding: 0;
    min-height: 0;
    overflow: hidden;
  }

  .task-list-pane,
  .task-detail-pane {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition:
      transform 260ms cubic-bezier(.2, .84, .22, 1),
      opacity 220ms ease,
      filter 220ms ease;
    will-change: transform;
  }

  .task-list-pane {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto minmax(0, 1fr);
    column-gap: 0;
    border-right: 0;
    padding: 10px;
    overflow: hidden;
  }

  .task-body--mobile-detail .task-list-pane {
    transform: translateX(-28%);
    opacity: 0.22;
    filter: blur(2px);
    pointer-events: none;
  }

  .task-list-pane--actions-only {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .task-list-pane--actions-only .task-list-scroll {
    grid-row: 2;
  }

  .task-list-scroll {
    grid-column: 1;
    grid-row: 3;
    padding: 0;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
  }

  .task-list-row {
    grid-template-columns: 30px minmax(0, 1fr) minmax(64px, 82px);
    min-height: 62px;
    padding: 7px 8px;
    gap: 7px;
  }

  .task-list-row__glyph {
    width: 30px;
    height: 30px;
    font-size: 14px;
  }

  .task-list-row__headline {
    gap: 5px;
  }

  .task-list-row__title {
    font-size: 12px;
  }

  .task-list-row__category,
  .task-mini-chip,
  .task-list-row__state {
    font-size: 8px;
  }

  .task-list-row__meta {
    margin-top: 2px;
    font-size: 9px;
  }

  .task-list-row__chips {
    margin-top: 4px;
  }

  .task-list-row__state {
    max-width: none;
    padding-inline: 6px;
  }

  .task-detail-pane {
    z-index: 2;
    transform: translateX(105%);
    min-height: 0;
    padding: 0.6rem 0.7rem 0.75rem;
    border-left: 0;
    overflow: hidden;
  }

  .task-body--mobile-detail .task-detail-pane {
    transform: translateX(0);
  }

  .task-mobile-detail-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 2.25rem;
    margin-bottom: 0.45rem;
    padding: 0 0.2rem 0.45rem;
    border-bottom: 1px solid rgba(132, 94, 44, 0.24);
    flex-shrink: 0;
  }

  .task-mobile-back {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-width: 0;
    padding: 0.2rem 0.3rem;
    border: 0;
    background: transparent;
    color: #f1c979;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 1px 0 #050505;
  }

  .task-mobile-back span {
    font-size: 1.45rem;
    line-height: 0.7;
  }

  .task-mobile-detail-state {
    max-width: 46%;
    padding: 0.28rem 0.5rem;
    border-radius: 4px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task-detail-scroll {
    min-height: 0;
    padding: 0;
    overflow-y: auto;
  }

  .task-detail-content {
    gap: 10px;
    min-height: min-content;
  }

  .task-detail-copy {
    font-size: 12px;
    line-height: 1.45;
  }

  .task-detail-block {
    gap: 6px;
    padding: 8px 9px;
  }

  .task-preview-card {
    gap: 8px;
    padding: 9px;
  }

  .task-preview-stage {
    min-height: 84px;
  }

  .task-preview-stage__layer {
    width: 68px;
    height: 68px;
  }

  .task-confirm-btn {
    min-height: 2.8rem;
  }

}

@media (max-width: 1180px) {
  .task-panel {
    border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 34px stretch;
  }

  .task-list-pane {
    border: 0;
    background:
      radial-gradient(circle at 20% 6%, rgba(255, 226, 161, 0.03), transparent 12rem),
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 8px),
      linear-gradient(180deg, rgba(18, 20, 20, 0.34), rgba(9, 10, 11, 0.42));
  }

  .task-list-pane--actions-only .task-list--actions {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .task-panel {
    border: 16px solid transparent;
    border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 28px stretch;
    background:
      radial-gradient(circle at 70% 0%, rgba(84, 58, 33, 0.16), transparent 20rem),
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 8px),
      linear-gradient(180deg, #151819 0%, #0b0d0f 100%);
  }

  .task-banner-tab {
    width: 2.9rem;
    height: 4.7rem;
    left: 0.85rem;
  }

  .task-header {
    min-height: 4.65rem;
    padding: 0.9rem 3.6rem 0.55rem 4.45rem;
    border-bottom-color: rgba(139, 93, 43, 0.5);
  }

  .task-command-strip {
    padding: 0.2rem 0.18rem 0.55rem;
    border: 0;
    border-bottom: 1px solid rgba(132, 94, 44, 0.24);
  }

  .task-list-pane {
    border: 0;
  }

  .task-category-tab {
    min-height: 2.55rem;
    grid-template-columns: 1.9rem minmax(0, 1fr) auto;
  }

  .task-category-tab__glyph {
    width: 1.55rem;
    height: 1.55rem;
  }

  .task-category-tab__label {
    font-size: 0.78rem;
  }

  .task-list-row {
    grid-template-columns: 2.9rem minmax(0, 1fr) minmax(4.5rem, 5.6rem);
    min-height: 4.45rem;
    border-color: rgba(132, 94, 44, 0.32);
  }

  .task-list-row__glyph,
  .task-list-row__icon-layer {
    width: 2.9rem;
    height: 2.9rem;
  }

  .task-list-row__title {
    font-size: 0.9rem;
  }

  .task-list-row__category,
  .task-mini-chip,
  .task-list-row__state {
    font-size: 0.64rem;
  }

  .task-detail-copy,
  .task-lock-hint {
    font-size: 0.82rem;
  }

  .task-list-pane--actions-only .task-list--actions {
    grid-template-columns: 1fr;
  }
}
</style>
