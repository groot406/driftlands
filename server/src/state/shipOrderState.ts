import { broadcast } from '../messages/messageRouter';
import type { ResourceDepositMessage, ResourceWithdrawMessage, ShipOrderUpdateMessage } from '../../../src/shared/protocol.ts';
import type { ResourceAmount, ResourceType } from '../../../src/core/types/Resource.ts';
import { tiles } from '../../../src/shared/game/world.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';
import { isHarborTile } from '../../../src/shared/game/harbor.ts';
import {
  getShipOrderResourceAmountValue,
  getShipOrderResourceValue,
  isShipOrderResourceType,
  type ShipOrderOverviewSnapshot,
  type ShipOrderResourceType,
  type ShipOrderSnapshot,
} from '../../../src/shared/game/shipOrders.ts';
import {
  depositResourceAcrossStoragesForSettlement,
  planResourceWithdrawalsAcrossStoragesForSettlement,
  withdrawResourceAcrossStoragesForSettlement,
} from '../../../src/shared/game/state/resourceStore.ts';
import { isUnlimitedResourcesEnabled, testModeSettings } from '../../../src/shared/game/testMode.ts';
import { playerSettlementState } from './playerSettlementState';
import { marketState } from './marketState';

const SHIP_DURATION_MS = 12 * 60_000;
const FIRST_SHIP_ARRIVAL_MIN_MS = 2 * 60_000;
const FIRST_SHIP_ARRIVAL_MAX_MS = 5 * 60_000;
const NEXT_SHIP_ARRIVAL_MIN_MS = 15 * 60_000;
const NEXT_SHIP_ARRIVAL_MAX_MS = 20 * 60_000;
const SHIP_REWARD_POOL_GOLD = 120;
const FULL_ORDER_MULTIPLIER = 1.25;
const TOP_CONTRIBUTOR_BONUS_GOLD = 25;

const SHIP_NAMES = [
  'The Gullwing',
  'Morrow Tide',
  'Lantern Wake',
  'Saltmere',
  'Copper Gull',
];

interface ShipRouteTemplate {
  origin: string;
  originDescription: string;
  requested: readonly { type: ShipOrderResourceType; amount: number }[];
  rewardGoods: readonly ResourceAmount[];
}

const ORDER_TEMPLATES: readonly ShipRouteTemplate[] = [
  {
    origin: 'North Sea traders',
    originDescription: 'Coastal merchants trade durable pottery and tea picked up through northern exchange ports.',
    requested: [
      { type: 'wood', amount: 40 },
      { type: 'fish', amount: 20 },
      { type: 'stone', amount: 12 },
    ],
    rewardGoods: [
      { type: 'pottery', amount: 12 },
      { type: 'tea', amount: 8 },
    ],
  },
  {
    origin: 'Eastern tea ports',
    originDescription: 'Long-route captains carry tea chests and bolts of silk from humid eastern harbors.',
    requested: [
      { type: 'grain', amount: 30 },
      { type: 'wood', amount: 28 },
      { type: 'ore', amount: 10 },
    ],
    rewardGoods: [
      { type: 'tea', amount: 18 },
      { type: 'silk', amount: 6 },
    ],
  },
  {
    origin: 'Mediterranean convoy',
    originDescription: 'Sun-warmed convoy holds are packed with spices, amphorae, and glazed pottery.',
    requested: [
      { type: 'stone', amount: 24 },
      { type: 'ore', amount: 14 },
      { type: 'tools', amount: 4 },
    ],
    rewardGoods: [
      { type: 'spices', amount: 12 },
      { type: 'pottery', amount: 8 },
    ],
  },
  {
    origin: 'Silk road factors',
    originDescription: 'Overland factors consolidate silk and spices before sending them onward by sea.',
    requested: [
      { type: 'meat', amount: 24 },
      { type: 'bread', amount: 12 },
      { type: 'weapons', amount: 4 },
      { type: 'wood', amount: 24 },
    ],
    rewardGoods: [
      { type: 'silk', amount: 10 },
      { type: 'spices', amount: 8 },
    ],
  },
] as const;

function cloneOrder(order: ShipOrderSnapshot): ShipOrderSnapshot {
  return {
    ...order,
    requested: order.requested.map((resource) => ({ ...resource })),
    rewardGoods: order.rewardGoods.map((resource) => ({ ...resource })),
    fulfilled: { ...order.fulfilled },
    contributions: order.contributions.map((contribution) => ({
      ...contribution,
      resources: { ...contribution.resources },
      rewardGoods: contribution.rewardGoods.map((resource) => ({ ...resource })),
    })),
  };
}

function hasSettlementHarbor(settlementId: string | null | undefined) {
  if (!settlementId) {
    return false;
  }

  return tiles.some((tile) => isHarborTile(tile) && getTileSettlementId(tile) === settlementId);
}

function hasAnyHarbor() {
  return tiles.some((tile) => isHarborTile(tile) && !!getTileSettlementId(tile));
}

