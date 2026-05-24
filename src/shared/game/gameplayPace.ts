import type { SeasonStageGameplayConfig } from '../seasons/types.ts';

type GameplayPaceProvider = () => SeasonStageGameplayConfig | null | undefined;

let gameplayPaceProvider: GameplayPaceProvider = () => null;

function normalizeMultiplier(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(0.01, Math.min(100, parsed));
}

function getGameplayConfig() {
  return gameplayPaceProvider() ?? null;
}

function getBaseGameSpeedMultiplier(config: SeasonStageGameplayConfig | null | undefined) {
  return normalizeMultiplier(config?.gameSpeedMultiplier, 1);
}

function getSpecificMultiplier(key: keyof SeasonStageGameplayConfig) {
  const config = getGameplayConfig();
  const base = getBaseGameSpeedMultiplier(config);
  return normalizeMultiplier(config?.[key], base);
}

export function configureGameplayPaceProvider(provider: GameplayPaceProvider | null | undefined) {
  gameplayPaceProvider = provider ?? (() => null);
}

export function resetGameplayPaceProvider() {
  configureGameplayPaceProvider(null);
}

export function getHeroMovementSpeedMultiplier() {
  return getSpecificMultiplier('heroMovementSpeedMultiplier');
}

export function getTaskProgressSpeedMultiplier() {
  return getSpecificMultiplier('taskProgressSpeedMultiplier');
}

export function getGrowthPaceMultiplier() {
  return getSpecificMultiplier('growthSpeedMultiplier');
}

export function getPopulationGrowthPaceMultiplier() {
  return getSpecificMultiplier('populationGrowthSpeedMultiplier');
}

export function getSettlerCyclePaceMultiplier() {
  return getSpecificMultiplier('settlerCycleSpeedMultiplier');
}

export function getGuardTrainingPaceMultiplier() {
  return getSpecificMultiplier('guardTrainingSpeedMultiplier');
}

export function getShipSchedulePaceMultiplier() {
  return getSpecificMultiplier('shipScheduleSpeedMultiplier');
}

export function getCalamitySchedulePaceMultiplier() {
  return getSpecificMultiplier('calamityScheduleSpeedMultiplier');
}
