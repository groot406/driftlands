import type { Server, Socket } from 'socket.io';
import type {
  CoopHeroClaimMessage,
  CoopHeroReleaseMessage,
  CoopPingMessage,
  CoopPingRequestMessage,
  CoopSetReadyMessage,
  CoopSnapshotMessage,
} from '../../../src/shared/protocol';
import type { CoopPingKind } from '../../../src/shared/coop/types';
import { serverMessageRouter, broadcast } from '../messages/messageRouter';
import { coopState } from '../state/coopState';
import { getHero } from '../../../src/shared/game/state/heroStore';
import { playerSettlementState } from '../state/playerSettlementState';

const PING_DURATION_MS = 7000;

function pingLabel(kind: CoopPingKind) {
  switch (kind) {
    case 'gather':
      return 'Gather here';
    case 'scout':
      return 'Scout ahead';
    default:
      return 'Need help here';
  }
}

export class ServerCoopHandler {
  constructor(_io: Server) {}

  init(): void {
    serverMessageRouter.on('coop:set_ready', this.handleSetReady.bind(this));
    serverMessageRouter.on('coop:hero_claim', this.handleHeroClaim.bind(this));
    serverMessageRouter.on('coop:hero_release', this.handleHeroRelease.bind(this));
    serverMessageRouter.on('coop:request_ping', this.handlePingRequest.bind(this));
  }

  broadcastSnapshot() {
    const message: CoopSnapshotMessage = {
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    };

    broadcast(message);
  }

  sendSnapshot(socket: Socket) {
    const message: CoopSnapshotMessage = {
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    };

    socket.emit('message', message);
  }

  private handleSetReady(socket: Socket, message: CoopSetReadyMessage): void {
    if (!coopState.setReady(socket.id, message.ready)) {
      return;
    }

    this.broadcastSnapshot();
  }

  private handleHeroClaim(socket: Socket, message: CoopHeroClaimMessage): void {
    const hero = getHero(message.heroId);
    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    if (!playerSettlementState.canPlayerControlHero(playerId, hero)) {
      return;
    }

    if (!coopState.claimHero(socket.id, message.heroId)) {
      return;
    }

    this.broadcastSnapshot();
  }

  private handleHeroRelease(socket: Socket, message: CoopHeroReleaseMessage): void {
    if (!coopState.releaseHero(socket.id, message.heroId)) {
      return;
    }

    this.broadcastSnapshot();
  }

  private handlePingRequest(socket: Socket, message: CoopPingRequestMessage): void {
    const player = coopState.getPlayer(socket.id);
    if (!player) {
      return;
    }

    const now = Date.now();
    const pingMessage: CoopPingMessage = {
      type: 'coop:ping',
      ping: {
        id: `${socket.id}-${now}`,
        playerId: player.id,
        playerName: player.name,
        kind: message.kind,
        q: message.q,
        r: message.r,
        label: pingLabel(message.kind),
        createdAt: now,
        expiresAt: now + PING_DURATION_MS,
        heroId: message.heroId,
      },
      timestamp: now,
    };

    broadcast(pingMessage);
  }
}
