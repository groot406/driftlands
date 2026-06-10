export type DriftlandsBuildTarget = 'web' | 'steam-demo' | 'ipad';

type BuildTargetEnv = {
  VITE_DRIFTLANDS_BUILD_TARGET?: unknown;
};

export function getBuildTarget(env: BuildTargetEnv = import.meta.env): DriftlandsBuildTarget {
  switch (env.VITE_DRIFTLANDS_BUILD_TARGET) {
    case 'steam-demo':
      return 'steam-demo';
    case 'ipad':
      return 'ipad';
    default:
      return 'web';
  }
}

export function isSteamDemoBuild(env: BuildTargetEnv = import.meta.env) {
  return getBuildTarget(env) === 'steam-demo';
}

export function isNativeAppBuild(env: BuildTargetEnv = import.meta.env) {
  return getBuildTarget(env) !== 'web';
}

export function shouldPreferNoWalletStart(env: BuildTargetEnv = import.meta.env) {
  return isNativeAppBuild(env);
}

export function shouldShowWalletExtras(env: BuildTargetEnv = import.meta.env) {
  return getBuildTarget(env) !== 'ipad';
}
