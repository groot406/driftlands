import type { ResourceAmount } from '../../core/types/Resource.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { getClimateProfile, hash32 } from '../../core/worldVariation';
import { getDistanceToNearestTowncenter } from '../game/worldQueries';

export interface FrontierFindResult {
  key: 'supply_cache' | 'ore_seam' | 'survey_beacon' | 'lost_camp';
  label: string;
  title: string;
  description: string;
  resourceRewards: ResourceAmount[];
  bonusScore?: number;
}

interface FrontierFindCandidate {
  weight: number;
  create: () => FrontierFindResult;
}

function roll1000(tile: Tile, salt: number) {
  return hash32(tile.q + (salt * 37), tile.r - (salt * 53)) % 1000;
}

function rollAmount(tile: Tile, salt: number, min: number, max: number) {
  return min + (roll1000(tile, salt) % (max - min + 1));
}

function buildSupplyCache(tile: Tile): FrontierFindResult {
  const woodAmount = rollAmount(tile, 11, 2, tile.terrain === 'water' ? 3 : 4);
  const foodAmount = rollAmount(tile, 12, 1, tile.terrain === 'snow' || tile.terrain === 'dessert' ? 3 : 2);

  if (tile.terrain === 'water') {
    return {
      key: 'supply_cache',
      label: 'Salvage!',
      title: 'Drift Cache',
      description: 'Scouts tow half-sunk crates out of the shallows before the tide can claim them.',
      resourceRewards: [
        { type: 'wood', amount: woodAmount },
        { type: 'food', amount: foodAmount },
      ],
    };
  }

  if (tile.terrain === 'dessert') {
    return {
      key: 'supply_cache',
      label: 'Cache!',
      title: 'Buried Caravan Cache',
      description: 'Wind-cut sand gives up a forgotten bundle of trail supplies and construction timber.',
      resourceRewards: [
        { type: 'wood', amount: woodAmount },
        { type: 'food', amount: foodAmount + 1 },
      ],
    };
  }

  if (tile.terrain === 'snow') {
    return {
      key: 'supply_cache',
      label: 'Cache!',
      title: 'Frozen Supply Crate',
      description: 'Ice preserved a shipment long enough for the expedition to reclaim it.',
      resourceRewards: [
        { type: 'wood', amount: woodAmount },
        { type: 'food', amount: foodAmount + 1 },
      ],
    };
  }

  return {
    key: 'supply_cache',
    label: 'Cache!',
    title: 'Supply Cache',
    description: 'The scouts uncover intact crates and drag the contents back to the warehouse.',
    resourceRewards: [
      { type: 'wood', amount: woodAmount },
      { type: 'food', amount: foodAmount },
    ],
  };
}

function buildOreSeam(tile: Tile): FrontierFindResult {
  const oreAmount = rollAmount(tile, 21, 2, tile.terrain === 'vulcano' ? 5 : 4);

  if (tile.terrain === 'vulcano') {
    return {
      key: 'ore_seam',
      label: 'Ore!',
      title: 'Ashen Ore Seam',
      description: 'Freshly exposed mineral veins can be hauled now, before the crust shifts again.',
      resourceRewards: [{ type: 'ore', amount: oreAmount }],
    };
  }

  return {
    key: 'ore_seam',
    label: 'Ore!',
    title: 'Surface Ore Seam',
    description: 'Loose ore lies close enough to the surface that the scouts can haul it without a full mine.',
    resourceRewards: [{ type: 'ore', amount: oreAmount }],
  };
}

function buildSurveyBeacon(tile: Tile): FrontierFindResult {
  const bonusScore = rollAmount(tile, 31, 30, 55);

  return {
    key: 'survey_beacon',
    label: 'Beacon!',
    title: 'Old Survey Beacon',
    description: 'Recovered route notes and signal marks cut confusion out of the next leg of the expedition.',
    resourceRewards: [],
    bonusScore,
  };
}

function buildLostCamp(tile: Tile): FrontierFindResult {
  return {
    key: 'lost_camp',
    label: 'Camp!',
    title: 'Lost Expedition Camp',
    description: 'The remains of an older camp still hold usable stock and field notes worth salvaging.',
    resourceRewards: [
      { type: 'wood', amount: rollAmount(tile, 41, 2, 4) },
      { type: 'food', amount: rollAmount(tile, 42, 2, 3) },
      { type: 'ore', amount: rollAmount(tile, 43, 1, 3) },
    ],
    bonusScore: rollAmount(tile, 44, 55, 90),
  };
}

function pickCandidate(tile: Tile, candidates: FrontierFindCandidate[]) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (!totalWeight) return null;

  let roll = roll1000(tile, 91) % totalWeight;
  for (const candidate of candidates) {
    if (roll < candidate.weight) {
      return candidate.create();
    }
    roll -= candidate.weight;
  }

  return candidates[0]?.create() ?? null;
}

export function resolveFrontierFind(tile: Tile | null | undefined): FrontierFindResult | null {
  if (!tile?.discovered || !tile.terrain || tile.terrain === 'towncenter') {
    return null;
  }

  const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
  if (distance < 3) {
    return null;
  }

  const climate = getClimateProfile(tile.q, tile.r);
  let threshold = 34 + (Math.max(0, distance - 2) * 4);

  if (tile.terrain === 'mountain' || tile.terrain === 'snow' || tile.terrain === 'vulcano') {
    threshold += 8;
  }

  if (climate.moisture > 0.7 || climate.fertility > 0.66) {
    threshold += 5;
  }

  if (climate.ruggedness > 0.72) {
    threshold += 4;
  }

  if (tile.terrain === 'water') {
    threshold -= 6;
  }

  threshold = Math.max(28, Math.min(92, threshold));
  if (roll1000(tile, 7) >= threshold) {
    return null;
  }

  const candidates: FrontierFindCandidate[] = [];

  if (tile.terrain === 'plains' || tile.terrain === 'forest' || tile.terrain === 'dirt' || tile.terrain === 'dessert' || tile.terrain === 'snow' || tile.terrain === 'water') {
    candidates.push({ weight: tile.terrain === 'water' ? 4 : 7, create: () => buildSupplyCache(tile) });
  }

  if (tile.terrain === 'mountain' || tile.terrain === 'dirt' || tile.terrain === 'vulcano' || tile.terrain === 'snow' || climate.ruggedness > 0.6) {
    candidates.push({ weight: 7, create: () => buildOreSeam(tile) });
  }

  if (distance >= 5) {
    candidates.push({ weight: 5, create: () => buildSurveyBeacon(tile) });
  }

  if (distance >= 7) {
    candidates.push({ weight: 2, create: () => buildLostCamp(tile) });
  }

  return pickCandidate(tile, candidates);
}
