import { broadcast } from '../messages/messageRouter';
import { generateFoundingExpeditionMission } from '../../../src/shared/goals/generator';
import type { GameplayEvent } from '../../../src/shared/gameplay/events';
import { tiles } from '../../../src/shared/game/world';
import { syncHeroRoster } from '../../../src/shared/game/state/heroStore';
import { getPopulationState } from '../../../src/shared/game/state/populationStore';
import { getWorkforceSnapshot } from '../../../src/shared/game/state/jobStore';
import { resourceInventory } from '../../../src/shared/game/state/resourceStore';
import type { ResourceType } from '../../../src/shared/game/types/Resource';
import { getDistanceToNearestTowncenter } from '../../../src/shared/game/worldQueries';
import {
  type CompletedChapterSnapshot,
  type DialogueEntrySnapshot,
  type DialogueLogSnapshot,
  type DialogueSpeakerSnapshot,
  type ObjectiveSnapshot,
  type RunSnapshot,
} from '../../../src/shared/goals/types';
import type { RunUpdateMessage } from '../../../src/shared/protocol';
import {
  cloneStoryProgression,
  createInitialProgressionSnapshot,
  evaluateProgression,
  type BuildingKey,
  type ProgressionMetrics,
  type ProgressionNodeSnapshot,
  type ProgressionSnapshot,
} from '../../../src/shared/story/progression';
import { loadStoryProgression } from '../../../src/shared/story/progressionState';
import { getStoryHeroTemplate } from '../../../src/shared/story/heroRoster';
import { resolveBuildingStateForTile } from '../../../src/shared/buildings/state';

interface ChapterBaselines {
  discoveredTiles: number;
  deliveredResources: Partial<Record<ResourceType, number>>;
  completedTasks: Record<string, number>;
  restoredTiles: number;
  bonusScore: number;
}

interface RunMetrics {
  discoveredTiles: number;
  frontierDistance: number;
  population: number;
  activeTiles: number;
  inactiveTiles: number;
  restoredTiles: number;
}

const ADVISOR_SPEAKER: DialogueSpeakerSnapshot = {
  id: 'advisor',
  name: 'Chronicle',
  avatar: null,
};

function cloneObjectives(objectives: ObjectiveSnapshot[]) {
  return objectives.map((objective) => ({ ...objective }));
}

function cloneDialogueSpeaker(speaker: DialogueSpeakerSnapshot): DialogueSpeakerSnapshot {
  return {
    id: speaker.id,
    name: speaker.name,
    avatar: speaker.avatar ?? null,
  };
}

function cloneDialogueEntry(entry: DialogueEntrySnapshot): DialogueEntrySnapshot {
  return {
    ...entry,
    speaker: cloneDialogueSpeaker(entry.speaker),
  };
}

function cloneDialogue(dialogue: DialogueLogSnapshot): DialogueLogSnapshot {
  return {
    activeEntryId: dialogue.activeEntryId,
    entries: dialogue.entries.map(cloneDialogueEntry),
  };
}

function cloneCompletedChapter(chapter: CompletedChapterSnapshot): CompletedChapterSnapshot {
  return {
    ...chapter,
    mutator: { ...chapter.mutator },
    chapter: { ...chapter.chapter },
    objectives: cloneObjectives(chapter.objectives),
  };
}

function cloneProgression(progression: ProgressionSnapshot): ProgressionSnapshot {
  return cloneStoryProgression(progression);
}

