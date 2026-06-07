import type { Hero } from '../../../src/core/types/Hero.ts';
import type { ResourceAmount } from '../../../src/core/types/Resource.ts';
import type { TaskType } from '../../../src/core/types/Task.ts';
import type { Tile } from '../../../src/core/types/Tile.ts';
import { resolveBuildingStateForTile } from '../../../src/shared/buildings/state.ts';
import { axialDistanceCoords } from '../../../src/shared/game/hex.ts';
import { heroes, upsertHero } from '../../../src/shared/game/state/heroStore.ts';
import { ensureTileExists, tileIndex, tiles } from '../../../src/shared/game/world.ts';
import type { GameplayEvent } from '../../../src/shared/gameplay/events.ts';
import type { HeroRosterUpdateMessage } from '../../../src/shared/protocol.ts';
import {
  getSideQuestDefinition,
  listSideQuestDefinitions,
} from '../../../src/shared/sideQuests/definitions.ts';
import { configureSideQuestTaskRuntime } from '../../../src/shared/sideQuests/taskRuntime.ts';
import type {
  SideQuestDefinition,
  SideQuestInstance,
  SideQuestObjectiveSnapshot,
  SideQuestRewardDefinition,
  SideQuestTriggerConditionDefinition,
} from '../../../src/shared/sideQuests/types.ts';
import { broadcast } from '../messages/messageRouter.ts';
import { playerSettlementState } from './playerSettlementState.ts';

