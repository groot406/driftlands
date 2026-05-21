import type { ResourceAmount, ResourceType } from '../../core/types/Resource.ts';

export const SHIP_ORDER_RESOURCE_TYPES = [
  'wood',
  'fish',
  'meat',
  'bread',
  'stone',
  'ore',
  'grain',
  'tools',
  'weapons',
] as const satisfies readonly ResourceType[];

export type ShipOrderResourceType = typeof SHIP_ORDER_RESOURCE_TYPES[number];
export type ShipOrderStatus = 'approaching' | 'active' | 'departing' | 'departed';
export type ShipOrderVisualPhase = 'approaching' | 'docked' | 'departing';

export interface ShipOrderSnapshot {
  id: string;
  harborTileId: string;
  settlementId: string;
  playerId: string | null;
  playerName: string | null;
  name: string;
  origin: string;
  originDescription?: string;
  status: ShipOrderStatus;
  startedAt: number;
  arrivesAt?: number | null;
  departsAt: number;
  departedAt?: number | null;
  requested: ResourceAmount[];
  fulfilled: Partial<Record<ShipOrderResourceType, number>>;
  totalRequestedValue: number;
  totalFulfilledValue: number;
  rewardPoolGold: number;
  rewardGoldPaid: number;
  rewardGoods: ResourceAmount[];
  deliveredRewardGoods: ResourceAmount[];
  completionMultiplier: number;
}

export interface ShipOrderVisualSnapshot {
  id: string;
  orderId: string;
  harborTileId: string;
  settlementId: string;
  name: string;
  phase: ShipOrderVisualPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
}

export interface ShipOrderOverviewSnapshot {
  activeOrder: ShipOrderSnapshot | null;
  activeOrders: ShipOrderSnapshot[];
  lastDepartedOrder: ShipOrderSnapshot | null;
  lastDepartedOrders: ShipOrderSnapshot[];
  nextArrivalAt: number | null;
  nextArrivals: Record<string, number>;
  visibleShip: ShipOrderVisualSnapshot | null;
  visibleShips: ShipOrderVisualSnapshot[];
}

export function isShipOrderResourceType(value: unknown): value is ShipOrderResourceType {
  return typeof value === 'string' && (SHIP_ORDER_RESOURCE_TYPES as readonly string[]).includes(value);
}

export function getShipOrderResourceValue(type: ResourceType) {
  switch (type) {
    case 'tools':
    case 'weapons':
      return 6;
    case 'ore':
      return 4;
    case 'stone':
      return 3;
    case 'bread':
      return 3;
    case 'grain':
    case 'fish':
    case 'meat':
      return 2;
    case 'wood':
    default:
      return 1;
  }
}

export function getShipOrderResourceAmountValue(resource: Pick<ResourceAmount, 'type' | 'amount'>) {
  return Math.max(0, resource.amount) * getShipOrderResourceValue(resource.type);
}
