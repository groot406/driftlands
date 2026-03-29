import { broadcast } from '../messages/messageRouter';
import { runState } from './runState';
import { getTile } from '../../../src/shared/game/world';
import { emitGameplayEvent, type GameplayEvent } from '../../../src/shared/gameplay/events';
import { depositResourceIntoNearestStorages } from '../../../src/shared/buildings/storage';
import { resumeWaitingTasksForResource } from '../../../src/shared/game/state/taskStore';
import { resolveFrontierFind } from '../../../src/shared/gameplay/frontierFinds';
import type { FrontierFindMessage } from '../../../src/shared/protocol';
import type { ResourceAmount, ResourceType } from '../../../src/shared/game/types/Resource';

class FrontierFindState {
  private handledDiscoveryTiles = new Set<string>();

  reset() {
    this.handledDiscoveryTiles.clear();
  }

  recordEvent(event: GameplayEvent) {
    if (event.type !== 'tile:discovered') {
      return;
    }

    if (this.handledDiscoveryTiles.has(event.tileId)) {
      return;
    }
    this.handledDiscoveryTiles.add(event.tileId);

    const tile = getTile({ q: event.q, r: event.r });
    const find = resolveFrontierFind(tile);
    if (!tile || !find) {
      return;
    }

    if (find.bonusScore) {
      runState.grantBonusScore(find.bonusScore);
    }

    const storageDeposits: Array<{ storageTileId: string; resource: ResourceAmount }> = [];
    const deliveredRewards = new Map<ResourceType, number>();

    for (const reward of find.resourceRewards) {
      const depositResult = depositResourceIntoNearestStorages(tile.q, tile.r, reward.type, reward.amount);

      for (const transfer of depositResult.transfers) {
        storageDeposits.push({
          storageTileId: transfer.storageTileId,
          resource: {
            type: reward.type,
            amount: transfer.amount,
          },
        });
        deliveredRewards.set(reward.type, (deliveredRewards.get(reward.type) ?? 0) + transfer.amount);
        emitGameplayEvent({
          type: 'resource:delivered',
          heroId: 'frontier',
          resourceType: reward.type,
          amount: transfer.amount,
        });
        resumeWaitingTasksForResource(reward.type, transfer.storageTileId);
      }
    }

    const resourceRewards = Array.from(deliveredRewards.entries()).map(([type, amount]) => ({ type, amount }));

    broadcast({
      type: 'frontier:find',
      q: tile.q,
      r: tile.r,
      terrain: tile.terrain,
      label: find.label,
      title: find.title,
      description: find.description,
      resourceRewards,
      storageDeposits,
      bonusScore: find.bonusScore,
      timestamp: Date.now(),
    } as FrontierFindMessage);
  }
}

export const frontierFindState = new FrontierFindState();
