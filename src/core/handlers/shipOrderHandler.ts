import type { ShipOrderUpdateMessage } from '../../shared/protocol.ts';
import { currentPlayerId } from '../socket.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { announceShipArrival, replaceShipOrderOverview, shipOrderOverview } from '../../store/shipOrderStore.ts';
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
    const previousActiveOrderId = shipOrderOverview.value.activeOrder?.id ?? null;
    const previousDepartedOrderId = shipOrderOverview.value.lastDepartedOrder?.id ?? null;
    replaceShipOrderOverview(message.overview);

    const departedOrder = message.overview.lastDepartedOrder;
    const reward = departedOrder?.id !== previousDepartedOrderId
      ? departedOrder?.contributions.find((contribution) => contribution.playerId === currentPlayerId.value && contribution.rewardGold > 0)
      : null;
    if (reward) {
      addNotification({
        type: 'settlement',
        title: 'Ship departed',
        message: `Cargo reward paid: ${reward.rewardGold} Gold${reward.topContributor ? ' with top contributor bonus' : ''}.`,
        duration: 5200,
      });
      void fetchMarketOverview(currentPlayerId.value).catch(() => {});
      return;
    }

    const activeOrder = message.overview.activeOrder;
    if (activeOrder && activeOrder.id !== previousActiveOrderId) {
      announceShipArrival(activeOrder);
      addNotification({
        type: 'settlement',
        title: `${activeOrder.name} arrived`,
        message: 'A ship is loading cargo at frontier Harbors.',
        duration: 4200,
      });
    }
  }
}

export const shipOrderHandler = new ClientShipOrderHandler();
