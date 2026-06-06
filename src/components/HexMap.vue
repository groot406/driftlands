<template>
  <div
    ref="container"
    class="w-full h-full relative map-container"
    :class="{
      'map-container-lite': !useCanvasDropShadow,
      'map-container-settler-hover': !!hoveredSettler,
    }"
  >
    <canvas ref="canvas" class="absolute inset-0 pixel-art"/>
    <Transition name="quick-action-pop">
      <div
        v-if="quickActionMenu.visible && quickActionMenu.tile"
        class="quick-action-menu"
        :style="quickActionMenuStyle"
        @contextmenu.stop.prevent
        @pointerdown.stop.prevent
        @pointerup.stop
      >
        <div class="quick-action-menu__header">
          <span class="quick-action-menu__kicker">Quick Actions</span>
          <span class="quick-action-menu__tile">{{ getTileActionLabel(quickActionMenu.tile) }}</span>
        </div>
        <div class="quick-action-menu__list">
          <button
            v-if="quickActionMenu.continueTask"
            type="button"
            class="quick-action-menu__item quick-action-menu__item--continue"
            @click.stop="handleQuickActionContinueClick(quickActionMenu.continueTask)"
            @pointerenter="handleQuickActionContinueHover(quickActionMenu.continueTask)"
            @pointerleave="handleQuickActionHover(null)"
          >
            <span class="quick-action-menu__glyph">↻</span>
            <span class="quick-action-menu__label">{{ getQuickActionContinueLabel(quickActionMenu.continueTask) }}</span>
          </button>
          <button
            v-for="task in quickActionMenu.tasks"
            :key="task.key"
            type="button"
            class="quick-action-menu__item"
            @click.stop="handleQuickActionClick(task)"
            @pointerenter="handleQuickActionHover(task)"
            @pointerleave="handleQuickActionHover(null)"
        >
            <span class="quick-action-menu__glyph">{{ getQuickActionGlyph(task) }}</span>
            <span class="quick-action-menu__label">{{ task.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
    <transition name="fade-menu" mode="out-in" v-show="showTaskMenu">
      <TaskMenu :containerSize="containerSize" :tile="taskMenuTile" :availableTasks="availableTasks"
                :visible="showTaskMenu"
                @close="handleTaskMenuClose"
                @hover="handleTaskHover"
      />
    </transition>
    <TownCenterPanel
      ref="townCenterPanel"
      :visible="showTownCenterPanel"
      :townCenterTileId="selectedTownCenterTileId"
      :standaloneBuildingTileId="selectedBuildingDetailTileId"
      @close="closeTownCenterPanel"
    />
    <div v-if="militaryHudUnlocked && militaryHud" class="military-hud-anchor">
      <button
        class="military-hud-trigger"
        :class="{ 'military-hud-trigger--alert': militaryHud.threatenedTowers > 0 }"
        @click.stop="toggleMilitaryHudPopup"
      >
        <span>Military</span>
        <span v-if="militaryHud.threatenedTowers > 0" class="military-hud-trigger__badge">{{ militaryHud.threatenedTowers }}</span>
      </button>
      <div v-if="showMilitaryHudPopup" class="military-hud">
        <div class="military-hud__header">
          <div>
            <div class="military-hud__kicker">Military</div>
            <div class="military-hud__title">{{ militaryHud.modeLabel }} Borders</div>
          </div>
          <div class="military-hud__actions">
            <button class="military-hud__button" @click.stop="openOwnSettlementPanel">
              Manage
            </button>
            <button class="military-hud__button military-hud__button--ghost" @click.stop="showMilitaryHudPopup = false">
              Close
            </button>
          </div>
        </div>
        <div class="military-hud__stats">
          <div class="military-hud__stat">
            <span class="military-hud__value">{{ militaryHud.reserveGuards }}</span>
            <span class="military-hud__label">Reserve</span>
          </div>
          <div class="military-hud__stat">
            <span class="military-hud__value">{{ militaryHud.threatenedTowers }}</span>
            <span class="military-hud__label">Threats</span>
          </div>
          <div class="military-hud__stat">
            <span class="military-hud__value">{{ militaryHud.wallCount }}</span>
            <span class="military-hud__label">Walls</span>
          </div>
          <div class="military-hud__stat">
            <span class="military-hud__value">{{ militaryHud.trainingQueue }}</span>
            <span class="military-hud__label">Training</span>
          </div>
        </div>
        <div class="military-hud__status" :class="{ 'military-hud__status--alert': militaryHud.threatenedTowers > 0 }">
          {{ militaryHud.statusText }}
        </div>
        <div class="military-hud__hint">
          {{ militaryHud.actionHint }}
        </div>
      </div>
    </div>
    <button
      v-for="renderedShip in renderedShips"
      :key="renderedShip.id"
      class="trading-ship-map-sprite"
      :class="`trading-ship-map-sprite--${renderedShip.phase}`"
      :style="renderedShip.style"
      type="button"
      :aria-label="`Open loading panel for ${renderedShip.name}`"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointercancel.stop
      @click.stop="toggleShipOrderPanel(renderedShip.orderId)"
    >
      <span class="trading-ship-map-sprite__frame" :style="renderedShip.frameStyle"></span>
    </button>
    <div
      v-for="ping in renderedPings"
      :key="ping.id"
      class="coop-ping"
      :style="ping.style"
    >
      <div class="coop-ping-ring"></div>
      <div class="coop-ping-label">{{ ping.playerName }} · {{ ping.label }}</div>
    </div>
    <div
      v-for="hint in renderedMapHints"
      :key="hint.id"
      class="story-tile-hint"
      :class="`story-tile-hint--${hint.source}`"
      :style="hint.style"
      @pointerdown.stop.prevent="handleStoryHintPointerDown"
      @pointerup.stop.prevent="handleMapHintPointerUp(hint)"
    >
      <div class="story-tile-hint-ring"></div>
      <div class="story-tile-hint-label">{{ hint.label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import {ensureTileExists, tileIndex, worldVersion} from '../core/world';
import {requestHeroMovement, startTaskRequest, updateHeroFacing, updateHeroMovements} from '../core/heroService';
import { heroes } from '../store/heroStore';
import TaskMenu from './TaskMenu.vue';
import TownCenterPanel from './TownCenterPanel.vue';
import {updateRenderDebugState} from '../store/renderDebugStore';
import { getBuildingDefinitionByTaskKey, getBuildingDefinitionForTile } from '../shared/buildings/registry.ts';
import { getUpgradeDefinitionByTaskKey } from '../shared/buildings/upgrades.ts';
import { isBridgeTile, isTunnelTile } from '../shared/game/bridges.ts';
import { isRoadTile } from '../shared/game/roads.ts';
import {
  axialToPixel,
  camera,
  createPointerHandlers,
  dragged,
  dragging,
  isCameraMoving,
  isKeyboardNavigating,
  keyDown,
  keyUp,
  resetCameraPointerState,
  stopCameraAnimation
} from '../core/camera';
import {getSelectedHero, isPaused, openSettlerModal, selectedHeroId, selectHero,} from '../store/uiStore';
import {isHeroWorkingTask} from '../shared/game/heroTaskState';
import {taskStore} from '../store/taskStore';
import {HexMapService} from '../core/HexMapService';
import {closeWindow, isKeyboardBlocked, openWindow, WINDOW_IDS} from '../core/windowManager';
import {requestHeroClaim} from '../core/coopService';
import {currentPlayerId} from '../core/socket';
import {getAvailableTasks} from "../shared/tasks/tasks";
import { getTaskDefinition, listTaskDefinitions } from '../shared/tasks/taskRegistry.ts';
import { formatContinueTaskLabel } from '../shared/tasks/taskLabels.ts';
import { canStartTaskDefinition } from '../shared/tasks/taskAvailability.ts';
import {PathService} from "../core/PathService";
import type {Tile} from "../core/types/Tile.ts";
import type {Hero} from "../core/types/Hero.ts";
import type { Settler } from '../core/types/Settler.ts';
import type { TaskInstance } from '../core/types/Task.ts';
import type {TaskDefinition} from "../core/types/Task.ts";
import {isHitStopActive, resetGameFeelState, sampleGameFeelTime} from '../core/gameFeel';
import {addNotification} from '../store/notificationStore';
import {
  graphicsDiagnosticOverrideStore,
  getEffectiveMapTargetFps,
  shouldUseCanvasDropShadow,
  shouldUseWindowsRescueTimer,
} from '../store/graphicsStore';
import {canControlHero, getActiveCoopPings, getHeroOwnerName, getPlayerEntities, isHeroClaimedByOtherPlayer} from '../store/playerStore';
import {populationVersion} from '../store/clientPopulationStore';
import {runSnapshot, runVersion} from '../store/runStore';
import {clearStoryTileHint, getActiveStoryTileHints, setStoryTileHint} from '../store/storyHintStore';
import { activeSideQuests } from '../store/sideQuestStore.ts';
import { tutorialMapHints, type TutorialMapHintAction } from '../store/tutorialStore';
import {getForestDiscoveryHintTile, getWaterDiscoveryHintTile} from '../shared/game/waterDiscoveryHint';
import { isUndiscoveredFrontierTile, listUndiscoveredFrontierTiles } from '../shared/game/explorationFrontier';
import { getScoutCancelMovementPathOptions } from '../shared/game/scoutResources';
import {
  computeControlledTileIdsForTC,
  computeControlledTileIdsForSettlement,
  getCachedReach,
  clearReachCache,
  isTileActive,
} from '../store/settlementSupportStore';
import {
  currentPlayerReachColor,
  currentPlayerSettlementId,
  isPositionInCurrentPlayerTerritory,
  isTileInCurrentPlayerTerritory,
  settlementStartMarkers,
} from '../store/settlementStartStore';
import {
  getSettlementTownCenterTile,
  getTileSettlementId as getSettlementIdForTile,
} from '../shared/game/settlement';
import { findNearestTaskAccessTile, getTaskAccessMode } from '../shared/tasks/taskAccess';
import type { SettlementStartMarker } from '../shared/multiplayer/settlementStart';
import {
  getEffectiveSettlementBorderMode,
  getSettlementGuardReserve,
  isBarracksTile,
  isRaidableMilitaryTarget,
  isWatchtowerTile,
  resolveWatchtowerConflictState,
  shouldOpenTownCenterRaidDetail,
} from '../shared/game/military.ts';
import { isWallTile } from '../shared/game/walls.ts';
import { isTileWalkable } from '../shared/game/navigation.ts';

import { detachHeroFromCurrentTask } from '../store/taskStore';
import { canStartTaskWhileCarrying } from '../store/taskStore';
import { isTaskUnlockedForUse } from '../shared/tasks/taskUnlocks.ts';
import { findHarborShipRoute, isHarborTile } from '../shared/game/harbor.ts';
import { shipOrderOverview, toggleShipOrderPanel } from '../store/shipOrderStore.ts';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { getSideQuestDefinition } from '../shared/sideQuests/definitions.ts';
import tradingShipDirectionsUrl from '../assets/tiles/trading_ship_directions.png';

const emit = defineEmits<{
  (e: 'tile-click', tile: Tile): void;
  (e: 'tile-doubleclick', tile: Tile): void;
  (e: 'hero-click', hero: Hero): void
}>();

const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const mouseDown = ref(false);
const {pointerDown, pointerMove, pointerUp, pointerCancel} = createPointerHandlers(mouseDown);

// Hover & path reactive state
const hoveredTile = shallowRef<Tile | null>(null);
const hoveredHero = shallowRef<Hero | null>(null);
const hoveredSettler = shallowRef<Settler | null>(null);
const pathCoords = shallowRef<{ q: number; r: number }[]>([]);
const pathPreviewState = shallowRef<{ heroId: string; targetKey: string; sourceKey: string } | null>(null);

const availableTasks = ref<TaskDefinition[]>([]);
const showTaskMenu = ref(false);
const taskMenuTile = ref<Tile | null>(null);
const quickActionMenu = ref<{
  visible: boolean;
  tile: Tile | null;
  continueTask: TaskInstance | null;
  tasks: TaskDefinition[];
  x: number;
  y: number;
}>({
  visible: false,
  tile: null,
  continueTask: null,
  tasks: [],
  x: 0,
  y: 0,
});
const showTownCenterPanel = ref(false);
const selectedTownCenterTileId = ref<string | null>(null);
const selectedBuildingDetailTileId = ref<string | null>(null);
const townCenterPanel = ref<InstanceType<typeof TownCenterPanel> | null>(null);
const containerSize = ref({width: 0, height: 0});
const clusterBoundaryTiles = ref<Tile[]>([]); // boundary tiles for same-terrain cluster highlighting
const clusterTiles = ref<Set<string>>(new Set()); // all tiles in cluster (id set)
const hoveredTask = ref<TaskDefinition | null>(null);
const globalReachBoundary = ref<Array<{q: number; r: number}>>([]);
const globalReachTileIds = ref<Set<string>>(new Set());
const settlementReachOutlines = ref<Array<{
  boundary: Array<{q: number; r: number}>;
  tileIds: Set<string>;
  color?: string | null;
  isOwn?: boolean;
  dashed?: boolean;
}>>([]);
const showSupportOverlay = ref(false);
const showMilitaryHudPopup = ref(false);
let lastGlobalReachComputeMs = 0;
const QUICK_ACTION_MENU_WIDTH = 224;
const QUICK_ACTION_MENU_MAX_HEIGHT = 300;
const QUICK_ACTION_MENU_MARGIN = 10;

// Service instance
const service = new HexMapService();
const pathService = new PathService();
const useCanvasDropShadow = shouldUseCanvasDropShadow();
const FOREST_DISCOVERY_HINT_ID = 'story:forest-nearby';
const WATER_DISCOVERY_HINT_ID = 'story:water-nearby';

type RenderedTileHint = {
  id: string;
  source: 'story' | 'tutorial' | 'side_quest';
  action: TutorialMapHintAction;
  q: number;
  r: number;
  label: string;
  taskKey?: string;
  style: {
    left: string;
    top: string;
  };
};

function findMovementPathForHero(hero: Hero, target: { q: number; r: number }, taskType?: string | null) {
  return pathService.findWalkablePath(
    hero.q,
    hero.r,
    target.q,
    target.r,
    getScoutCancelMovementPathOptions(hero, taskType),
  );
}
const renderedPings = computed(() => {
  const cameraPx = axialToPixel(camera.q, camera.r);
  const { width, height } = containerSize.value;

  return getActiveCoopPings.value.map((ping) => {
    const tilePx = axialToPixel(ping.q, ping.r);

    return {
      ...ping,
      style: {
        left: `${tilePx.x - cameraPx.x + (width / 2)}px`,
        top: `${tilePx.y - cameraPx.y + (height / 2)}px`,
      },
    };
  });
});

const shipVisualNow = ref(Date.now());

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - (2 * t));
}

function getPrimaryShipHarborTile() {
  void worldVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  const harborTiles = Object.values(tileIndex)
    .filter((tile) => isHarborTile(tile) && (!settlementId || getSettlementIdForTile(tile) === settlementId))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (harborTiles.length > 0) {
    return harborTiles[0]!;
  }

  return Object.values(tileIndex)
    .filter((tile) => isHarborTile(tile))
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

type ShipDirection = 'east' | 'northeast' | 'northwest' | 'west' | 'southwest' | 'southeast';

const SHIP_DIRECTION_FRAME_ORDER: ShipDirection[] = [
  'southwest',
  'west',
  'southeast',
  'northeast',
  'east',
  'northwest',
];

const SHIP_DIRECTION_BY_STEP = new Map<string, ShipDirection>([
  ['1,0', 'east'],
  ['1,-1', 'northeast'],
  ['0,-1', 'northwest'],
  ['-1,0', 'west'],
  ['-1,1', 'southwest'],
  ['0,1', 'southeast'],
]);

const SHIP_SPRITE_DISPLAY_WIDTH = 96;
const SHIP_SPRITE_DISPLAY_HEIGHT = 72;

function getShipDirection(from: { q: number; r: number }, to: { q: number; r: number }): ShipDirection {
  const dq = Math.sign(to.q - from.q);
  const dr = Math.sign(to.r - from.r);
  return SHIP_DIRECTION_BY_STEP.get(`${dq},${dr}`) ?? 'east';
}

function getShipFrameStyle(direction: ShipDirection) {
  const frameIndex = Math.max(0, SHIP_DIRECTION_FRAME_ORDER.indexOf(direction));
  return {
    backgroundImage: `url(${tradingShipDirectionsUrl})`,
    backgroundPosition: `-${frameIndex * SHIP_SPRITE_DISPLAY_WIDTH}px 0`,
    backgroundSize: `${SHIP_DIRECTION_FRAME_ORDER.length * SHIP_SPRITE_DISPLAY_WIDTH}px ${SHIP_SPRITE_DISPLAY_HEIGHT}px`,
  };
}

function sampleShipPath(path: Array<{ q: number; r: number }>, progress: number, reverseDirection = false) {
  if (path.length <= 1) {
    const only = path[0] ?? { q: 0, r: 0 };
    return {
      position: axialToPixel(only.q, only.r),
      direction: 'east' as ShipDirection,
      fromCoord: only,
      toCoord: only,
    };
  }

  const scaled = clamp01(progress) * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const fromCoord = path[index]!;
  const toCoord = path[index + 1]!;
  const from = axialToPixel(fromCoord.q, fromCoord.r);
  const to = axialToPixel(toCoord.q, toCoord.r);

  return {
    position: {
      x: from.x + ((to.x - from.x) * local),
      y: from.y + ((to.y - from.y) * local),
    },
    direction: reverseDirection
      ? getShipDirection(toCoord, fromCoord)
      : getShipDirection(fromCoord, toCoord),
    fromCoord,
    toCoord,
  };
}

function isShipSampleDiscovered(sample: ReturnType<typeof sampleShipPath>) {
  const fromTile = tileIndex[`${sample.fromCoord.q},${sample.fromCoord.r}`] ?? null;
  const toTile = tileIndex[`${sample.toCoord.q},${sample.toCoord.r}`] ?? null;
  return !!fromTile?.discovered && !!toTile?.discovered;
}

const renderedShips = computed(() => {
  const visibleShips = shipOrderOverview.value.visibleShips ?? (shipOrderOverview.value.visibleShip ? [shipOrderOverview.value.visibleShip] : []);
  if (!visibleShips.length) {
    return [];
  }

  const cameraPx = axialToPixel(camera.q, camera.r);
  const { width, height } = containerSize.value;

  return visibleShips.flatMap((visibleShip) => {
    const harbor = tileIndex[visibleShip.harborTileId] ?? getPrimaryShipHarborTile();
    const route = findHarborShipRoute(harbor);
    if (!route) {
      return [];
    }

    const duration = Math.max(1, visibleShip.phaseEndsAt - visibleShip.phaseStartedAt);
    const rawProgress = visibleShip.phase === 'docked'
      ? 1
      : clamp01((shipVisualNow.value - visibleShip.phaseStartedAt) / duration);
    const pathProgress = visibleShip.phase === 'departing'
      ? 1 - rawProgress
      : rawProgress;
    const sample = sampleShipPath(route.path, pathProgress, visibleShip.phase === 'departing');
    if (!isShipSampleDiscovered(sample)) {
      return [];
    }

    const worldPx = sample.position;
    const opacity = visibleShip.phase === 'approaching'
      ? smoothStep(0.02, 0.28, rawProgress)
      : visibleShip.phase === 'departing'
        ? 1 - smoothStep(0.72, 0.98, rawProgress)
        : 1;
    const bob = Math.sin((shipVisualNow.value / 520) + route.dock.q + route.dock.r) * 2;

    return [{
      id: visibleShip.id,
      orderId: visibleShip.orderId,
      name: visibleShip.name,
      phase: visibleShip.phase,
      style: {
        left: `${worldPx.x - cameraPx.x + (width / 2)}px`,
        top: `${worldPx.y - cameraPx.y + (height / 2) + bob}px`,
        opacity: `${opacity}`,
        transform: 'translate(-50%, -62%)',
      },
      frameStyle: getShipFrameStyle(sample.direction),
    }];
  });
});

const quickActionMenuStyle = computed(() => ({
  left: `${quickActionMenu.value.x}px`,
  top: `${quickActionMenu.value.y}px`,
}));

const militaryHud = computed(() => {
  void worldVersion.value;
  void populationVersion.value;

  const settlementId = currentPlayerSettlementId.value;
  const townCenter = getSettlementTownCenterTile(Object.values(tileIndex), settlementId);
  if (!settlementId || !townCenter) {
    return null;
  }

  const ownedTiles = Object.values(tileIndex).filter((tile) => tile.ownerSettlementId === settlementId);
  const towers = ownedTiles.filter((tile) => isWatchtowerTile(tile));
  const threatenedTowers = towers.filter((tile) => {
    const state = resolveWatchtowerConflictState(tile);
    return state === 'under_attack' || state === 'contested' || state === 'captured';
  }).length;
  const wallCount = ownedTiles.filter((tile) => isWallTile(tile)).length;
  const barracksTiles = ownedTiles.filter((tile) => isBarracksTile(tile));
  const trainingQueue = barracksTiles.reduce((total, tile) => {
    const queued = Math.max(0, tile.barracksTrainingQueue ?? 0);
    const active = (tile.barracksTrainingProgressMs ?? 0) > 0 ? 1 : 0;
    return total + queued + active;
  }, 0);
  const modeOpen = getEffectiveSettlementBorderMode(townCenter, seasonSnapshot.value) === 'open';

  return {
    modeLabel: modeOpen ? 'Open' : 'Closed',
    reserveGuards: getSettlementGuardReserve(Object.values(tileIndex), settlementId),
    threatenedTowers,
    wallCount,
    trainingQueue,
    statusText: threatenedTowers > 0
      ? `${threatenedTowers} watchtower${threatenedTowers === 1 ? '' : 's'} contested`
      : modeOpen
        ? 'Borders exposed to raids'
        : 'Borders protected',
    actionHint: modeOpen
      ? 'Attack by selecting an enemy watchtower or town center and choosing Start Capture Raid.'
      : 'Open your borders, train guards, then target an enemy watchtower or town center.',
  };
});

const militaryHudUnlocked = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  if (!settlementId) {
    return false;
  }

  return Object.values(tileIndex).some((tile) => tile.ownerSettlementId === settlementId && (
    isWatchtowerTile(tile)
    || isWallTile(tile)
    || tile.variant === 'plains_barracks'
    || tile.variant === 'dirt_barracks'
  ));
});

const sideQuestDistressHeroes = computed<Hero[]>(() => {
  const settlementId = currentPlayerSettlementId.value;

  return activeSideQuests.value.flatMap((quest) => {
    if (quest.status !== 'active') {
      return [];
    }
    if (settlementId && quest.ownerSettlementId && quest.ownerSettlementId !== settlementId) {
      return [];
    }

    const tile = tileIndex[quest.signalTileId] ?? ensureTileExists(quest.q, quest.r);
    if (!tile.discovered) {
      return [];
    }

    const definition = getSideQuestDefinition(quest.definitionId);
    if (!definition) {
      return [];
    }

    return [{
      id: `sidequest-distress:${quest.id}`,
      name: definition.npc.name,
      avatar: definition.npc.avatar,
      storyTemplateId: null,
      settlementId: quest.ownerSettlementId ?? quest.spawnSettlementId ?? null,
      q: quest.q,
      r: quest.r,
      stats: { xp: 0, hp: 100, atk: 0, spd: 1 },
      facing: 'down',
    }];
  });
});

const mapHintTiles = computed(() => {
  const seen = new Set<string>();
  const hintTiles: Tile[] = [];

  for (const hint of [...getActiveStoryTileHints.value, ...tutorialMapHints.value]) {
    const tile = tileIndex[`${hint.q},${hint.r}`] ?? ensureTileExists(hint.q, hint.r);
    if (seen.has(tile.id)) {
      continue;
    }

    seen.add(tile.id);
    hintTiles.push(tile);
  }

  return hintTiles;
});

const renderedMapHints = computed<RenderedTileHint[]>(() => {
  const cameraPx = axialToPixel(camera.q, camera.r);
  const { width, height } = containerSize.value;
  const hints = [
    ...getActiveStoryTileHints.value.map((hint) => ({
      id: hint.id,
      source: hint.kind === 'side_quest' ? 'side_quest' as const : 'story' as const,
      action: 'explore' as const,
      q: hint.q,
      r: hint.r,
      label: hint.label,
      taskKey: 'explore',
    })),
    ...tutorialMapHints.value.map((hint) => ({
      id: hint.id,
      source: 'tutorial' as const,
      action: hint.action,
      q: hint.q,
      r: hint.r,
      label: hint.label,
      taskKey: hint.taskKey,
    })),
  ];

  return hints.map((hint) => {
    const tilePx = axialToPixel(hint.q, hint.r);

    return {
      ...hint,
      style: {
        left: `${tilePx.x - cameraPx.x + (width / 2)}px`,
        top: `${tilePx.y - cameraPx.y + (height / 2)}px`,
      },
    };
  });
});

function hasBuiltHouse() {
  const settlementId = currentPlayerSettlementId.value;
  return Object.values(tileIndex).some((tile) => {
    if (settlementId && tile.ownerSettlementId !== settlementId && tile.controlledBySettlementId !== settlementId) {
      return false;
    }

    return getBuildingDefinitionForTile(tile)?.key === 'house';
  });
}

function getCurrentSettlementOrigin() {
  const settlementId = currentPlayerSettlementId.value;
  const townCenter = getSettlementTownCenterTile(Object.values(tileIndex), settlementId);
  return townCenter ? { q: townCenter.q, r: townCenter.r } : { q: 0, r: 0 };
}

function setStoryTerrainHint(id: string, kind: 'forest' | 'water', label: string, target: Tile) {
  setStoryTileHint({
    id,
    kind,
    q: target.q,
    r: target.r,
    label,
    createdAt: Date.now(),
  });
}

function syncStoryDiscoveryHint() {
  if (!runSnapshot.value) {
    clearStoryTileHint(FOREST_DISCOVERY_HINT_ID);
    clearStoryTileHint(WATER_DISCOVERY_HINT_ID);
    return;
  }

  const settlementId = currentPlayerSettlementId.value;
  const origin = getCurrentSettlementOrigin();
  const forestTarget = getForestDiscoveryHintTile(origin, undefined, settlementId);
  if (forestTarget) {
    clearStoryTileHint(WATER_DISCOVERY_HINT_ID);
    setStoryTerrainHint(FOREST_DISCOVERY_HINT_ID, 'forest', 'Forest nearby', forestTarget);
    return;
  }

  clearStoryTileHint(FOREST_DISCOVERY_HINT_ID);

  const waterTarget = hasBuiltHouse() ? getWaterDiscoveryHintTile(origin, undefined, settlementId) : null;
  if (waterTarget) {
    setStoryTerrainHint(WATER_DISCOVERY_HINT_ID, 'water', 'Water nearby', waterTarget);
    return;
  }

  clearStoryTileHint(WATER_DISCOVERY_HINT_ID);
}

function onWindowResize() {
  service.resize();
  updateContainerSize();
}

function onOrientationChange() {
  service.resize();
  updateContainerSize();
}

let rafId: number | null = null;
let rescueTimerId: ReturnType<typeof setTimeout> | null = null;
let lastClickTime = 0;
let lastMenuOpenTime = 0; // cooldown to avoid immediate close after open on mobile short taps
let lastPointerClient: { x: number; y: number } | null = null;
let pendingPathPreviewUpdate = false;
let lastPathPreviewComputeMs = 0;
let pendingMenuTimer: ReturnType<typeof setTimeout> | null = null;
let quickActionIgnoreCloseUntil = 0;

function cancelPendingMenu() {
  if (pendingMenuTimer !== null) {
    clearTimeout(pendingMenuTimer);
    pendingMenuTimer = null;
  }
}

// Cap canvas rendering separately from simulation; rAF still limits lower-refresh displays.
let lastDrawTime = 0;
const FRAME_INTERVAL_TOLERANCE_MS = 0.5;
const RESCUE_TIMER_INTERVAL_MS = 8;
const HIDDEN_RESCUE_TIMER_INTERVAL_MS = 250;

function clearPathPreview() {
  pathCoords.value = [];
  pathPreviewState.value = null;
  pendingPathPreviewUpdate = false;
}

function getTileKey(tile: Tile) {
  return `${tile.q},${tile.r}`;
}

function getPreviewSourceKey(hero: Hero) {
  return `${hero.q},${hero.r}:${hero.movement ? 'moving' : 'idle'}`;
}

function hasMatchingPathPreview(hero: Hero, tile: Tile) {
  return pathPreviewState.value?.heroId === hero.id
    && pathPreviewState.value.targetKey === getTileKey(tile)
    && pathPreviewState.value.sourceKey === getPreviewSourceKey(hero);
}

function isActiveStoryHintTile(tile: Tile) {
  return getActiveStoryTileHints.value.some((hint) => hint.q === tile.q && hint.r === tile.r)
    || tutorialMapHints.value.some((hint) => (
      hint.action === 'explore'
      && hint.q === tile.q
      && hint.r === tile.r
    ));
}

function setPathPreview(path: { q: number; r: number }[], hero: Hero, tile: Tile, nowMs: number = Date.now()) {
  pathCoords.value = path;
  pathPreviewState.value = {
    heroId: hero.id,
    targetKey: getTileKey(tile),
    sourceKey: getPreviewSourceKey(hero),
  };
  pendingPathPreviewUpdate = false;
  lastPathPreviewComputeMs = nowMs;
}

function getControlledUndiscoveredHintStep(target: Tile, hero: Hero): Tile | null {
  const frontierTiles = listUndiscoveredFrontierTiles();
  let best: { tile: Tile; distanceToTarget: number; distanceFromHero: number } | null = null;

  for (const candidate of frontierTiles) {
    if (candidate.discovered) {
      continue;
    }

    if (!isPositionInCurrentPlayerTerritory(candidate.q, candidate.r)) {
      continue;
    }

    const accessTile = findNearestTaskAccessTile('explore', candidate, hero.q, hero.r, hero.settlementId ?? null);
    if (!accessTile) {
      continue;
    }

    const canReachAccess = accessTile.q === hero.q && accessTile.r === hero.r
      || findMovementPathForHero(hero, accessTile, 'explore').length > 0;
    if (!canReachAccess) {
      continue;
    }

    const distanceToTarget = pathService.axialDistance(candidate.q, candidate.r, target.q, target.r);
    const distanceFromHero = pathService.axialDistance(hero.q, hero.r, candidate.q, candidate.r);
    if (
      !best
      || distanceToTarget < best.distanceToTarget
      || (distanceToTarget === best.distanceToTarget && distanceFromHero < best.distanceFromHero)
      || (distanceToTarget === best.distanceToTarget && distanceFromHero === best.distanceFromHero && candidate.id.localeCompare(best.tile.id) < 0)
    ) {
      best = { tile: candidate, distanceToTarget, distanceFromHero };
    }
  }

  return best?.tile ?? null;
}

function buildStoryHintExplorationRoute(
  taskTile: Tile,
  hero: Hero,
) {
  const accessTile = findNearestTaskAccessTile('explore', taskTile, hero.q, hero.r, hero.settlementId ?? null) ?? taskTile;
  const path = (accessTile.q === hero.q && accessTile.r === hero.r)
    ? []
    : findMovementPathForHero(hero, accessTile, 'explore');

  if (accessTile.q !== hero.q || accessTile.r !== hero.r) {
    if (!path.length) {
      return null;
    }
  }

  return { taskTile, accessTile, path };
}

function getStoryHintExplorationRoute(target: Tile, hero: Hero) {
  if (target.discovered) {
    return null;
  }

  if (isPositionInCurrentPlayerTerritory(target.q, target.r)) {
    const directRoute = buildStoryHintExplorationRoute(target, hero);
    if (directRoute) {
      return directRoute;
    }
  }

  const taskTile = getControlledUndiscoveredHintStep(target, hero);
  if (!taskTile) {
    return null;
  }

  return buildStoryHintExplorationRoute(taskTile, hero);
}

function requestSelectedHeroExploreStoryHint(target: Tile, source = 'map-click') {
  const isStoryHintSource = source === 'story-hint';
  const selHero = getSelectedHero();
  const selectedHeroControllable = selHero ? canControlHero(selHero.id, currentPlayerId.value) : false;

  if (!isStoryHintSource && !isActiveStoryHintTile(target)) {
    return false;
  }

  if (!selHero) {
    return false;
  }

  if (!selectedHeroControllable) {
    if (isStoryHintSource) {
      addNotification({
        type: 'coop_state',
        title: `${selHero.name} is occupied`,
        message: `${getHeroOwnerName(selHero.id) ?? 'Another player'} has claimed this hero.`,
        duration: 3000,
      });
    }
    return false;
  }

  const route = getStoryHintExplorationRoute(target, selHero);

  if (!route) {
    if (isStoryHintSource) {
      addNotification({
        type: 'coop_state',
        title: 'No route to hint',
        message: 'No reachable frontier tile could be found for this explore target.',
        duration: 3500,
      });
    }
    return false;
  }

  if (showTaskMenu.value) {
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
  }
  closeTownCenterPanel();

  setPathPreview(route.path, selHero, target);
  const exploreTarget = { q: target.q, r: target.r };
  if (route.accessTile.q === selHero.q && route.accessTile.r === selHero.r) {
    startTaskRequest(selHero.id, 'explore', { q: route.taskTile.q, r: route.taskTile.r }, exploreTarget);
  } else {
    detachHeroFromCurrentTask(selHero);
    requestHeroMovement(selHero.id, route.path, route.accessTile, 'explore', route.taskTile, exploreTarget);
  }
  clearPathPreview();
  hoveredTile.value = target;
  return true;
}

function handleStoryHintPointerDown() {
  resetCameraPointerState(mouseDown);
}

function openTaskMenuForTile(tile: Tile, tasks: TaskDefinition[]) {
  closeQuickActionMenu();
  cancelPendingMenu();
  taskMenuTile.value = tile;
  availableTasks.value = tasks;
  showTaskMenu.value = true;
  openWindow(WINDOW_IDS.TASK_MENU);
  lastMenuOpenTime = Date.now();
}

function closeQuickActionMenu() {
  if (!quickActionMenu.value.visible && !quickActionMenu.value.tile) {
    return;
  }

  quickActionMenu.value = {
    visible: false,
    tile: null,
    continueTask: null,
    tasks: [],
    x: 0,
    y: 0,
  };
  if (!showTaskMenu.value) {
    hoveredTask.value = null;
  }
  computeTerrainCluster(null);
}

function getQuickActionPosition(clientX: number, clientY: number) {
  const el = container.value;
  const rect = el?.getBoundingClientRect();
  if (!rect) {
    return { x: clientX, y: clientY };
  }

  const maxX = Math.max(QUICK_ACTION_MENU_MARGIN, rect.width - QUICK_ACTION_MENU_WIDTH - QUICK_ACTION_MENU_MARGIN);
  const maxY = Math.max(QUICK_ACTION_MENU_MARGIN, rect.height - QUICK_ACTION_MENU_MAX_HEIGHT - QUICK_ACTION_MENU_MARGIN);
  return {
    x: Math.min(Math.max(clientX - rect.left, QUICK_ACTION_MENU_MARGIN), maxX),
    y: Math.min(Math.max(clientY - rect.top, QUICK_ACTION_MENU_MARGIN), maxY),
  };
}

function openQuickActionMenu(tile: Tile, tasks: TaskDefinition[], clientX: number, clientY: number) {
  cancelPendingMenu();
  if (showTaskMenu.value) {
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
  }

  const position = getQuickActionPosition(clientX, clientY);
  quickActionMenu.value = {
    visible: true,
    tile,
    continueTask: getContinuableTaskForTile(tile),
    tasks,
    x: position.x,
    y: position.y,
  };
  quickActionIgnoreCloseUntil = Date.now() + 300;
  hoveredTile.value = tile;
  hoveredHero.value = null;
  hoveredSettler.value = null;
}

function getQuickActionTasks(tile: Tile, hero: Hero) {
  const tasks = getAvailableTasks(tile, hero);
  const withWalk = !tasks.some((task) => task.key === 'walk') && isTileWalkable(tile)
    ? [
      ...tasks,
      {
        key: 'walk',
        label: 'Go here',
        canStart: (_tile: Tile, _hero: Hero) => true,
        requiredXp: (_distance: number) => 0,
        heroRate: (_hero: Hero, _tile: Tile) => 1,
      },
    ]
    : tasks;

  return withWalk
    .map((task, index) => ({ task, index }))
    .sort((a, b) => getQuickActionGroup(a.task) - getQuickActionGroup(b.task) || a.index - b.index)
    .map((entry) => entry.task);
}

function getQuickActionGroup(task: TaskDefinition) {
  if (task.key === 'walk') {
    return 2;
  }

  if (getBuildingDefinitionByTaskKey(task.key) || getUpgradeDefinitionByTaskKey(task.key)) {
    return 1;
  }

  return 0;
}

function getTileActionLabel(tile: Tile) {
  const building = getBuildingDefinitionForTile(tile);
  if (building) {
    return building.label;
  }

  if (tile.terrain === 'towncenter') {
    return 'Town Center';
  }

  const terrain = (tile.terrain ?? 'tile').replace(/_/g, ' ');
  return terrain.charAt(0).toUpperCase() + terrain.slice(1);
}

function getQuickActionGlyph(task: TaskDefinition) {
  if (task.key === 'walk') return '→';
  if (task.key === 'chopWood' || task.key === 'gatherTimber') return '⌓';
  if (task.key === 'fishAtDock') return '≈';
  if (task.key === 'explore') return '?';
  if (task.key.startsWith('build')) return '+';
  if (task.key.startsWith('upgrade')) return '↑';
  return '•';
}

function getContinuableTaskForTile(tile: Tile) {
  const tileTasks = taskStore.tasksByTile[tile.id];
  if (!tileTasks) return null;

  return Object.values(tileTasks)
    .map((taskId) => taskStore.taskIndex[taskId])
    .filter((task): task is TaskInstance => !!task && !task.completedMs && !!getTaskDefinition(task.type))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.createdMs - b.createdMs || a.type.localeCompare(b.type))
    [0] ?? null;
}

