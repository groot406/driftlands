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

      <div class="task-body">
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
                        'task-list-row--selected': selectedTask?.key === item.task.key,
                        'task-list-row--locked': item.locked,
                      }"
                      :style="getTaskRowStyle(item.task)"
                      @click="handleTaskClick(item.task)"
                      @pointerenter="hoverTask(item.task)"
                      @pointerleave="unHoverTask(item.task)"
                    >
                      <span class="task-list-row__glyph">{{ getTaskGlyph(item.task) }}</span>
                      <div class="task-list-row__info">
                        <div class="task-list-row__headline">
                          <p class="task-list-row__title">{{ item.task.label }}</p>
                          <span class="task-list-row__category">{{ item.categoryLabel }}</span>
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
                    'task-list-row--selected': selectedTask?.key === item.task.key,
                    'task-list-row--locked': item.locked,
                  }"
                  :style="getTaskRowStyle(item.task)"
                  @click="handleTaskClick(item.task)"
                  @pointerenter="hoverTask(item.task)"
                  @pointerleave="unHoverTask(item.task)"
                >
                  <span class="task-list-row__glyph">{{ getTaskGlyph(item.task) }}</span>
                  <div class="task-list-row__info">
                    <div class="task-list-row__headline">
                      <p class="task-list-row__title">{{ item.task.label }}</p>
                      <span class="task-list-row__category">Action</span>
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
                    {{ item.locked ? 'Locked' : 'Ready' }}
                  </span>
                </button>
              </TransitionGroup>
            </div>
          </div>
        </div>

        <div class="task-detail-pane">
          <div class="task-detail-scroll">
            <section v-if="showTileSurveyPanel" class="task-detail-block tile-survey-block">
              <div class="tile-survey-heading">
                <p class="task-detail-block__label">Tile Survey</p>
                <span class="tile-survey-status" :class="tileSurveyStatusClass">
                  {{ tileSurveyStatusLabel }}
                </span>
              </div>
              <div class="tile-survey-list">
                <div
                  v-for="trait in tileSurveyTraits"
                  :key="`${trait.kind}:${trait.label}`"
                  class="tile-survey-trait"
                  :class="`tile-survey-trait--${trait.tone}`"
                >
                  <span class="tile-survey-trait__label">{{ trait.label }}</span>
                  <span class="tile-survey-trait__effect">{{ trait.effect }}</span>
                </div>
              </div>
            </section>

            <Transition name="task-detail-swap" mode="out-in">
              <div v-if="selectedTask" :key="selectedTask.key" class="task-detail-content">
              <!-- Detail header -->
              <div class="task-detail-top">
                <div>
                  <span class="task-badge">{{ selectedTaskUi?.categoryLabel ?? getBuildCategoryLabel(selectedTask) }}</span>
                  <h4 class="task-detail-title">{{ selectedTask.label }}</h4>
                </div>
                <span class="task-detail-state" :class="selectedTaskUi?.stateTone ?? getBuildStateTone(selectedTask)">
                  {{ selectedTaskUi?.stateLabel ?? getBuildStateLabel(selectedTask) }}
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
              <p v-if="selectedTaskUi?.lockHint" class="task-lock-hint">{{ selectedTaskUi.lockHint }}</p>
              <p v-else-if="selectedTaskHint" class="task-lock-hint">{{ selectedTaskHint }}</p>

              <div v-if="!isBuildingTask(selectedTask) && getTaskRequiredResources(selectedTask).length" class="task-detail-grid">
                <section class="task-detail-block">
                  <p class="task-detail-block__label">Required Resources</p>
                  <div class="task-costs">
                    <span
                      v-for="resource in getTaskRequiredResources(selectedTask)"
                      :key="resource.type"
                      class="task-cost-chip"
                      :class="{ 'task-cost-chip-missing': isCostMissing(resource) }"
                    >
                      {{ resourceLabel(resource.type) }} {{ getWarehouseAmount(resource.type) }}/{{ resource.amount }}
                    </span>
                  </div>
                </section>
              </div>

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
                      Population {{ playerPopulation.current }}/{{ getPopulationRequirement(selectedTask) }}
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
                :class="{ 'task-confirm-btn--disabled': selectedTaskUi?.locked ?? isTaskLocked(selectedTask) }"
                :disabled="selectedTaskUi?.locked ?? isTaskLocked(selectedTask)"
                @click.stop="confirmTask"
              >
                {{ (selectedTaskUi?.locked ?? isTaskLocked(selectedTask)) ? 'Locked' : `Send Hero — ${selectedTask.label}` }}
              </button>
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Tile, TileModifierKey, TileSpecialKey } from '../core/types/Tile';
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
import { getStoryTaskDescriptor } from '../shared/story/progression';
import { getScoutCancelMovementPathOptions } from '../shared/game/scoutResources';
import { getInventoryEntryDefinition } from '../shared/game/inventoryPresentation.ts';
import { runSnapshot } from '../store/runStore.ts';

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
let hoverFrame = 0;
let pendingHoverTask: TaskDefinition | null = null;

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
  isMobile.value = window.matchMedia('(max-width: 640px)').matches || 'ontouchstart' in window;
}

