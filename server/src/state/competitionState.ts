import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type {
  CompetitionBadge,
  CompetitionLeaderboardEntry,
  CompetitionLeaderboardKind,
  CompetitionPlayerProfile,
  CompetitionSeasonResult,
  CompetitionSettlementRecord,
  CompetitionSnapshot,
} from '../../../src/shared/competition/types.ts';
import type { LeaderboardEntry, SeasonReward, SeasonSnapshot } from '../../../src/shared/seasons/types.ts';

const COMPETITION_SCHEMA_VERSION = 1;
const DEFAULT_COMPETITION_PATH = '.driftlands/competition-state.json';
const MAX_RECENT_RESULTS = 8;
const MAX_SETTLEMENT_RECORDS = 100;
const LIFETIME_WIN_POINTS = 5_000;
const LIFETIME_PODIUM_POINTS = 1_500;
const LIFETIME_BADGE_POINTS = 250;

interface ActivePlayerSession {
  socketIds: Set<string>;
  lastFlushedAt: number;
}

interface SocketSession {
  playerId: string;
  spectator: boolean;
}

interface CompetitionProfileState {
  playerId: string;
  playerName: string;
  playerColor?: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  totalPlayMs: number;
  totalSeasonScore: number;
  currentSeasonScore: number;
  seasonsPlayed: number;
  seasonWins: number;
  podiums: number;
  hallOfFameFinishes: number;
  currentSettlementId: string | null;
  bestSettlement: CompetitionSettlementRecord | null;
  recentResults: CompetitionSeasonResult[];
  badges: CompetitionBadge[];
}

interface CompetitionPersistenceSnapshot {
  schemaVersion: typeof COMPETITION_SCHEMA_VERSION;
  savedAt: number;
  currentSeasonId: string | null;
  processedSeasonIds: string[];
  profiles: CompetitionProfileState[];
  settlements: CompetitionSettlementRecord[];
}

interface CompetitionStateOptions {
  persistencePath?: string | null;
  now?: () => number;
}

function resolveCompetitionPath() {
  const configured = process.env.SERVER_COMPETITION_PATH ?? process.env.DRIFTLANDS_COMPETITION_PATH;
  if (configured?.trim()) {
    return configured.trim();
  }

  if (process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event?.includes('test')) {
    return null;
  }

  return resolve(process.cwd(), DEFAULT_COMPETITION_PATH);
}

function cloneBadge(badge: CompetitionBadge): CompetitionBadge {
  return { ...badge };
}

function cloneSettlement(record: CompetitionSettlementRecord): CompetitionSettlementRecord {
  return {
    ...record,
    breakdown: { ...record.breakdown },
  };
}

function cloneResult(result: CompetitionSeasonResult): CompetitionSeasonResult {
  return { ...result };
}

