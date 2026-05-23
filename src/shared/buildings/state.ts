import type { Tile } from '../../core/types/Tile.ts';
import type { StorageKind } from '../game/storage.ts';
import { getBuildingDefinitionForTile, type BuildingDefinition } from './registry.ts';
import { getUpgradeDefinitionByKey, listUpgradeDefinitions, type UpgradeDefinition } from './upgrades.ts';
import { getStudyJobOutputMultiplier } from '../../store/studyStore.ts';
import { getTileProductionBoostMultiplier } from '../game/tileFeatures.ts';
import { getTileSettlementId } from '../game/settlement.ts';

export interface BuildingStateSnapshot {
  building: BuildingDefinition;
  upgrade: UpgradeDefinition | null;
  level: number;
  houseBeds: number | null;
  houseGoodsCapacity: number | null;
  houseComfortHappiness: number | null;
  storageKind: StorageKind | null;
  jobOutputMultiplier: number;
}

function getAppliedUpgradeForTile(tile: Tile | null | undefined) {
  if (!tile?.variant) {
    return null;
  }

  for (const upgrade of listUpgradeDefinitions()) {
    for (const fromVariant of upgrade.fromVariants) {
      if (upgrade.resolveToVariant({ ...tile, variant: fromVariant } as Tile) === tile.variant) {
        return upgrade;
      }
    }
  }

  return null;
}

export function getUpgradeDefinitionForTile(tile: Tile | null | undefined) {
  return getAppliedUpgradeForTile(tile);
}

export function resolveBuildingStateForTile(tile: Tile | null | undefined): BuildingStateSnapshot | null {
  const building = getBuildingDefinitionForTile(tile);
  if (!building) {
    return null;
  }

  const upgrade = getAppliedUpgradeForTile(tile);
  const houseBeds = building.key === 'house'
    ? (upgrade?.effects.find((effect) => effect.kind === 'house_beds_total')?.value ?? 2)
    : null;
  const houseGoodsCapacity = building.key === 'house'
    ? (upgrade?.effects.find((effect) => effect.kind === 'house_goods_capacity')?.value ?? 1)
    : null;
  const houseComfortHappiness = building.key === 'house'
    ? (upgrade?.effects.find((effect) => effect.kind === 'house_comfort_happiness')?.value ?? 0)
    : null;
  const storageKind = building.providesWarehouse
    ? ((upgrade?.effects.find((effect) => effect.kind === 'storage_kind_override')?.value
      ?? building.storageKind
      ?? (building.key === 'supplyDepot' ? 'depot' : 'warehouse')) as StorageKind)
    : (building.key === 'supplyDepot' ? 'depot' : null);
  const upgradeOutputMultiplier = upgrade?.effects.find((effect) => effect.kind === 'job_output_multiplier')?.value ?? 1;
  const jobOutputMultiplier = upgradeOutputMultiplier * getStudyJobOutputMultiplier(getTileSettlementId(tile)) * getTileProductionBoostMultiplier(tile);

  return {
    building,
    upgrade,
    level: upgrade ? 2 : 1,
    houseBeds,
    houseGoodsCapacity,
    houseComfortHappiness,
    storageKind,
    jobOutputMultiplier,
  };
}

export function getHouseBedCapacityForTile(tile: Tile | null | undefined) {
  return resolveBuildingStateForTile(tile)?.houseBeds ?? 0;
}

export function getHouseGoodCapacityForTile(tile: Tile | null | undefined) {
  return resolveBuildingStateForTile(tile)?.houseGoodsCapacity ?? 0;
}

export function getHouseComfortHappinessForTile(tile: Tile | null | undefined) {
  return resolveBuildingStateForTile(tile)?.houseComfortHappiness ?? 0;
}

export function getStorageKindForBuildingTile(tile: Tile | null | undefined) {
  return resolveBuildingStateForTile(tile)?.storageKind ?? null;
}

export function getBuildingOutputMultiplier(tile: Tile | null | undefined) {
  return resolveBuildingStateForTile(tile)?.jobOutputMultiplier ?? 1;
}

export function getUpgradeDefinitionByBuildingStateKey(upgradeKey: string) {
  return getUpgradeDefinitionByKey(upgradeKey);
}