function getQuickActionContinueDefinition(task: TaskInstance) {
  return getTaskDefinition(task.type) ?? null;
}

function getQuickActionContinueLabel(task: TaskInstance) {
  return formatContinueTaskLabel(getQuickActionContinueDefinition(task), task.type);
}

function handleQuickActionHover(task: TaskDefinition | null) {
  hoveredTask.value = task;
}

function handleQuickActionContinueHover(task: TaskInstance) {
  handleQuickActionHover(getQuickActionContinueDefinition(task));
}

function requestSelectedHeroOpenTutorialTaskHint(hint: RenderedTileHint, target: Tile) {
  const selHero = getSelectedHero();
  const selectedHeroControllable = selHero ? canControlHero(selHero.id, currentPlayerId.value) : false;

  if (!selHero) {
    addNotification({
      type: 'run_state',
      title: 'Select a hero',
      message: 'Choose a hero before opening tutorial orders.',
      duration: 2800,
    });
    return false;
  }

  if (!selectedHeroControllable) {
    addNotification({
      type: 'coop_state',
      title: `${selHero.name} is occupied`,
      message: `${getHeroOwnerName(selHero.id) ?? 'Another player'} has claimed this hero.`,
      duration: 3000,
    });
    return false;
  }

  const tasks = getAvailableTasks(target, selHero);
  const hasRequestedTask = hint.taskKey
    ? tasks.some((task) => task.key === hint.taskKey)
    : tasks.length > 0;

  if (!hasRequestedTask) {
    addNotification({
      type: 'run_state',
      title: 'Order unavailable',
      message: 'That order is no longer available on this tile.',
      duration: 3200,
    });
    return false;
  }

  closeTownCenterPanel();
  hoveredTile.value = target;
  openTaskMenuForTile(target, tasks);
  return true;
}

