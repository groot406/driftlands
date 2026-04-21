import { broadcast } from '../messages/messageRouter';
import type { GameplayEvent } from '../../../src/shared/gameplay/events';
import { tiles } from '../../../src/shared/game/world';
import { heroes, syncHeroRoster } from '../../../src/shared/game/state/heroStore';
import { getPopulationState } from '../../../src/shared/game/state/populationStore';
import { getWorkforceSnapshot } from '../../../src/shared/game/state/jobStore';
import { resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { getDistanceToNearestTowncenter } from '../../../src/shared/game/worldQueries';
import type {
  DialogueEntrySnapshot,
  DialogueLogSnapshot,
  DialogueSpeakerSnapshot,
  RunSnapshot,
  RunStoryBeat,
} from '../../../src/shared/goals/types';
import type { RunUpdateMessage } from '../../../src/shared/protocol';
import {
  cloneStoryProgression,
  evaluateProgression,
  type BuildingKey,
  type ProgressionMetrics,
  type ProgressionNodeKey,
  type ProgressionNodeSnapshot,
  type ProgressionSnapshot,
} from '../../../src/shared/story/progression';
import { loadStoryProgression } from '../../../src/shared/story/progressionState';
import { getStoryHeroTemplate } from '../../../src/shared/story/heroRoster';
import { resolveBuildingStateForTile } from '../../../src/shared/buildings/state';
import { getForestDiscoveryHintTile, getWaterDiscoveryHintTile } from '../../../src/shared/game/waterDiscoveryHint';
import { getStudySnapshot } from '../../../src/store/studyStore';

interface RunMetrics {
  discoveredTiles: number;
  frontierDistance: number;
  activeTiles: number;
  inactiveTiles: number;
}

const STORY_VOICE: Record<ProgressionNodeKey, { speakerId: string | null; text: string }> = {
  landfall: {
    speakerId: 'h1',
    text: 'We can survive the landing, but not much more than that. Get timber, raise a house, and make this place worth staying in.',
  },
  shoreline: {
    speakerId: 'h4',
    text: 'The coast is no longer just an edge. A dock and a few lily paths will turn it into part of the settlement.',
  },
  farming: {
    speakerId: 'h2',
    text: 'A real roof changes everything. More beds mean more hands, and more hands make fields worth the trouble.',
  },
  irrigation: {
    speakerId: 'h3',
    text: 'Dry ground is only a problem until we learn to move water. After that, the colony grows where we tell it to.',
  },
  stores: {
    speakerId: 'h1',
    text: 'Loose harvests are not a food system. We need proper storage before the colony can trust its own grain.',
  },
  baking: {
    speakerId: 'h1',
    text: 'Stored grain is promise, not dinner. Once a bakery is staffed, the colony finally starts eating like it means to last.',
  },
  security: {
    speakerId: 'h2',
    text: 'We are too spread out to keep guessing what lies ahead. Put up a watchtower and let the colony breathe a little farther.',
  },
  mountain_frontier: {
    speakerId: 'h2',
    text: 'The ridges are finally close enough to matter. A quarry gives us steady stone, and a mine turns the same frontier into ore.',
  },
  logistics: {
    speakerId: 'h4',
    text: 'Everything still bottlenecks through the center stone. A supply depot is how this stops feeling like improvisation.',
  },
  frontier_surveying: {
    speakerId: 'h2',
    text: 'We are done guessing at good ground. Survey the frontier, mark what is special, and build where the land gives us leverage.',
  },
  timber_industry: {
    speakerId: 'h4',
    text: 'We can stop scavenging wood tree by tree now. A staffed lumber camp turns forest into a real production line.',
  },
  masonry: {
    speakerId: 'h1',
    text: 'Stone is finally more than rubble. We have enough to make houses and storage feel permanent.',
  },
  harsh_frontier: {
    speakerId: 'h2',
    text: 'The forgiving ground ends here. Snow and desert are within reach now, if the colony can keep itself fed on the march.',
  },
  desert_industry: {
    speakerId: 'h4',
    text: 'The desert is not empty. Bring sand home, feed an oven, and glass becomes the next housing bottleneck.',
  },
  hero_methods: {
    speakerId: 'h3',
    text: 'The crew has learned enough to act decisively. Save those hero charges for the moments where timing matters.',
  },
  toolmaking: {
    speakerId: 'h4',
    text: 'Ore is useful. Tools are leverage. Give the miners a workshop and the whole frontier starts moving differently.',
  },
  expansion: {
    speakerId: 'h1',
    text: 'One settlement is no longer enough for what we are trying to become. It is time to plant another center stone.',
  },
  deep_frontier: {
    speakerId: 'h4',
    text: 'The deep frontier is open now. If we stall here, it will be because the colony stopped upgrading the tools that got it this far.',
  },
  ancient_frontier: {
    speakerId: 'h3',
    text: 'Some landmarks are older than the colony by centuries. Survey them carefully, and the ruins may still teach us.',
  },
};

const DEFAULT_SPEAKER: DialogueSpeakerSnapshot = {
  id: 'advisor',
  name: 'Quartermaster',
  avatar: null,
};

const DEFAULT_MUTATOR = {
  key: 'open_frontier' as const,
  name: 'Colony Growth',
  description: 'Population, job sites, and production chains unlock the next layer of buildings.',
};

const FOREST_DISCOVERY_ADVICE = 'I spotted a stand of timber nearby. Scout those trees first, and we should have the wood for a proper house.';
const WATER_DISCOVERY_ADVICE = 'With a roof standing, I can hear water nearby. Find it next; a dock there gives us fish when the stores run thin.';

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

function cloneProgression(progression: ProgressionSnapshot): ProgressionSnapshot {
  return cloneStoryProgression(progression);
}

function incrementRecordValue<T extends string>(record: Partial<Record<T, number>>, key: T, amount: number = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function getSpeaker(heroId: string | null, fallbackName: string = 'Chronicle'): DialogueSpeakerSnapshot {
  if (heroId) {
    const hero = getStoryHeroTemplate(heroId);
    if (hero) {
      return {
        id: hero.id,
        name: hero.name,
        avatar: hero.avatar,
      };
    }
  }

  return {
    ...DEFAULT_SPEAKER,
    name: fallbackName,
  };
}

function getCurrentStoryNode(progression: ProgressionSnapshot) {
  return progression.nodes.filter((node) => node.unlocked).at(-1) ?? null;
}

function getNextStoryNode(progression: ProgressionSnapshot) {
  const nextNodeKey = progression.nextRecommendedNodeKeys[0];
  return nextNodeKey
    ? progression.nodes.find((node) => node.key === nextNodeKey) ?? null
    : null;
}

function buildNodeAdvice(node: ProgressionNodeSnapshot | null | undefined) {
  if (!node) {
    return 'The colony has its own momentum now. Keep chaining one specialist building into the next resource it unlocks.';
  }

  const unmet = node.requirements.filter((requirement) => !requirement.satisfied);
  if (!unmet.length) {
    return `${node.label} is ready. Build it, staff it, and let that new output carry the colony forward.`;
  }

  const primaryBlocker = unmet[0]!;
  return `${node.label} is the next step. ${primaryBlocker.label} is currently ${primaryBlocker.currentLabel}.`;
}

function buildStoryBeat(progression: ProgressionSnapshot, _metrics: RunMetrics): RunStoryBeat {
  const currentNode = getCurrentStoryNode(progression);
  const nextNode = getNextStoryNode(progression);
  const chapterNumber = Math.max(1, progression.unlockedNodeKeys.length);

  return {
    chapterId: currentNode?.key ?? 'landfall',
    chapterLabel: currentNode?.label ?? `Stage ${chapterNumber}`,
    actLabel: currentNode?.category ?? 'Colony Story',
    title: currentNode?.label ?? 'Landfall',
    kicker: currentNode?.description ?? 'The first camp is still little more than a promise.',
    briefing: nextNode
      ? `The next step is ${nextNode.label}. ${nextNode.description}`
      : 'The colony has a working loop now. Keep expanding job sites and housing to deepen the frontier economy.',
    stakes: 'The colony grows when food, housing, and staffed production stay in balance.',
    guidance: buildNodeAdvice(nextNode),
    completionTitle: currentNode?.label ?? 'Colony Growth',
    completionText: currentNode?.description ?? 'The colony has found its footing.',
    failureTitle: 'Keep The Chain Moving',
    failureText: 'If houses, food, and job sites fall out of balance, the frontier stalls.',
    nextHint: nextNode
      ? `Unlocking ${nextNode.label} comes from colony state: resources, beds, and staffed job sites.`
      : 'Keep building specialized production lines and stronger settlements.',
  };
}

class RunState {
  private snapshot: RunSnapshot | null = null;
  private restoredTiles = 0;
  private dialogueSequence = 0;

  initialize(seed: number) {
    this.restoredTiles = 0;
    this.dialogueSequence = 0;

    const now = Date.now();
    const metrics = this.captureMetrics();
    const progression = evaluateProgression(this.captureProgressionMetrics(metrics));
    const dialogue: DialogueLogSnapshot = {
      activeEntryId: null,
      entries: [],
    };

    this.snapshot = {
      mode: 'story_mode',
      modeLabel: 'Colony Mode',
      seed,
      chapterNumber: Math.max(1, progression.unlockedNodeKeys.length),
      chaptersCompleted: Math.max(0, progression.unlockedNodeKeys.length - 1),
      status: 'active',
      startedAt: now,
      score: 0,
      chapterScore: 0,
      discoveredTiles: metrics.discoveredTiles,
      activeTiles: metrics.activeTiles,
      inactiveTiles: metrics.inactiveTiles,
      restoredTiles: this.restoredTiles,
      summary: buildNodeAdvice(getNextStoryNode(progression)),
      mutator: { ...DEFAULT_MUTATOR },
      chapter: buildStoryBeat(progression, metrics),
      progression: cloneProgression(progression),
      objectives: [],
      dialogue,
      chapterArchive: [],
      lastCompletedChapter: undefined,
    };

    this.appendDialogueEntry(
      Math.max(1, progression.unlockedNodeKeys.length),
      'chapter_intro',
      STORY_VOICE.landfall.text,
      getSpeaker(STORY_VOICE.landfall.speakerId),
      now,
    );
    if (getForestDiscoveryHintTile()) {
      this.appendDialogueEntry(
        Math.max(1, progression.unlockedNodeKeys.length),
        'advice',
        FOREST_DISCOVERY_ADVICE,
        getSpeaker('h2'),
        now,
      );
    }
    this.appendDialogueEntry(
      Math.max(1, progression.unlockedNodeKeys.length),
      'advice',
      buildNodeAdvice(getNextStoryNode(progression)),
      DEFAULT_SPEAKER,
      now,
    );

    loadStoryProgression(progression);
    syncHeroRoster(progression.unlocked.heroes);
    this.broadcastUpdate();
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
      objectives: [],
      dialogue: cloneDialogue(this.snapshot.dialogue),
      chapterArchive: [],
      lastCompletedChapter: undefined,
    };
  }

  tick(_now: number) {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return;
    }
  }

  grantBonusScore(_points: number) {}

  recordEvent(event: GameplayEvent) {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return;
    }

    if (event.type === 'tile:restored') {
      this.restoredTiles += 1;
    }

    if (event.type === 'study:completed') {
      this.recomputeProgress(true);
      return;
    }

    this.recomputeProgress();
  }

  private captureMetrics(): RunMetrics {
    const population = getPopulationState();

    return {
      discoveredTiles: tiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length,
      frontierDistance: tiles.reduce((maxDistance, tile) => {
        if (!tile.discovered || !tile.terrain || tile.terrain === 'towncenter') {
          return maxDistance;
        }

        return Math.max(maxDistance, getDistanceToNearestTowncenter(tile.q, tile.r));
      }, 0),
      activeTiles: population.activeTileCount,
      inactiveTiles: population.inactiveTileCount,
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
      completedStudyKeys: getStudySnapshot().completedStudyKeys,
      heroAbilityChargesEarned: heroes.reduce((sum, hero) => sum + (hero.abilityChargesEarned ?? 0), 0),
    };
  }

  private nextDialogueId(kind: DialogueEntrySnapshot['kind'], chapterNumber: number) {
    this.dialogueSequence += 1;
    return `${kind}:${chapterNumber}:${this.dialogueSequence}`;
  }

  private appendDialogueEntry(
    chapterNumber: number,
    kind: DialogueEntrySnapshot['kind'],
    text: string,
    speaker: DialogueSpeakerSnapshot,
    createdAt: number,
  ) {
    if (!this.snapshot) {
      return;
    }

    const entry: DialogueEntrySnapshot = {
      id: this.nextDialogueId(kind, chapterNumber),
      chapterNumber,
      kind,
      speaker: cloneDialogueSpeaker(speaker),
      text,
      createdAt,
    };

    this.snapshot.dialogue.entries.push(entry);
    this.snapshot.dialogue.activeEntryId = entry.id;
  }

  private hasDialogueText(text: string) {
    return this.snapshot?.dialogue.entries.some((entry) => entry.text === text) ?? false;
  }

  private maybeAppendWaterDiscoveryAdvice(progressionMetrics: ProgressionMetrics, createdAt: number) {
    if (!this.snapshot) {
      return;
    }

    if ((progressionMetrics.buildingCounts.house ?? 0) < 1) {
      return;
    }

    if (!getWaterDiscoveryHintTile() || this.hasDialogueText(WATER_DISCOVERY_ADVICE)) {
      return;
    }

    this.appendDialogueEntry(
      this.snapshot.chapterNumber,
      'advice',
      WATER_DISCOVERY_ADVICE,
      getSpeaker('h2'),
      createdAt,
    );
  }

  private recomputeProgress(forceBroadcast: boolean = false) {
    if (!this.snapshot) {
      return;
    }

    const before = JSON.stringify(this.snapshot);
    const metrics = this.captureMetrics();
    const previousProgression = cloneProgression(this.snapshot.progression);
    const progressionMetrics = this.captureProgressionMetrics(metrics);
    const nextProgression = evaluateProgression(
      progressionMetrics,
      previousProgression.unlockedNodeKeys,
    );

    const heroRosterChanged = previousProgression.unlocked.heroes.length !== nextProgression.unlocked.heroes.length
      || previousProgression.unlocked.heroes.some((heroId, index) => nextProgression.unlocked.heroes[index] !== heroId);

    this.snapshot.progression = cloneProgression(nextProgression);
    this.snapshot.chapterNumber = Math.max(1, nextProgression.unlockedNodeKeys.length);
    this.snapshot.chaptersCompleted = Math.max(0, this.snapshot.chapterNumber - 1);
    this.snapshot.chapter = buildStoryBeat(nextProgression, metrics);
    this.snapshot.summary = buildNodeAdvice(getNextStoryNode(nextProgression));
    this.snapshot.discoveredTiles = metrics.discoveredTiles;
    this.snapshot.activeTiles = metrics.activeTiles;
    this.snapshot.inactiveTiles = metrics.inactiveTiles;
    this.snapshot.restoredTiles = this.restoredTiles;
    this.snapshot.score = 0;
    this.snapshot.chapterScore = 0;
    this.snapshot.objectives = [];
    this.snapshot.chapterArchive = [];
    this.snapshot.lastCompletedChapter = undefined;

    if (heroRosterChanged) {
      syncHeroRoster(nextProgression.unlocked.heroes);
    }
    loadStoryProgression(nextProgression);
    this.maybeAppendWaterDiscoveryAdvice(progressionMetrics, Date.now());

    if (nextProgression.recentlyUnlockedNodeKeys.length > 0) {
      const now = Date.now();
      for (const nodeKey of nextProgression.recentlyUnlockedNodeKeys) {
        const beat = STORY_VOICE[nodeKey];
        const node = nextProgression.nodes.find((candidate) => candidate.key === nodeKey);
        this.appendDialogueEntry(
          this.snapshot.chapterNumber,
          'unlock',
          beat?.text ?? `${node?.label ?? 'New milestone'} is now available.`,
          getSpeaker(beat?.speakerId ?? null),
          now,
        );
      }
      this.appendDialogueEntry(
        this.snapshot.chapterNumber,
        'advice',
        buildNodeAdvice(getNextStoryNode(nextProgression)),
        DEFAULT_SPEAKER,
        now,
      );
    }

    if (forceBroadcast || before !== JSON.stringify(this.snapshot)) {
      this.broadcastUpdate();
    }
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