const resourceLabels: Record<ResourceType, string> = {
  wood: getInventoryEntryDefinition('wood').label,
  ore: getInventoryEntryDefinition('ore').label,
  iron: getInventoryEntryDefinition('iron').label,
  coal: getInventoryEntryDefinition('coal').label,
  stone: getInventoryEntryDefinition('stone').label,
  tools: getInventoryEntryDefinition('tools').label,
  weapons: getInventoryEntryDefinition('weapons').label,
  food: getInventoryEntryDefinition('food').label,
  fish: getInventoryEntryDefinition('fish').label,
  bread: getInventoryEntryDefinition('bread').label,
  meat: getInventoryEntryDefinition('meat').label,
  beer: getInventoryEntryDefinition('beer').label,
  wine: getInventoryEntryDefinition('wine').label,
  crystal: getInventoryEntryDefinition('crystal').label,
  diamonds: getInventoryEntryDefinition('diamonds').label,
  artifact: getInventoryEntryDefinition('artifact').label,
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
}

interface TileSurveyTrait {
  kind: 'status' | 'modifier' | 'special';
  label: string;
  effect: string;
  tone: 'unknown' | 'known' | 'empty';
}

const tileModifierMeta: Record<TileModifierKey, { label: string; effect: string }> = {
  rich_soil: {
    label: 'Rich Soil',
    effect: '+1 grain from harvests and granary work here.',
  },
  rocky_ground: {
    label: 'Rocky Ground',
    effect: '+1 stone from quarry work; farming is blocked here.',
  },
  dense_forest: {
    label: 'Dense Forest',
    effect: '+1 wood for lumber camps here or beside this forest.',
  },
  sand_rich: {
    label: 'Sand Rich',
    effect: '+1 sand when gathering sand here.',
  },
};

const tileSpecialMeta: Record<TileSpecialKey, { label: string; effect: string }> = {
  fertile_basin: {
    label: 'Fertile Basin',
    effect: '+1 output for adjacent farms and grain sites.',
  },
  ancient_ruins: {
    label: 'Ancient Ruins',
    effect: 'Can be activated once for study progress.',
  },
  natural_crossing: {
    label: 'Natural Crossing',
    effect: 'Reduces bridge cost on this crossing or nearby shore.',
  },
  rich_ore_vein: {
    label: 'Rich Ore Vein',
    effect: '+1 ore from a mine on this mountain.',
  },
};

const showTileSurveyPanel = computed(() => props.tile?.discovered === true);

