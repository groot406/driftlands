import { computed, ref } from 'vue';
import type { SeasonSnapshot } from '../shared/seasons/types.ts';
import { queueSeasonStageAnnouncement } from './seasonStageAnnouncementStore.ts';
import { queueSettlementDefeatAnnouncements, resetSettlementDefeats } from './settlementDefeatStore.ts';

export const seasonSnapshot = ref<SeasonSnapshot | null>(null);
export const seasonVersion = ref(0);

function cloneSeasonSnapshot(season: SeasonSnapshot): SeasonSnapshot {
  return {
    ...season,
    config: {
      stages: season.config.stages.map((stage) => ({
        ...stage,
        scoreMultiplier: stage.scoreMultiplier ? { ...stage.scoreMultiplier } : undefined,
        gameplay: stage.gameplay ? { ...stage.gameplay } : undefined,
      })),
      endGoals: season.config.endGoals.map((goal) => ({
        ...goal,
        enabledDuring: goal.enabledDuring.slice(),
      })),
    },
    completedReason: season.completedReason ? { ...season.completedReason } : undefined,
    leaderboard: season.leaderboard.map((entry) => ({
      ...entry,
      breakdown: { ...entry.breakdown },
      rewardTitles: entry.rewardTitles.slice(),
    })),
    endGoals: season.endGoals.map((goal) => ({ ...goal })),
    rewards: season.rewards.map((reward) => ({ ...reward })),
    archive: season.archive.map((entry) => ({
      ...entry,
      completedReason: entry.completedReason ? { ...entry.completedReason } : undefined,
      winner: entry.winner ? { ...entry.winner } : undefined,
      leaderboard: entry.leaderboard.map((leaderboardEntry) => ({
        ...leaderboardEntry,
        breakdown: { ...leaderboardEntry.breakdown },
        rewardTitles: leaderboardEntry.rewardTitles.slice(),
      })),
      rewards: entry.rewards.map((reward) => ({ ...reward })),
    })),
  };
}

export function loadSeasonState(season: SeasonSnapshot) {
  const previous = seasonSnapshot.value;
  const next = cloneSeasonSnapshot(season);
  seasonSnapshot.value = next;
  if (previous) {
    queueSeasonStageAnnouncement(previous, next);
    queueSettlementDefeatAnnouncements(previous, next);
  }
  seasonVersion.value++;
}

export function resetSeasonStore() {
  seasonSnapshot.value = null;
  resetSettlementDefeats();
  seasonVersion.value++;
}

export function getSeasonEntryForPlayer(playerId: string | null | undefined) {
  if (!playerId) {
    return null;
  }

  return seasonSnapshot.value?.leaderboard.find((entry) => entry.playerId === playerId) ?? null;
}

export function isPlayerDefeatedInCurrentSeason(playerId: string | null | undefined) {
  return getSeasonEntryForPlayer(playerId)?.defeated === true;
}

export const seasonCompleted = computed(() => seasonSnapshot.value?.status === 'completed');
