import type { ResourceAmount, ResourceType } from '../../../src/shared/game/types/Resource.ts';
import type { ResourceWithdrawMessage, StewardshipReportMessage, TileUpdatedMessage } from '../../../src/shared/protocol.ts';
import { tiles } from '../../../src/shared/game/world.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime.ts';
import { settlers } from '../../../src/shared/game/state/settlerStore.ts';
import {
  planResourceWithdrawalsAcrossStoragesForSettlement,
  withdrawResourceAcrossStoragesForSettlement,
} from '../../../src/shared/game/state/resourceStore.ts';
import {
  REPAIR_CYCLE_MS,
  REPAIR_RESTORE_AMOUNT,
  getRepairNeededAmount,
  getTileConditionState,
  getTileRepairResources,
  initializeBuildingCondition,
  isMaintainedBuildingTile,
  updateTileCondition,
} from '../../../src/shared/buildings/maintenance.ts';

const MIN_REPORT_OFFLINE_MS = 5 * 60_000;
const MAX_STEWARDSHIP_OFFLINE_MS = 12 * 60 * 60_000;

function addResourceAmount(map: Map<ResourceType, number>, resource: ResourceAmount) {
  if (resource.amount <= 0) {
    return;
  }

  map.set(resource.type, (map.get(resource.type) ?? 0) + resource.amount);
}

function mapToResourceAmounts(map: Map<ResourceType, number>): ResourceAmount[] {
  return Array.from(map.entries())
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ type, amount }))
    .sort((left, right) => left.type.localeCompare(right.type));
}

function getSettlementIds() {
  return tiles
    .filter((tile) => tile.discovered && tile.terrain === 'towncenter')
    .map((tile) => getTileSettlementId(tile) ?? tile.id)
    .sort((left, right) => left.localeCompare(right));
}

function countAvailableRepairSettlers(settlementId: string) {
  return settlers.filter((settler) => (
    settler.settlementId === settlementId
    && settler.assignedRole !== 'guard'
    && (settler.assignedRole == null || settler.assignedRole === 'repair')
  )).length;
}

function canSpendRepairResources(settlementId: string, resources: ResourceAmount[]) {
  const shortfalls: ResourceAmount[] = [];

  for (const resource of resources) {
    const planned = planResourceWithdrawalsAcrossStoragesForSettlement(settlementId, resource.type, resource.amount);
    const plannedAmount = planned.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (plannedAmount < resource.amount) {
      shortfalls.push({
        type: resource.type,
        amount: resource.amount - plannedAmount,
      });
    }
  }

  return shortfalls;
}

function spendRepairResources(settlementId: string, resources: ResourceAmount[], spent: Map<ResourceType, number>) {
  for (const resource of resources) {
    const withdrawals = withdrawResourceAcrossStoragesForSettlement(settlementId, resource.type, resource.amount);
    for (const withdrawal of withdrawals) {
      if (withdrawal.amount <= 0) {
        continue;
      }

      addResourceAmount(spent, { type: resource.type, amount: withdrawal.amount });
      broadcast({
        type: 'resource:withdraw',
        heroId: 'stewardship:repair',
        storageTileId: withdrawal.storageTileId,
        resource: { type: resource.type, amount: withdrawal.amount },
      } satisfies ResourceWithdrawMessage);
    }
  }
}

function summarizeNextActions(
  remainingOfflineBuildings: number,
  remainingDamagedBuildings: number,
  resourceShortfalls: ResourceAmount[],
  availableRepairSettlers: number,
) {
  const actions: string[] = [];

  if (resourceShortfalls.length > 0) {
    actions.push(`Restock ${resourceShortfalls.map((resource) => resource.type.replaceAll('_', ' ')).join(', ')} for repairs.`);
  }
  if (availableRepairSettlers <= 0 && (remainingOfflineBuildings > 0 || remainingDamagedBuildings > 0)) {
    actions.push('Free up settlers or add housing so emergency repairs can run.');
  }
  if (remainingOfflineBuildings > 0) {
    actions.push('Inspect offline buildings first; they are not producing until repaired.');
  } else if (remainingDamagedBuildings > 0) {
    actions.push('Let repair crews finish the damaged buildings before expanding again.');
  }

  if (actions.length === 0) {
    actions.push('The settlement handled the night. Keep small wood and stone reserves for the next absence.');
  }

  return actions.slice(0, 3);
}

