import type { ShipOrderUpdateMessage } from '../../shared/protocol.ts';
import { currentPlayerId } from '../socket.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { replaceShipOrderOverview, shipOrderOverview } from '../../store/shipOrderStore.ts';
import { fetchMarketOverview } from '../../store/marketStore.ts';
import { addNotification } from '../../store/notificationStore.ts';

class ClientShipOrderHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('ship_order:update', this.handleUpdate.bind(this));
  }

  private handleUpdate(message: ShipOrderUpdateMessage): void {
    const previousDepartedOrderIds = new Set((shipOrderOverview.value.lastDepartedOrders ?? [])
      .map((order) => order.id));
    replaceShipOrderOverview(message.overview);

    const departedOrder = (message.overview.lastDepartedOrders ?? [])
      .find((order) => !previousDepartedOrderIds.has(order.id)
        && order.playerId === currentPlayerId.value
        && order.rewardGoldPaid > 0);
    if (departedOrder) {
      addNotification({
        type: 'settlement',
        title: 'Ship departed',
        message: `Cargo reward paid: ${departedOrder.rewardGoldPaid} Gold.`,
        duration: 5200,
      });
      void fetchMarketOverview(currentPlayerId.value).catch(() => {});
      return;
    }
  }
}

export const shipOrderHandler = new ClientShipOrderHandler();
