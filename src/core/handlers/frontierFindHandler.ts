import type { FrontierFindMessage } from '../../shared/protocol.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { depositResource, depositResourceToStorage } from '../../store/resourceStore.ts';
import { addNotification } from '../../store/notificationStore.ts';
import { addTextIndicator } from '../textIndicators.ts';
import { playPositionalSound } from '../../store/soundStore.ts';
import { triggerGameplayImpact } from '../gameFeel.ts';

const RESOURCE_LABELS: Record<string, string> = {
  wood: 'wood',
  ore: 'ore',
  stone: 'stone',
  food: 'food',
  crystal: 'crystal',
  artifact: 'artifact',
  water: 'water',
  grain: 'grain',
};

function formatRewardSummary(message: FrontierFindMessage) {
  const parts = message.resourceRewards.map((reward) => `+${reward.amount} ${RESOURCE_LABELS[reward.type] ?? reward.type}`);
  if (message.bonusScore) {
    parts.push(`+${message.bonusScore} score`);
  }
  return parts.join(', ');
}

class FrontierFindHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('frontier:find', this.handleFrontierFind.bind(this));
  }

  private handleFrontierFind(message: FrontierFindMessage): void {
    const rewardSummary = formatRewardSummary(message);

    if (message.storageDeposits?.length) {
      for (const deposit of message.storageDeposits) {
        depositResourceToStorage(deposit.storageTileId, deposit.resource.type, deposit.resource.amount);
      }
    } else {
      for (const reward of message.resourceRewards) {
        depositResource(reward.type, reward.amount);
      }
    }

    for (const reward of message.resourceRewards) {
      triggerGameplayImpact({
        q: message.q,
        r: message.r,
        kind: 'complete',
        terrain: message.terrain,
        resourceType: reward.type,
        amount: reward.amount,
      });
    }

    if (!message.resourceRewards.length) {
      triggerGameplayImpact({
        q: message.q,
        r: message.r,
        kind: 'complete',
        terrain: message.terrain,
      });
    }

    addTextIndicator({ q: message.q, r: message.r }, message.label, '#fde68a', 2200);

    if (message.bonusScore) {
      addTextIndicator({ q: message.q, r: message.r }, `+${message.bonusScore} score`, '#fbbf24', 2600);
    }

    addNotification({
      type: 'run_state',
      title: message.title,
      message: rewardSummary ? `${message.description} Reward: ${rewardSummary}.` : message.description,
      duration: 7000,
    });

    void playPositionalSound(
      `frontier-find:${message.q},${message.r}`,
      'success.mp3',
      message.q,
      message.r,
      { baseVolume: 0.5, maxDistance: 14, loop: false },
    );
  }
}

export const frontierFindHandler = new FrontierFindHandler();
