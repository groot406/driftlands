import { broadcast } from '../messages/messageRouter';
import { generateFoundingExpeditionMission } from '../../../src/shared/goals/generator';
import type { GameplayEvent } from '../../../src/shared/gameplay/events';
import { tiles } from '../../../src/shared/game/world';
import { syncHeroRoster } from '../../../src/shared/game/state/heroStore';
import { getPopulationState } from '../../../src/shared/game/state/populationStore';
import type { ResourceType } from '../../../src/shared/game/types/Resource';
import { getDistanceToNearestTowncenter } from '../../../src/shared/game/worldQueries';
import type { CompletedMissionSnapshot, ObjectiveSnapshot, RunSnapshot } from '../../../src/shared/goals/types';
import type { RunUpdateMessage } from '../../../src/shared/protocol';
import type { StoryProgressionSnapshot } from '../../../src/shared/story/progression';
import { setStoryProgressionForMission } from '../../../src/shared/story/progressionState';

interface MissionBaselines {
  discoveredTiles: number;
  deliveredResources: Partial<Record<ResourceType, number>>;
  completedTasks: Record<string, number>;
  bonusScore: number;
}

interface RunMetrics {
  discoveredTiles: number;
  frontierDistance: number;
  population: number;
}

function cloneProgression(progression: StoryProgressionSnapshot): StoryProgressionSnapshot {
  return {
    missionNumber: progression.missionNumber,
    heroes: {
      available: progression.heroes.available.slice(),
      newlyUnlocked: progression.heroes.newlyUnlocked.slice(),
    },
    buildings: {
      available: progression.buildings.available.slice(),
      newlyUnlocked: progression.buildings.newlyUnlocked.slice(),
    },
    tasks: {
      available: progression.tasks.available.slice(),
      newlyUnlocked: progression.tasks.newlyUnlocked.slice(),
    },
    terrains: {
      available: progression.terrains.available.slice(),
      newlyUnlocked: progression.terrains.newlyUnlocked.slice(),
    },
  };
}

class RunState {
  private snapshot: RunSnapshot | null = null;
  private baseSeed: number = 0;
  private totalScore: number = 0;
  private bonusScore: number = 0;
  private deliveredResources: Partial<Record<ResourceType, number>> = {};
  private completedTasks: Record<string, number> = {};
  private baselines: MissionBaselines = {
    discoveredTiles: 0,
    deliveredResources: {},
    completedTasks: {},
    bonusScore: 0,
  };

  initialize(seed: number) {
    this.baseSeed = seed;
    this.totalScore = 0;
    this.bonusScore = 0;
    this.deliveredResources = {};
    this.completedTasks = {};
    this.baselines = {
      discoveredTiles: 0,
      deliveredResources: {},
      completedTasks: {},
      bonusScore: 0,
    };

    this.issueMission(1);
  }

  isReady() {
    return !!this.snapshot;
  }

  getSnapshot(): RunSnapshot | null {
    if (!this.snapshot) {
      return null;
    }

    return {
      ...this.snapshot,
      story: { ...this.snapshot.story },
      progression: cloneProgression(this.snapshot.progression),
      objectives: this.snapshot.objectives.map((objective) => ({ ...objective })),
      mutator: { ...this.snapshot.mutator },
      lastCompletedMission: this.snapshot.lastCompletedMission
        ? {
            ...this.snapshot.lastCompletedMission,
            story: { ...this.snapshot.lastCompletedMission.story },
            mutator: { ...this.snapshot.lastCompletedMission.mutator },
            objectives: this.snapshot.lastCompletedMission.objectives.map((objective) => ({ ...objective })),
          }
        : undefined,
    };
  }