function handleMapHintPointerUp(hint: RenderedTileHint) {
  const wasCameraDrag = mouseDown.value && dragging;
  resetCameraPointerState(mouseDown);
  if (isPaused() || wasCameraDrag) {
    return;
  }

  const target = tileIndex[`${hint.q},${hint.r}`] ?? ensureTileExists(hint.q, hint.r);
  if (hint.action === 'open-task-menu') {
    requestSelectedHeroOpenTutorialTaskHint(hint, target);
    return;
  }

  requestSelectedHeroExploreStoryHint(target, 'story-hint');
}

function handlePointerMoveEvent(ev: Event) {
  const pointerEvent = ev as PointerEvent;
  lastPointerClient = { x: pointerEvent.clientX, y: pointerEvent.clientY };
  pointerMove(pointerEvent);
  updateHover(pointerEvent);
}

function handlePointerUpEvent(ev: Event) {
  const pointerEvent = ev as PointerEvent;
  lastPointerClient = { x: pointerEvent.clientX, y: pointerEvent.clientY };
  pointerUp();
  handleClick(pointerEvent);
  if (!showTaskMenu.value) updateHover(pointerEvent);
}

function handlePointerCancelEvent() {
  pointerCancel();
}

function handlePointerLeaveEvent() {
  pointerUp();
  lastPointerClient = null;
  hoveredTile.value = null;
  hoveredHero.value = null;
  hoveredSettler.value = null;
  clearPathPreview();
}

