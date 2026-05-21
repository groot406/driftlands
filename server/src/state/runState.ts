import { broadcast } from '../messages/messageRouter';
import type { GameplayEvent } from '../../../src/shared/gameplay/events';
import { tiles, tileIndex } from '../../../src/shared/game/world';
import { heroes } from '../../../src/shared/game/state/heroStore';
import { getPopulationState, getSettlementPopulationState } from '../../../src/shared/game/state/populationStore';
import { getWorkforceSnapshot } from '../../../src/shared/game/state/jobStore';
import { getEffectiveResourceInventory, getSettlementResourceInventory } from '../../../src/shared/game/state/resourceStore';
import { getDistanceToNearestTowncenter } from '../../../src/shared/game/worldQueries';
import type {
  DialogueEntrySnapshot,
  DialogueLogSnapshot,
  DialogueSpeakerSnapshot,
  RunSnapshot,
  RunStoryBeat,
} from '../../../src/shared/goals/types';
import type { Hero } from '../../../src/shared/game/types/Hero';
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
import { createStoryBeat, evaluateStoryChapterNumber } from '../../../src/shared/story/storyMode';
import { createLandingProfile, DEFAULT_LANDING_PROFILE_RADIUS } from '../../../src/shared/story/landingProfile';
import { resolveBuildingStateForTile } from '../../../src/shared/buildings/state';
import { getStudySnapshot } from '../../../src/store/studyStore';
import { getTileSettlementId } from '../../../src/shared/game/settlement';
import { getProgressionOverrideNodeKeys, testModeSettings } from '../../../src/shared/game/testMode.ts';
import { listTaskAccessTiles } from '../../../src/shared/tasks/taskAccess';
import { PathService } from '../../../src/shared/game/PathService';
import { axialDistanceCoords } from '../../../src/shared/game/hex';

interface RunMetrics {
  discoveredTiles: number;
  frontierDistance: number;
  activeTiles: number;
  inactiveTiles: number;
}

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

const landingPathService = new PathService();