export function resolveStewardshipAfterAbsence(
  offlineMs: number,
  now: number = Date.now(),
): StewardshipReportMessage[] {
  if (offlineMs < MIN_REPORT_OFFLINE_MS) {
    return [];
  }

  const effectiveOfflineMs = Math.min(MAX_STEWARDSHIP_OFFLINE_MS, Math.max(0, offlineMs));
  const reports: StewardshipReportMessage[] = [];

  for (const settlementId of getSettlementIds()) {
    const availableRepairSettlers = countAvailableRepairSettlers(settlementId);
    let availableRepairCycles = availableRepairSettlers * Math.floor(effectiveOfflineMs / REPAIR_CYCLE_MS);
    const affectedTileIds = new Set<string>();
    const repairedTileIds = new Set<string>();
    const resourcesSpent = new Map<ResourceType, number>();
    const resourceShortfalls = new Map<ResourceType, number>();
    let repairCycles = 0;

    const repairTargets = tiles
      .filter((tile) => getTileSettlementId(tile) === settlementId)
      .filter((tile) => isMaintainedBuildingTile(tile))
      .filter((tile) => getRepairNeededAmount(tile) > 0)
      .sort((left, right) => {
        const leftState = getTileConditionState(left.condition);
        const rightState = getTileConditionState(right.condition);
        const stateRank = { offline: 3, damaged: 2, worn: 1, healthy: 0 };
        const stateDelta = stateRank[rightState] - stateRank[leftState];
        if (stateDelta !== 0) {
          return stateDelta;
        }
        return getRepairNeededAmount(right) - getRepairNeededAmount(left);
      });

    for (const tile of repairTargets) {
      initializeBuildingCondition(tile, now);

      while (availableRepairCycles > 0 && getRepairNeededAmount(tile) > 0) {
        const repairResources = getTileRepairResources(tile);
        const shortfalls = canSpendRepairResources(settlementId, repairResources);
        if (shortfalls.length > 0) {
          for (const shortfall of shortfalls) {
            addResourceAmount(resourceShortfalls, shortfall);
          }
          break;
        }

        spendRepairResources(settlementId, repairResources, resourcesSpent);
        const nextCondition = Math.min(100, (tile.condition ?? 100) + REPAIR_RESTORE_AMOUNT);
        if (updateTileCondition(tile, nextCondition, now)) {
          affectedTileIds.add(tile.id);
          if (getRepairNeededAmount(tile) <= 0) {
            repairedTileIds.add(tile.id);
          }
          broadcast({ type: 'tile:updated', tile } satisfies TileUpdatedMessage);
        }

        repairCycles++;
        availableRepairCycles--;
      }
    }

    const remainingOfflineBuildings = tiles.filter((tile) => (
      getTileSettlementId(tile) === settlementId
      && isMaintainedBuildingTile(tile)
      && getTileConditionState(tile.condition) === 'offline'
    )).length;
    const remainingDamagedBuildings = tiles.filter((tile) => (
      getTileSettlementId(tile) === settlementId
      && isMaintainedBuildingTile(tile)
      && getTileConditionState(tile.condition) === 'damaged'
    )).length;

    const resourcesSpentList = mapToResourceAmounts(resourcesSpent);
    const resourceShortfallList = mapToResourceAmounts(resourceShortfalls);
    const repairedBuildings = repairedTileIds.size;
    const title = repairedBuildings > 0
      ? 'Night watch repairs complete'
      : 'Night watch report';
    const message = repairedBuildings > 0
      ? `${repairedBuildings} building${repairedBuildings === 1 ? '' : 's'} repaired while you were away.`
      : remainingOfflineBuildings > 0 || remainingDamagedBuildings > 0
        ? 'The settlement held together, but repair crews still need attention.'
        : 'The settlement stayed stable while you were away.';

    reports.push({
      type: 'stewardship:report',
      settlementId,
      offlineMs,
      title,
      message,
      repairedBuildings,
      repairCycles,
      remainingDamagedBuildings,
      remainingOfflineBuildings,
      resourcesSpent: resourcesSpentList,
      resourceShortfalls: resourceShortfallList,
      affectedTileIds: Array.from(affectedTileIds).sort((left, right) => left.localeCompare(right)),
      nextActions: summarizeNextActions(
        remainingOfflineBuildings,
        remainingDamagedBuildings,
        resourceShortfallList,
        availableRepairSettlers,
      ),
      timestamp: now,
    });
  }

  return reports;
}