function shouldDrawFrame(frameNowMs: number) {
  const targetFps = getEffectiveMapTargetFps();
  const frameInterval = 1000 / targetFps;

  if (lastDrawTime === 0) {
    lastDrawTime = frameNowMs;
    return true;
  }

  const elapsedMs = frameNowMs - lastDrawTime;
  if (elapsedMs + FRAME_INTERVAL_TOLERANCE_MS < frameInterval) {
    return false;
  }

  lastDrawTime = elapsedMs > frameInterval * 4
    ? frameNowMs
    : lastDrawTime + frameInterval;
  return true;
}

function drawAnimationFrame(frameNowMs = performance.now()) {
  const movementNowMs = Date.now();
  const effectNowMs = sampleGameFeelTime(movementNowMs);
  const hitStopActive = isHitStopActive(movementNowMs);
  const cameraMoving = isCameraMoving();

  // Movement uses wall-clock time, but only needs sampling when a visual frame is drawn.
  if (shouldDrawFrame(frameNowMs)) {
    updateHeroMovements(movementNowMs);
    shipVisualNow.value = movementNowMs;

    if (!hitStopActive && lastPointerClient && !showTaskMenu.value && (isKeyboardNavigating() || cameraMoving)) {
      updateHoverAt(lastPointerClient.x, lastPointerClient.y);
    }

    if (!hitStopActive) {
      updatePath(false, movementNowMs);
    }

    service.draw({
      hoveredTile: hoveredTile.value,
      hoveredHero: hoveredHero.value,
      hoveredSettler: hoveredSettler.value,
      pathCoords: pathCoords.value,
      taskMenuTile: taskMenuTile.value,
      clusterBoundaryTiles: clusterBoundaryTiles.value,
      clusterTileIds: clusterTiles.value,
      globalReachBoundary: globalReachBoundary.value,
      globalReachTileIds: globalReachTileIds.value,
      globalReachColor: currentPlayerReachColor.value ?? undefined,
      globalReachDashed: getEffectiveSettlementBorderMode(getSettlementTownCenterTile(Object.values(tileIndex), currentPlayerSettlementId.value), seasonSnapshot.value) === 'open',
      settlementReachOutlines: settlementReachOutlines.value,
      storyHintTiles: mapHintTiles.value,
      sideQuestHeroes: sideQuestDistressHeroes.value,
      showSupportOverlay: showSupportOverlay.value,
      hoveredTileInReach: hoveredTile.value
        ? (hoveredTile.value.discovered
          ? isTileActive(hoveredTile.value)
          : isPositionInCurrentPlayerTerritory(hoveredTile.value.q, hoveredTile.value.r))
        : true,
    }, {
      effectNowMs,
      movementNowMs,
      perfNowMs: performance.now(),
    });
  }
}

