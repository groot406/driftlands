import { broadcast } from '../messages/messageRouter';
import type { ResourceDepositMessage, ResourceWithdrawMessage, ShipOrderUpdateMessage } from '../../../src/shared/protocol.ts';
import type { ResourceAmount, ResourceType } from '../../../src/core/types/Resource.ts';
import { tiles } from '../../../src/shared/game/world.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';
import { isHarborTile } from '../../../src/shared/game/harbor.ts';
import {
  getShipOrderResourceAmountValue,
  isShipOrderResourceType,
  type ShipOrderOverviewSnapshot,
  type ShipOrderResourceType,
  type ShipOrderSnapshot,
  type ShipOrderVisualSnapshot,
} from '../../../src/shared/game/shipOrders.ts';
import {
  depositResourceAcrossStoragesForSettlement,
  planResourceWithdrawalsAcrossStoragesForSettlement,
  withdrawResourceAcrossStoragesForSettlement,
} from '../../../src/shared/game/state/resourceStore.ts';
import { isUnlimitedResourcesEnabled, testModeSettings } from '../../../src/shared/game/testMode.ts';
import { getShipSchedulePaceMultiplier } from '../../../src/shared/game/gameplayPace.ts';
import { playerSettlementState } from './playerSettlementState';
import { marketState } from './marketState';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events.ts';
import { seasonState } from './seasonState';

const SHIP_DURATION_MS = 12 * 60_000;
const SHIP_APPROACH_MS = 45_000;
const SHIP_DEPARTURE_MS = 35_000;
const FIRST_SHIP_ARRIVAL_MIN_MS = 2 * 60_000;
const FIRST_SHIP_ARRIVAL_MAX_MS = 5 * 60_000;
const NEXT_SHIP_ARRIVAL_MIN_MS = 15 * 60_000;
const NEXT_SHIP_ARRIVAL_MAX_MS = 20 * 60_000;
const SHIP_REWARD_POOL_GOLD = 120;
const FULL_ORDER_MULTIPLIER = 1.25;

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
    deliveredRewardGoods: order.deliveredRewardGoods.map((resource) => ({ ...resource })),
    fulfilled: { ...order.fulfilled },
  };
}

function hasSettlementHarbor(settlementId: string | null | undefined) {
  if (!settlementId) {
    return false;
  }

  return tiles.some((tile) => isHarborTile(tile) && getTileSettlementId(tile) === settlementId);
}

