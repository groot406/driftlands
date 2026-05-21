import { computed, ref } from 'vue';
import type { ShipOrderOverviewSnapshot, ShipOrderResourceType } from '../shared/game/shipOrders.ts';
import { sendMessage } from '../core/socket.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';

export const shipOrderOverview = ref<ShipOrderOverviewSnapshot>({
  activeOrder: null,
  activeOrders: [],
  lastDepartedOrder: null,
  lastDepartedOrders: [],
  nextArrivalAt: null,
  nextArrivals: {},
  visibleShip: null,
  visibleShips: [],
});
export const shipOrderPanelOpen = ref(false);
export const shipOrderVersion = ref(0);
export const selectedShipOrderId = ref<string | null>(null);

export const activeShipOrder = computed(() => {
  const orders = shipOrderOverview.value.activeOrders ?? [];
  if (selectedShipOrderId.value) {
    const selected = orders.find((order) => order.id === selectedShipOrderId.value);
    if (selected) {
      return selected;
    }
  }

  const settlementId = currentPlayerSettlementId.value;
  return orders.find((order) => order.settlementId === settlementId) ?? shipOrderOverview.value.activeOrder;
});

export function replaceShipOrderOverview(overview: ShipOrderOverviewSnapshot | null | undefined) {
  const activeOrders = overview?.activeOrders ?? (overview?.activeOrder ? [overview.activeOrder] : []);
  const lastDepartedOrders = overview?.lastDepartedOrders ?? (overview?.lastDepartedOrder ? [overview.lastDepartedOrder] : []);
  const visibleShips = overview?.visibleShips ?? (overview?.visibleShip ? [overview.visibleShip] : []);
  shipOrderOverview.value = {
    activeOrder: overview?.activeOrder ?? activeOrders[0] ?? null,
    activeOrders,
    lastDepartedOrder: overview?.lastDepartedOrder ?? null,
    lastDepartedOrders,
    nextArrivalAt: overview?.nextArrivalAt ?? null,
    nextArrivals: overview?.nextArrivals ?? {},
    visibleShip: overview?.visibleShip ?? visibleShips[0] ?? null,
    visibleShips,
  };
  if (selectedShipOrderId.value && !activeOrders.some((order) => order.id === selectedShipOrderId.value)) {
    selectedShipOrderId.value = null;
  }
  shipOrderVersion.value++;
}

export function openShipOrderPanel(orderId?: string | null) {
  if (orderId) {
    selectedShipOrderId.value = orderId;
  }
  shipOrderPanelOpen.value = true;
}

export function toggleShipOrderPanel(orderId?: string | null) {
  if (shipOrderPanelOpen.value && (!orderId || selectedShipOrderId.value === orderId)) {
    closeShipOrderPanel();
    return;
  }

  openShipOrderPanel(orderId);
}

export function closeShipOrderPanel() {
  shipOrderPanelOpen.value = false;
}

export function submitShipOrderLoad(orderId: string, settlementId: string, resources: Partial<Record<ShipOrderResourceType, number>>) {
  sendMessage({
    type: 'ship_order:load',
    orderId,
    settlementId,
    resources,
    timestamp: Date.now(),
  });
}