function animationLoop(frameNowMs = performance.now()) {
  drawAnimationFrame(frameNowMs);
  rafId = requestAnimationFrame(animationLoop);
}

function rescueTimerLoop() {
  if (document.visibilityState === 'visible') {
    drawAnimationFrame(performance.now());
  }

  rescueTimerId = window.setTimeout(
    rescueTimerLoop,
    document.visibilityState === 'visible'
      ? RESCUE_TIMER_INTERVAL_MS
      : HIDDEN_RESCUE_TIMER_INTERVAL_MS,
  );
}

function startAnimationLoops() {
  if (rafId) cancelAnimationFrame(rafId);
  if (rescueTimerId !== null) {
    clearTimeout(rescueTimerId);
    rescueTimerId = null;
  }

  lastDrawTime = 0;
  animationLoop();

  if (shouldUseWindowsRescueTimer()) {
    rescueTimerId = window.setTimeout(rescueTimerLoop, RESCUE_TIMER_INTERVAL_MS);
  }
}

function stopAnimationLoops() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (rescueTimerId !== null) {
    clearTimeout(rescueTimerId);
    rescueTimerId = null;
  }
}

function getPathPreviewThrottleMs(hero: Hero, tile: Tile) {
  const distance = pathService.axialDistance(hero.q, hero.r, tile.q, tile.r);
  if (distance >= 34) return 90;
  if (distance >= 22) return 56;
  if (distance >= 12) return 28;
  return 0;
}

function updatePath(force = false, nowMs: number = Date.now()) {
  const hero = getSelectedHero();
  if (!hero || !canControlHero(hero.id, currentPlayerId.value)) {
    clearPathPreview();
    return;
  }

  if (!hoveredTile.value) {
    clearPathPreview();
    return;
  }

  if (!force) {
    if (!pendingPathPreviewUpdate && hasMatchingPathPreview(hero, hoveredTile.value)) {
      return;
    }

    const throttleMs = getPathPreviewThrottleMs(hero, hoveredTile.value);
    if ((nowMs - lastPathPreviewComputeMs) < throttleMs) {
      return;
    }
  }

  if (!hoveredTile.value.discovered) {
    const storyHintRoute = isActiveStoryHintTile(hoveredTile.value)
      ? getStoryHintExplorationRoute(hoveredTile.value, hero)
      : null;
    if (storyHintRoute) {
      setPathPreview(storyHintRoute.path, hero, hoveredTile.value, nowMs);
      return;
    }

    if (!isUndiscoveredFrontierTile(hoveredTile.value)) {
      setPathPreview([], hero, hoveredTile.value, nowMs);
      return;
    }

    const accessTile = findNearestTaskAccessTile('explore', hoveredTile.value, hero.q, hero.r, hero.settlementId ?? null) ?? hoveredTile.value;
    const previewPath = (accessTile.q === hero.q && accessTile.r === hero.r)
      ? []
      : findMovementPathForHero(hero, accessTile, 'explore');
    setPathPreview(previewPath, hero, hoveredTile.value, nowMs);
    return;
  }

  if (!isTileInCurrentPlayerTerritory(hoveredTile.value)) {
    setPathPreview([], hero, hoveredTile.value, nowMs);
    return;
  }

  setPathPreview(findMovementPathForHero(hero, hoveredTile.value), hero, hoveredTile.value, nowMs);
}

function handleTaskMenuClose() {
  cancelPendingMenu();
  const closedTile = taskMenuTile.value;
  const timeSinceOpen = Date.now() - lastMenuOpenTime;

  showTaskMenu.value = false;
  taskMenuTile.value = null;
  closeWindow(WINDOW_IDS.TASK_MENU);

  // The TaskMenu overlay stops pointer-event propagation, so the second click
  // of a double-click never reaches handleClick.  Detect the pattern here
  // instead: if the menu was closed very quickly after opening, the user
  // intended a quick tile action, not a task selection.
  if (closedTile && closedTile.discovered && timeSinceOpen < 400) {
    if (requestSelectedHeroJoinActiveTask(closedTile)) {
      return;
    }

    const selHero = getSelectedHero();
    if (selHero && canControlHero(selHero.id, currentPlayerId.value) && isTileInCurrentPlayerTerritory(closedTile)) {
      const goalTile = findNearestTaskAccessTile(null, closedTile, selHero.q, selHero.r, selHero.settlementId ?? null);
      if (goalTile) {
        closeTownCenterPanel();
        const path = findMovementPathForHero(selHero, goalTile);
        if (path.length) {
          detachHeroFromCurrentTask(selHero);
          requestHeroMovement(selHero.id, path, goalTile);
          clearPathPreview();
        }
        hoveredTile.value = closedTile;
        emit('tile-doubleclick', closedTile);
      }
    }
  }
}

function closeTownCenterPanel() {
  showTownCenterPanel.value = false;
  selectedTownCenterTileId.value = null;
  selectedBuildingDetailTileId.value = null;
  closeWindow(WINDOW_IDS.TOWN_CENTER_PANEL);
}

function openOwnSettlementPanel() {
  if (!currentPlayerSettlementId.value) {
    return;
  }

  showMilitaryHudPopup.value = false;
  selectedTownCenterTileId.value = currentPlayerSettlementId.value;
  selectedBuildingDetailTileId.value = null;
  showTownCenterPanel.value = true;
  openWindow(WINDOW_IDS.TOWN_CENTER_PANEL);
}

function toggleMilitaryHudPopup() {
  if (!militaryHudUnlocked.value || !militaryHud.value) {
    showMilitaryHudPopup.value = false;
    return;
  }

  showMilitaryHudPopup.value = !showMilitaryHudPopup.value;
}

function isInspectableBuildingTile(tile: Tile) {
  return !!getBuildingDefinitionForTile(tile) || isRoadTile(tile) || isBridgeTile(tile) || isTunnelTile(tile) || isRaidableMilitaryTarget(tile);
}

function getTileSettlementId(tile: Tile) {
  return getSettlementIdForTile(tile) ?? currentPlayerSettlementId.value;
}

function logTownCenterDebug(event: string, tile: Tile | null | undefined, extra: Record<string, unknown> = {}) {
  if (tile?.terrain !== 'towncenter') {
    return;
  }

  console.info('[driftlands:town-center-click]', event, {
    tileId: tile.id,
    q: tile.q,
    r: tile.r,
    terrain: tile.terrain,
    ownerSettlementId: tile.ownerSettlementId ?? null,
    controlledBySettlementId: tile.controlledBySettlementId ?? null,
    derivedSettlementId: getSettlementIdForTile(tile),
    currentPlayerSettlementId: currentPlayerSettlementId.value,
    shouldOpenRaidDetail: shouldOpenTownCenterRaidDetail(tile, currentPlayerSettlementId.value),
    showTownCenterPanel: showTownCenterPanel.value,
    selectedTownCenterTileId: selectedTownCenterTileId.value,
    selectedBuildingDetailTileId: selectedBuildingDetailTileId.value,
    ...extra,
  });
}

function openJobSiteDetailFromTile(tile: Tile) {
  logTownCenterDebug('open-detail-request', tile, {
    panelRefReady: !!townCenterPanel.value,
  });
  selectedTownCenterTileId.value = getTileSettlementId(tile);
  selectedBuildingDetailTileId.value = tile.id;
  showTownCenterPanel.value = true;
  openWindow(WINDOW_IDS.TOWN_CENTER_PANEL);
  void nextTick(() => {
    logTownCenterDebug('open-detail-next-tick', tile, {
      panelRefReady: !!townCenterPanel.value,
      selectedTownCenterTileId: selectedTownCenterTileId.value,
      selectedBuildingDetailTileId: selectedBuildingDetailTileId.value,
    });
    townCenterPanel.value?.openStandaloneBuildingDetail(tile.id);
  });
}

function getJoinableActiveTask(tile: Tile, hero: Hero): TaskInstance | null {
  const tileTasks = taskStore.tasksByTile[tile.id];
  if (!tileTasks) return null;

  return Object.values(tileTasks)
    .map((taskId) => taskStore.taskIndex[taskId])
    .filter((task): task is TaskInstance => {
      if (!task || !task.active || task.completedMs) return false;
      const definition = getTaskDefinition(task.type);
      return canStartTaskDefinition(definition, tile, hero);
    })
    .sort((a, b) => a.createdMs - b.createdMs || a.type.localeCompare(b.type))
    [0] ?? null;
}

function requestSelectedHeroJoinActiveTask(tile: Tile) {
  const selHero = getSelectedHero();
  if (!selHero || !tile.discovered || !canControlHero(selHero.id, currentPlayerId.value)) {
    return false;
  }

  const task = getJoinableActiveTask(tile, selHero);
  if (!task) {
    return false;
  }

  const accessTile = findNearestTaskAccessTile(task.type, tile, selHero.q, selHero.r, selHero.settlementId ?? null) ?? tile;
  const path = (accessTile.q === selHero.q && accessTile.r === selHero.r)
    ? []
    : findMovementPathForHero(selHero, accessTile, task.type);

  if (accessTile.q !== selHero.q || accessTile.r !== selHero.r) {
    if (!path.length) {
      return false;
    }
  }

  if (showTaskMenu.value) {
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
  }
  closeTownCenterPanel();
  detachHeroFromCurrentTask(selHero);
  requestHeroMovement(selHero.id, path, accessTile, task.type, tile);
  clearPathPreview();
  hoveredTile.value = tile;
  emit('tile-doubleclick', tile);
  return true;
}

