import { watch } from 'vue';
import type { LeaderboardEntry, SeasonSnapshot } from '../../shared/seasons/types.ts';
import { currentPlayer, currentPlayerId } from '../socket.ts';
import { gameCenterService } from '../gameCenterService.ts';
import { seasonSnapshot } from '../../store/seasonStore.ts';

const RANK_ACHIEVEMENTS = [
  { id: 'driftlands.rank.top10', rank: 10 },
  { id: 'driftlands.rank.top5', rank: 5 },
  { id: 'driftlands.rank.top1', rank: 1 },
];

class GameCenterHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    watch(
      () => [currentPlayer.value?.id, currentPlayer.value?.name],
      ([playerId, playerName], [previousId] = []) => {
        if (!playerId || previousId === playerId) {
          return;
        }
        void gameCenterService.authenticate(playerId, playerName);
      },
      { immediate: true },
    );

    watch(
      () => seasonSnapshot.value,
      (next, previous) => {
        this.handleSeasonUpdate(next, previous);
      },
    );
  }

  private handleSeasonUpdate(
    next: SeasonSnapshot | null,
    previous: SeasonSnapshot | null | undefined,
  ): void {
    if (!next) {
      return;
    }

    const player = currentPlayer.value;
    const playerId = currentPlayerId.value;
    if (!player || !playerId) {
      return;
    }

    const currentEntry = this.getPlayerEntry(next, playerId);
    const previousEntry = previous ? this.getPlayerEntry(previous, playerId) : null;
    if (!currentEntry) {
      return;
    }

    void gameCenterService.submitSeasonLeaderboard({
      playerId,
      playerName: player.name,
      seasonId: next.seasonId,
      score: currentEntry.score,
      rank: currentEntry.rank,
      leaderboardId: gameCenterService.defaultLeaderboardId(),
    });

    this.handleMilestoneAchievements(next, previous ?? null, currentEntry, previousEntry);
  }

  private handleMilestoneAchievements(
    next: SeasonSnapshot,
    previous: SeasonSnapshot | null,
    currentEntry: LeaderboardEntry,
    previousEntry: LeaderboardEntry | null,
  ): void {
    this.reportScoreAchievements(currentEntry, previousEntry);
    this.reportRankAchievements(currentEntry, previousEntry);
    this.reportDefeatAchievements(currentEntry, previousEntry);
    this.reportSeasonCompletedAchievements(next, previous, currentEntry);
  }

  private reportScoreAchievements(
    currentEntry: LeaderboardEntry,
    previousEntry: LeaderboardEntry | null,
  ): void {
    const previousScoreAchievements = gameCenterService.scoreAchievementsFor(previousEntry?.score ?? 0);
    const currentScoreAchievements = gameCenterService.scoreAchievementsFor(currentEntry.score);

    for (const achievement of currentScoreAchievements) {
      const alreadyEarned = previousScoreAchievements.some((previous) => previous.id === achievement.id);
      if (!alreadyEarned) {
        void gameCenterService.reportAchievement(achievement.id, achievement.percent);
      }
    }
  }

  private reportRankAchievements(
    currentEntry: LeaderboardEntry,
    previousEntry: LeaderboardEntry | null,
  ): void {
    const previousRanks = RANK_ACHIEVEMENTS.filter((entry) =>
      (previousEntry?.rank ?? Number.POSITIVE_INFINITY) <= entry.rank,
    ).map((entry) => entry.id);
    const currentRanks = RANK_ACHIEVEMENTS.filter((entry) => currentEntry.rank <= entry.rank).map((entry) => entry.id);

    for (const rank of currentRanks) {
      if (!previousRanks.includes(rank)) {
        void gameCenterService.reportAchievement(rank, 100);
      }
    }

    if (currentEntry.defeated !== previousEntry?.defeated && currentEntry.defeated === true) {
      void gameCenterService.reportAchievement('driftlands.match.lost', 100);
    }
  }

  private reportDefeatAchievements(
    currentEntry: LeaderboardEntry,
    previousEntry: LeaderboardEntry | null,
  ): void {
    if (!previousEntry) {
      return;
    }

    if (previousEntry.defeated === false && currentEntry.defeated === true) {
      void gameCenterService.reportAchievement('driftlands.defeat.recorded', 100);
    }
  }

  private reportSeasonCompletedAchievements(
    next: SeasonSnapshot,
    previous: SeasonSnapshot | null,
    currentEntry: LeaderboardEntry,
  ): void {
    if (!previous || previous.status === 'completed' || next.status !== 'completed') {
      return;
    }
    if (currentEntry.defeated === true) {
      return;
    }

    for (const achievement of gameCenterService.championAchievements(currentEntry.rank)) {
      void gameCenterService.reportAchievement(achievement.id, achievement.percent);
    }

    void gameCenterService.reportAchievement('driftlands.season.completed', 100);

    if (currentEntry.rank <= 3) {
      void gameCenterService.reportAchievement(`driftlands.season.top${Math.min(3, currentEntry.rank)}`, 100);
    }

    if (currentEntry.rank === 1) {
      const streak = gameCenterService.recordWinStreakOnDay(Date.now(), true);
      for (const streakAchievement of gameCenterService.reportStreakAchievements(streak)) {
        void gameCenterService.reportAchievement(streakAchievement.id, streakAchievement.percent);
      }
    }
  }

  private getPlayerEntry(snapshot: SeasonSnapshot, playerId: string): LeaderboardEntry | null {
    return snapshot.leaderboard.find((entry) => entry.playerId === playerId) ?? null;
  }
}

export const gameCenterHandler = new GameCenterHandler();
