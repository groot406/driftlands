import type { Socket } from 'socket.io';
import { broadcast, sendToSocket } from '../messages/messageRouter';
import type { TestSetSettingsMessage, TestUpdateMessage } from '../../../src/shared/protocol.ts';
import {
  getTestModeSettingsSnapshot,
  loadTestModeSettings,
  testModeSettings,
} from '../../../src/shared/game/testMode.ts';
import { setStudyOverrides, broadcastStudyState } from '../../../src/store/studyStore.ts';
import { refreshWorkforceState } from '../systems/jobSystem';
import { runState } from './runState';

class TestModeState {
  private buildUpdateMessage(): TestUpdateMessage {
    return {
      type: 'test:update',
      settings: getTestModeSettingsSnapshot(),
      timestamp: Date.now(),
    };
  }

  private applyRuntimeEffects() {
    setStudyOverrides(testModeSettings.enabled ? testModeSettings.completedStudyKeys : null);
    broadcastStudyState();
    refreshWorkforceState();
    runState.refreshAllProgress();
  }

  applySettings(message: TestSetSettingsMessage) {
    const next = getTestModeSettingsSnapshot();

    if (typeof message.enabled === 'boolean') {
      next.enabled = message.enabled;
    }
    if (typeof message.instantBuild === 'boolean') {
      next.instantBuild = message.instantBuild;
    }
    if (typeof message.unlimitedResources === 'boolean') {
      next.unlimitedResources = message.unlimitedResources;
    }
    if (typeof message.fastHeroMovement === 'boolean') {
      next.fastHeroMovement = message.fastHeroMovement;
    }
    if (typeof message.fastGrowth === 'boolean') {
      next.fastGrowth = message.fastGrowth;
    }
    if (typeof message.fastPopulationGrowth === 'boolean') {
      next.fastPopulationGrowth = message.fastPopulationGrowth;
    }
    if (typeof message.fastSettlerCycles === 'boolean') {
      next.fastSettlerCycles = message.fastSettlerCycles;
    }
    if (typeof message.supportTiles === 'boolean') {
      next.supportTiles = message.supportTiles;
    }
    if (Array.isArray(message.completedStudyKeys)) {
      next.completedStudyKeys = message.completedStudyKeys.slice();
    }
    if (message.settlementId && Array.isArray(message.unlockedNodeKeys)) {
      if (message.unlockedNodeKeys.length > 0) {
        next.progressionOverridesBySettlementId[message.settlementId] = message.unlockedNodeKeys.slice();
      } else {
        delete next.progressionOverridesBySettlementId[message.settlementId];
      }
    }

    loadTestModeSettings(next);
    this.applyRuntimeEffects();
    this.broadcastUpdate();
  }

  reapplyWorldState() {
    this.applyRuntimeEffects();
    this.broadcastUpdate();
  }

  sendUpdate(socket: Socket) {
    sendToSocket(socket, this.buildUpdateMessage());
  }

  broadcastUpdate() {
    broadcast(this.buildUpdateMessage());
  }
}

export const testModeState = new TestModeState();
