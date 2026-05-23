import { ref } from 'vue';
import type { ActiveSeasonStageKey, SeasonSnapshot, SeasonStageConfig, SeasonStageKey } from '../shared/seasons/types.ts';

export interface SeasonStageAnnouncement {
  id: string;
  seasonId: string;
  previousStage: SeasonStageKey;
  stage: ActiveSeasonStageKey;
  stageStartedAt: number;
  stageEndsAt: number | null;
  config: SeasonStageConfig | null;
  endGoalCount: number;
}

export const activeSeasonStageAnnouncement = ref<SeasonStageAnnouncement | null>(null);

export function queueSeasonStageAnnouncement(previous: SeasonSnapshot, next: SeasonSnapshot) {
  if (
    previous.seasonId !== next.seasonId
    || previous.currentStage === next.currentStage
    || next.currentStage === 'completed'
  ) {
    return;
  }

  const config = next.config.stages.find((stage) => stage.key === next.currentStage) ?? null;
  activeSeasonStageAnnouncement.value = {
    id: `${next.seasonId}:${next.currentStage}:${next.stageStartedAt}`,
    seasonId: next.seasonId,
    previousStage: previous.currentStage,
    stage: next.currentStage,
    stageStartedAt: next.stageStartedAt,
    stageEndsAt: next.stageEndsAt,
    config,
    endGoalCount: next.endGoals.filter((goal) => goal.enabled).length,
  };
}

export function dismissSeasonStageAnnouncement() {
  activeSeasonStageAnnouncement.value = null;
}
