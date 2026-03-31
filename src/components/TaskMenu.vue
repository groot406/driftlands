<template>
  <div v-if="tile" class="task-overlay" @pointerdown.stop.prevent @pointerup.stop :style="menuStyle">
    <div class="task-container">
      <div ref="panelEl" class="task-panel pointer-events-auto">
        <div class="task-header">
          <div class="task-header-copy">
            <p class="task-kicker pixel-font">{{ buildingTasks.length ? 'Frontier Orders' : 'Field Actions' }}</p>
            <h3 class="task-hero-title">{{ previewTask?.label ?? 'Choose an order' }}</h3>
            <p class="task-header-summary">
              {{
                previewTask
                  ? getBuildingMeta(previewTask)?.summary
                  : 'Choose what your hero should do on this tile.'
              }}
            </p>
          </div>
          <button class="task-close" @click.stop.prevent="close" title="Close">
            ✕
          </button>
        </div>

        <div v-if="buildingTasks.length" class="task-section task-section-build">
          <div class="task-section-row">
            <div class="task-section-title">Construction</div>
            <div class="task-section-caption">
              {{ buildingTasks.length }} {{ buildingTasks.length === 1 ? 'option' : 'options' }}
            </div>
          </div>
          <transition-group name="fade-task" tag="div" class="task-build-grid">
            <button
              v-for="t in buildingTasks"
              :key="t.key"
              class="task-choice"
              :class="{
                'task-choice-active': previewTask?.key === t.key,
                'task-choice-blocked': taskHasMissingCosts(t),
              }"
              @click="selectTask(t)"
              @mouseover="hoverTask(t)"
              @mouseleave="unHoverTask(t)"
              @focus="hoverTask(t)"
              @blur="unHoverTask(t)"
              :title="t.label"
            >
              <span class="task-choice-kicker pixel-font">{{ getBuildingMeta(t)?.categoryLabel }}</span>
              <span class="task-choice-title">{{ t.label }}</span>
              <span
                class="task-choice-state"
                :class="taskHasMissingCosts(t) ? 'task-choice-state-blocked' : 'task-choice-state-ready'"
              >
                {{ getBuildStateLabel(t) }}
              </span>
            </button>
          </transition-group>

          <div
            v-if="previewTask"
            class="task-detail"
            :class="{ 'task-detail-blocked': taskHasMissingCosts(previewTask) }"
          >
            <div class="task-detail-top">
              <span class="task-badge">{{ getBuildingMeta(previewTask)?.categoryLabel }}</span>
              <span
                class="task-detail-state"
                :class="taskHasMissingCosts(previewTask) ? 'task-detail-state-blocked' : 'task-detail-state-ready'"
              >
                {{ getBuildStateLabel(previewTask) }}
              </span>
            </div>
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
                Settlers {{ populationState.current }}/{{ getPopulationRequirement(previewTask) }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="actionTasks.length" class="task-section task-section-actions">
          <div class="task-section-row">
            <div class="task-section-title">Actions</div>
            <div class="task-section-caption">
              {{ actionTasks.length }} {{ actionTasks.length === 1 ? 'command' : 'commands' }}
            </div>
          </div>
          <transition-group name="fade-task" tag="div" class="task-action-strip">
            <button
              v-for="t in actionTasks"
              :key="t.key"
              class="task-action-pill"
              @click="selectTask(t)"
              @mouseover="hoverTask(t)"
              @mouseleave="unHoverTask(t)"
              @focus="hoverTask(t)"
              @blur="unHoverTask(t)"
              :title="t.label"
            >
              <span class="task-action-label">{{ t.label }}</span>
            </button>
          </transition-group>
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
import { getBuildingDefinitionByTaskKey } from '../shared/buildings/registry';
import { resourceInventory } from '../store/resourceStore';
import { populationState } from '../store/clientPopulationStore';
import { currentPlayerId } from '../core/socket';
import { addNotification } from '../store/notificationStore';
import { canControlHero, getHeroOwnerName } from '../store/playerStore';
import { getDistanceToNearestTowncenter } from '../shared/game/worldQueries';

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
};