interface ServerSideQuestStateSnapshot {
  instances: SideQuestInstance[];
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

function cloneResource(resource: ResourceAmount): ResourceAmount {
  return { ...resource };
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

function scoreCandidate(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
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

function getTileSettlementId(tile: Tile | null | undefined) {
  return tile?.ownerSettlementId ?? tile?.controlledBySettlementId ?? null;
}

function getHero(heroId: string | null | undefined): Hero | null {
  return heroId ? heroes.find((hero) => hero.id === heroId) ?? null : null;
}

function sideQuestInstanceId(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  return `${definition.id}:${settlementId ?? 'global'}`;
}

function sideQuestHeroRewardId(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  return `sidequest:${sideQuestInstanceId(definition, settlementId)}:${definition.npc.id}`;
}

function hasClaimedSideQuestHeroReward(definition: SideQuestDefinition, settlementId: string | null | undefined) {
  return definition.rewards.some((reward) => (
    reward.kind === 'hero'
    && heroes.some((hero) => hero.id === sideQuestHeroRewardId(definition, settlementId))
  ));
}

function resolveTimeLimitMs(definition: SideQuestDefinition) {
  const minutes = definition.timeLimit?.minutes ?? 0;
  return Math.max(0, minutes) * 60_000;
}

class ServerSideQuestState {
  private readonly state: ServerSideQuestStateSnapshot = {
    instances: [],
  };

  constructor() {
    configureSideQuestTaskRuntime({
      getActiveSideQuestForTask: this.getActiveSideQuestForTask.bind(this),
      getSideQuestRequiredResources: this.getSideQuestRequiredResources.bind(this),
    });
  }

  reset() {
    this.state.instances = [];
  }

  listInstances() {
    return this.state.instances;
  }

  syncSettlementSideQuests(settlementId: string | null | undefined) {
    if (!settlementId) {
      return;
    }

    this.expireOverdueSideQuests();

    for (const definition of listSideQuestDefinitions()) {
      if (!this.hasQuestInstanceForDefinition(definition, settlementId) && this.areTriggerConditionsMet(definition, settlementId)) {
        this.spawnSideQuest(definition, settlementId);
      }
    }

    this.revealDiscoveredSignalTiles(settlementId);
  }

  recordEvent(event: GameplayEvent) {
    this.expireOverdueSideQuests();

    if (event.type === 'tile:discovered') {
      const tile = tileIndex[event.tileId];
      this.syncSettlementSideQuests(getTileSettlementId(tile));
      return;
    }

    if (event.type !== 'task:completed') {
      return;
    }

    if (event.taskType === 'explore') {
      this.handleExploreCompleted(event);
    }

    this.progressTaskObjectives(event);
  }

  getActiveSideQuestForTask(tileId: string, taskType: TaskType) {
    this.expireOverdueSideQuests();
    this.ensureQuestForTaskTile(tileId, taskType);

    return this.state.instances.find((quest) => {
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

  getSideQuestRequiredResources(tileId: string, taskType: TaskType) {
    const quest = this.getActiveSideQuestForTask(tileId, taskType);
    const definition = quest ? getSideQuestDefinition(quest.definitionId) : null;
    return definition?.requiredResources?.map(cloneResource) ?? [];
  }

  private hasQuestInstanceForDefinition(definition: SideQuestDefinition, settlementId: string | null | undefined) {
    return hasClaimedSideQuestHeroReward(definition, settlementId)
      || this.state.instances.some((quest) => (
        quest.definitionId === definition.id
        && (quest.spawnSettlementId ?? null) === (settlementId ?? null)
      ));
  }

  private countSettlementBuildings(buildingKey: string, settlementId: string | null | undefined) {
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

  private isTriggerConditionMet(condition: SideQuestTriggerConditionDefinition, settlementId: string | null | undefined) {
    switch (condition.kind) {
      case 'building_count_at_least':
        return this.countSettlementBuildings(condition.buildingKey, settlementId) >= condition.amount;
      default:
        return false;
    }
  }

  private areTriggerConditionsMet(definition: SideQuestDefinition, settlementId: string | null | undefined) {
    return (definition.trigger?.conditions ?? []).every((condition) => this.isTriggerConditionMet(condition, settlementId));
  }

  private findSignalTile(
    definition: SideQuestDefinition,
    settlementId: string | null | undefined,
    options: { includeDiscovered?: boolean } = {},
  ) {
    const origin = findSettlementOrigin(settlementId);
    const candidates = listRingCoordinates(origin, definition.signal.minDistance, definition.signal.maxDistance)
      .filter((candidate) => {
        if (options.includeDiscovered) {
          return true;
        }

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

  private spawnSideQuest(definition: SideQuestDefinition, settlementId: string | null | undefined, tile?: Tile | null) {
    if (hasClaimedSideQuestHeroReward(definition, settlementId)) {
      return null;
    }

    const signalTile = tile ?? this.findSignalTile(definition, settlementId);
    if (!signalTile) {
      return null;
    }

    const instance: SideQuestInstance = {
      id: sideQuestInstanceId(definition, settlementId),
      definitionId: definition.id,
      status: 'signaled',
      signalTileId: signalTile.id,
      q: signalTile.q,
      r: signalTile.r,
      spawnSettlementId: settlementId ?? null,
      ownerPlayerId: null,
      ownerSettlementId: null,
      discoveredByHeroId: null,
      objectives: createObjectiveSnapshots(definition),
      createdAt: Date.now(),
    };

    this.state.instances.push(instance);
    return instance;
  }

  private revealDiscoveredSignalTiles(settlementId: string | null | undefined) {
    for (const quest of this.state.instances) {
      if (
        quest.status !== 'signaled'
        || (quest.spawnSettlementId ?? null) !== (settlementId ?? null)
      ) {
        continue;
      }

      const tile = tileIndex[quest.signalTileId];
      if (tile?.discovered) {
        this.revealSideQuest(quest, null);
      }
    }
  }

  private ensureQuestForTaskTile(tileId: string, taskType: TaskType) {
    const tile = tileIndex[tileId];
    if (!tile) {
      return null;
    }

    const settlementId = getTileSettlementId(tile);
    if (settlementId) {
      this.syncSettlementSideQuests(settlementId);
    }

    let quest = this.state.instances.find((candidate) => candidate.signalTileId === tileId) ?? null;
    if (!quest) {
      quest = this.restoreQuestForDiscoveredSignal(tile, settlementId, taskType);
    }

    if (quest?.status === 'signaled' && tile.discovered) {
      this.revealSideQuest(quest, null);
    }

    return quest;
  }

  private restoreQuestForDiscoveredSignal(
    tile: Tile,
    settlementId: string | null | undefined,
    taskType: TaskType,
  ) {
    for (const definition of listSideQuestDefinitions()) {
      const hasTaskObjective = definition.objectives.some((objective) => (
        objective.kind === 'complete_task'
        && objective.taskType === taskType
      ));
      if (!hasTaskObjective || !this.areTriggerConditionsMet(definition, settlementId)) {
        continue;
      }
      if (hasClaimedSideQuestHeroReward(definition, settlementId)) {
        continue;
      }

      const expectedSignalTile = this.findSignalTile(definition, settlementId, { includeDiscovered: true });
      if (expectedSignalTile?.id !== tile.id) {
        continue;
      }

      let quest = this.state.instances.find((candidate) => (
        candidate.definitionId === definition.id
        && (candidate.spawnSettlementId ?? null) === (settlementId ?? null)
        && candidate.status === 'signaled'
      )) ?? null;

      if (quest) {
        quest.signalTileId = tile.id;
        quest.q = tile.q;
        quest.r = tile.r;
      } else {
        quest = this.spawnSideQuest(definition, settlementId, tile);
      }

      if (quest && tile.discovered) {
        this.revealSideQuest(quest, null);
      }
      return quest;
    }

    return null;
  }

  private resolveOwnerPlayerId(hero: Hero | null, settlementId: string | null | undefined) {
    if (hero?.playerId) {
      return hero.playerId;
    }

    return settlementId ? playerSettlementState.getSettlementOwner(settlementId)?.playerId ?? null : null;
  }

  private revealSideQuest(quest: SideQuestInstance, hero: Hero | null) {
    if (quest.status === 'completed' || quest.status === 'expired') {
      return;
    }

    if (quest.status === 'signaled') {
      quest.status = 'active';
      quest.revealedAt = Date.now();
      const definition = getSideQuestDefinition(quest.definitionId);
      if (definition) {
        this.assignQuestTimeLimit(quest, definition);
      }
    }

    const tile = tileIndex[quest.signalTileId];
    const ownerSettlementId = hero?.settlementId ?? quest.ownerSettlementId ?? getTileSettlementId(tile) ?? quest.spawnSettlementId ?? null;
    quest.discoveredByHeroId = hero?.id ?? quest.discoveredByHeroId ?? null;
    quest.ownerSettlementId = ownerSettlementId;
    quest.ownerPlayerId = this.resolveOwnerPlayerId(hero, ownerSettlementId) ?? quest.ownerPlayerId ?? null;
  }

  private handleExploreCompleted(event: Extract<GameplayEvent, { type: 'task:completed' }>) {
    const tile = tileIndex[event.tileId];
    const discoveringHero = event.participantIds.map(getHero).find((hero): hero is Hero => !!hero) ?? null;
    const settlementId = discoveringHero?.settlementId ?? getTileSettlementId(tile);
    if (settlementId) {
      this.syncSettlementSideQuests(settlementId);
    }

    let quest = this.state.instances.find((candidate) => (
      candidate.signalTileId === event.tileId
      && candidate.status !== 'completed'
    )) ?? null;

    if (!quest && tile) {
      for (const definition of listSideQuestDefinitions()) {
        if (!this.areTriggerConditionsMet(definition, settlementId)) {
          continue;
        }
        if (hasClaimedSideQuestHeroReward(definition, settlementId)) {
          continue;
        }

        const expectedSignalTile = this.findSignalTile(definition, settlementId, { includeDiscovered: true });
        if (expectedSignalTile?.id !== tile.id) {
          continue;
        }

        quest = this.spawnSideQuest(definition, settlementId, tile);
        break;
      }
    }

    if (quest) {
      this.revealSideQuest(quest, discoveringHero);
    }
  }

  private progressTaskObjectives(event: Extract<GameplayEvent, { type: 'task:completed' }>) {
    this.expireOverdueSideQuests();
    this.ensureQuestForTaskTile(event.tileId, event.taskType);

    for (const quest of this.state.instances) {
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
        this.completeSideQuest(quest);
      }
    }
  }

  private completeSideQuest(quest: SideQuestInstance) {
    if (quest.status === 'completed') {
      return;
    }

    const definition = getSideQuestDefinition(quest.definitionId);
    quest.status = 'completed';
    quest.completedAt = Date.now();

    if (!definition) {
      return;
    }

    for (const reward of definition.rewards) {
      this.applyReward(reward, quest);
    }
  }

  private applyReward(reward: SideQuestRewardDefinition, quest: SideQuestInstance) {
    switch (reward.kind) {
      case 'hero':
        this.grantQuestHero(quest);
        return;
    }
  }

  private grantQuestHero(quest: SideQuestInstance) {
    const definition = getSideQuestDefinition(quest.definitionId);
    if (!definition) {
      return;
    }

    const heroId = `sidequest:${quest.id}:${definition.npc.id}`;
    if (heroes.some((hero) => hero.id === heroId)) {
      return;
    }

    upsertHero({
      id: heroId,
      name: definition.npc.name,
      avatar: definition.npc.avatar,
      storyTemplateId: null,
      playerId: quest.ownerPlayerId ?? undefined,
      settlementId: quest.ownerSettlementId ?? quest.spawnSettlementId ?? null,
      q: quest.q,
      r: quest.r,
      stats: { xp: 100, hp: 100, atk: 8, spd: 1 },
      facing: 'down',
    });

    broadcast({
      type: 'hero:roster_update',
      heroes: heroes.map(cloneHeroForRoster),
    } satisfies HeroRosterUpdateMessage);
  }

  private assignQuestTimeLimit(quest: SideQuestInstance, definition: SideQuestDefinition) {
    const timeLimitMs = resolveTimeLimitMs(definition);
    if (timeLimitMs <= 0 || quest.expiresAt) {
      return;
    }

    quest.expiresAt = Date.now() + timeLimitMs;
  }

  private expireOverdueSideQuests() {
    for (const quest of this.state.instances) {
      if (quest.status !== 'active' || !quest.expiresAt || quest.expiresAt > Date.now()) {
        continue;
      }

      quest.status = 'expired';
      quest.expiredAt = Date.now();
    }
  }
}

export const serverSideQuestState = new ServerSideQuestState();
