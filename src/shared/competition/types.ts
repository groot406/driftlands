import type { ScoreBreakdown, ScoreCategory, SeasonRewardKind } from '../seasons/types.ts';

export type CompetitionBadgeKind = SeasonRewardKind | 'milestone';
export type CompetitionLeaderboardKind = 'overall' | 'hours' | 'settlements' | 'badges';

export interface CompetitionBadge {
  id: string;
  kind: CompetitionBadgeKind;
  playerId: string;
  label: string;
  description: string;
  awardedAt: number;
  seasonId?: string;
  category?: ScoreCategory | 'overall' | 'lifetime';
}

export interface CompetitionSettlementRecord {
  id: string;
  playerId: string;
  playerName: string;
  playerColor?: string | null;
  settlementId: string;
  seasonId: string;
  seed: number;
  score: number;
  rank: number;
  completedAt: number;
  live: boolean;
  breakdown: ScoreBreakdown;
  controlledTiles: number;
  discoveredTiles: number;
  activeTiles: number;
  watchtowersControlled: number;
  shipOrdersCompleted: number;
}

export interface CompetitionSeasonResult {
  seasonId: string;
  seed: number;
  completedAt: number;
  rank: number;
  score: number;
  settlementId: string;
}

export interface CompetitionPlayerProfile {
  playerId: string;
  playerName: string;
  playerColor?: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  totalPlayMs: number;
  totalSeasonScore: number;
  currentSeasonScore: number;
  lifetimePoints: number;
  liveOverallScore: number;
  seasonsPlayed: number;
  seasonWins: number;
  podiums: number;
  hallOfFameFinishes: number;
  currentSettlementId: string | null;
  bestSettlement: CompetitionSettlementRecord | null;
  recentResults: CompetitionSeasonResult[];
  badges: CompetitionBadge[];
}

export interface CompetitionLeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  playerColor?: string | null;
  value: number;
  secondaryValue?: number;
  badgeCount: number;
  seasonWins: number;
  podiums: number;
  currentSettlementId: string | null;
  bestSettlementScore?: number;
}

export interface CompetitionSnapshot {
  schemaVersion: number;
  generatedAt: number;
  currentSeasonId: string | null;
  processedSeasonIds: string[];
  leaderboards: Record<CompetitionLeaderboardKind, CompetitionLeaderboardEntry[]>;
  profiles: CompetitionPlayerProfile[];
  settlements: CompetitionSettlementRecord[];
  badges: CompetitionBadge[];
}