function getRequestedAmount(order: ShipOrderSnapshot, resourceType: ShipOrderResourceType) {
  return order.requested.find((resource) => resource.type === resourceType)?.amount ?? 0;
}

function getRemainingAmount(order: ShipOrderSnapshot, resourceType: ShipOrderResourceType) {
  return Math.max(0, getRequestedAmount(order, resourceType) - (order.fulfilled[resourceType] ?? 0));
}

function randomDelay(minMs: number, maxMs: number) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

class ShipOrderState {
  private activeOrder: ShipOrderSnapshot | null = null;
  private lastDepartedOrder: ShipOrderSnapshot | null = null;
  private nextArrivalAt: number | null = null;
  private sequence = 0;

  reset() {
    this.activeOrder = null;
    this.lastDepartedOrder = null;
    this.nextArrivalAt = null;
    this.sequence = 0;
  }

  tick(now: number) {
    if (this.activeOrder && now >= this.activeOrder.departsAt) {
      this.departActiveOrder(now);
      this.broadcastUpdate();
      return;
    }

    if (this.activeOrder || !hasAnyHarbor()) {
      return;
    }

    if (this.nextArrivalAt == null) {
      this.nextArrivalAt = now + randomDelay(FIRST_SHIP_ARRIVAL_MIN_MS, FIRST_SHIP_ARRIVAL_MAX_MS);
      this.broadcastUpdate();
      return;
    }

    if (now >= this.nextArrivalAt) {
      this.activeOrder = this.createOrder(now);
      this.nextArrivalAt = null;
      this.broadcastUpdate();
    }
  }

  getOverview(): ShipOrderOverviewSnapshot {
    return {
      activeOrder: this.activeOrder ? cloneOrder(this.activeOrder) : null,
      lastDepartedOrder: this.lastDepartedOrder ? cloneOrder(this.lastDepartedOrder) : null,
      nextArrivalAt: this.nextArrivalAt,
    };
  }

  canSettlementContribute(settlementId: string | null | undefined) {
    return !!this.activeOrder && hasSettlementHarbor(settlementId);
  }

  contribute(input: {
    settlementId: string;
    playerId: string | null;
    playerName: string | null;
    resources: Partial<Record<ShipOrderResourceType, number>>;
  }) {
    const order = this.activeOrder;
    if (!order || !hasSettlementHarbor(input.settlementId)) {
      return false;
    }

    const normalized: Array<{ type: ShipOrderResourceType; amount: number }> = [];
    for (const [type, rawAmount] of Object.entries(input.resources)) {
      if (!isShipOrderResourceType(type)) {
        continue;
      }

      const requestedAmount = getRequestedAmount(order, type);
      if (requestedAmount <= 0) {
        continue;
      }

      const amount = Math.min(
        getRemainingAmount(order, type),
        Math.max(0, Math.floor(Number(rawAmount) || 0)),
      );
      if (amount > 0) {
        normalized.push({ type, amount });
      }
    }

    if (!normalized.length) {
      return false;
    }

    const unlimitedResources = isUnlimitedResourcesEnabled(testModeSettings);

    if (!unlimitedResources) {
      for (const resource of normalized) {
        const planned = planResourceWithdrawalsAcrossStoragesForSettlement(input.settlementId, resource.type, resource.amount);
        const plannedAmount = planned.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (plannedAmount < resource.amount) {
          return false;
        }
      }
    }

    if (!unlimitedResources) {
      for (const resource of normalized) {
        const withdrawals = withdrawResourceAcrossStoragesForSettlement(input.settlementId, resource.type, resource.amount);
        for (const withdrawal of withdrawals) {
          broadcast({
            type: 'resource:withdraw',
            heroId: 'ship-order',
            storageTileId: withdrawal.storageTileId,
            resource: {
              type: resource.type as ResourceType,
              amount: withdrawal.amount,
            },
            timestamp: Date.now(),
          } satisfies ResourceWithdrawMessage);
        }
      }
    }

    let contribution = order.contributions.find((entry) => entry.settlementId === input.settlementId);
    if (!contribution) {
      const owner = playerSettlementState.getSettlementOwner(input.settlementId);
      contribution = {
        settlementId: input.settlementId,
        playerId: input.playerId ?? owner?.playerId ?? null,
        playerName: input.playerName ?? owner?.playerName ?? null,
        resources: {},
        value: 0,
        rewardGold: 0,
        rewardGoods: [],
        topContributor: false,
      };
      order.contributions.push(contribution);
    } else {
      contribution.playerId ??= input.playerId;
      contribution.playerName ??= input.playerName;
    }

    for (const resource of normalized) {
      order.fulfilled[resource.type] = (order.fulfilled[resource.type] ?? 0) + resource.amount;
      contribution.resources[resource.type] = (contribution.resources[resource.type] ?? 0) + resource.amount;
      const value = resource.amount * getShipOrderResourceValue(resource.type);
      contribution.value += value;
      order.totalFulfilledValue += value;
    }

    this.sortContributions(order);
    this.broadcastUpdate();
    return true;
  }

