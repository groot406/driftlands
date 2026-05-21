import type { TerrainKey } from '../../core/terrainDefs.ts';
import { axialDistanceCoords } from '../game/hex.ts';

export type LandingArchetype = 'shoreline' | 'woodland' | 'open_field';

export interface LandingProfileTile {
  q: number;
  r: number;
  terrain: TerrainKey | null | undefined;
  discovered?: boolean;
}

export interface LandingProfile {
  archetype: LandingArchetype;
  terrainCounts: Partial<Record<TerrainKey, number>>;
  radius: number;
}

export const DEFAULT_LANDING_PROFILE_RADIUS = 6;

export function classifyLandingArchetype(terrainCounts: Partial<Record<string, number>>): LandingArchetype {
  if ((terrainCounts.water ?? 0) > 0) {
    return 'shoreline';
  }

  if ((terrainCounts.forest ?? 0) > 0) {
    return 'woodland';
  }

  return 'open_field';
}

export function createLandingProfile(
  tiles: readonly LandingProfileTile[],
  origin: { q: number; r: number } = { q: 0, r: 0 },
  radius: number = DEFAULT_LANDING_PROFILE_RADIUS,
): LandingProfile {
  const resolvedRadius = Math.max(1, Math.floor(radius));
  const terrainCounts: Partial<Record<TerrainKey, number>> = {};

  for (const tile of tiles) {
    if (tile.discovered === false || !tile.terrain) {
      continue;
    }

    if (axialDistanceCoords(origin.q, origin.r, tile.q, tile.r) > resolvedRadius) {
      continue;
    }

    terrainCounts[tile.terrain] = (terrainCounts[tile.terrain] ?? 0) + 1;
  }

  return {
    archetype: classifyLandingArchetype(terrainCounts),
    terrainCounts,
    radius: resolvedRadius,
  };
}