function listHarborTiles() {
  return tiles
    .filter((tile) => isHarborTile(tile) && !!getTileSettlementId(tile))
    .sort((a, b) => a.id.localeCompare(b.id));
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

function normalizedRange(minMs: number, maxMs: number) {
  const min = Math.max(1_000, Math.trunc(minMs));
  const max = Math.max(min, Math.trunc(maxMs));
  return { min, max };
}

function getShipOrderTuning() {
  const gameplay = seasonState.getCurrentStageConfig()?.gameplay;
  const scheduleSpeed = getShipSchedulePaceMultiplier();
  const paceDuration = (value: number) => Math.max(1_000, Math.trunc(value / scheduleSpeed));
  const firstArrival = normalizedRange(
    paceDuration(gameplay?.shipFirstArrivalMinMs ?? FIRST_SHIP_ARRIVAL_MIN_MS),
    paceDuration(gameplay?.shipFirstArrivalMaxMs ?? FIRST_SHIP_ARRIVAL_MAX_MS),
  );
  const nextArrival = normalizedRange(
    paceDuration(gameplay?.shipNextArrivalMinMs ?? NEXT_SHIP_ARRIVAL_MIN_MS),
    paceDuration(gameplay?.shipNextArrivalMaxMs ?? NEXT_SHIP_ARRIVAL_MAX_MS),
  );

  return {
    firstArrivalMinMs: firstArrival.min,
    firstArrivalMaxMs: firstArrival.max,
    nextArrivalMinMs: nextArrival.min,
    nextArrivalMaxMs: nextArrival.max,
    approachMs: paceDuration(gameplay?.shipApproachMs ?? SHIP_APPROACH_MS),
    dockedDurationMs: paceDuration(gameplay?.shipDockedDurationMs ?? SHIP_DURATION_MS),
    departureMs: paceDuration(gameplay?.shipDepartureMs ?? SHIP_DEPARTURE_MS),
    orderSizeMultiplier: Math.max(0.1, Number(gameplay?.shipOrderSizeMultiplier ?? 1)),
    rewardGoldMultiplier: Math.max(0, Number(gameplay?.shipRewardGoldMultiplier ?? 1)),
    rewardGoodsMultiplier: Math.max(0, Number(gameplay?.shipRewardGoodsMultiplier ?? 1)),
  };
}

export interface HarborShipState {
  harborTileId: string;
  settlementId: string;
  approachingOrder: ShipOrderSnapshot | null;
  activeOrder: ShipOrderSnapshot | null;
  departingShip: ShipOrderVisualSnapshot | null;
  lastDepartedOrder: ShipOrderSnapshot | null;
  nextArrivalAt: number | null;
}

export interface ShipOrderPersistenceSnapshot {
  harborStates: HarborShipState[];
  previousShipName: string | null;
  sequence: number;
}

class ShipOrderState {
  private harborStates = new Map<string, HarborShipState>();
  private previousShipName: string | null = null;
  private sequence = 0;

  reset() {
    this.harborStates.clear();
    this.previousShipName = null;
    this.sequence = 0;
  }

  getPersistenceSnapshot(): ShipOrderPersistenceSnapshot {
    return {
      harborStates: Array.from(this.harborStates.values()).map((state) => ({
        harborTileId: state.harborTileId,
        settlementId: state.settlementId,
        approachingOrder: state.approachingOrder ? cloneOrder(state.approachingOrder) : null,
        activeOrder: state.activeOrder ? cloneOrder(state.activeOrder) : null,
        departingShip: state.departingShip ? { ...state.departingShip } : null,
        lastDepartedOrder: state.lastDepartedOrder ? cloneOrder(state.lastDepartedOrder) : null,
        nextArrivalAt: state.nextArrivalAt,
      })),
      previousShipName: this.previousShipName,
      sequence: this.sequence,
    };
  }

  loadPersistenceSnapshot(snapshot: ShipOrderPersistenceSnapshot | null | undefined) {
    this.reset();
    if (!snapshot) {
      return;
    }

    for (const state of snapshot.harborStates ?? []) {
      if (!state.harborTileId || !state.settlementId) {
        continue;
      }
      this.harborStates.set(state.harborTileId, {
        harborTileId: state.harborTileId,
        settlementId: state.settlementId,
        approachingOrder: state.approachingOrder ? cloneOrder(state.approachingOrder) : null,
        activeOrder: state.activeOrder ? cloneOrder(state.activeOrder) : null,
        departingShip: state.departingShip ? { ...state.departingShip } : null,
        lastDepartedOrder: state.lastDepartedOrder ? cloneOrder(state.lastDepartedOrder) : null,
        nextArrivalAt: state.nextArrivalAt ?? null,
      });
    }

    this.previousShipName = snapshot.previousShipName ?? null;
    this.sequence = Math.max(0, Math.floor(snapshot.sequence ?? 0));
  }

  tick(now: number) {
    const harborTiles = listHarborTiles();
    if (!harborTiles.length) {
      return;
    }

    let changed = this.syncHarborStates(harborTiles);

    for (const harbor of harborTiles) {
      const state = this.harborStates.get(harbor.id);
      if (!state) {
        continue;
      }

      if (state.departingShip && now >= state.departingShip.phaseEndsAt) {
        const tuning = getShipOrderTuning();
        state.departingShip = null;
        state.nextArrivalAt = now + randomDelay(tuning.nextArrivalMinMs, tuning.nextArrivalMaxMs);
        changed = true;
      }

      if (state.activeOrder && now >= state.activeOrder.departsAt) {
        this.departActiveOrder(state, now);
        changed = true;
      }

      if (state.approachingOrder && now >= state.approachingOrder.arrivesAt!) {
        const arrivedAt = state.approachingOrder.arrivesAt!;
        state.activeOrder = {
          ...state.approachingOrder,
          status: 'active',
          startedAt: arrivedAt,
          departsAt: arrivedAt + getShipOrderTuning().dockedDurationMs,
        };
        state.approachingOrder = null;
        changed = true;
      }

      if (state.activeOrder || state.approachingOrder || state.departingShip) {
        continue;
      }

      if (state.nextArrivalAt == null) {
        const tuning = getShipOrderTuning();
        state.nextArrivalAt = now + randomDelay(tuning.firstArrivalMinMs, tuning.firstArrivalMaxMs);
        changed = true;
        continue;
      }

      if (now >= state.nextArrivalAt) {
        state.approachingOrder = this.createOrder(now, state);
        state.nextArrivalAt = null;
        changed = true;
      }
    }

    if (changed) {
      this.broadcastUpdate();
    }
  }

  getOverview(): ShipOrderOverviewSnapshot {
    const activeOrders = Array.from(this.harborStates.values())
      .map((state) => state.activeOrder)
      .filter((order): order is ShipOrderSnapshot => !!order)
      .sort((a, b) => a.harborTileId.localeCompare(b.harborTileId))
      .map(cloneOrder);
    const lastDepartedOrders = Array.from(this.harborStates.values())
      .map((state) => state.lastDepartedOrder)
      .filter((order): order is ShipOrderSnapshot => !!order)
      .sort((a, b) => (b.departedAt ?? 0) - (a.departedAt ?? 0) || a.harborTileId.localeCompare(b.harborTileId))
      .map(cloneOrder);
    const nextArrivals = Object.fromEntries(
      Array.from(this.harborStates.values())
        .filter((state) => state.nextArrivalAt != null)
        .map((state) => [state.harborTileId, state.nextArrivalAt!]),
    );
    const visibleShips = Array.from(this.harborStates.values())
      .map((state) => this.getVisibleShip(state))
      .filter((ship): ship is ShipOrderVisualSnapshot => !!ship)
      .sort((a, b) => a.harborTileId.localeCompare(b.harborTileId));
    const nextArrivalAt = Object.values(nextArrivals).sort((a, b) => a - b)[0] ?? null;

    return {
      activeOrder: activeOrders[0] ?? null,
      activeOrders,
      lastDepartedOrder: lastDepartedOrders[0] ?? null,
      lastDepartedOrders,
      nextArrivalAt,
      nextArrivals,
      visibleShip: visibleShips[0] ?? null,
      visibleShips,
    };
  }

  canSettlementLoad(settlementId: string | null | undefined) {
    return !!settlementId
      && Array.from(this.harborStates.values()).some((state) => (
        state.settlementId === settlementId && !!state.activeOrder
      ));
  }

  loadCargo(input: {
    orderId: string | null | undefined;
    settlementId: string;
    playerId: string | null;
    playerName: string | null;
    resources: Partial<Record<ShipOrderResourceType, number>>;
  }) {
    const state = this.findActiveOrderState(input.orderId, input.settlementId);
    const order = state?.activeOrder ?? null;
    if (!state || !order || order.settlementId !== input.settlementId || !hasSettlementHarbor(input.settlementId)) {
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

    order.playerId ??= input.playerId;
    order.playerName ??= input.playerName;

    for (const resource of normalized) {
      order.fulfilled[resource.type] = (order.fulfilled[resource.type] ?? 0) + resource.amount;
      const value = getShipOrderResourceAmountValue(resource);
      order.totalFulfilledValue += value;
    }

    this.broadcastUpdate();
    return true;
  }

  contribute(input: {
    settlementId: string;
    playerId: string | null;
    playerName: string | null;
    resources: Partial<Record<ShipOrderResourceType, number>>;
  }) {
    return this.loadCargo({
      ...input,
      orderId: null,
    });
  }

  private createOrder(now: number, state: HarborShipState): ShipOrderSnapshot {
    const tuning = getShipOrderTuning();
    const template = ORDER_TEMPLATES[this.sequence % ORDER_TEMPLATES.length]!;
    const id = `ship:${this.sequence + 1}`;
    const name = this.pickShipName();
    this.sequence += 1;
    const owner = playerSettlementState.getSettlementOwner(state.settlementId);

    const requested = template.requested.map((resource) => ({
      ...resource,
      amount: Math.max(1, Math.round(resource.amount * tuning.orderSizeMultiplier)),
    }));
    return {
      id,
      harborTileId: state.harborTileId,
      settlementId: state.settlementId,
      playerId: owner?.playerId ?? null,
      playerName: owner?.playerName ?? null,
      name,
      origin: template.origin,
      originDescription: template.originDescription,
      status: 'approaching',
      startedAt: now,
      arrivesAt: now + tuning.approachMs,
      departsAt: now + tuning.approachMs + tuning.dockedDurationMs,
      departedAt: null,
      requested,
      fulfilled: {},
      totalRequestedValue: requested.reduce((sum, resource) => sum + getShipOrderResourceAmountValue(resource), 0),
      totalFulfilledValue: 0,
      rewardPoolGold: Math.round(SHIP_REWARD_POOL_GOLD * tuning.rewardGoldMultiplier),
      rewardGoldPaid: 0,
      rewardGoods: template.rewardGoods.map((resource) => ({
        ...resource,
        amount: Math.max(0, Math.round(resource.amount * tuning.rewardGoodsMultiplier)),
      })),
      deliveredRewardGoods: [],
      completionMultiplier: 1,
    };
  }

  private pickShipName() {
    let name = SHIP_NAMES[Math.floor(Math.random() * SHIP_NAMES.length)] ?? SHIP_NAMES[0]!;
    if (SHIP_NAMES.length > 1 && name === this.previousShipName) {
      const nextIndex = (SHIP_NAMES.indexOf(name) + 1) % SHIP_NAMES.length;
      name = SHIP_NAMES[nextIndex]!;
    }

    this.previousShipName = name;
    return name;
  }

  private departActiveOrder(state: HarborShipState, now: number) {
    const order = state.activeOrder;
    if (!order) {
      return;
    }

    const fulfilledRatio = order.totalRequestedValue > 0
      ? Math.min(1, order.totalFulfilledValue / order.totalRequestedValue)
      : 0;
    const completionMultiplier = fulfilledRatio >= 1 ? FULL_ORDER_MULTIPLIER : fulfilledRatio;
    const rewardPool = Math.round(order.rewardPoolGold * completionMultiplier);
    const owner = playerSettlementState.getSettlementOwner(order.settlementId);

    order.rewardGoldPaid = rewardPool;
    order.deliveredRewardGoods = this.grantRewardGoods(order, order.settlementId, completionMultiplier);
    const rewardPlayerId = owner?.playerId ?? order.playerId;
    if (rewardPlayerId && rewardPool > 0) {
      marketState.grantGold(rewardPlayerId, rewardPool);
    }

    order.status = 'departed';
    order.departedAt = now;
    order.completionMultiplier = completionMultiplier;
    if (completionMultiplier >= 1) {
      emitGameplayEvent({
        type: 'ship_order:completed',
        orderId: order.id,
        settlementId: order.settlementId,
        playerId: rewardPlayerId ?? null,
        fulfilledValue: order.totalFulfilledValue,
        requestedValue: order.totalRequestedValue,
      });
    }
    state.lastDepartedOrder = cloneOrder(order);
    state.departingShip = {
      id: order.id,
      orderId: order.id,
      harborTileId: order.harborTileId,
      settlementId: order.settlementId,
      name: order.name,
      phase: 'departing',
      phaseStartedAt: now,
      phaseEndsAt: now + getShipOrderTuning().departureMs,
    };
    state.activeOrder = null;
  }

  private getVisibleShip(state: HarborShipState): ShipOrderVisualSnapshot | null {
    if (state.approachingOrder?.arrivesAt) {
      return {
        id: state.approachingOrder.id,
        orderId: state.approachingOrder.id,
        harborTileId: state.harborTileId,
        settlementId: state.settlementId,
        name: state.approachingOrder.name,
        phase: 'approaching',
        phaseStartedAt: state.approachingOrder.startedAt,
        phaseEndsAt: state.approachingOrder.arrivesAt,
      };
    }

    if (state.activeOrder) {
      return {
        id: state.activeOrder.id,
        orderId: state.activeOrder.id,
        harborTileId: state.harborTileId,
        settlementId: state.settlementId,
        name: state.activeOrder.name,
        phase: 'docked',
        phaseStartedAt: state.activeOrder.startedAt,
        phaseEndsAt: state.activeOrder.departsAt,
      };
    }

    return state.departingShip ? { ...state.departingShip } : null;
  }

  private grantRewardGoods(order: ShipOrderSnapshot, settlementId: string, multiplier: number) {
    const grantedGoods: ResourceAmount[] = [];
    for (let index = 0; index < order.rewardGoods.length; index += 1) {
      const reward = order.rewardGoods[index]!;
      const amount = Math.floor(reward.amount * multiplier);
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

  private syncHarborStates(harborTiles: ReturnType<typeof listHarborTiles>) {
    let changed = false;
    const liveHarborIds = new Set(harborTiles.map((tile) => tile.id));

    for (const stateHarborId of Array.from(this.harborStates.keys())) {
      if (!liveHarborIds.has(stateHarborId)) {
        this.harborStates.delete(stateHarborId);
        changed = true;
      }
    }

    for (const harbor of harborTiles) {
      const settlementId = getTileSettlementId(harbor);
      if (!settlementId) {
        continue;
      }

      const existing = this.harborStates.get(harbor.id);
      if (existing && existing.settlementId === settlementId) {
        continue;
      }

      this.harborStates.set(harbor.id, {
        harborTileId: harbor.id,
        settlementId,
        approachingOrder: null,
        activeOrder: null,
        departingShip: null,
        lastDepartedOrder: null,
        nextArrivalAt: null,
      });
      changed = true;
    }

    return changed;
  }

  private findActiveOrderState(orderId: string | null | undefined, settlementId: string) {
    const states = Array.from(this.harborStates.values());
    if (orderId) {
      return states.find((state) => state.activeOrder?.id === orderId && state.settlementId === settlementId) ?? null;
    }

    return states
      .filter((state) => state.settlementId === settlementId && !!state.activeOrder)
      .sort((a, b) => a.harborTileId.localeCompare(b.harborTileId))[0] ?? null;
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
  SHIP_APPROACH_MS,
  SHIP_DEPARTURE_MS,
  NEXT_SHIP_ARRIVAL_MAX_MS,
  NEXT_SHIP_ARRIVAL_MIN_MS,
};