  private createOrder(now: number): ShipOrderSnapshot {
    const template = ORDER_TEMPLATES[this.sequence % ORDER_TEMPLATES.length]!;
    const id = `ship:${this.sequence + 1}`;
    const name = SHIP_NAMES[this.sequence % SHIP_NAMES.length]!;
    this.sequence += 1;

    const requested = template.requested.map((resource) => ({ ...resource }));
    return {
      id,
      name,
      origin: template.origin,
      originDescription: template.originDescription,
      status: 'active',
      startedAt: now,
      departsAt: now + SHIP_DURATION_MS,
      departedAt: null,
      requested,
      fulfilled: {},
      contributions: [],
      totalRequestedValue: requested.reduce((sum, resource) => sum + getShipOrderResourceAmountValue(resource), 0),
      totalFulfilledValue: 0,
      rewardPoolGold: SHIP_REWARD_POOL_GOLD,
      rewardGoods: template.rewardGoods.map((resource) => ({ ...resource })),
      completionMultiplier: 1,
      topContributorSettlementId: null,
    };
  }

  private departActiveOrder(now: number) {
    const order = this.activeOrder;
    if (!order) {
      return;
    }

    const topContributor = [...order.contributions].sort((a, b) => b.value - a.value || a.settlementId.localeCompare(b.settlementId))[0] ?? null;
    const fulfilledRatio = order.totalRequestedValue > 0
      ? Math.min(1, order.totalFulfilledValue / order.totalRequestedValue)
      : 0;
    const completionMultiplier = fulfilledRatio >= 1 ? FULL_ORDER_MULTIPLIER : Math.max(0.25, fulfilledRatio);
    const rewardPool = Math.round(order.rewardPoolGold * completionMultiplier);

    for (const contribution of order.contributions) {
      const share = order.totalFulfilledValue > 0 ? contribution.value / order.totalFulfilledValue : 0;
      const topBonus = topContributor?.settlementId === contribution.settlementId ? TOP_CONTRIBUTOR_BONUS_GOLD : 0;
      contribution.rewardGold = Math.floor(rewardPool * share) + topBonus;
      contribution.rewardGoods = this.grantRewardGoods(order, contribution.settlementId, share, topContributor?.settlementId === contribution.settlementId);
      contribution.topContributor = topBonus > 0;
      if (contribution.playerId && contribution.rewardGold > 0) {
        marketState.grantGold(contribution.playerId, contribution.rewardGold);
      }
    }

    order.status = 'departed';
    order.departedAt = now;
    order.completionMultiplier = completionMultiplier;
    order.topContributorSettlementId = topContributor?.settlementId ?? null;
    this.sortContributions(order);
    this.lastDepartedOrder = cloneOrder(order);
    this.activeOrder = null;
    this.nextArrivalAt = now + randomDelay(NEXT_SHIP_ARRIVAL_MIN_MS, NEXT_SHIP_ARRIVAL_MAX_MS);
  }

  private grantRewardGoods(order: ShipOrderSnapshot, settlementId: string, share: number, topContributor: boolean) {
    const grantedGoods: ResourceAmount[] = [];
    for (let index = 0; index < order.rewardGoods.length; index += 1) {
      const reward = order.rewardGoods[index]!;
      const amount = Math.floor(reward.amount * share) + (topContributor && index === 0 ? 1 : 0);
      if (amount <= 0) {
        continue;
      }

      const deposits = depositResourceAcrossStoragesForSettlement(settlementId, reward.type, amount);
      const depositedAmount = deposits.reduce((sum, transfer) => sum + transfer.amount, 0);
      if (depositedAmount <= 0) {
        continue;
      }

      for (const deposit of deposits) {
        broadcast({
          type: 'resource:deposit',
          heroId: 'ship-order',
          storageTileId: deposit.storageTileId,
          resource: {
            type: reward.type,
            amount: deposit.amount,
          },
          timestamp: Date.now(),
        } satisfies ResourceDepositMessage);
      }

      grantedGoods.push({ type: reward.type, amount: depositedAmount });
    }

    return grantedGoods;
  }

  private sortContributions(order: ShipOrderSnapshot) {
    order.contributions.sort((a, b) => b.value - a.value || a.settlementId.localeCompare(b.settlementId));
  }

  private broadcastUpdate() {
    broadcast({
      type: 'ship_order:update',
      overview: this.getOverview(),
      timestamp: Date.now(),
    } satisfies ShipOrderUpdateMessage);
  }
}

export const shipOrderState = new ShipOrderState();
export {
  FIRST_SHIP_ARRIVAL_MAX_MS,
  FIRST_SHIP_ARRIVAL_MIN_MS,
  NEXT_SHIP_ARRIVAL_MAX_MS,
  NEXT_SHIP_ARRIVAL_MIN_MS,
  hasSettlementHarbor,
};
