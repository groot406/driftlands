import type { Socket } from 'socket.io';
import { broadcast, sendToSocket } from '../messages/messageRouter';
import type {
  ResourceDepositMessage,
  TestRunActionMessage,
  TestSetSettingsMessage,
  TestUpdateMessage,
  TileUpdatedMessage,
  CalamityEventMessage,
  CalamityKind,
} from '../../../src/shared/protocol.ts';
import {
  getTestModeSettingsSnapshot,
  loadTestModeSettings,
  testModeSettings,
} from '../../../src/shared/game/testMode.ts';
import { listProgressionNodeDefinitions } from '../../../src/shared/story/progression.ts';
import { tileIndex } from '../../../src/shared/game/world.ts';
import { depositResourceToStorage } from '../../../src/shared/game/state/resourceStore.ts';
import { ensureTownCenterMilitaryState } from '../../../src/shared/game/military.ts';
import { setStudyOverrides, broadcastStudyState } from '../../../src/store/studyStore.ts';
import { refreshWorkforceState } from '../systems/jobSystem';
import { getAvailableCalamities, triggerCalamity } from '../systems/calamitySystem';
import { runState } from './runState';

function getCalamityLabel(kind: CalamityKind) {
  switch (kind) {
    case 'volcano_eruption':
      return 'volcano eruption';
    case 'lost_harvest':
      return 'lost harvest';
    case 'food_spoilage':
      return 'food spoilage';
    case 'forest_fire':
      return 'forest fire';
    case 'outbreak':
      return 'outbreak';
    case 'flood':
    default:
      return 'flood';
  }
}

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

  private broadcastTile(tileId: string | null | undefined) {
    const tile = tileId ? tileIndex[tileId] ?? null : null;
    if (!tile) {
      return;
    }

    broadcast({
      type: 'tile:updated',
      tile,
      timestamp: Date.now(),
    } satisfies TileUpdatedMessage);
  }

  private depositResource(tileId: string | null | undefined, type: ResourceDepositMessage['resource']['type'], amount: number) {
    if (!tileId || amount <= 0) {
      return;
    }

    const stored = depositResourceToStorage(tileId, type, amount);
    if (stored <= 0) {
      return;
    }

    broadcast({
      type: 'resource:deposit',
      heroId: 'test-mode',
      storageTileId: tileId,
      resource: {
        type,
        amount: stored,
      },
      timestamp: Date.now(),
    } satisfies ResourceDepositMessage);
  }

  private broadcastUnavailableCalamity(kind: CalamityKind, settlementId: string | null) {
    broadcast({
      type: 'calamity:event',
      kind,
      phase: 'averted',
      severity: 'minor',
      title: 'Calamity unavailable',
      message: `No valid ${getCalamityLabel(kind)} target exists for this settlement right now.`,
      settlementId,
      affectedTileIds: [],
      timestamp: Date.now(),
    } satisfies CalamityEventMessage);
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
    if (typeof message.fastGuardTraining === 'boolean') {
      next.fastGuardTraining = message.fastGuardTraining;
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

  applyAction(message: TestRunActionMessage) {
    const settlementId = message.settlementId ?? null;
    const townCenter = settlementId ? ensureTownCenterMilitaryState(tileIndex[settlementId] ?? null) : null;

    switch (message.action) {
      case 'prepare_military_sandbox': {
        if (!settlementId) {
          return;
        }

        const next = getTestModeSettingsSnapshot();
        next.enabled = true;
        next.instantBuild = true;
        next.unlimitedResources = true;
        next.fastSettlerCycles = true;
        next.fastGuardTraining = true;
        next.progressionOverridesBySettlementId[settlementId] = listProgressionNodeDefinitions().map((node) => node.key);
        next.completedStudyKeys = Array.from(new Set([
          ...next.completedStudyKeys,
          'border_management',
          'defensive_construction',
          'guard_training',
          'weapon_smithing',
          'masonry_treatises',
        ]));
        loadTestModeSettings(next);
        this.applyRuntimeEffects();
        this.broadcastUpdate();
        return;
      }
      case 'grant_guard_reserve': {
        if (!townCenter) {
          return;
        }

        townCenter.guardReserve = Math.max(0, townCenter.guardReserve ?? 0) + Math.max(1, Math.floor(message.amount ?? 5));
        this.broadcastTile(townCenter.id);
        return;
      }
      case 'grant_weapons': {
        const targetTileId = townCenter?.id ?? settlementId;
        this.depositResource(targetTileId, 'weapons', Math.max(1, Math.floor(message.amount ?? 20)));
        return;
      }
      case 'trigger_calamity': {
        if (!settlementId) {
          return;
        }

        const available = getAvailableCalamities(settlementId);
        const kind = message.calamityKind
          ?? available[Math.floor(Math.random() * available.length)]
          ?? null;
        if (!kind || !available.includes(kind)) {
          this.broadcastUnavailableCalamity(kind ?? 'flood', settlementId);
          return;
        }

        const outcome = triggerCalamity(kind, { settlementId });
        if (!outcome) {
          this.broadcastUnavailableCalamity(kind, settlementId);
        }
        return;
      }
      default:
        return;
    }
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
