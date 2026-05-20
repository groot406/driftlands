import { computed, reactive, watch } from 'vue';
import { ensureTileExists, tileIndex, tiles, worldVersion } from '../core/world.ts';
import { currentPlayerId } from '../core/socket.ts';
import type { Hero } from '../core/types/Hero.ts';
import type { TaskType } from '../core/types/Task.ts';
import type { DialogueEntrySnapshot } from '../shared/goals/types.ts';
import type { HeroRosterUpdateMessage } from '../shared/protocol.ts';
import { axialDistanceCoords } from '../shared/game/hex.ts';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime.ts';
import { onGameplayEvent, type GameplayEvent } from '../shared/gameplay/events.ts';
import { listSideQuestDefinitions, getSideQuestDefinition } from '../shared/sideQuests/definitions.ts';
import type {
  SideQuestDefinition,
  SideQuestInstance,
  SideQuestObjectiveSnapshot,
  SideQuestRewardDefinition,
  SideQuestTriggerConditionDefinition,
} from '../shared/sideQuests/types.ts';
import { resolveBuildingStateForTile } from '../shared/buildings/state.ts';
import { heroes, upsertHero } from './heroStore.ts';
import { addNotification } from './notificationStore.ts';
import { appendRunDialogueEntries, runSnapshot, runVersion } from './runStore.ts';
import { clearStoryTileHint, setStoryTileHint } from './storyHintStore.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';

interface SideQuestState {
  instances: SideQuestInstance[];
}

const SIDE_QUEST_HINT_PREFIX = 'sidequest:';

export const sideQuestState = reactive<SideQuestState>({
  instances: [],
});

export const activeSideQuests = computed(() => sideQuestState.instances.filter((quest) => quest.status !== 'completed'));

let initialized = false;
let stopEventListener: (() => void) | null = null;
let stopSignalWatcher: (() => void) | null = null;
let activeRunKey: string | null = null;
const triggerGateStateByKey = new Map<string, {
  conditionsMetAt: number;
  eligibleAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}>();

function hintIdForQuest(quest: Pick<SideQuestInstance, 'id'>) {
  return `${SIDE_QUEST_HINT_PREFIX}${quest.id}`;
}

function createObjectiveSnapshots(definition: SideQuestDefinition): SideQuestObjectiveSnapshot[] {
  return definition.objectives.map((objective) => ({
    id: objective.id,
    title: objective.title,
    description: objective.description,
    kind: objective.kind,
    progress: 0,
    target: objective.target,
    completed: false,
  }));
}

function findSettlementOrigin(settlementId: string | null | undefined) {
  if (settlementId) {
    const settlementTile = tileIndex[settlementId];
    if (settlementTile) {
      return { q: settlementTile.q, r: settlementTile.r };
    }
  }

  const discoveredTownCenter = Object.values(tileIndex)
    .find((tile) => tile.discovered && tile.terrain === 'towncenter');
  return discoveredTownCenter ? { q: discoveredTownCenter.q, r: discoveredTownCenter.r } : { q: 0, r: 0 };
}

