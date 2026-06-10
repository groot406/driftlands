import { watch } from 'vue';
import type { LeaderboardEntry, SeasonSnapshot } from '../../shared/seasons/types.ts';
import { currentPlayer, currentPlayerId } from '../socket.ts';
import { pushNotificationService } from '../pushNotificationService.ts';
import { seasonSnapshot } from '../../store/seasonStore.ts';

const COMEBACK_REMINDER_DELAYS_MS = [25 * 60 * 1000, 2 * 60 * 60 * 1000];

class PushNotificationHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    watch(
      () => [currentPlayer.value?.id, currentPlayer.value?.name],
      ([playerId]) => {
        if (!playerId) {
          return;
        }

        void pushNotificationService.enableNotifications();
      },
    );

    watch(
      () => seasonSnapshot.value,
      (next, previous) => {
        this.handleSeasonUpdate(next, previous);
      },
    );
  }

  private handleSeasonUpdate(next: SeasonSnapshot | null, previous: SeasonSnapshot | null | undefined): void {
    if (!next || !currentPlayer.value || !currentPlayerId.value) {
      return;
    }

    const playerEntry = this.getPlayerEntry(next, currentPlayerId.value);
    const previousEntry = previous ? this.getPlayerEntry(previous, currentPlayerId.value) : null;

    if (!playerEntry) {
      return;
    }

    if (previous && previous.currentStage !== next.currentStage) {
      void pushNotificationService.notifyEvent({
        eventId: `season-stage:${next.seasonId}:${next.currentStage}`,
        title: 'Season phase updated',
        body: `The frontier moved to ${next.currentStage}.`,
        cooldownMs: 10 * 60 * 1000,
      });
    }

    if (previous && previous.status !== 'completed' && next.status === 'completed') {
      void this.sendSeasonCompletedNotifications(next, playerEntry);
      return;
    }

    if (!previous || previous.status === 'archived') {
      return;
    }

    this.sendDefeatNotificationIfNeeded(playerEntry, previousEntry);
  }

  private async sendSeasonCompletedNotifications(season: SeasonSnapshot, entry: LeaderboardEntry): Promise<void> {
    const seasonTitle = 'Season ended';

    if (entry.defeated) {
      await pushNotificationService.notifyReward({
        seasonId: season.seasonId,
        playerId: entry.playerId,
        title: seasonTitle,
        body: 'Your settlement was defeated, but you can return for a fresh run right away.',
      });
      return;
    }

    if (entry.rank === 1) {
      await pushNotificationService.notifyReward({
        seasonId: season.seasonId,
        playerId: entry.playerId,
        title: 'You took first place',
        body: 'Commander, your colony is champion. Start a new season and defend your title.',
      });
    } else if (entry.rank <= 3) {
      await pushNotificationService.notifyReward({
        seasonId: season.seasonId,
        playerId: entry.playerId,
        title: 'Strong finish',
        body: `You placed #${entry.rank} in the season. A top finish unlocks comeback bonus rewards.`,
      });
    } else {
      await pushNotificationService.notifyReward({
        seasonId: season.seasonId,
        playerId: entry.playerId,
        title: seasonTitle,
        body: `You finished with ${entry.score.toLocaleString()} points. Come back soon to climb the board.`,
      });
    }

    await pushNotificationService.notifySeasonMilestone({
      seasonId: season.seasonId,
      playerId: entry.playerId,
      title: 'Season recap',
      body: 'New seasons rotate soon. Return for fresh goals and fresh rewards.',
      delayMs: 45 * 60 * 1000,
      cooldownMs: 6 * 60 * 60 * 1000,
    });

    await this.scheduleComebackReminders(`season-complete:${season.seasonId}:${entry.playerId}`);
  }

  private async sendDefeatNotificationIfNeeded(
    currentEntry: LeaderboardEntry,
    previousEntry: LeaderboardEntry | null,
  ): Promise<void> {
    if (!previousEntry || previousEntry.defeated === currentEntry.defeated) {
      return;
    }

    if (previousEntry.defeated || !currentEntry.defeated) {
      return;
    }

    await pushNotificationService.notifyEvent({
      eventId: `defeat:${currentEntry.playerId}`,
      title: 'Settlement defeated',
      body: 'Your base was captured. You can start a fresh run from the title screen.',
      cooldownMs: 30 * 60 * 1000,
    });

    await this.scheduleComebackReminders(`defeat:${currentEntry.playerId}`);
  }

  private async scheduleComebackReminders(reminderId: string): Promise<void> {
    for (const delayMs of COMEBACK_REMINDER_DELAYS_MS) {
      await pushNotificationService.scheduleComebackReminder({
        reminderId: `${reminderId}:${delayMs}`,
        title: 'Comeback ready',
        body: 'Your next run starts from the title screen. Your progress loop is waiting.',
        delayMs,
      });
    }
  }

  private getPlayerEntry(snapshot: SeasonSnapshot, playerId: string): LeaderboardEntry | null {
    return snapshot.leaderboard.find((entry) => entry.playerId === playerId) ?? null;
  }
}

export const pushNotificationHandler = new PushNotificationHandler();