function handleClick(e: PointerEvent) {
  if (e.type !== 'pointerup') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (isPaused()) return;
  if (dragged) return;

  const nowTs = Date.now();

  // ── Double-click on tile: send hero directly (skip task menu) ──
  // Detect before the menu guard so the second click isn't swallowed.
  const dblTile = service.pickTile(e.clientX, e.clientY);
  const isDoubleClick = (nowTs - lastClickTime) < 300;
  if (isDoubleClick && dblTile) {
    logTownCenterDebug('double-click-detected', dblTile, {
      selectedHeroId: getSelectedHero()?.id ?? null,
    });
    lastClickTime = 0; // consume
    cancelPendingMenu();
    if (requestSelectedHeroExploreStoryHint(dblTile)) {
      return;
    }
    if (requestSelectedHeroJoinActiveTask(dblTile)) {
      return;
    }
    const selHero = getSelectedHero();
    if (selHero && dblTile.discovered
      && canControlHero(selHero.id, currentPlayerId.value)) {
      // For non-walkable tiles (e.g. resources), resolve the nearest walkable neighbor
      const goalTile = findNearestTaskAccessTile(null, dblTile, selHero.q, selHero.r, selHero.settlementId ?? null);
      if (goalTile) {
        if (showTaskMenu.value) {
          showTaskMenu.value = false;
          taskMenuTile.value = null;
          closeWindow(WINDOW_IDS.TASK_MENU);
        }
        closeTownCenterPanel();
        const path = findMovementPathForHero(selHero, goalTile);
        if (path.length) {
          detachHeroFromCurrentTask(selHero);
          requestHeroMovement(selHero.id, path, goalTile);
          clearPathPreview();
        }
        hoveredTile.value = dblTile;
        emit('tile-doubleclick', dblTile);
        return;
      }
    }
    // No reachable goal — fall through to normal handling
  }

  if (quickActionMenu.value.visible) {
    if (nowTs < quickActionIgnoreCloseUntil) {
      return;
    }
    closeQuickActionMenu();
    return;
  }

  // If menu just opened, ignore further taps briefly to avoid flicker-close
  if (showTaskMenu.value && (nowTs - lastMenuOpenTime) < 250) {
    return;
  } else if (showTaskMenu.value) {
    // If menu is open, close it on any click outside
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
    return;
  }

  const hero = service.pickHero(e.clientX, e.clientY);
  if (hero && canControlHero(hero.id, currentPlayerId.value)) {
    closeTownCenterPanel();
    if (!isHeroClaimedByOtherPlayer(hero.id, currentPlayerId.value)) {
      requestHeroClaim(hero.id);
    }
    selectHero(hero, false);
    hoveredHero.value = hero;
    hoveredSettler.value = null;
    emit('hero-click', hero);
    return;
  }

  const settler = service.pickSettler(e.clientX, e.clientY);
  if (settler) {
    closeTownCenterPanel();
    hoveredHero.value = null;
    hoveredSettler.value = settler;
    openSettlerModal(settler);
    return;
  }

  hoveredSettler.value = null;

  const tile = service.pickTile(e.clientX, e.clientY);
  if (!tile) return;
  const selHero = getSelectedHero();
  logTownCenterDebug('single-click-picked', tile, {
    pointerX: e.clientX,
    pointerY: e.clientY,
    selectedHeroId: selHero?.id ?? null,
  });

  // Track click time for double-click detection (handled at top of function)
  lastClickTime = nowTs;
  hoveredTile.value = tile;
  emit('tile-click', tile);

  if (requestSelectedHeroExploreStoryHint(tile)) {
    return;
  }

  // Town center click — toggle the info panel or drop off goods
  if (tile.terrain === 'towncenter') {
    const selHero = getSelectedHero();
    if (shouldOpenTownCenterRaidDetail(tile, currentPlayerSettlementId.value)) {
      logTownCenterDebug('foreign-town-center-branch', tile);
      openJobSiteDetailFromTile(tile);
      return;
    }

    const isWorking = selHero && selHero.currentTaskId && isHeroWorkingTask(selHero, taskStore.taskIndex[selHero.currentTaskId]);
    const isCarrying = selHero && selHero.carryingPayload && selHero.carryingPayload.amount > 0;

    if (selHero && isCarrying && !isWorking) {
      const path = findMovementPathForHero(selHero, tile).slice();
      if (path.length > 0) {
        setPathPreview(path, selHero, tile);
        requestHeroMovement(selHero.id, path, tile);
        clearPathPreview();
        return;
      }
    }

    if (showTownCenterPanel.value && selectedTownCenterTileId.value === tile.id) {
      logTownCenterDebug('toggle-close-town-center-panel', tile);
      closeTownCenterPanel();
    } else {
      logTownCenterDebug('open-town-center-overview-branch', tile);
      selectedTownCenterTileId.value = tile.id;
      selectedBuildingDetailTileId.value = null;
      showTownCenterPanel.value = true;
      openWindow(WINDOW_IDS.TOWN_CENTER_PANEL);
    }
    return;
  }

  if (tile.discovered && isInspectableBuildingTile(tile)) {
    if (showTaskMenu.value) {
      showTaskMenu.value = false;
      taskMenuTile.value = null;
      closeWindow(WINDOW_IDS.TASK_MENU);
    }

    openJobSiteDetailFromTile(tile);
    return;
  }

  // Close town center panel when clicking elsewhere
  if (showTownCenterPanel.value) {
    closeTownCenterPanel();
  }

  if (!selHero) {
    selectHero(null, false);
    return;
  }

  if (!canControlHero(selHero.id, currentPlayerId.value)) {
    addNotification({
      type: 'coop_state',
      title: `${selHero.name} is occupied`,
      message: `${getHeroOwnerName(selHero.id) ?? 'Another player'} has claimed this hero.`,
      duration: 3000,
    });
    clearPathPreview();
    return;
  }

  if (!tile.discovered) {
    if (!isUndiscoveredFrontierTile(tile)) {
      if (requestSelectedHeroExploreStoryHint(tile)) {
        return;
      }
      clearPathPreview();
      return;
    }

    // Block actions on tiles outside reach
    if (!isPositionInCurrentPlayerTerritory(tile.q, tile.r)) {
      clearPathPreview();
      return;
    }

    const accessTile = findNearestTaskAccessTile('explore', tile, selHero.q, selHero.r, selHero.settlementId ?? null) ?? tile;
    const path = (accessTile.q === selHero.q && accessTile.r === selHero.r)
      ? []
      : findMovementPathForHero(selHero, accessTile, 'explore');
    setPathPreview(path, selHero, tile);

    if (accessTile.q === selHero.q && accessTile.r === selHero.r) {
      startTaskRequest(selHero.id, 'explore', { q: tile.q, r: tile.r });
      clearPathPreview();
      return;
    }

    if (path.length) {
      requestHeroMovement(selHero.id, path, accessTile, 'explore', tile);
      clearPathPreview();
      return;
    }

    clearPathPreview();
    return;
  }

  if (!isTileInCurrentPlayerTerritory(tile)) {
    addNotification({
      type: 'settlement',
      title: 'Closed border',
      message: 'This tile belongs outside your settlement reach.',
      duration: 2500,
    });
    clearPathPreview();
    return;
  }

  // Refresh available tasks for this tile & hero
  availableTasks.value = getAvailableTasks(tile, selHero);

  if (tile.discovered && availableTasks.value.length === 0 && selHero.carryingPayload && selHero.carryingPayload.amount > 0) {
    const carryBlockedTasks = listTaskDefinitions().filter((task) => (
      isTaskUnlockedForUse(task.key, selHero.settlementId)
      && canStartTaskDefinition(task, tile, selHero)
      && !canStartTaskWhileCarrying(selHero, task, tile)
    ));

    if (carryBlockedTasks.length > 0) {
      const highlightedTask = carryBlockedTasks.find((task) => task.key === 'buildWall') ?? carryBlockedTasks[0];
      addNotification({
        type: 'run_state',
        title: 'Hands full',
        message: `${selHero.name} is carrying ${selHero.carryingPayload.type}. Store it first to use ${highlightedTask?.label ?? 'this order'} here.`,
        duration: 3200,
      });
      clearPathPreview();
      return;
    }
  }

  // Task menu opening logic (no toggle auto-close; only explicit close or selecting other tile without tasks)
  if (tile.discovered && availableTasks.value.length > 0) {
    // If menu already open on this tile, keep it open (do nothing)
    if (!(showTaskMenu.value && taskMenuTile.value === tile)) {
      // Delay opening so a double-tap "go here" can cancel it before
      // the overlay steals pointer events from the second tap.
      cancelPendingMenu();
      const pendingTile = tile;
      const pendingTasks = availableTasks.value;
      pendingMenuTimer = setTimeout(() => {
        pendingMenuTimer = null;
        openTaskMenuForTile(pendingTile, pendingTasks);
      }, 200);
    }

    // Skip movement logic while menu pending or open
    return;
  } else if (showTaskMenu.value || pendingMenuTimer !== null) {
    // Close if switching to a tile without tasks
    cancelPendingMenu();
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
  }

  const canReusePreviewPath = hasMatchingPathPreview(selHero, tile) &&
    pathCoords.value.length > 0 &&
    pathCoords.value[pathCoords.value.length - 1]?.q === tile.q &&
    pathCoords.value[pathCoords.value.length - 1]?.r === tile.r;

  const path = canReusePreviewPath
    ? pathCoords.value.slice()
    : findMovementPathForHero(selHero, tile);

  if (path.length) {
    requestHeroMovement(selHero.id, path, tile, !tile.discovered ? 'explore' : undefined);
    clearPathPreview();
    return;
  }

  updatePath(true);
}

function handleQuickActionClick(def: TaskDefinition) {
  const tile = quickActionMenu.value.tile;
  if (!tile) {
    closeQuickActionMenu();
    return;
  }

  const hero = getSelectedHero();
  if (!hero) {
    addNotification({
      type: 'run_state',
      title: 'Select a hero',
      message: 'Choose a hero before issuing a quick order.',
      duration: 2800,
    });
    closeQuickActionMenu();
    return;
  }

  if (!canControlHero(hero.id, currentPlayerId.value)) {
    addNotification({
      type: 'coop_state',
      title: `${hero.name} is occupied`,
      message: `${getHeroOwnerName(hero.id) ?? 'Another player'} has claimed this hero.`,
      duration: 3000,
    });
    closeQuickActionMenu();
    return;
  }

  if (!isTileInCurrentPlayerTerritory(tile)) {
    addNotification({
      type: 'settlement',
      title: 'Closed border',
      message: 'This tile belongs outside your settlement reach.',
      duration: 2500,
    });
    closeQuickActionMenu();
    return;
  }

  const accessMode = getTaskAccessMode(def.key, tile);
  const accessTile = findNearestTaskAccessTile(def.key, tile, hero.q, hero.r, hero.settlementId ?? null);
  if (!accessTile) {
    addNotification({
      type: 'run_state',
      title: 'No route',
      message: 'No reachable approach tile was found for that quick order.',
      duration: 3000,
    });
    closeQuickActionMenu();
    return;
  }

  closeTownCenterPanel();

  if (hero.q === accessTile.q && hero.r === accessTile.r) {
    if (def.key !== 'walk') {
      startTaskRequest(hero.id, def.key, { q: tile.q, r: tile.r });
      emit('tile-click', tile);
    }
    closeQuickActionMenu();
    clearPathPreview();
    return;
  }

  const movementTaskType = def.key === 'walk' ? undefined : def.key;
  const path = findMovementPathForHero(hero, accessTile, movementTaskType);
  if (!path.length) {
    addNotification({
      type: 'run_state',
      title: 'No route',
      message: 'Your selected hero cannot reach that quick order yet.',
      duration: 3000,
    });
    closeQuickActionMenu();
    return;
  }

  detachHeroFromCurrentTask(hero);
  requestHeroMovement(
    hero.id,
    path,
    accessTile,
    movementTaskType,
    movementTaskType && accessMode !== 'tile' ? tile : undefined,
  );
  hoveredTile.value = tile;
  emit('tile-click', tile);
  closeQuickActionMenu();
  clearPathPreview();
}