function scoreCandidate(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function sideQuestGateKey(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  return `${activeRunKey ?? 'no-run'}:${definition.id}:${settlementId ?? 'global'}`;
}

function countSettlementBuildings(buildingKey: string, settlementId: string | null | undefined) {
  let count = 0;
  for (const tile of tiles) {
    if (
      settlementId
      && tile.ownerSettlementId !== settlementId
      && tile.controlledBySettlementId !== settlementId
      && tile.id !== settlementId
    ) {
      continue;
    }

    const buildingState = resolveBuildingStateForTile(tile);
    if (buildingState?.building.key === buildingKey) {
      count++;
    }
  }

  return count;
}

function isTriggerConditionMet(condition: SideQuestTriggerConditionDefinition, settlementId: string | null | undefined) {
  switch (condition.kind) {
    case 'building_count_at_least':
      return countSettlementBuildings(condition.buildingKey, settlementId) >= condition.amount;
    default:
      return false;
  }
}

function areTriggerConditionsMet(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  return (definition.trigger?.conditions ?? []).every((condition) => isTriggerConditionMet(condition, settlementId));
}

function resolveTriggerDelayMs(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  const delay = definition.trigger?.delayAfterConditionsMet;
  if (!delay) {
    return 0;
  }

  const minMinutes = Math.max(0, Math.min(delay.minMinutes, delay.maxMinutes));
  const maxMinutes = Math.max(0, Math.max(delay.minMinutes, delay.maxMinutes));
  if (maxMinutes <= minMinutes) {
    return minMinutes * 60_000;
  }

  const seed = `${activeRunKey ?? 'no-run'}:${definition.id}:${settlementId ?? 'global'}:trigger-delay`;
  const randomUnit = scoreCandidate(seed) / 0xffffffff;
  return (minMinutes + (maxMinutes - minMinutes) * randomUnit) * 60_000;
}

function clearTriggerGateTimer(key: string) {
  const gate = triggerGateStateByKey.get(key);
  if (gate?.timer) {
    clearTimeout(gate.timer);
    gate.timer = null;
  }
}

function clearTriggerGateState() {
  for (const key of triggerGateStateByKey.keys()) {
    clearTriggerGateTimer(key);
  }
  triggerGateStateByKey.clear();
}

function scheduleTriggerGateSync(key: string, delayMs: number) {
  const gate = triggerGateStateByKey.get(key);
  if (!gate || gate.timer || delayMs <= 0) {
    return;
  }

  gate.timer = setTimeout(() => {
    gate.timer = null;
    syncSideQuestSignals();
  }, delayMs);
}

function isDefinitionReadyToSpawn(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  if (!definition.trigger) {
    return true;
  }

  const key = sideQuestGateKey(definition, settlementId);
  if (!areTriggerConditionsMet(definition, settlementId)) {
    clearTriggerGateTimer(key);
    triggerGateStateByKey.delete(key);
    return false;
  }

  let gate = triggerGateStateByKey.get(key);
  if (!gate) {
    const conditionsMetAt = Date.now();
    gate = {
      conditionsMetAt,
      eligibleAt: conditionsMetAt + resolveTriggerDelayMs(definition, settlementId),
      timer: null,
    };
    triggerGateStateByKey.set(key, gate);
  }

  const remainingMs = gate.eligibleAt - Date.now();
  if (remainingMs > 0) {
    scheduleTriggerGateSync(key, remainingMs);
    return false;
  }

  clearTriggerGateTimer(key);
  return true;
}

function listRingCoordinates(origin: { q: number; r: number }, minDistance: number, maxDistance: number) {
  const coordinates: Array<{ q: number; r: number; distance: number }> = [];
  for (let dq = -maxDistance; dq <= maxDistance; dq++) {
    for (let dr = Math.max(-maxDistance, -dq - maxDistance); dr <= Math.min(maxDistance, -dq + maxDistance); dr++) {
      const q = origin.q + dq;
      const r = origin.r + dr;
      const distance = axialDistanceCoords(origin.q, origin.r, q, r);
      if (distance >= minDistance && distance <= maxDistance) {
        coordinates.push({ q, r, distance });
      }
    }
  }

  return coordinates;
}

function findSignalTile(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  const origin = findSettlementOrigin(settlementId);
  const candidates = listRingCoordinates(origin, definition.signal.minDistance, definition.signal.maxDistance)
    .filter((candidate) => {
      const existingTile = tileIndex[`${candidate.q},${candidate.r}`];
      return existingTile?.discovered !== true;
    })
    .sort((left, right) => {
      const leftScore = scoreCandidate(`${definition.id}:${settlementId ?? 'global'}:${left.q},${left.r}`);
      const rightScore = scoreCandidate(`${definition.id}:${settlementId ?? 'global'}:${right.q},${right.r}`);
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      return left.distance - right.distance || `${left.q},${left.r}`.localeCompare(`${right.q},${right.r}`);
    });

  const selected = candidates[0];
  return selected ? ensureTileExists(selected.q, selected.r) : null;
}

function hasQuestInstanceForDefinition(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  return sideQuestState.instances.some((quest) => (
    quest.definitionId === definition.id
    && (quest.spawnSettlementId ?? null) === (settlementId ?? null)
  ));
}

function spawnSideQuest(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  const tile = findSignalTile(definition, settlementId);
  if (!tile) {
    return null;
  }

  const id = `${definition.id}:${settlementId ?? 'global'}`;
  const instance: SideQuestInstance = {
    id,
    definitionId: definition.id,
    status: 'signaled',
    signalTileId: tile.id,
    q: tile.q,
    r: tile.r,
    spawnSettlementId: settlementId ?? null,
    ownerPlayerId: null,
    ownerSettlementId: null,
    discoveredByHeroId: null,
    objectives: createObjectiveSnapshots(definition),
    createdAt: Date.now(),
  };

  sideQuestState.instances.push(instance);
  return instance;
}

export function syncSideQuestSignals() {
  const settlementId = currentPlayerSettlementId.value;
  const runKey = runSnapshot.value ? `${runSnapshot.value.seed}:${runSnapshot.value.startedAt}` : null;
  if (runKey !== activeRunKey) {
    resetSideQuests();
    activeRunKey = runKey;
  }

  if (!runSnapshot.value || !settlementId) {
    for (const quest of sideQuestState.instances) {
      clearStoryTileHint(hintIdForQuest(quest));
    }
    return;
  }

  for (const definition of listSideQuestDefinitions()) {
    if (!hasQuestInstanceForDefinition(definition, settlementId) && isDefinitionReadyToSpawn(definition, settlementId)) {
      spawnSideQuest(definition, settlementId);
    }
  }

  for (const quest of sideQuestState.instances) {
    const hintId = hintIdForQuest(quest);
    clearStoryTileHint(hintId);
    if (quest.status !== 'signaled' || (quest.spawnSettlementId ?? null) !== settlementId) {
      continue;
    }

    const definition = getSideQuestDefinition(quest.definitionId);
    if (!definition) {
      continue;
    }

    setStoryTileHint({
      id: hintId,
      kind: 'side_quest',
      q: quest.q,
      r: quest.r,
      label: definition.signal.label,
      createdAt: quest.createdAt,
    });
  }
}

function getHero(heroId: string | null | undefined): Hero | null {
  return heroId ? heroes.find((hero) => hero.id === heroId) ?? null : null;
}

function getDiscoveringHero(participantIds: string[]) {
  for (const participantId of participantIds) {
    const hero = getHero(participantId);
    if (hero) {
      return hero;
    }
  }

  return null;
}

function appendQuestDialogue(quest: SideQuestInstance, phase: 'reveal' | 'complete') {
  const definition = getSideQuestDefinition(quest.definitionId);
  const chapterNumber = runSnapshot.value?.chapterNumber ?? 0;
  if (!definition || !runSnapshot.value) {
    return false;
  }

  const lines = definition.dialogue[phase];
  const entries: DialogueEntrySnapshot[] = lines.map((text, index) => ({
    id: `${quest.id}:${phase}:${index + 1}`,
    chapterNumber,
    kind: 'side_quest',
    speaker: {
      id: definition.npc.id,
      name: definition.npc.name,
      avatar: definition.npc.avatar,
      avatarSource: 'local',
    },
    text,
    createdAt: Date.now() + index,
  }));

  return appendRunDialogueEntries(entries);
}

function revealSideQuest(quest: SideQuestInstance, hero: Hero | null) {
  if (quest.status !== 'signaled') {
    return;
  }

  quest.status = 'active';
  quest.revealedAt = Date.now();
  quest.discoveredByHeroId = hero?.id ?? null;
  quest.ownerPlayerId = hero?.playerId ?? currentPlayerId.value ?? null;
  quest.ownerSettlementId = hero?.settlementId ?? quest.spawnSettlementId ?? null;
  clearStoryTileHint(hintIdForQuest(quest));

  const definition = getSideQuestDefinition(quest.definitionId);
  appendQuestDialogue(quest, 'reveal');
  addNotification({
    type: 'goal_completed',
    title: definition?.title ?? 'Side quest discovered',
    message: definition ? `${definition.npc.name} needs help at the signal site.` : 'A side quest has been discovered.',
    duration: 6000,
  });
}

function cloneHeroForRoster(hero: Hero): Hero {
  return {
    ...hero,
    stats: { ...hero.stats },
    movement: hero.movement
      ? {
          ...hero.movement,
          origin: { ...hero.movement.origin },
          target: { ...hero.movement.target },
          path: hero.movement.path.map((step) => ({ ...step })),
          stepDurations: hero.movement.stepDurations.slice(),
          cumulative: hero.movement.cumulative.slice(),
        }
      : undefined,
    pendingTask: hero.pendingTask ? { ...hero.pendingTask } : undefined,
    pendingExploreTarget: hero.pendingExploreTarget ? { ...hero.pendingExploreTarget } : undefined,
    scoutResourceIntent: hero.scoutResourceIntent ? { ...hero.scoutResourceIntent } : undefined,
    carryingPayload: hero.carryingPayload ? { ...hero.carryingPayload } : undefined,
    pendingChain: hero.pendingChain ? { ...hero.pendingChain } : undefined,
    returnPos: hero.returnPos ? { ...hero.returnPos } : undefined,
    delayedMovementTimer: undefined,
    currentOffset: undefined,
    lastSoundPosition: hero.lastSoundPosition ? { ...hero.lastSoundPosition } : undefined,
  };
}

function broadcastHeroRoster() {
  broadcast({
    type: 'hero:roster_update',
    heroes: heroes.map(cloneHeroForRoster),
  } as HeroRosterUpdateMessage);
}

function grantQuestHero(quest: SideQuestInstance) {
  const definition = getSideQuestDefinition(quest.definitionId);
  if (!definition) {
    return;
  }

  const heroId = `sidequest:${quest.id}:${definition.npc.id}`;
  upsertHero({
    id: heroId,
    name: definition.npc.name,
    avatar: definition.npc.avatar,
    storyTemplateId: null,
    playerId: quest.ownerPlayerId ?? currentPlayerId.value ?? undefined,
    settlementId: quest.ownerSettlementId ?? quest.spawnSettlementId ?? null,
    q: quest.q,
    r: quest.r,
    stats: { xp: 100, hp: 100, atk: 8, spd: 1 },
    facing: 'down',
  });
  broadcastHeroRoster();
}

function applyReward(reward: SideQuestRewardDefinition, quest: SideQuestInstance) {
  switch (reward.kind) {
    case 'hero':
      grantQuestHero(quest);
      return;
  }
}

function completeSideQuest(quest: SideQuestInstance) {
  if (quest.status === 'completed') {
    return;
  }

  const definition = getSideQuestDefinition(quest.definitionId);
  quest.status = 'completed';
  quest.completedAt = Date.now();
  clearStoryTileHint(hintIdForQuest(quest));

  if (definition) {
    for (const reward of definition.rewards) {
      applyReward(reward, quest);
    }

    appendQuestDialogue(quest, 'complete');
    addNotification({
      type: 'goal_completed',
      title: `${definition.title} complete`,
      message: definition.rewards.map((reward) => reward.label).join(', '),
      duration: 7000,
    });
  }
}

function progressTaskObjectives(event: Extract<GameplayEvent, { type: 'task:completed' }>) {
  for (const quest of sideQuestState.instances) {
    if (quest.status !== 'active') {
      continue;
    }

    const definition = getSideQuestDefinition(quest.definitionId);
    if (!definition) {
      continue;
    }

    for (const objectiveDefinition of definition.objectives) {
      if (objectiveDefinition.kind !== 'complete_task') {
        continue;
      }
      if (objectiveDefinition.taskType !== event.taskType) {
        continue;
      }
      if (objectiveDefinition.tileScope === 'quest_tile' && event.tileId !== quest.signalTileId) {
        continue;
      }

      const objective = quest.objectives.find((entry) => entry.id === objectiveDefinition.id);
      if (!objective || objective.completed) {
        continue;
      }

      objective.progress = Math.min(objective.target, objective.progress + 1);
      objective.completed = objective.progress >= objective.target;
    }

    if (quest.objectives.length > 0 && quest.objectives.every((objective) => objective.completed)) {
      completeSideQuest(quest);
    }
  }
}

function handleTaskCompleted(event: Extract<GameplayEvent, { type: 'task:completed' }>) {
  if (event.taskType === 'explore') {
    const quest = sideQuestState.instances.find((candidate) => (
      candidate.status === 'signaled'
      && candidate.signalTileId === event.tileId
    ));
    if (quest) {
      revealSideQuest(quest, getDiscoveringHero(event.participantIds));
    }
  }

  progressTaskObjectives(event);
}

function handleGameplayEvent(event: GameplayEvent) {
  if (event.type === 'task:completed') {
    handleTaskCompleted(event);
  }
}

export function initializeSideQuestRuntime() {
  if (initialized) {
    return;
  }

  initialized = true;
  stopEventListener = onGameplayEvent(handleGameplayEvent);
  stopSignalWatcher = watch(
    [runVersion, worldVersion, currentPlayerSettlementId],
    () => syncSideQuestSignals(),
    { immediate: true },
  );
}

export function teardownSideQuestRuntime() {
  stopEventListener?.();
  stopEventListener = null;
  stopSignalWatcher?.();
  stopSignalWatcher = null;
  clearTriggerGateState();
  initialized = false;
}

export function resetSideQuests() {
  for (const quest of sideQuestState.instances) {
    clearStoryTileHint(hintIdForQuest(quest));
  }
  sideQuestState.instances = [];
  clearTriggerGateState();
  activeRunKey = null;
}

export function getSideQuestAtTile(tileId: string) {
  return sideQuestState.instances.find((quest) => quest.signalTileId === tileId) ?? null;
}

export function getActiveSideQuestForTask(tileId: string, taskType: TaskType) {
  return sideQuestState.instances.find((quest) => {
    if (quest.status !== 'active' || quest.signalTileId !== tileId) {
      return false;
    }

    const definition = getSideQuestDefinition(quest.definitionId);
    return definition?.objectives.some((objective) => (
      objective.kind === 'complete_task'
      && objective.taskType === taskType
    )) === true;
  }) ?? null;
}

export function getSideQuestRequiredResources(tileId: string, taskType: TaskType) {
  const quest = getActiveSideQuestForTask(tileId, taskType);
  const definition = quest ? getSideQuestDefinition(quest.definitionId) : null;
  return definition?.requiredResources?.map((resource) => ({ ...resource })) ?? [];
}