const sortedTasks = computed(() => props.availableTasks ?? []);
const buildingTasks = computed(() => sortedTasks.value.filter((task) => !!getBuildingMeta(task)));
const actionTasks = computed(() => sortedTasks.value.filter((task) => !getBuildingMeta(task)));
const previewTask = computed(() => {
  const hovered = hoveredTask.value;

  if (hovered && buildingTasks.value.some((task) => task.key === hovered.key)) {
    return hovered;
  }

  return buildingTasks.value[0] ?? null;
});
const panelWidth = computed(() => {
  const containerWidth = props.containerSize?.width ?? 0;

  if (containerWidth <= 0) {
    return 460;
  }

  return Math.min(520, Math.max(280, containerWidth - 32));
});
const panelEstimatedHeight = computed(() => {
  const columns = panelWidth.value >= 500 ? 3 : panelWidth.value >= 360 ? 2 : 1;
  const buildRows = buildingTasks.value.length ? Math.ceil(buildingTasks.value.length / columns) : 0;
  const actionRows = actionTasks.value.length ? Math.ceil(actionTasks.value.length / 3) : 0;

  return (
    118 +
    (buildRows ? 44 + buildRows * 94 : 0) +
    (previewTask.value ? 82 : 0) +
    (actionRows ? 44 + actionRows * 52 : 0)
  );
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

function getBuildingCosts(def: TaskDefinition): ResourceAmount[] {
  if (!props.tile || !getBuildingMeta(def)) return [];
  return def.requiredResources?.(getDistanceToNearestTowncenter(props.tile.q, props.tile.r)) ?? [];
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

function getBuildStateLabel(def: TaskDefinition) {
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

function resourceLabel(type: ResourceType) {
  return resourceLabels[type] ?? type;
}

function close() {
  emit('close');
}

function selectTask(def: TaskDefinition) {
  if (!props.tile) return;
  const hero = getSelectedHero();
  if (!hero) return;
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

  if (hero.q === props.tile.q && hero.r === props.tile.r) {
    if (def.key !== 'walk') {
      startTaskRequest(hero.id, def.key, { q: props.tile.q, r: props.tile.r });
      emit('started', def.key, props.tile);
    }
  } else {
    const path = pathService.findWalkablePath(hero.q, hero.r, props.tile.q, props.tile.r);
    if (path.length) {
      detachHeroFromCurrentTask(hero);
      requestHeroMovement(hero.id, path, props.tile, def.key);
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
  max-width: 38ch;
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

.task-section-build {
  margin-top: 18px;
}

.task-section-actions {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
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

.task-build-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  gap: 10px;
}

.task-choice {
  min-height: 94px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(23, 37, 84, 0.52), rgba(15, 23, 42, 0.78)),
    linear-gradient(135deg, rgba(34, 197, 94, 0.06), transparent 60%);
  color: #f8fafc;
  text-align: left;
  cursor: pointer;
  transition: transform .16s, border-color .16s, box-shadow .16s, background .16s;
}

.task-choice:hover {
  transform: translateY(-2px);
  border-color: rgba(125, 211, 252, 0.26);
  box-shadow: 0 18px 28px rgba(2, 6, 23, 0.24);
}

.task-choice-active {
  border-color: rgba(250, 204, 21, 0.34);
  background:
    linear-gradient(180deg, rgba(45, 55, 110, 0.72), rgba(15, 23, 42, 0.86)),
    linear-gradient(135deg, rgba(251, 191, 36, 0.14), transparent 60%);
  box-shadow:
    0 0 0 1px rgba(250, 204, 21, 0.14) inset,
    0 20px 32px rgba(15, 23, 42, 0.28);
}

.task-choice-blocked {
  background:
    linear-gradient(180deg, rgba(65, 30, 42, 0.56), rgba(15, 23, 42, 0.82)),
    linear-gradient(135deg, rgba(239, 68, 68, 0.08), transparent 60%);
}

.task-choice-kicker {
  display: block;
  font-size: 8px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(252, 211, 77, 0.72);
}

.task-choice-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.15;
  color: #f8fafc;
}

.task-choice-state {
  display: block;
  font-size: 11px;
  font-weight: 600;
}

.task-choice-state-ready {
  color: rgba(167, 243, 208, 0.92);
}

.task-choice-state-blocked {
  color: rgba(254, 202, 202, 0.9);
}

.task-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(125, 211, 252, 0.16);
  background:
    linear-gradient(180deg, rgba(14, 165, 233, 0.1), rgba(15, 23, 42, 0.02)),
    rgba(15, 23, 42, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.task-detail-blocked {
  border-color: rgba(248, 113, 113, 0.14);
}

.task-detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-detail-state {
  font-size: 11px;
  font-weight: 700;
}

.task-detail-state-ready {
  color: rgba(167, 243, 208, 0.92);
}

.task-detail-state-blocked {
  color: rgba(254, 202, 202, 0.92);
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

.task-costs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

.task-action-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-action-pill {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.68), rgba(15, 23, 42, 0.84)),
    linear-gradient(135deg, rgba(56, 189, 248, 0.06), transparent 60%);
  color: #e2e8f0;
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.task-action-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.32);
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.78), rgba(15, 23, 42, 0.9)),
    linear-gradient(135deg, rgba(56, 189, 248, 0.1), transparent 60%);
}

.task-action-label {
  font-size: 13px;
  font-weight: 600;
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

  .task-build-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .task-header-summary {
    max-width: none;
  }
}

@media (max-width: 420px) {
  .task-build-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