function handleQuickActionContinueClick(task: TaskInstance) {
  const definition = getQuickActionContinueDefinition(task);
  if (!definition) {
    closeQuickActionMenu();
    return;
  }

  handleQuickActionClick(definition);
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  if (isPaused() || isKeyboardBlocked.value) {
    closeQuickActionMenu();
    return;
  }

  const tile = service.pickTile(e.clientX, e.clientY);
  if (!tile) {
    closeQuickActionMenu();
    return;
  }

  const selectedHero = getSelectedHero();
  if (!selectedHero) {
    addNotification({
      type: 'run_state',
      title: 'Select a hero',
      message: 'Choose a hero before opening quick actions.',
      duration: 2800,
    });
    closeQuickActionMenu();
    return;
  }

  if (!tile.discovered || !isTileInCurrentPlayerTerritory(tile)) {
    closeQuickActionMenu();
    return;
  }

  const tasks = getQuickActionTasks(tile, selectedHero);
  const continueTask = getContinuableTaskForTile(tile);
  if (!tasks.length && !continueTask) {
    closeQuickActionMenu();
    return;
  }

  openQuickActionMenu(tile, tasks, e.clientX, e.clientY);
}

function handleQuickActionKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !quickActionMenu.value.visible) {
    return;
  }

  e.preventDefault();
  closeQuickActionMenu();
}

function updateHoverAt(clientX: number, clientY: number) {
  if (isPaused() || showTaskMenu.value || quickActionMenu.value.visible) {
    hoveredTile.value = null;
    hoveredHero.value = null;
    hoveredSettler.value = null;
    clearPathPreview();
    return;
  }

  const hero = service.pickHero(clientX, clientY);
  if (hero && canControlHero(hero.id, currentPlayerId.value)) {
    hoveredHero.value = hero;
    hoveredSettler.value = null;
    hoveredTile.value = null;
    clearPathPreview();
    return;
  }

  const settler = service.pickSettler(clientX, clientY);
  if (settler) {
    hoveredHero.value = null;
    hoveredSettler.value = settler;
    hoveredTile.value = null;
    clearPathPreview();
    return;
  }

  hoveredHero.value = null;
  hoveredSettler.value = null;
  const tile = service.pickTile(clientX, clientY);
  if (tile !== hoveredTile.value) hoveredTile.value = tile;
}

function updateHover(e: PointerEvent) {
  updateHoverAt(e.clientX, e.clientY);
}

watch(selectedHeroId, () => {
  pendingPathPreviewUpdate = true;
  updatePath(true);
});

// Adjust facing: look towards first step in current path preview (if any), rather than final hovered tile.
watch([pathCoords, selectedHeroId], () => {
  if (!selectedHeroId.value) return;
  const hero = heroes.find(h => h.id === selectedHeroId.value);
  if (!hero || hero.movement) return; // do not override while moving
  const first = pathCoords.value[0];
  if (!first) return; // no path -> keep current facing
  const dq = first.q - hero.q;
  const dr = first.r - hero.r;
  if (dq === 0 && dr === 0) return;
  let facing: 'up' | 'down' | 'left' | 'right' = hero.facing;
  if (dr < 0) facing = 'up';
  else if (dr > 0) facing = 'down';
  else if (dq > 0) facing = 'right';
  else if (dq < 0) facing = 'left';
  if (facing !== hero.facing) updateHeroFacing(hero.id, facing);
});

function updateContainerSize() {
  const el = container.value;
  if (!el) return;
  containerSize.value = {width: el.clientWidth, height: el.clientHeight};
}

function computeTerrainCluster(base: Tile | null) {

  clusterBoundaryTiles.value = [];
  clusterTiles.value.clear();

  if (!base || !base.discovered || !base.terrain) return;

  // only if hoveredTask has chainAdjacentSameTerrain
  if (!hoveredTask.value) return;
  if (!hoveredTask.value.chainAdjacentSameTerrain) return;

  if (typeof hoveredTask.value.chainAdjacentSameTerrain === 'function') {
    if (!hoveredTask.value.chainAdjacentSameTerrain(base)) return;
  }

  const terrain = base.terrain;
  const maxSize = 500; // safety cap
  const queue: Tile[] = [base];
  const visited = new Set<string>();
  while (queue.length && visited.size < maxSize) {
    const t = queue.shift()!;
    if (!t.discovered || t.terrain !== terrain) continue;
    if (visited.has(t.id)) continue;
    visited.add(t.id);
    clusterTiles.value.add(t.id);
    const nm = t.neighbors ?? ensureTileExists(t.q, t.r).neighbors ?? undefined;
    if (nm) {
      for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        const nt = nm[side];
        if (nt.discovered && nt.terrain === terrain && !visited.has(nt.id)) queue.push(nt);
      }
    }
  }
  for (const id of clusterTiles.value) {
    const baseTile = tileIndex[id];
    if (!baseTile) continue;
    const nm = baseTile.neighbors ?? ensureTileExists(baseTile.q, baseTile.r).neighbors!;
    let isBoundary = false;
    for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
      const nt = nm[side];
      if (!nt.discovered || nt.terrain !== terrain || !clusterTiles.value.has(nt.id)) {
        isBoundary = true;
        break;
      }
    }
    if (isBoundary) clusterBoundaryTiles.value.push(baseTile);
  }
}

watch([taskMenuTile, () => quickActionMenu.value.tile, hoveredTask], () => {
  // Recompute cluster when task menu tile changes
  computeTerrainCluster(taskMenuTile.value ?? quickActionMenu.value.tile);
});

watch(isKeyboardBlocked, (blocked) => {
  if (blocked) {
    closeQuickActionMenu();
  }
});

watch([runVersion, worldVersion], () => {
  syncStoryDiscoveryHint();
}, { immediate: true });

function handleTaskHover(task: TaskDefinition | null) {
  hoveredTask.value = task;
}

function getKnownSettlementMarkers() {
  const markersBySettlementId = new Map<string, SettlementStartMarker>();

  for (const marker of settlementStartMarkers.value) {
    markersBySettlementId.set(marker.settlementId, { ...marker });
  }

  for (const player of getPlayerEntities.value) {
    if (!player.settlementId) {
      continue;
    }

    const existing = markersBySettlementId.get(player.settlementId);
    const separatorIndex = player.settlementId.indexOf(',');
    const q = existing?.q ?? Number(player.settlementId.slice(0, separatorIndex));
    const r = existing?.r ?? Number(player.settlementId.slice(separatorIndex + 1));
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      continue;
    }

    markersBySettlementId.set(player.settlementId, {
      settlementId: player.settlementId,
      q,
      r,
      playerId: player.id,
      playerName: player.nickname,
      playerColor: player.color,
    });
  }

  return Array.from(markersBySettlementId.values());
}

/** Recompute the always-visible settlement reach outlines. Cached for 2s. */
function recomputeGlobalReach(force = false) {
  const now = Date.now();
  if (!force && now - lastGlobalReachComputeMs < 2000) return;
  lastGlobalReachComputeMs = now;

  if (force) {
    clearReachCache();
  }

  const ownReach = getCachedReach(currentPlayerSettlementId.value || '');
  globalReachTileIds.value = ownReach.reach;
  globalReachBoundary.value = ownReach.boundary;

  settlementReachOutlines.value = getKnownSettlementMarkers()
    .map((settlement) => {
      const cached = getCachedReach(settlement.settlementId);
      const townCenterTile = tileIndex[settlement.settlementId];
      return {
        boundary: cached.boundary,
        tileIds: cached.reach,
        color: settlement.playerColor,
        isOwn: settlement.settlementId === currentPlayerSettlementId.value,
        dashed: getEffectiveSettlementBorderMode(townCenterTile, seasonSnapshot.value) === 'open',
      };
    })
    .filter((outline) => outline.boundary.length > 0);

  updateRenderDebugState({
    settlementReachCount: settlementReachOutlines.value.length,
    settlementReachInfo: settlementReachOutlines.value.map(o => `${o.tileIds.size}t`).join(', '),
  });
}

function shouldIgnoreShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function handleSupportOverlayShortcut(event: KeyboardEvent) {
  if (event.repeat || shouldIgnoreShortcut(event)) {
    return;
  }

  if (event.code !== 'KeyV') {
    return;
  }

  event.preventDefault();
  showSupportOverlay.value = !showSupportOverlay.value;
}

watch(hoveredTile, (tile, previousTile) => {
  recomputeGlobalReach();

  if (!tile) {
    clearPathPreview();
    return;
  }

  if (!previousTile || previousTile.q !== tile.q || previousTile.r !== tile.r) {
    pendingPathPreviewUpdate = true;
  }
});

watch(populationVersion, () => {
  recomputeGlobalReach(true);
});

watch(worldVersion, () => {
  recomputeGlobalReach(true);
});

watch(currentPlayerSettlementId, () => {
  showMilitaryHudPopup.value = false;
  recomputeGlobalReach(true);
});

watch(militaryHudUnlocked, (unlocked) => {
  if (!unlocked) {
    showMilitaryHudPopup.value = false;
  }
});

watch(getPlayerEntities, () => {
  recomputeGlobalReach(true);
}, { deep: true });

watch(settlementStartMarkers, () => {
  recomputeGlobalReach(true);
}, { deep: true });

watch(() => [
  graphicsDiagnosticOverrideStore.canvasDpr,
  graphicsDiagnosticOverrideStore.desynchronizedCanvas,
], () => {
  service.resize();
  updateContainerSize();
});

watch(() => [
  graphicsDiagnosticOverrideStore.rescueTimer,
  graphicsDiagnosticOverrideStore.windowsPresentationSafeMode,
], () => {
  startAnimationLoops();
});