function incrementRecordValue<T extends string>(record: Partial<Record<T, number>>, key: T, amount: number = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function createHeroSpeaker(heroId: string): DialogueSpeakerSnapshot | null {
  const hero = getStoryHeroTemplate(heroId);
  if (!hero) {
    return null;
  }

  return {
    id: hero.id,
    name: hero.name,
    avatar: hero.avatar,
  };
}

function getPreferredSpeaker(progression: ProgressionSnapshot, fallbackHeroId: string | null = null): DialogueSpeakerSnapshot {
  if (fallbackHeroId) {
    const fallbackSpeaker = createHeroSpeaker(fallbackHeroId);
    if (fallbackSpeaker) {
      return fallbackSpeaker;
    }
  }

  for (const heroId of progression.unlocked.heroes) {
    const speaker = createHeroSpeaker(heroId);
    if (speaker) {
      return speaker;
    }
  }

  return ADVISOR_SPEAKER;
}

function buildNodeAdvice(node: ProgressionNodeSnapshot | undefined) {
  if (!node) {
    return 'The frontier is open. Keep building, staffing jobs, and discovering new ground to reveal the next milestone.';
  }

  const unmet = node.requirements.filter((requirement) => !requirement.satisfied);
  if (unmet.length === 0) {
    return `${node.label} is ready. Open the build and action menus to put the new milestone to work.`;
  }

  const primaryBlocker = unmet[0];
  return `Next milestone: ${node.label}. ${primaryBlocker.label} is still short at ${primaryBlocker.currentLabel}.`;
}

class RunState {
  private snapshot: RunSnapshot | null = null;
  private baseSeed = 0;
  private totalScore = 0;
  private bonusScore = 0;
  private deliveredResources: Partial<Record<ResourceType, number>> = {};
  private completedTasks: Record<string, number> = {};
  private restoredTiles = 0;
  private baselines: ChapterBaselines = {
    discoveredTiles: 0,
    deliveredResources: {},
    completedTasks: {},
    restoredTiles: 0,
    bonusScore: 0,
  };
  private dialogueSequence = 0;

  initialize(seed: number) {
    this.baseSeed = seed;
    this.totalScore = 0;
    this.bonusScore = 0;
    this.deliveredResources = {};
    this.completedTasks = {};
    this.restoredTiles = 0;
    this.dialogueSequence = 0;
    this.baselines = {
      discoveredTiles: 0,
      deliveredResources: {},
      completedTasks: {},
      restoredTiles: 0,
      bonusScore: 0,
    };

    const initialProgression = createInitialProgressionSnapshot();
    loadStoryProgression(initialProgression);
    syncHeroRoster(initialProgression.unlocked.heroes);
    this.issueChapter(1);
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
      mutator: { ...this.snapshot.mutator },
      chapter: { ...this.snapshot.chapter },
      progression: cloneProgression(this.snapshot.progression),
      objectives: cloneObjectives(this.snapshot.objectives),
      dialogue: cloneDialogue(this.snapshot.dialogue),
      chapterArchive: this.snapshot.chapterArchive.map(cloneCompletedChapter),
      lastCompletedChapter: this.snapshot.lastCompletedChapter
        ? cloneCompletedChapter(this.snapshot.lastCompletedChapter)
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
        this.deliveredResources[event.resourceType] = (this.deliveredResources[event.resourceType] ?? 0) + event.amount;
        break;
      case 'task:completed':
        this.completedTasks[event.taskType] = (this.completedTasks[event.taskType] ?? 0) + 1;
        break;
      case 'tile:discovered':
        break;
      case 'tile:restored':
        this.restoredTiles += 1;
        break;
      default:
        return;
    }

    this.recomputeProgress();
  }

  private nextDialogueId(kind: DialogueEntrySnapshot['kind'], chapterNumber: number) {
    this.dialogueSequence += 1;
    return `${kind}:${chapterNumber}:${this.dialogueSequence}`;
  }

  private appendDialogueEntry(
    dialogue: DialogueLogSnapshot,
    chapterNumber: number,
    kind: DialogueEntrySnapshot['kind'],
    text: string,
    speaker: DialogueSpeakerSnapshot,
    createdAt: number,
  ) {
    const entry: DialogueEntrySnapshot = {
      id: this.nextDialogueId(kind, chapterNumber),
      chapterNumber,
      kind,
      speaker: cloneDialogueSpeaker(speaker),
      text,
      createdAt,
    };

    dialogue.entries.push(entry);
    dialogue.activeEntryId = entry.id;
  }

  private applyProgression(progression: ProgressionSnapshot, previousProgression: ProgressionSnapshot | null, createdAt: number) {
    if (!this.snapshot) {
      return;
    }

    const rosterChanged = !previousProgression
      || previousProgression.unlocked.heroes.length !== progression.unlocked.heroes.length
      || previousProgression.unlocked.heroes.some((heroId, index) => progression.unlocked.heroes[index] !== heroId);

    this.snapshot.progression = cloneProgression(progression);
    loadStoryProgression(this.snapshot.progression);
    if (rosterChanged) {
      syncHeroRoster(this.snapshot.progression.unlocked.heroes);
    }

    if (previousProgression) {
      for (const nodeKey of progression.recentlyUnlockedNodeKeys) {
        const node = progression.nodes.find((candidate) => candidate.key === nodeKey);
        if (!node) {
          continue;
        }

        this.appendDialogueEntry(
          this.snapshot.dialogue,
          this.snapshot.chapterNumber,
          'unlock',
          `${node.label} unlocked. ${node.description}`,
          getPreferredSpeaker(progression),
          createdAt,
        );
      }
    }
  }

  private recomputeProgress(forceBroadcast: boolean = false) {
    if (!this.snapshot) {
      return;
    }

    const before = JSON.stringify(this.snapshot);
    const now = Date.now();
    const metrics = this.captureMetrics();
    const previousProgression = cloneProgression(this.snapshot.progression);
    const nextProgression = evaluateProgression(
      this.captureProgressionMetrics(metrics),
      previousProgression.unlockedNodeKeys,
    );

    this.applyProgression(nextProgression, previousProgression, now);

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
      this.snapshot.objectives.some((objective) => objective.required)
      && this.snapshot.objectives.filter((objective) => objective.required).every((objective) => objective.completed)
    ) {
      this.completeCurrentChapter(now);
      return;
    }

    if (this.snapshot.status === 'active') {
      const recommendedNodeKey = this.snapshot.progression.nextRecommendedNodeKeys[0];
      this.snapshot.summary = buildNodeAdvice(
        recommendedNodeKey
          ? this.snapshot.progression.nodes.find((node) => node.key === recommendedNodeKey)
          : undefined,
      );
    }
    this.snapshot.discoveredTiles = metrics.discoveredTiles;
    this.snapshot.activeTiles = metrics.activeTiles;
    this.snapshot.inactiveTiles = metrics.inactiveTiles;
    this.snapshot.restoredTiles = Math.max(0, metrics.restoredTiles - this.baselines.restoredTiles);
    this.snapshot.chapterScore = this.computeChapterScore();
    this.snapshot.score = this.totalScore + this.snapshot.chapterScore;

    if (forceBroadcast || before !== JSON.stringify(this.snapshot)) {
      this.broadcastUpdate();
    }
  }

  private computeObjectiveProgress(objective: ObjectiveSnapshot, metrics: RunMetrics) {
    switch (objective.kind) {
      case 'discover_tiles':
        return metrics.discoveredTiles;
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
      case 'reach_active_tiles':
        return metrics.activeTiles;
      case 'restore_tiles':
        return Math.max(0, metrics.restoredTiles - this.baselines.restoredTiles);
      default:
        return 0;
    }
  }

  private captureMetrics(): RunMetrics {
    const population = getPopulationState();

    return {
      discoveredTiles: tiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length,
      frontierDistance: tiles.reduce((maxDistance, tile) => {
        if (!tile.discovered || !tile.terrain || tile.terrain === 'towncenter') {
          return maxDistance;
        }

        const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
        return Math.max(maxDistance, distance);
      }, 0),
      population: population.current,
      activeTiles: population.activeTileCount,
      inactiveTiles: population.inactiveTileCount,
      restoredTiles: this.restoredTiles,
    };
  }

  private captureProgressionMetrics(runMetrics: RunMetrics): ProgressionMetrics {
    const population = getPopulationState();
    const workforce = getWorkforceSnapshot();
    const discoveredTerrains = new Set<typeof tiles[number]['terrain']>();
    const buildingCounts: Partial<Record<BuildingKey, number>> = {};
    const operationalBuildingCounts: Partial<Record<BuildingKey, number>> = {};

    for (const tile of tiles) {
      if (tile.discovered && tile.terrain) {
        discoveredTerrains.add(tile.terrain);
      }

      if (tile.terrain === 'towncenter') {
        incrementRecordValue(buildingCounts, 'townCenter');
      }

      const buildingState = resolveBuildingStateForTile(tile);
      if (!buildingState) {
        continue;
      }

      incrementRecordValue(buildingCounts, buildingState.building.key as BuildingKey);
    }

    for (const site of workforce.sites) {
      if (site.status !== 'staffed') {
        continue;
      }

      incrementRecordValue(operationalBuildingCounts, site.buildingKey as BuildingKey);
    }

    return {
      population: population.current,
      beds: population.beds,
      frontierDistance: runMetrics.frontierDistance,
      resourceStock: { ...resourceInventory },
      buildingCounts,
      operationalBuildingCounts,
      discoveredTerrains: Array.from(discoveredTerrains).filter((terrain): terrain is NonNullable<typeof terrain> => !!terrain),
      unlockedHeroIds: this.snapshot?.progression.unlocked.heroes.slice() ?? [],
    };
  }

  private computeChapterScore() {
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

  private completeCurrentChapter(now: number) {
    if (!this.snapshot) {
      return;
    }

    this.snapshot.chapterScore = this.computeChapterScore();
    this.snapshot.score = this.totalScore + this.snapshot.chapterScore;

    const totalScoreAfterCompletion = this.totalScore + this.snapshot.chapterScore;
    const completedChapter: CompletedChapterSnapshot = {
      chapterNumber: this.snapshot.chapterNumber,
      completedAt: now,
      score: this.snapshot.chapterScore,
      totalScore: totalScoreAfterCompletion,
      summary: this.snapshot.chapter.completionText,
      mutator: { ...this.snapshot.mutator },
      chapter: { ...this.snapshot.chapter },
      objectives: cloneObjectives(this.snapshot.objectives),
    };

    this.totalScore = totalScoreAfterCompletion;
    this.issueChapter(this.snapshot.chapterNumber + 1, completedChapter);
  }

  private issueChapter(chapterNumber: number, lastCompletedChapter?: CompletedChapterSnapshot) {
    const metrics = this.captureMetrics();
    const previousProgression = this.snapshot?.progression ?? createInitialProgressionSnapshot();
    const previousArchive = this.snapshot?.chapterArchive ?? [];
    const previousDialogueEntries = this.snapshot?.dialogue.entries ?? [];
    const now = Date.now();
    const progression = evaluateProgression(
      this.captureProgressionMetrics(metrics),
      this.snapshot?.progression.unlockedNodeKeys ?? [],
    );
    const blueprint = generateFoundingExpeditionMission(this.baseSeed, chapterNumber, {
      frontierDistance: metrics.frontierDistance,
      population: metrics.population,
      activeTiles: metrics.activeTiles,
      inactiveTiles: metrics.inactiveTiles,
    }, progression);
    const dialogue: DialogueLogSnapshot = {
      activeEntryId: null,
      entries: previousDialogueEntries.map(cloneDialogueEntry),
    };

    if (lastCompletedChapter) {
      this.appendDialogueEntry(
        dialogue,
        lastCompletedChapter.chapterNumber,
        'chapter_complete',
        lastCompletedChapter.chapter.completionText,
        getPreferredSpeaker(previousProgression, 'h1'),
        lastCompletedChapter.completedAt,
      );
    }

    if (this.snapshot) {
      for (const nodeKey of progression.recentlyUnlockedNodeKeys) {
        const node = progression.nodes.find((candidate) => candidate.key === nodeKey);
        if (!node) {
          continue;
        }

        this.appendDialogueEntry(
          dialogue,
          chapterNumber,
          'unlock',
          `${node.label} unlocked. ${node.description}`,
          getPreferredSpeaker(progression),
          now,
        );
      }
    }

    this.appendDialogueEntry(
      dialogue,
      chapterNumber,
      'chapter_intro',
      blueprint.chapter.briefing,
      getPreferredSpeaker(progression, 'h2'),
      now,
    );

    this.appendDialogueEntry(
      dialogue,
      chapterNumber,
      'advice',
      buildNodeAdvice(progression.nodes.find((node) => node.key === progression.nextRecommendedNodeKeys[0])),
      getPreferredSpeaker(progression, 'h1'),
      now,
    );

    loadStoryProgression(progression);
    syncHeroRoster(progression.unlocked.heroes);

    this.baselines = {
      discoveredTiles: metrics.discoveredTiles,
      deliveredResources: { ...this.deliveredResources },
      completedTasks: { ...this.completedTasks },
      restoredTiles: metrics.restoredTiles,
      bonusScore: this.bonusScore,
    };

    this.snapshot = {
      mode: blueprint.mode,
      modeLabel: blueprint.modeLabel,
      seed: this.baseSeed,
      chapterNumber,
      chaptersCompleted: chapterNumber - 1,
      status: 'active',
      startedAt: now,
      score: this.totalScore,
      chapterScore: 0,
      discoveredTiles: metrics.discoveredTiles,
      activeTiles: metrics.activeTiles,
      inactiveTiles: metrics.inactiveTiles,
      restoredTiles: Math.max(0, metrics.restoredTiles - this.baselines.restoredTiles),
      summary: buildNodeAdvice(progression.nodes.find((node) => node.key === progression.nextRecommendedNodeKeys[0])),
      mutator: blueprint.mutator,
      chapter: { ...blueprint.chapter },
      progression: cloneProgression(progression),
      objectives: blueprint.objectives.map((objective) => ({
        ...objective,
        progress: 0,
        completed: false,
      })),
      dialogue,
      chapterArchive: lastCompletedChapter
        ? [...previousArchive.map(cloneCompletedChapter), cloneCompletedChapter(lastCompletedChapter)]
        : previousArchive.map(cloneCompletedChapter),
      lastCompletedChapter: lastCompletedChapter ? cloneCompletedChapter(lastCompletedChapter) : undefined,
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
