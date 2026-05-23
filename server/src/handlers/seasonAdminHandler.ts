import type { Server, Socket } from 'socket.io';
import { broadcast, serverMessageRouter } from '../messages/messageRouter';
import { seasonState } from '../state/seasonState';
import { isAdminSocket } from '../config/admin';
import { worldState } from '../worldState';
import { playerSettlementState } from '../state/playerSettlementState';
import { coopState } from '../state/coopState';
import { serverDebugModeEnabled, spawnSafetyEnabled } from '../config/serverMode';
import { ServerSettlementStartHandler } from './settlementStartHandler';
import type {
  SeasonAdminCompleteNowMessage,
  SeasonAdminRestartNowMessage,
  SeasonAdminSetStageMessage,
  SeasonAdminUpdateConfigMessage,
  CoopSnapshotMessage,
  PlayerSnapshotMessage,
  SeasonSnapshotMessage,
  WorldSnapshotMessage,
} from '../../../src/shared/protocol.ts';

export class ServerSeasonAdminHandler {
  private restartInFlight = false;

  constructor(_io: Server) {}

  init(): void {
    serverMessageRouter.on('season_admin:update_config', this.handleUpdateConfig.bind(this));
    serverMessageRouter.on('season_admin:set_stage', this.handleSetStage.bind(this));
    serverMessageRouter.on('season_admin:complete_now', this.handleCompleteNow.bind(this));
    serverMessageRouter.on('season_admin:restart_now', this.handleRestartNow.bind(this));
  }

  private handleUpdateConfig(_socket: Socket, message: SeasonAdminUpdateConfigMessage) {
    if (!this.canManageSeason(_socket)) {
      return;
    }
    seasonState.applyConfig(message.config);
  }

  private handleSetStage(_socket: Socket, message: SeasonAdminSetStageMessage) {
    if (!this.canManageSeason(_socket)) {
      return;
    }
    seasonState.setStage(message.stage);
  }

  private handleCompleteNow(_socket: Socket, message: SeasonAdminCompleteNowMessage) {
    if (!this.canManageSeason(_socket)) {
      return;
    }
    seasonState.completeNow(message.message);
  }

  private async handleRestartNow(_socket: Socket, message: SeasonAdminRestartNowMessage) {
    if (!this.canManageSeason(_socket) || this.restartInFlight) {
      return;
    }

    this.restartInFlight = true;
    try {
      playerSettlementState.clearAssignments();
      coopState.resetHeroClaims();
      await worldState.init(message.seed ?? undefined);
      this.broadcastWorldSnapshot();
      this.broadcastSeasonSnapshot();
      this.broadcastPlayerSnapshot();
      this.broadcastCoopSnapshot();
      ServerSettlementStartHandler.broadcastStartOptionsToConnectedPlayers();
    } catch (error) {
      console.error('[season-admin] restart_now failed', error);
    } finally {
      this.restartInFlight = false;
    }
  }

  private canManageSeason(socket: Socket) {
    return isAdminSocket(socket);
  }

  private broadcastWorldSnapshot() {
    broadcast({
      type: 'world:snapshot',
      ...worldState.getSnapshot(),
      debugModeEnabled: serverDebugModeEnabled,
      spawnSafetyEnabled,
      timestamp: Date.now(),
    } satisfies WorldSnapshotMessage);
  }

  private broadcastSeasonSnapshot() {
    const season = seasonState.getSnapshot();
    if (!season) {
      return;
    }
    broadcast({
      type: 'season:snapshot',
      season,
      timestamp: Date.now(),
    } satisfies SeasonSnapshotMessage);
  }

  private broadcastPlayerSnapshot() {
    broadcast({
      type: 'player:snapshot',
      currentPlayerId: null,
      players: playerSettlementState.listPlayers(),
      timestamp: Date.now(),
    } satisfies PlayerSnapshotMessage);
  }

  private broadcastCoopSnapshot() {
    broadcast({
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    } satisfies CoopSnapshotMessage);
  }
}
