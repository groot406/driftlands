import type { Server, Socket } from 'socket.io';
import type { HeroScoutResourceRequestMessage } from '../../../src/shared/protocol';
import { getHero } from '../../../src/shared/game/state/heroStore';
import { detachHeroFromCurrentTask } from '../../../src/shared/game/state/taskStore';
import {
  broadcastHeroScoutResourceUpdate,
  isScoutResourceUnlocked,
  isScoutableResourceType,
  startScoutResourceSearch,
} from '../../../src/shared/game/scoutResources';
import { serverMessageRouter } from '../messages/messageRouter';
import { coopState } from '../state/coopState';
import { playerSettlementState } from '../state/playerSettlementState';

export class ServerScoutHandler {
  constructor(_io: Server) {}

  init(): void {
    serverMessageRouter.on('hero:scout_resource_request', this.handleScoutResourceRequest.bind(this));
  }

  private handleScoutResourceRequest(socket: Socket, message: HeroScoutResourceRequestMessage): void {
    const hero = getHero(message.heroId);
    if (!hero) {
      return;
    }

    if (!coopState.canControlHero(socket.id, hero.id)) {
      return;
    }
    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    if (!playerSettlementState.canPlayerControlHero(playerId, hero)) {
      return;
    }

    if (!isScoutableResourceType(message.resourceType) || !isScoutResourceUnlocked(message.resourceType)) {
      return;
    }

    if (hero.carryingPayload) {
      return;
    }

    const player = coopState.getPlayer(socket.id);
    coopState.touchHeroActivity(hero.id);
    detachHeroFromCurrentTask(hero);
    hero.pendingTask = undefined;
    hero.pendingExploreTarget = undefined;
    hero.pendingChain = undefined;
    hero.scoutResourceIntent = {
      resourceType: message.resourceType,
      playerId: player?.id ?? playerId ?? socket.id,
      playerName: player?.name ?? hero.name,
    };
    broadcastHeroScoutResourceUpdate(hero);

    startScoutResourceSearch(hero);
  }
}