const tileSurveyTraits = computed<TileSurveyTrait[]>(() => {
  const tile = props.tile;
  if (!tile?.discovered) {
    return [];
  }

  if (tile.surveyed !== true) {
    return [{
      kind: 'status',
      label: 'Unsurveyed',
      effect: 'Hidden terrain traits unknown.',
      tone: 'unknown',
    }];
  }

  const traits: TileSurveyTrait[] = [];

  if (tile.modifier && tile.modifierRevealed === true) {
    const meta = tileModifierMeta[tile.modifier];
    traits.push({
      kind: 'modifier',
      label: meta.label,
      effect: meta.effect,
      tone: 'known',
    });
  }

  if (tile.special && tile.specialRevealed === true) {
    const meta = tileSpecialMeta[tile.special];
    traits.push({
      kind: 'special',
      label: meta.label,
      effect: meta.effect,
      tone: 'known',
    });
  }

  if (!traits.length) {
    traits.push({
      kind: 'status',
      label: 'Surveyed',
      effect: 'No hidden traits found.',
      tone: 'empty',
    });
  }

  return traits;
});

const tileSurveyStatusLabel = computed(() => {
  const tile = props.tile;
  if (!tile?.discovered || tile.surveyed !== true) {
    return 'Unsurveyed';
  }

  return tileSurveyTraits.value.some((trait) => trait.tone === 'known')
    ? 'Trait Found'
    : 'Clear';
});

const tileSurveyStatusClass = computed(() => {
  const tile = props.tile;
  if (!tile?.discovered || tile.surveyed !== true) {
    return 'tile-survey-status--unknown';
  }

  return tileSurveyTraits.value.some((trait) => trait.tone === 'known')
    ? 'tile-survey-status--known'
    : 'tile-survey-status--empty';
});

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
  if (!getBuildingMeta(def) && !getUpgradeMeta(def)) return [];
  return getTaskRequiredResources(def);
}

function getTaskRequiredResources(def: TaskDefinition): ResourceAmount[] {
  if (!props.tile) return [];
  return def.requiredResources?.(getTaskEconomyDistance(), props.tile) ?? [];
}

function getWarehouseAmount(type: ResourceType) {
  return Math.floor(playerInventory.value[type] ?? 0);
}

function isCostMissing(resource: ResourceAmount) {
  return getWarehouseAmount(resource.type) < resource.amount;
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
    return unlockStatus.lockingNode ? `Locked by ${unlockStatus.lockingNode.label}` : 'Locked';
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
    const [resource] = missing;
    const missingAmount = Math.floor(Math.max(0, resource.amount - getWarehouseAmount(resource.type)));
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
    stateLabel = unlockStatus.lockingNode ? `Locked by ${unlockStatus.lockingNode.label}` : 'Locked';
  } else if (!populationMet) {
    const requirement = getPopulationRequirement(def);
    stateLabel = requirement ? `Need ${requirement} settlers` : 'Need settlers';
  } else {
    const costs = getTaskRequiredResources(def);
    const missing = costs.filter(isCostMissing);
    if (missing.length === 1) {
      const [resource] = missing;
      const missingAmount = Math.floor(Math.max(0, resource.amount - getWarehouseAmount(resource.type)));
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
    return [{ label: 'Locked', tone: 'locked' }];
  }

  const chips: TaskRowChip[] = [];
  const building = getBuildingMeta(def);
  const upgrade = getUpgradeMeta(def);

  if (building?.jobSlots) {
    chips.push({
      label: formatWorkerCount(building.jobSlots, building.jobLabel ?? 'worker'),
      tone: 'neutral',
    });
  } else if (upgrade) {
    chips.push({ label: 'Upgrade', tone: 'neutral' });
  }

  const populationRequirement = getPopulationRequirement(def);
  if (populationRequirement) {
    chips.push({
      label: `Pop ${playerPopulation.value.current}/${populationRequirement}`,
      tone: isPopulationMet(def) ? 'ready' : 'blocked',
    });
  }

  for (const resource of getTaskRequiredResources(def)) {
    chips.push({
      label: `${resourceLabel(resource.type)} ${getWarehouseAmount(resource.type)}/${resource.amount}`,
      tone: isCostMissing(resource) ? 'blocked' : 'ready',
    });
  }

  if (!chips.length && isBuildingTask(def)) {
    chips.push({ label: 'No cost', tone: 'ready' });
  }

  return chips.slice(0, 4);
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
  if (hoverFrame) {
    window.cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
  }

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

.task-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(94, 234, 212, 0.1);
  background: rgba(7, 26, 32, 0.34);
  color: rgba(248, 250, 252, 0.9);
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.task-close:hover {
  transform: translateY(-1px);
  border-color: rgba(74, 222, 128, 0.26);
  background: rgba(6, 78, 59, 0.42);
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
  animation: task-preview-float 3.6s ease-in-out infinite;
}

.task-preview-stage__layer--base {
  filter: none;
}

.task-preview-stage__layer--terrain-overlay,
.task-preview-stage__layer--building-overlay {
  filter: none;
  animation-delay: .18s;
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

.tile-survey-block {
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.72)),
    radial-gradient(circle at top left, rgba(20, 184, 166, 0.1), transparent 46%);
}