function cloneProfile(profile: CompetitionProfileState): CompetitionProfileState {
  return {
    ...profile,
    bestSettlement: profile.bestSettlement ? cloneSettlement(profile.bestSettlement) : null,
    recentResults: profile.recentResults.map(cloneResult),
    badges: profile.badges.map(cloneBadge),
  };
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function badgeSort(left: CompetitionBadge, right: CompetitionBadge) {
  return right.awardedAt - left.awardedAt || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function settlementSort(left: CompetitionSettlementRecord, right: CompetitionSettlementRecord) {
  return right.score - left.score || right.completedAt - left.completedAt || left.playerName.localeCompare(right.playerName);
}

function entryToSettlementRecord(season: SeasonSnapshot, entry: LeaderboardEntry, live: boolean): CompetitionSettlementRecord {
  return {
    id: `${live ? 'live' : 'final'}:${season.seasonId}:${entry.settlementId}:${entry.playerId}`,
    playerId: entry.playerId,
    playerName: entry.playerName,
    playerColor: entry.playerColor ?? null,
    settlementId: entry.settlementId,
    seasonId: season.seasonId,
    seed: season.seed,
    score: entry.score,
    rank: entry.rank,
    completedAt: season.completedAt ?? Date.now(),
    live,
    breakdown: { ...entry.breakdown },
    controlledTiles: entry.controlledTiles,
    discoveredTiles: entry.discoveredTiles,
    activeTiles: entry.activeTiles,
    watchtowersControlled: entry.watchtowersControlled,
    shipOrdersCompleted: entry.shipOrdersCompleted,
  };
}

function createBadgeFromSeasonReward(reward: SeasonReward, awardedAt: number): CompetitionBadge {
  return {
    id: `season:${reward.id}`,
    kind: reward.kind,
    playerId: reward.playerId,
    label: reward.label,
    description: reward.description,
    awardedAt,
    seasonId: reward.seasonId,
    category: reward.category,
  };
}

function createMilestoneBadge(playerId: string, id: string, label: string, description: string, awardedAt: number): CompetitionBadge {
  return {
    id: `milestone:${id}:${playerId}`,
    kind: 'milestone',
    playerId,
    label,
    description,
    awardedAt,
    category: 'lifetime',
  };
}

export class CompetitionState {
  private readonly persistencePath: string | null;
  private readonly now: () => number;
  private readonly profiles = new Map<string, CompetitionProfileState>();
  private readonly sockets = new Map<string, SocketSession>();
  private readonly activePlayers = new Map<string, ActivePlayerSession>();
  private processedSeasonIds = new Set<string>();
  private settlements: CompetitionSettlementRecord[] = [];
  private currentSeasonId: string | null = null;
  private dirty = false;

  constructor(options: CompetitionStateOptions = {}) {
    this.persistencePath = options.persistencePath === undefined ? resolveCompetitionPath() : options.persistencePath;
    this.now = options.now ?? (() => Date.now());
  }

  reset() {
    this.profiles.clear();
    this.sockets.clear();
    this.activePlayers.clear();
    this.processedSeasonIds.clear();
    this.settlements = [];
    this.currentSeasonId = null;
    this.dirty = false;
  }

  loadFromDisk() {
    if (!this.persistencePath || !existsSync(this.persistencePath)) {
      return false;
    }

    const raw = JSON.parse(readFileSync(this.persistencePath, 'utf8')) as Partial<CompetitionPersistenceSnapshot>;
    if (raw.schemaVersion !== COMPETITION_SCHEMA_VERSION || !Array.isArray(raw.profiles)) {
      return false;
    }

    this.reset();
    this.currentSeasonId = raw.currentSeasonId ?? null;
    this.processedSeasonIds = new Set((raw.processedSeasonIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0));
    this.settlements = (raw.settlements ?? []).map(cloneSettlement).sort(settlementSort).slice(0, MAX_SETTLEMENT_RECORDS);

    for (const profile of raw.profiles) {
      if (!profile.playerId) {
        continue;
      }
      this.profiles.set(profile.playerId, {
        playerId: profile.playerId,
        playerName: profile.playerName || 'Pioneer',
        playerColor: profile.playerColor ?? null,
        firstSeenAt: normalizeNumber(profile.firstSeenAt, this.now()),
        lastSeenAt: normalizeNumber(profile.lastSeenAt, this.now()),
        totalPlayMs: normalizeNumber(profile.totalPlayMs),
        totalSeasonScore: normalizeNumber(profile.totalSeasonScore),
        currentSeasonScore: normalizeNumber(profile.currentSeasonScore),
        seasonsPlayed: normalizeNumber(profile.seasonsPlayed),
        seasonWins: normalizeNumber(profile.seasonWins),
        podiums: normalizeNumber(profile.podiums),
        hallOfFameFinishes: normalizeNumber(profile.hallOfFameFinishes),
        currentSettlementId: profile.currentSettlementId ?? null,
        bestSettlement: profile.bestSettlement ? cloneSettlement(profile.bestSettlement) : null,
        recentResults: (profile.recentResults ?? []).map(cloneResult).slice(0, MAX_RECENT_RESULTS),
        badges: (profile.badges ?? []).map(cloneBadge).sort(badgeSort),
      });
    }

    this.dirty = false;
    return true;
  }

  saveNow(_reason: string = 'manual') {
    if (!this.persistencePath) {
      this.dirty = false;
      return false;
    }

    mkdirSync(dirname(this.persistencePath), { recursive: true });
    const snapshot: CompetitionPersistenceSnapshot = {
      schemaVersion: COMPETITION_SCHEMA_VERSION,
      savedAt: this.now(),
      currentSeasonId: this.currentSeasonId,
      processedSeasonIds: Array.from(this.processedSeasonIds).sort(),
      profiles: Array.from(this.profiles.values()).map(cloneProfile),
      settlements: this.settlements.map(cloneSettlement),
    };
    const temporaryPath = `${this.persistencePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
    renameSync(temporaryPath, this.persistencePath);
    this.dirty = false;
    return true;
  }

  saveIfDirty(reason: string = 'autosave') {
    return this.dirty ? this.saveNow(reason) : false;
  }

  recordPlayerConnected(socketId: string, input: {
    playerId: string;
    playerName: string;
    playerColor?: string | null;
    spectator?: boolean;
    connectedAt?: number;
  }) {
    const connectedAt = input.connectedAt ?? this.now();
    if (this.sockets.has(socketId)) {
      this.recordPlayerDisconnected(socketId, connectedAt);
    }
    this.sockets.set(socketId, { playerId: input.playerId, spectator: input.spectator === true });
    if (input.spectator) {
      return;
    }

    this.ensureProfile(input.playerId, input.playerName, input.playerColor ?? null, connectedAt);
    let active = this.activePlayers.get(input.playerId);
    if (!active) {
      active = { socketIds: new Set<string>(), lastFlushedAt: connectedAt };
      this.activePlayers.set(input.playerId, active);
    }
    active.socketIds.add(socketId);
    this.dirty = true;
  }

  recordPlayerDisconnected(socketId: string, disconnectedAt: number = this.now()) {
    const socket = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    if (!socket || socket.spectator) {
      return;
    }

    const active = this.activePlayers.get(socket.playerId);
    if (!active) {
      return;
    }

    active.socketIds.delete(socketId);
    if (active.socketIds.size > 0) {
      return;
    }

    this.addPlaytime(socket.playerId, disconnectedAt - active.lastFlushedAt, disconnectedAt);
    this.activePlayers.delete(socket.playerId);
  }

  flushActiveSessions(flushedAt: number = this.now()) {
    for (const [playerId, active] of this.activePlayers) {
      this.addPlaytime(playerId, flushedAt - active.lastFlushedAt, flushedAt);
      active.lastFlushedAt = flushedAt;
    }
  }

  recordSettlementFounded(input: {
    playerId: string;
    playerName: string;
    playerColor?: string | null;
    settlementId: string;
    foundedAt?: number;
  }) {
    const profile = this.ensureProfile(input.playerId, input.playerName, input.playerColor ?? null, input.foundedAt ?? this.now());
    profile.currentSettlementId = input.settlementId;
    profile.lastSeenAt = input.foundedAt ?? this.now();
    this.dirty = true;
  }

  syncLiveSeason(season: SeasonSnapshot | null | undefined) {
    if (!season) {
      return;
    }

    this.currentSeasonId = season.seasonId;
    for (const entry of season.leaderboard) {
      const profile = this.ensureProfile(entry.playerId, entry.playerName, entry.playerColor ?? null, this.now());
      profile.currentSeasonScore = season.status === 'active' ? entry.score : 0;
      profile.currentSettlementId = entry.settlementId;
    }

    this.dirty = true;
  }

  processCompletedSeason(season: SeasonSnapshot | null | undefined) {
    if (!season || season.status !== 'completed' || this.processedSeasonIds.has(season.seasonId)) {
      return false;
    }

    const completedAt = season.completedAt ?? this.now();
    this.flushActiveSessions(completedAt);
    this.currentSeasonId = season.seasonId;

    for (const entry of season.leaderboard) {
      const profile = this.ensureProfile(entry.playerId, entry.playerName, entry.playerColor ?? null, completedAt);
      const record = entryToSettlementRecord(season, entry, false);
      profile.totalSeasonScore += entry.score;
      profile.currentSeasonScore = 0;
      profile.seasonsPlayed += 1;
      profile.currentSettlementId = entry.settlementId;
      if (entry.rank === 1) profile.seasonWins += 1;
      if (entry.rank <= 3) profile.podiums += 1;
      if (entry.rank <= 10) profile.hallOfFameFinishes += 1;
      if (!profile.bestSettlement || record.score > profile.bestSettlement.score) {
        profile.bestSettlement = cloneSettlement(record);
      }
      profile.recentResults = [{
        seasonId: season.seasonId,
        seed: season.seed,
        completedAt,
        rank: entry.rank,
        score: entry.score,
        settlementId: entry.settlementId,
      }, ...profile.recentResults].slice(0, MAX_RECENT_RESULTS);
      this.upsertSettlementRecord(record);
    }

    for (const reward of season.rewards) {
      const profile = this.profiles.get(reward.playerId);
      if (!profile) {
        continue;
      }
      this.addBadge(profile, createBadgeFromSeasonReward(reward, completedAt));
    }

    for (const profile of this.profiles.values()) {
      this.awardLifetimeMilestones(profile, completedAt);
    }

    this.processedSeasonIds.add(season.seasonId);
    this.dirty = true;
    return true;
  }

  getSnapshot(generatedAt: number = this.now()): CompetitionSnapshot {
    const profiles = Array.from(this.profiles.values())
      .map((profile) => this.profileToSnapshot(profile))
      .sort((left, right) => right.liveOverallScore - left.liveOverallScore || left.playerName.localeCompare(right.playerName));
    const settlements = this.settlements.map(cloneSettlement).sort(settlementSort).slice(0, MAX_SETTLEMENT_RECORDS);
    const badges = profiles.flatMap((profile) => profile.badges).sort(badgeSort);

    return {
      schemaVersion: COMPETITION_SCHEMA_VERSION,
      generatedAt,
      currentSeasonId: this.currentSeasonId,
      processedSeasonIds: Array.from(this.processedSeasonIds).sort(),
      leaderboards: {
        overall: this.buildLeaderboard(profiles, 'overall'),
        hours: this.buildLeaderboard(profiles, 'hours'),
        settlements: this.buildLeaderboard(profiles, 'settlements'),
        badges: this.buildLeaderboard(profiles, 'badges'),
      },
      profiles,
      settlements,
      badges,
    };
  }

  private ensureProfile(playerId: string, playerName: string, playerColor: string | null, seenAt: number) {
    let profile = this.profiles.get(playerId);
    if (!profile) {
      profile = {
        playerId,
        playerName: playerName || 'Pioneer',
        playerColor,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        totalPlayMs: 0,
        totalSeasonScore: 0,
        currentSeasonScore: 0,
        seasonsPlayed: 0,
        seasonWins: 0,
        podiums: 0,
        hallOfFameFinishes: 0,
        currentSettlementId: null,
        bestSettlement: null,
        recentResults: [],
        badges: [],
      };
      this.profiles.set(playerId, profile);
    }

    profile.playerName = playerName || profile.playerName;
    profile.playerColor = playerColor ?? profile.playerColor ?? null;
    profile.lastSeenAt = Math.max(profile.lastSeenAt, seenAt);
    return profile;
  }

  private addPlaytime(playerId: string, playMs: number, seenAt: number) {
    const profile = this.profiles.get(playerId);
    if (!profile || !Number.isFinite(playMs) || playMs <= 0) {
      return;
    }
    profile.totalPlayMs += Math.floor(playMs);
    profile.lastSeenAt = Math.max(profile.lastSeenAt, seenAt);
    this.awardLifetimeMilestones(profile, seenAt);
    this.dirty = true;
  }

  private upsertSettlementRecord(record: CompetitionSettlementRecord) {
    const existingIndex = this.settlements.findIndex((entry) => entry.id === record.id);
    if (existingIndex >= 0) {
      this.settlements.splice(existingIndex, 1, cloneSettlement(record));
    } else {
      this.settlements.push(cloneSettlement(record));
    }
    this.settlements = this.settlements.sort(settlementSort).slice(0, MAX_SETTLEMENT_RECORDS);
  }

  private addBadge(profile: CompetitionProfileState, badge: CompetitionBadge) {
    if (profile.badges.some((entry) => entry.id === badge.id)) {
      return;
    }
    profile.badges.push(cloneBadge(badge));
    profile.badges.sort(badgeSort);
  }

  private awardLifetimeMilestones(profile: CompetitionProfileState, awardedAt: number) {
    const milestones: Array<[boolean, string, string, string]> = [
      [profile.seasonWins >= 1, 'first-win', 'First Win', 'Won a global season.'],
      [profile.seasonWins >= 3, 'three-wins', 'Three Crowns', 'Won three global seasons.'],
      [profile.totalPlayMs >= 10 * 60 * 60_000, 'ten-hours', 'Ten Hour Charter', 'Played for ten total hours.'],
      [profile.totalPlayMs >= 50 * 60 * 60_000, 'fifty-hours', 'Frontier Fixture', 'Played for fifty total hours.'],
      [(profile.bestSettlement?.controlledTiles ?? 0) >= 50, 'frontier-builder', 'Frontier Builder', 'Finished a season controlling fifty tiles.'],
      [(profile.bestSettlement?.shipOrdersCompleted ?? 0) >= 10, 'master-logistician', 'Master Logistician', 'Completed ten ship orders in one settlement record.'],
      [(profile.bestSettlement?.watchtowersControlled ?? 0) >= 5, 'watchtower-warden', 'Watchtower Warden', 'Controlled five watchtowers in one settlement record.'],
      [profile.badges.some((badge) => badge.category === 'resilience'), 'calamity-survivor', 'Calamity Survivor', 'Earned a resilience season badge.'],
    ];

    for (const [earned, id, label, description] of milestones) {
      if (earned) {
        this.addBadge(profile, createMilestoneBadge(profile.playerId, id, label, description, awardedAt));
      }
    }
  }

  private calculateLifetimePoints(profile: CompetitionProfileState) {
    return profile.totalSeasonScore
      + (profile.seasonWins * LIFETIME_WIN_POINTS)
      + (profile.podiums * LIFETIME_PODIUM_POINTS)
      + (profile.badges.length * LIFETIME_BADGE_POINTS);
  }

  private profileToSnapshot(profile: CompetitionProfileState): CompetitionPlayerProfile {
    const lifetimePoints = this.calculateLifetimePoints(profile);
    return {
      ...profile,
      bestSettlement: profile.bestSettlement ? cloneSettlement(profile.bestSettlement) : null,
      recentResults: profile.recentResults.map(cloneResult),
      badges: profile.badges.map(cloneBadge).sort(badgeSort),
      lifetimePoints,
      liveOverallScore: lifetimePoints + profile.currentSeasonScore,
    };
  }

  private buildLeaderboard(profiles: CompetitionPlayerProfile[], kind: CompetitionLeaderboardKind): CompetitionLeaderboardEntry[] {
    const valueFor = (profile: CompetitionPlayerProfile) => {
      if (kind === 'hours') return profile.totalPlayMs;
      if (kind === 'settlements') return profile.bestSettlement?.score ?? 0;
      if (kind === 'badges') return profile.badges.length;
      return profile.liveOverallScore;
    };

    return profiles
      .map((profile) => ({
        rank: 0,
        playerId: profile.playerId,
        playerName: profile.playerName,
        playerColor: profile.playerColor,
        value: valueFor(profile),
        secondaryValue: kind === 'overall' ? profile.currentSeasonScore : profile.liveOverallScore,
        badgeCount: profile.badges.length,
        seasonWins: profile.seasonWins,
        podiums: profile.podiums,
        currentSettlementId: profile.currentSettlementId,
        bestSettlementScore: profile.bestSettlement?.score,
      }))
      .sort((left, right) => right.value - left.value || right.seasonWins - left.seasonWins || left.playerName.localeCompare(right.playerName))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
}

export const competitionState = new CompetitionState();
