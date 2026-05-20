import { computed, ref } from 'vue';
import type { ShipOrderOverviewSnapshot, ShipOrderResourceType, ShipOrderSnapshot } from '../shared/game/shipOrders.ts';
import { sendMessage } from '../core/socket.ts';

export const shipOrderOverview = ref<ShipOrderOverviewSnapshot>({
  activeOrder: null,
  lastDepartedOrder: null,
  nextArrivalAt: null,
});
export const shipOrderPanelOpen = ref(false);
export const shipOrderVersion = ref(0);
export const shipArrivalAnnouncement = ref<ShipOrderSnapshot | null>(null);

export const activeShipOrder = computed(() => shipOrderOverview.value.activeOrder);

export function replaceShipOrderOverview(overview: ShipOrderOverviewSnapshot | null | undefined) {
  const activeOrder = overview?.activeOrder ?? null;
  shipOrderOverview.value = {
    activeOrder,
    lastDepartedOrder: overview?.lastDepartedOrder ?? null,
    nextArrivalAt: overview?.nextArrivalAt ?? null,
  };
  if (shipArrivalAnnouncement.value && shipArrivalAnnouncement.value.id !== activeOrder?.id) {
    shipArrivalAnnouncement.value = null;
  }
  shipOrderVersion.value++;
}

export function openShipOrderPanel() {
  shipOrderPanelOpen.value = true;
}

export function announceShipArrival(order: ShipOrderSnapshot) {
  shipArrivalAnnouncement.value = order;
}

export function dismissShipArrivalAnnouncement() {
  shipArrivalAnnouncement.value = null;
}

export function openShipOrderPanelFromArrivalAnnouncement() {
  shipArrivalAnnouncement.value = null;
  shipOrderPanelOpen.value = true;
}

export function closeShipOrderPanel() {
  shipOrderPanelOpen.value = false;
}

export function submitShipOrderContribution(settlementId: string, resources: Partial<Record<ShipOrderResourceType, number>>) {
  sendMessage({
    type: 'ship_order:contribute',
    settlementId,
    resources,
    timestamp: Date.now(),
  });
}