function cloneDialogueSpeaker(speaker: DialogueSpeakerSnapshot): DialogueSpeakerSnapshot {
  return {
    id: speaker.id,
    name: speaker.name,
    avatar: speaker.avatar ?? null,
    avatarSource: speaker.avatarSource ?? null,
    avatarSpriteUrl: speaker.avatarSpriteUrl ?? null,
    avatarFallbackSpriteUrl: speaker.avatarFallbackSpriteUrl ?? null,
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

function storyHeroMatches(hero: Hero, storyHeroId: string): boolean {
  const template = getStoryHeroTemplate(storyHeroId);
  if (!template) {
    return false;
  }

  return hero.storyTemplateId === template.id
    || (hero.avatarSource !== 'looperlands' && hero.avatar === template.avatar && hero.name === template.name);
}

function hashSpeakerSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function heroToSpeaker(hero: Hero): DialogueSpeakerSnapshot {
  return {
    id: hero.id,
    name: hero.name,
    avatar: hero.avatar,
    avatarSource: hero.avatarSource ?? 'local',
    avatarSpriteUrl: hero.avatarSpriteUrl ?? null,
    avatarFallbackSpriteUrl: hero.avatarFallbackSpriteUrl ?? null,
  };
}

function getStoryTemplateSpeaker(heroId: string | null, fallbackName: string = 'Chronicle'): DialogueSpeakerSnapshot {
  if (heroId) {
    const hero = getStoryHeroTemplate(heroId);
    if (hero) {
      return {
        id: hero.id,
        name: hero.name,
        avatar: hero.avatar,
        avatarSource: 'local',
      };
    }
  }

  return {
    ...DEFAULT_SPEAKER,
    name: fallbackName,
  };
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

function buildStoryBeatForChapter(
  chapterNumber: number,
  metrics: RunMetrics,
  progressionMetrics: ProgressionMetrics,
  settlementId: string | null,
): RunStoryBeat {
  const townCenter = settlementId ? tileIndex[settlementId] : null;
  const settlementTiles = tiles.filter((tile) => (
    !settlementId
    || tile.ownerSettlementId === settlementId
    || tile.controlledBySettlementId === settlementId
    || tile.id === settlementId
  ));
  const landingProfile = createSettlementLandingProfile(settlementTiles, townCenter, settlementId);
  const storyContextTerrains = progressionMetrics.discoveredTerrains.filter((terrain) => (
    terrain !== 'water' || progressionMetrics.landingTerrains.includes('water')
  ));

  return createStoryBeat(chapterNumber, metrics.frontierDistance, { ...DEFAULT_MUTATOR }, {
    landingArchetype: landingProfile.archetype,
    discoveredTerrains: storyContextTerrains,
  });
}

function hasPathFromTownCenter(
  townCenter: { q: number; r: number },
  target: { q: number; r: number },
  settlementId: string,
) {
  return (townCenter.q === target.q && townCenter.r === target.r)
    || landingPathService.findWalkablePath(
      townCenter.q,
      townCenter.r,
      target.q,
      target.r,
      { settlementId },
    ).length > 0;
}

function isReachableLandingWater(
  tile: typeof tiles[number],
  townCenter: typeof tiles[number] | null | undefined,
  settlementId: string | null | undefined,
) {
  if (!townCenter || !settlementId || !tile.discovered || tile.terrain !== 'water') {
    return false;
  }

  if (axialDistanceCoords(townCenter.q, townCenter.r, tile.q, tile.r) > DEFAULT_LANDING_PROFILE_RADIUS) {
    return false;
  }

  return listTaskAccessTiles('buildDock', tile, settlementId)
    .some((accessTile) => hasPathFromTownCenter(townCenter, accessTile, settlementId));
}

function createSettlementLandingProfile(
  settlementTiles: readonly (typeof tiles[number])[],
  townCenter: typeof tiles[number] | null | undefined,
  settlementId: string | null | undefined,
) {
  const origin = townCenter ? { q: townCenter.q, r: townCenter.r } : { q: 0, r: 0 };
  if (!townCenter || !settlementId) {
    return createLandingProfile(settlementTiles, origin);
  }

  return createLandingProfile(
    settlementTiles.filter((tile) => tile.terrain !== 'water' || isReachableLandingWater(tile, townCenter, settlementId)),
    origin,
  );
}

function buildStoryIntroText(chapter: RunStoryBeat) {
  return `${chapter.kicker} ${chapter.briefing}`;
}

function buildStoryCompletionText(chapter: RunStoryBeat) {
  return `${chapter.completionTitle}. ${chapter.completionText}`;
}

class RunState {
  private snapshot: RunSnapshot | null = null;
  private snapshotsBySettlementId = new Map<string, RunSnapshot>();
  private restoredTilesBySettlementId = new Map<string, number>();
  private dialogueSequenceBySettlementId = new Map<string, number>();
  private naturalUnlockedNodeKeysBySettlementId = new Map<string, ProgressionNodeKey[]>();
  private restoredTiles = 0;
  private dialogueSequence = 0;
  private activeSeed = 0;
  private activeSettlementId: string | null = null;

  initialize(seed: number) {
    this.activeSeed = seed;
    this.snapshotsBySettlementId.clear();
    this.restoredTilesBySettlementId.clear();
    this.dialogueSequenceBySettlementId.clear();
    this.naturalUnlockedNodeKeysBySettlementId.clear();
    this.restoredTiles = 0;
    this.dialogueSequence = 0;
    this.activeSettlementId = null;
    this.snapshot = null;
  }

  initializeSettlement(settlementId: string, seed: number = this.activeSeed) {
    this.activeSeed = seed;
    this.restoredTiles = this.restoredTilesBySettlementId.get(settlementId) ?? 0;
    this.dialogueSequence = this.dialogueSequenceBySettlementId.get(settlementId) ?? 0;
    this.activeSettlementId = settlementId;

    const now = Date.now();
    const metrics = this.captureMetrics();
    const progressionMetrics = this.captureProgressionMetrics(metrics);
    const progression = this.computeProgression(progressionMetrics, settlementId);
    const storyChapterNumber = evaluateStoryChapterNumber(progressionMetrics, 1);
    const storyChapter = buildStoryBeatForChapter(storyChapterNumber, metrics, progressionMetrics, settlementId);
    const dialogue: DialogueLogSnapshot = {
      activeEntryId: null,
      entries: [],
    };

    this.snapshot = {
      mode: 'story_mode',
      modeLabel: 'Colony Mode',
      seed: this.activeSeed,
      chapterNumber: storyChapterNumber,
      chaptersCompleted: Math.max(0, storyChapterNumber - 1),
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
      chapter: storyChapter,
      progression: cloneProgression(progression),
      objectives: [],
      dialogue,
      chapterArchive: [],
      lastCompletedChapter: undefined,
    };

    this.appendDialogueEntry(
      storyChapterNumber,
      'chapter_intro',
      buildStoryIntroText(storyChapter),
      this.getSpeaker(null, 'Chronicle'),
      now,
    );

    loadStoryProgression(progression, settlementId);
    // syncHeroRoster(progression.unlocked.heroes);
    this.saveActiveSettlementSnapshot();
    this.broadcastUpdate(settlementId);
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

  getSnapshotForSettlement(settlementId: string | null | undefined): RunSnapshot | null {
    if (!settlementId) {
      return this.getSnapshot();
    }

    const snapshot = this.snapshotsBySettlementId.get(settlementId);
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      mutator: { ...snapshot.mutator },
      chapter: { ...snapshot.chapter },
      progression: cloneProgression(snapshot.progression),
      objectives: [],
      dialogue: cloneDialogue(snapshot.dialogue),
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

  refreshSettlementProgress(settlementId: string) {
    if (!this.snapshotsBySettlementId.has(settlementId)) {
      return;
    }

    const previousActiveSettlementId = this.activeSettlementId;
    this.useSettlementSnapshot(settlementId);
    this.recomputeProgress(true, settlementId);
    if (previousActiveSettlementId && previousActiveSettlementId !== settlementId && this.snapshotsBySettlementId.has(previousActiveSettlementId)) {
      this.useSettlementSnapshot(previousActiveSettlementId);
    }
  }

  refreshAllProgress() {
    const settlementIds = Array.from(this.snapshotsBySettlementId.keys());
    if (!settlementIds.length && this.activeSettlementId) {
      this.recomputeProgress(true, this.activeSettlementId);
      return;
    }

    const previousActiveSettlementId = this.activeSettlementId;
    for (const settlementId of settlementIds) {
      this.useSettlementSnapshot(settlementId);
      this.recomputeProgress(true, settlementId);
    }

    if (previousActiveSettlementId && this.snapshotsBySettlementId.has(previousActiveSettlementId)) {
      this.useSettlementSnapshot(previousActiveSettlementId);
    }
  }

  recordEvent(event: GameplayEvent) {
    const settlementId = this.resolveEventSettlementId(event);
    if (!settlementId) {
      return;
    }

    if (!this.snapshotsBySettlementId.has(settlementId)) {
      this.initializeSettlement(settlementId);
    }

    this.useSettlementSnapshot(settlementId);
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return;
    }

    if (event.type === 'tile:restored') {
      this.restoredTiles += 1;
      this.restoredTilesBySettlementId.set(settlementId, this.restoredTiles);
    }

    if (event.type === 'study:completed') {
      this.recomputeProgress(true, settlementId);
      return;
    }

    this.recomputeProgress(false, settlementId);
  }

  private useSettlementSnapshot(settlementId: string) {
    this.snapshot = this.snapshotsBySettlementId.get(settlementId) ?? null;
    this.restoredTiles = this.restoredTilesBySettlementId.get(settlementId) ?? 0;
    this.dialogueSequence = this.dialogueSequenceBySettlementId.get(settlementId) ?? 0;
    this.activeSettlementId = settlementId;
  }

  private saveActiveSettlementSnapshot() {
    if (!this.snapshot || !this.activeSettlementId) {
      return;
    }

    this.snapshotsBySettlementId.set(this.activeSettlementId, this.snapshot);
    this.restoredTilesBySettlementId.set(this.activeSettlementId, this.restoredTiles);
    this.dialogueSequenceBySettlementId.set(this.activeSettlementId, this.dialogueSequence);
  }

  private computeProgression(metrics: ProgressionMetrics, settlementId: string) {
    const previousNaturalNodeKeys = (this.naturalUnlockedNodeKeysBySettlementId.get(settlementId) ?? [])
      .filter((nodeKey) => nodeKey !== 'shoreline' || metrics.landingTerrains.includes('water'));
    const naturalProgression = evaluateProgression(metrics, previousNaturalNodeKeys);
    this.naturalUnlockedNodeKeysBySettlementId.set(settlementId, naturalProgression.unlockedNodeKeys.slice());

    const overrideNodeKeys = getProgressionOverrideNodeKeys(testModeSettings, settlementId);
    if (!overrideNodeKeys.length) {
      return naturalProgression;
    }

    return evaluateProgression(metrics, Array.from(new Set([
      ...naturalProgression.unlockedNodeKeys,
      ...overrideNodeKeys,
    ])));
  }

  private resolveEventSettlementId(event: GameplayEvent) {
    if (event.type === 'resource:delivered') {
      const hero = heroes.find((candidate) => candidate.id === event.heroId);
      if (hero?.settlementId) return hero.settlementId;
    }

    if (event.type === 'task:completed') {
      const tile = tileIndex[event.tileId];
      return tile?.ownerSettlementId ?? tile?.controlledBySettlementId ?? null;
    }

    if (event.type === 'tile:discovered' || event.type === 'tile:restored') {
      const tile = tileIndex[event.tileId];
      return tile?.ownerSettlementId ?? tile?.controlledBySettlementId ?? null;
    }

    if (event.type === 'study:completed') {
      return this.activeSettlementId ?? Array.from(this.snapshotsBySettlementId.keys())[0] ?? null;
    }

    if (event.type === 'population:changed') {
      return event.settlementId;
    }

    return null;
  }

  private captureMetrics(): RunMetrics {
    const settlementId = this.activeSettlementId;
    const population = settlementId ? getSettlementPopulationState(settlementId) ?? getPopulationState() : getPopulationState();
    const settlementTiles = tiles.filter((tile) => !settlementId || getTileSettlementId(tile) === settlementId);
    const townCenter = settlementId ? tileIndex[settlementId] : null;

    return {
      discoveredTiles: settlementTiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length,
      frontierDistance: settlementTiles.reduce((maxDistance, tile) => {
        if (!tile.discovered || !tile.terrain || tile.terrain === 'towncenter') {
          return maxDistance;
        }

        const distance = townCenter
          ? Math.max(Math.abs(tile.q - townCenter.q), Math.abs(tile.r - townCenter.r), Math.abs((tile.q - townCenter.q) + (tile.r - townCenter.r)))
          : getDistanceToNearestTowncenter(tile.q, tile.r);
        return Math.max(maxDistance, distance);
      }, 0),
      activeTiles: population.activeTileCount,
      inactiveTiles: population.inactiveTileCount,
    };
  }

  private captureProgressionMetrics(runMetrics: RunMetrics): ProgressionMetrics {
    const settlementId = this.activeSettlementId;
    const population = settlementId ? getSettlementPopulationState(settlementId) ?? getPopulationState() : getPopulationState();
    const workforce = getWorkforceSnapshot();
    const discoveredTerrains = new Set<typeof tiles[number]['terrain']>();
    const buildingCounts: Partial<Record<BuildingKey, number>> = {};
    const operationalBuildingCounts: Partial<Record<BuildingKey, number>> = {};
    const townCenter = settlementId ? tileIndex[settlementId] : null;
    const settlementTiles = tiles.filter((tile) => (
      !settlementId
      || tile.ownerSettlementId === settlementId
      || tile.controlledBySettlementId === settlementId
      || tile.id === settlementId
    ));
    const landingProfile = createSettlementLandingProfile(settlementTiles, townCenter, settlementId);

    for (const tile of settlementTiles) {
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
      const siteTile = tileIndex[site.tileId];
      if (settlementId && siteTile?.ownerSettlementId !== settlementId && siteTile?.controlledBySettlementId !== settlementId) {
        continue;
      }

      if (site.status !== 'staffed') {
        continue;
      }

      incrementRecordValue(operationalBuildingCounts, site.buildingKey as BuildingKey);
    }

    return {
      population: population.current,
      beds: population.beds,
      frontierDistance: runMetrics.frontierDistance,
      resourceStock: settlementId ? getSettlementResourceInventory(settlementId) : getEffectiveResourceInventory(),
      buildingCounts,
      operationalBuildingCounts,
      discoveredTerrains: Array.from(discoveredTerrains).filter((terrain): terrain is NonNullable<typeof terrain> => !!terrain),
      landingTerrains: Object.keys(landingProfile.terrainCounts) as NonNullable<typeof tiles[number]['terrain']>[],
      unlockedHeroIds: this.snapshot?.progression.unlocked.heroes.slice() ?? [],
      completedStudyKeys: getStudySnapshot().completedStudyKeys,
      heroAbilityChargesEarned: heroes
        .filter((hero) => !settlementId || hero.settlementId === settlementId)
        .reduce((sum, hero) => sum + (hero.abilityChargesEarned ?? 0), 0),
    };
  }

  private nextDialogueId(kind: DialogueEntrySnapshot['kind'], chapterNumber: number) {
    this.dialogueSequence += 1;
    return `${kind}:${chapterNumber}:${this.dialogueSequence}`;
  }

  private getSettlementDialogueHeroes(): Hero[] {
    if (!this.activeSettlementId) {
      return [];
    }

    return heroes.filter((hero) => hero.settlementId === this.activeSettlementId && !!hero.playerId);
  }

  private getSpeaker(heroId: string | null, fallbackName: string = 'Chronicle'): DialogueSpeakerSnapshot {
    const selectedHeroes = this.getSettlementDialogueHeroes();
    if (selectedHeroes.length > 0) {
      const exactMatch = heroId ? selectedHeroes.find((hero) => storyHeroMatches(hero, heroId)) : null;
      if (exactMatch) {
        return heroToSpeaker(exactMatch);
      }

      const fallbackIndex = hashSpeakerSeed(`${this.activeSettlementId}:${heroId ?? fallbackName}:${this.dialogueSequence}`) % selectedHeroes.length;
      return heroToSpeaker(selectedHeroes[fallbackIndex]!);
    }

    return getStoryTemplateSpeaker(heroId, fallbackName);
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

  private recomputeProgress(forceBroadcast: boolean = false, settlementId: string | null = this.activeSettlementId) {
    if (!this.snapshot) {
      return;
    }

    const before = JSON.stringify(this.snapshot);
    const metrics = this.captureMetrics();
    const previousProgression = cloneProgression(this.snapshot.progression);
    const previousChapterNumber = this.snapshot.chapterNumber;
    const previousChapter = { ...this.snapshot.chapter };
    const progressionMetrics = this.captureProgressionMetrics(metrics);
    const resolvedSettlementId = settlementId ?? this.activeSettlementId;
    if (!resolvedSettlementId) {
      return;
    }
    const nextProgression = this.computeProgression(progressionMetrics, resolvedSettlementId);
    const nextChapterNumber = evaluateStoryChapterNumber(progressionMetrics, previousChapterNumber);
    const nextChapter = buildStoryBeatForChapter(nextChapterNumber, metrics, progressionMetrics, resolvedSettlementId);

    const heroRosterChanged = previousProgression.unlocked.heroes.length !== nextProgression.unlocked.heroes.length
      || previousProgression.unlocked.heroes.some((heroId, index) => nextProgression.unlocked.heroes[index] !== heroId);

    this.snapshot.progression = cloneProgression(nextProgression);
    this.snapshot.chapterNumber = nextChapterNumber;
    this.snapshot.chaptersCompleted = Math.max(0, nextChapterNumber - 1);
    this.snapshot.chapter = nextChapter;
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
      //syncHeroRoster(nextProgression.unlocked.heroes);
    }
    loadStoryProgression(nextProgression, settlementId);

    if (nextChapterNumber > previousChapterNumber) {
      const now = Date.now();
      this.appendDialogueEntry(
        previousChapterNumber,
        'chapter_complete',
        buildStoryCompletionText(previousChapter),
        this.getSpeaker(null, 'Chronicle'),
        now,
      );
      this.appendDialogueEntry(
        nextChapterNumber,
        'chapter_intro',
        buildStoryIntroText(nextChapter),
        this.getSpeaker(null, 'Chronicle'),
        now,
      );
    }

    if (forceBroadcast || before !== JSON.stringify(this.snapshot)) {
      this.saveActiveSettlementSnapshot();
      this.broadcastUpdate(settlementId);
    }
  }

  private broadcastUpdate(settlementId: string | null = this.activeSettlementId) {
    const run = settlementId ? this.getSnapshotForSettlement(settlementId) : this.getSnapshot();
    if (!run) {
      return;
    }

    broadcast({
      type: 'run:update',
      settlementId,
      run,
      timestamp: Date.now(),
    } as RunUpdateMessage);
  }
}

export const runState = new RunState();
