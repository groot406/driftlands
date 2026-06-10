import { ref } from 'vue';
import type {
  CompetitionBadge,
  CompetitionPlayerProfile,
  CompetitionSeasonResult,
  CompetitionSettlementRecord,
  CompetitionSnapshot,
} from '../shared/competition/types.ts';

export const competitionSnapshot = ref<CompetitionSnapshot | null>(null);
export const competitionVersion = ref(0);

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

function cloneProfile(profile: CompetitionPlayerProfile): CompetitionPlayerProfile {
  return {
    ...profile,
    bestSettlement: profile.bestSettlement ? cloneSettlement(profile.bestSettlement) : null,
    recentResults: profile.recentResults.map(cloneResult),
    badges: profile.badges.map(cloneBadge),
  };
}

function cloneCompetitionSnapshot(snapshot: CompetitionSnapshot): CompetitionSnapshot {
  return {
    ...snapshot,
    processedSeasonIds: snapshot.processedSeasonIds.slice(),
    leaderboards: {
      overall: snapshot.leaderboards.overall.map((entry) => ({ ...entry })),
      hours: snapshot.leaderboards.hours.map((entry) => ({ ...entry })),
      settlements: snapshot.leaderboards.settlements.map((entry) => ({ ...entry })),
      badges: snapshot.leaderboards.badges.map((entry) => ({ ...entry })),
    },
    profiles: snapshot.profiles.map(cloneProfile),
    settlements: snapshot.settlements.map(cloneSettlement),
    badges: snapshot.badges.map(cloneBadge),
  };
}

export function loadCompetitionState(snapshot: CompetitionSnapshot) {
  competitionSnapshot.value = cloneCompetitionSnapshot(snapshot);
  competitionVersion.value++;
}

export function resetCompetitionStore() {
  competitionSnapshot.value = null;
  competitionVersion.value++;
}

export function getCompetitionProfileForPlayer(playerId: string | null | undefined) {
  if (!playerId) {
    return null;
  }

  return competitionSnapshot.value?.profiles.find((profile) => profile.playerId === playerId) ?? null;
}