  tick(_now: number) {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return;
    }
  }

  grantBonusScore(points: number) {
    if (!this.snapshot || this.snapshot.status !== 'active' || points <= 0) {
      return;
    }

    this.bonusScore += points;
    this.recomputeProgress();
  }

  recordEvent(event: GameplayEvent) {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return;
    }

    switch (event.type) {
      case 'resource:delivered':
        this.deliveredResources[event.resourceType] =
          (this.deliveredResources[event.resourceType] ?? 0) + event.amount;
        break;
      case 'task:completed':
        this.completedTasks[event.taskType] = (this.completedTasks[event.taskType] ?? 0) + 1;
        break;
      case 'tile:discovered':
        break;
      default:
        return;
    }

    this.recomputeProgress();
  }

  private recomputeProgress(forceBroadcast: boolean = false) {
    if (!this.snapshot) {
      return;
    }

    const before = JSON.stringify(this.snapshot);
    const now = Date.now();
    const metrics = this.captureMetrics();

    for (const objective of this.snapshot.objectives) {
      const nextProgress = this.computeObjectiveProgress(objective, metrics);
      objective.progress = Math.min(objective.target, nextProgress);

      if (!objective.completed && nextProgress >= objective.target) {
        objective.completed = true;

        if (objective.reward?.scoreBonus) {
          this.bonusScore += objective.reward.scoreBonus;
        }
      }
    }

    if (
      this.snapshot.objectives.some((objective) => objective.required) &&
      this.snapshot.objectives.filter((objective) => objective.required).every((objective) => objective.completed)
    ) {
      this.completeCurrentMission(now);
      return;
    }

    if (this.snapshot.status === 'active') {
      this.snapshot.summary = this.snapshot.story.kicker;
    }
    this.snapshot.missionScore = this.computeMissionScore();
    this.snapshot.score = this.totalScore + this.snapshot.missionScore;

    if (forceBroadcast || before !== JSON.stringify(this.snapshot)) {
      this.broadcastUpdate();
    }
  }

  private computeObjectiveProgress(objective: ObjectiveSnapshot, metrics: RunMetrics) {
    switch (objective.kind) {
      case 'discover_tiles':
        return Math.max(0, metrics.discoveredTiles - this.baselines.discoveredTiles);
      case 'deliver_resource':
        if (!objective.resourceType) return 0;
        return Math.max(
          0,
          (this.deliveredResources[objective.resourceType] ?? 0) - (this.baselines.deliveredResources[objective.resourceType] ?? 0),
        );
      case 'complete_task':
        if (!objective.taskType) return 0;
        return Math.max(
          0,
          (this.completedTasks[objective.taskType] ?? 0) - (this.baselines.completedTasks[objective.taskType] ?? 0),
        );
      case 'reach_distance':
        return metrics.frontierDistance;
      case 'reach_population':
        return metrics.population;
      default:
        return 0;
    }
  }

  private captureMetrics(): RunMetrics {
    return {
      discoveredTiles: tiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length,
      frontierDistance: tiles.reduce((maxDistance, tile) => {
        if (!tile.discovered || !tile.terrain || tile.terrain === 'towncenter') {
          return maxDistance;
        }

        const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
        return Math.max(maxDistance, distance);
      }, 0),
      population: getPopulationState().current,
    };
  }

  private computeMissionScore() {
    if (!this.snapshot) {
      return 0;
    }

    const completedRequired = this.snapshot.objectives.filter((objective) => objective.required && objective.completed).length;
    const completedOptional = this.snapshot.objectives.filter((objective) => !objective.required && objective.completed).length;
    const deliveredTotal = Object.keys(this.deliveredResources).reduce((sum, key) => {
      const resourceType = key as ResourceType;
      const current = this.deliveredResources[resourceType] ?? 0;
      const baseline = this.baselines.deliveredResources[resourceType] ?? 0;
      return sum + Math.max(0, current - baseline);
    }, 0);
    const completedTaskTotal = Object.keys(this.completedTasks).reduce((sum, taskType) => {
      const current = this.completedTasks[taskType] ?? 0;
      const baseline = this.baselines.completedTasks[taskType] ?? 0;
      return sum + Math.max(0, current - baseline);
    }, 0);
    const earnedBonusScore = Math.max(0, this.bonusScore - this.baselines.bonusScore);

    return (completedRequired * 300) + (completedOptional * 150) + deliveredTotal + (completedTaskTotal * 25) + earnedBonusScore;
  }

  private completeCurrentMission(now: number) {
    if (!this.snapshot) {
      return;
    }

    this.snapshot.missionScore = this.computeMissionScore();
    this.snapshot.score = this.totalScore + this.snapshot.missionScore;

    const totalScoreAfterCompletion = this.totalScore + this.snapshot.missionScore;
    const completedMission: CompletedMissionSnapshot = {
      missionNumber: this.snapshot.missionNumber,
      completedAt: now,
      score: this.snapshot.missionScore,
      totalScore: totalScoreAfterCompletion,
      summary: this.snapshot.story.completionText,
      mutator: { ...this.snapshot.mutator },
      story: { ...this.snapshot.story },
      objectives: this.snapshot.objectives.map((objective) => ({ ...objective })),
    };

    this.totalScore = totalScoreAfterCompletion;
    this.issueMission(this.snapshot.missionNumber + 1, completedMission);
  }

  private issueMission(missionNumber: number, lastCompletedMission?: CompletedMissionSnapshot) {
    const metrics = this.captureMetrics();
    const blueprint = generateFoundingExpeditionMission(this.baseSeed, missionNumber, metrics.frontierDistance);
    const now = Date.now();

    setStoryProgressionForMission(missionNumber);
    syncHeroRoster(blueprint.progression.heroes.available);

    this.baselines = {
      discoveredTiles: metrics.discoveredTiles,
      deliveredResources: { ...this.deliveredResources },
      completedTasks: { ...this.completedTasks },
      bonusScore: this.bonusScore,
    };

    this.snapshot = {
      mode: blueprint.mode,
      modeLabel: blueprint.modeLabel,
      seed: this.baseSeed,
      missionNumber,
      missionsCompleted: missionNumber - 1,
      status: 'active',
      startedAt: now,
      score: this.totalScore,
      missionScore: 0,
      summary: blueprint.story.kicker,
      mutator: blueprint.mutator,
      story: { ...blueprint.story },
      progression: cloneProgression(blueprint.progression),
      objectives: blueprint.objectives.map((objective) => ({
        ...objective,
        progress: 0,
        completed: false,
      })),
      lastCompletedMission,
    };

    this.recomputeProgress(true);
  }

  private broadcastUpdate() {
    const run = this.getSnapshot();
    if (!run) {
      return;
    }

    broadcast({
      type: 'run:update',
      run,
      timestamp: Date.now(),
    } as RunUpdateMessage);
  }
}

export const runState = new RunState();