.tile-survey-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tile-survey-status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.tile-survey-status--unknown {
  background: rgba(51, 65, 85, 0.72);
  color: rgba(203, 213, 225, 0.9);
}

.tile-survey-status--known {
  border-color: rgba(45, 212, 191, 0.32);
  background: rgba(13, 148, 136, 0.24);
  color: rgba(153, 246, 228, 0.96);
}

.tile-survey-status--empty {
  background: rgba(30, 41, 59, 0.72);
  color: rgba(186, 230, 253, 0.88);
}

.tile-survey-list {
  display: grid;
  gap: 6px;
}

.tile-survey-trait {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.46);
}

.tile-survey-trait--known {
  border-color: rgba(45, 212, 191, 0.24);
  background: rgba(15, 118, 110, 0.16);
}

.tile-survey-trait--unknown {
  border-style: dashed;
}

.tile-survey-trait--empty {
  background: rgba(30, 41, 59, 0.5);
}

.tile-survey-trait__label {
  color: rgba(241, 245, 249, 0.94);
  font-size: 12px;
  font-weight: 700;
}

.tile-survey-trait__effect {
  color: rgba(203, 213, 225, 0.82);
  font-size: 11px;
  line-height: 1.45;
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
  width: 100%;
  padding: 12px 16px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.5), rgba(6, 78, 59, 0.7));
  color: rgba(167, 243, 208, 0.96);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  cursor: pointer;
  transition: transform .12s, background .12s, border-color .12s, box-shadow .12s;
  clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 9px 100%, 0 50%);
}

.task-confirm-btn:hover {
  transform: translateY(-2px);
  border-color: rgba(52, 211, 153, 0.44);
  box-shadow: 0 12px 24px rgba(6, 78, 59, 0.34);
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

@keyframes task-preview-float {
  0%,
  100% {
    translate: 0 0;
  }

  50% {
    translate: 0 -4px;
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
    width: 100%;
    max-width: 100%;
    height: 100dvh;
    max-height: none;
    border: 0;
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

  .task-close {
    width: 32px;
    height: 32px;
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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    min-height: 0;
    max-height: none;
    margin-bottom: 8px;
    padding: 1px 6px 8px 2px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .task-category-tab {
    min-height: 34px;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    padding: 5px 8px 5px 6px;
    width: calc(100% - 2px);
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
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 0.98fr) minmax(0, 1.02fr);
    gap: 8px;
    padding: 10px 10px 12px;
    min-height: 0;
    overflow: hidden;
  }

  .task-list-pane {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 92px) minmax(0, 1fr);
    column-gap: 0;
    border-right: 1px solid rgba(56, 189, 248, 0.16);
    border-bottom: 1px solid rgba(56, 189, 248, 0.16);
    padding: 10px;
    overflow: hidden;
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
    max-width: 12ch;
    padding-inline: 6px;
  }

  .task-detail-pane {
    min-height: 0;
    padding: 10px;
    overflow: hidden;
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
    padding: 11px 12px;
    font-size: 12px;
    border-radius: 4px;
  }

  .tile-survey-block {
    display: none;
  }
}
</style>