onMounted(async () => {
  if (!canvas.value || !container.value) return;

  // Pre-capture size so menus position correctly immediately
  updateContainerSize();
  await service.init(canvas.value, container.value);
  // Re-capture after init & next frame (handles potential layout shifts)
  updateContainerSize();
  requestAnimationFrame(updateContainerSize);
  // Compute initial global reach outline so it's visible immediately
  recomputeGlobalReach(true);
  // Ignore if modifier keys pressed to avoid interfering with shortcuts
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keydown', handleQuickActionKeydown);
  window.addEventListener('keydown', handleSupportOverlayShortcut);
  window.addEventListener('keyup', keyUp);
  const el = container.value;

  if (el) {
    el.addEventListener('pointerdown', pointerDown, {passive: false});
    el.addEventListener('pointermove', handlePointerMoveEvent, {passive: false});
    el.addEventListener('pointerup', handlePointerUpEvent, {passive: false});
    el.addEventListener('pointercancel', handlePointerCancelEvent, {passive: false});
    el.addEventListener('pointerleave', handlePointerLeaveEvent, {passive: false});
    el.addEventListener('contextmenu', handleContextMenu, {passive: false});
  }
  startAnimationLoops();
});

onBeforeUnmount(() => {
  stopAnimationLoops();
  cancelPendingMenu();
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('orientationchange', onOrientationChange);
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keydown', handleQuickActionKeydown);
  window.removeEventListener('keydown', handleSupportOverlayShortcut);
  window.removeEventListener('keyup', keyUp);
  const el = container.value;
  if (el) {
    el.removeEventListener('pointerdown', pointerDown as any);
    el.removeEventListener('pointermove', handlePointerMoveEvent as any);
    el.removeEventListener('pointerup', handlePointerUpEvent as any);
    el.removeEventListener('pointercancel', handlePointerCancelEvent as any);
    el.removeEventListener('pointerleave', handlePointerLeaveEvent as any);
    el.removeEventListener('contextmenu', handleContextMenu as any);
  }
  resetGameFeelState();
  service.destroy();
  stopCameraAnimation();
});

</script>

<style scoped>
.map-container {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain; /* existing */
}

.map-container canvas {
  filter: drop-shadow(0px 2px 5px rgba(0, 0, 0, 0.8)) drop-shadow(15px 35px 25px rgba(0, 0, 0, 0.4));
}

.quick-action-pop-enter-active {
  transition:
    opacity 90ms ease-out,
    transform 90ms cubic-bezier(0.2, 0.9, 0.28, 1.08);
}

.quick-action-pop-leave-active {
  transition:
    opacity 70ms ease-in,
    transform 70ms ease-in;
}

.quick-action-pop-enter-from,
.quick-action-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

.quick-action-pop-enter-to,
.quick-action-pop-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.quick-action-menu {
  position: absolute;
  z-index: 45;
  width: 224px;
  max-height: 300px;
  overflow: hidden;
  border: 1px solid rgba(236, 201, 128, 0.74);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(48, 35, 20, 0.96), rgba(28, 21, 15, 0.97)),
    radial-gradient(circle at top left, rgba(247, 195, 92, 0.2), transparent 62%);
  box-shadow:
    0 16px 34px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 237, 196, 0.18);
  color: #f9e7bd;
  pointer-events: auto;
  user-select: none;
}

.quick-action-menu__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0.52rem 0.62rem 0.45rem;
  border-bottom: 1px solid rgba(236, 201, 128, 0.26);
}

.quick-action-menu__kicker {
  color: #facc6b;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.quick-action-menu__tile {
  min-width: 0;
  color: rgba(255, 242, 214, 0.82);
  font-size: 0.72rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-action-menu__list {
  display: grid;
  gap: 0.18rem;
  max-height: 246px;
  overflow-y: auto;
  padding: 0.38rem;
}

.quick-action-menu__item {
  display: grid;
  grid-template-columns: 1.55rem minmax(0, 1fr);
  align-items: center;
  gap: 0.48rem;
  min-height: 2rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0.3rem 0.44rem;
  background: rgba(93, 65, 32, 0.32);
  color: #fff3cf;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.quick-action-menu__item:hover,
.quick-action-menu__item:focus-visible {
  border-color: rgba(250, 204, 107, 0.72);
  background: rgba(143, 98, 43, 0.62);
  outline: none;
}

.quick-action-menu__item--continue {
  border-color: rgba(134, 239, 172, 0.48);
  background:
    linear-gradient(180deg, rgba(40, 95, 58, 0.54), rgba(65, 51, 27, 0.46));
}

.quick-action-menu__item--continue:hover,
.quick-action-menu__item--continue:focus-visible {
  border-color: rgba(187, 247, 208, 0.82);
  background:
    linear-gradient(180deg, rgba(52, 132, 80, 0.68), rgba(101, 77, 34, 0.58));
}

.quick-action-menu__glyph {
  display: grid;
  place-items: center;
  width: 1.42rem;
  height: 1.42rem;
  border-radius: 6px;
  border: 1px solid rgba(250, 204, 107, 0.36);
  background: rgba(20, 13, 8, 0.38);
  color: #ffe3a0;
  font-size: 0.88rem;
  font-weight: 900;
  line-height: 1;
}

.quick-action-menu__label {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-size: 0.86rem;
  font-weight: 800;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-container-lite canvas {
  filter: none;
}

.map-container-settler-hover {
  cursor: pointer;
}

.military-hud-anchor {
  position: absolute;
  top: 4.5rem;
  right: 1rem;
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.military-hud-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.35);
  color: rgb(226, 232, 240);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: auto;
}

.military-hud-trigger--alert {
  border-color: rgba(251, 146, 60, 0.5);
  color: rgb(254, 215, 170);
}

.military-hud-trigger__badge {
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.25rem;
  border-radius: 9999px;
  background: rgba(194, 65, 12, 0.95);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.64rem;
}

.military-hud {
  min-width: 14rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.24);
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.35);
  backdrop-filter: blur(12px);
  color: rgb(226, 232, 240);
  pointer-events: auto;
}

.military-hud__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.military-hud__actions {
  display: flex;
  gap: 0.35rem;
}

.military-hud__kicker {
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.92);
}

.military-hud__title {
  font-size: 0.96rem;
  font-weight: 700;
  color: rgb(248, 250, 252);
}

.military-hud__button {
  border: 1px solid rgba(125, 211, 252, 0.26);
  background: rgba(8, 47, 73, 0.7);
  color: rgb(224, 242, 254);
  border-radius: 9999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.military-hud__button--ghost {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(30, 41, 59, 0.7);
  color: rgb(226, 232, 240);
}

.military-hud__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.75rem;
}

.military-hud__stat {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  padding: 0.42rem 0.5rem;
  border-radius: 0.7rem;
  background: rgba(30, 41, 59, 0.66);
}

.military-hud__value {
  font-size: 0.92rem;
  font-weight: 700;
  color: rgb(248, 250, 252);
}

.military-hud__label {
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.92);
}

.military-hud__status {
  margin-top: 0.7rem;
  font-size: 0.76rem;
  color: rgba(191, 219, 254, 0.95);
}

.military-hud__status--alert {
  color: rgb(253, 186, 116);
}

.military-hud__hint {
  margin-top: 0.55rem;
  font-size: 0.69rem;
  line-height: 1.35;
  color: rgba(191, 219, 254, 0.8);
  max-width: 18rem;
}

.coop-ping,
.story-tile-hint {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 30;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.45rem;
}

.story-tile-hint {
  pointer-events: auto;
  cursor: pointer;
}

.coop-ping {
  transform: translate(-50%, -130%);
}

.coop-ping-ring {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid rgba(103, 232, 249, 0.95);
  background: rgba(12, 74, 110, 0.45);
  box-shadow: 0 0 0 0 rgba(103, 232, 249, 0.55);
  animation: coop-ping-pulse 1.1s ease-out infinite;
}

.coop-ping-label {
  white-space: nowrap;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(103, 232, 249, 0.28);
  color: rgb(207, 250, 254);
  font-size: 0.67rem;
  letter-spacing: 0.04em;
}

.trading-ship-map-sprite {
  position: absolute;
  z-index: 8;
  width: 92px;
  height: 72px;
  border: 0;
  padding: 0;
  background: transparent;
  pointer-events: auto;
  cursor: pointer;
  transform-origin: center 62%;
  transition: opacity 180ms linear;
  filter: drop-shadow(0 8px 7px rgba(15, 23, 42, 0.24));
}

.trading-ship-map-sprite__frame {
  display: block;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}

.trading-ship-map-sprite--docked {
  filter: drop-shadow(0 8px 8px rgba(15, 23, 42, 0.28));
}

.trading-ship-map-sprite--departing {
  filter: drop-shadow(0 7px 7px rgba(15, 23, 42, 0.22));
}

.story-tile-hint-ring {
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 9999px;
  border: 2px solid rgba(125, 211, 252, 0.98);
  background: rgba(8, 47, 73, 0.58);
  box-shadow: 0 0 0 0 rgba(125, 211, 252, 0.58);
  animation: story-hint-pulse 1.05s ease-out infinite;
}

.story-tile-hint-label {
  white-space: nowrap;
  padding: 0.22rem 0.6rem;
  border-radius: 9999px;
  background: rgba(8, 47, 73, 0.9);
  border: 1px solid rgba(125, 211, 252, 0.38);
  color: rgb(224, 242, 254);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  position: absolute;
  bottom: calc(100% + 0.45rem);
}

.story-tile-hint--tutorial .story-tile-hint-ring {
  border-color: rgba(252, 211, 77, 0.98);
  background: rgba(120, 53, 15, 0.58);
  box-shadow: 0 0 0 0 rgba(252, 211, 77, 0.58);
  animation-name: tutorial-hint-pulse;
}

.story-tile-hint--tutorial .story-tile-hint-label {
  background: rgba(69, 26, 3, 0.9);
  border-color: rgba(252, 211, 77, 0.44);
  color: rgb(254, 243, 199);
}

.story-tile-hint--side_quest .story-tile-hint-ring {
  border-color: rgba(251, 146, 60, 0.98);
  background: rgba(124, 45, 18, 0.58);
  box-shadow: 0 0 0 0 rgba(251, 146, 60, 0.58);
  animation-name: side-quest-hint-pulse;
}

.story-tile-hint--side_quest .story-tile-hint-label {
  background: rgba(67, 20, 7, 0.92);
  border-color: rgba(251, 146, 60, 0.44);
  color: rgb(255, 237, 213);
}

@keyframes coop-ping-pulse {
  0% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 rgba(103, 232, 249, 0.55);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 16px rgba(103, 232, 249, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(103, 232, 249, 0);
  }
}

@keyframes story-hint-pulse {
  0% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 rgba(125, 211, 252, 0.58);
  }
  70% {
    transform: scale(1.12);
    box-shadow: 0 0 0 18px rgba(125, 211, 252, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(125, 211, 252, 0);
  }
}

@keyframes tutorial-hint-pulse {
  0% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 rgba(252, 211, 77, 0.58);
  }
  70% {
    transform: scale(1.12);
    box-shadow: 0 0 0 18px rgba(252, 211, 77, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(252, 211, 77, 0);
  }
}

@keyframes side-quest-hint-pulse {
  0% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 rgba(251, 146, 60, 0.56);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 18px rgba(251, 146, 60, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(251, 146, 60, 0);
  }
}
</style>
