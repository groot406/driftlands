import type { Socket } from 'socket.io';
import { getHero } from '../../../src/shared/game/state/heroStore';
import type { CoopPlayerSnapshot, CoopStateSnapshot } from '../../../src/shared/coop/types';

interface CoopPlayerState {
  socketId: string;
  id: string;
  name: string;
  ready: boolean;
  connectedAt: number;
  claimedHeroIds: Set<string>;
}

class CoopState {
  private readonly playersBySocket = new Map<string, CoopPlayerState>();
  private readonly heroClaims = new Map<string, string>();

  upsertPlayer(socket: Socket, name: string) {
    const existing = this.playersBySocket.get(socket.id);

    this.playersBySocket.set(socket.id, {
      socketId: socket.id,
      id: socket.id,
      name,
      ready: existing?.ready ?? false,
      connectedAt: existing?.connectedAt ?? Date.now(),
      claimedHeroIds: existing?.claimedHeroIds ?? new Set<string>(),
    });
  }

  removePlayer(socketId: string) {
    const player = this.playersBySocket.get(socketId);
    if (!player) {
      return;
    }

    for (const heroId of player.claimedHeroIds) {
      if (this.heroClaims.get(heroId) === player.id) {
        this.heroClaims.delete(heroId);
      }
    }

    this.playersBySocket.delete(socketId);
  }

  getPlayer(socketId: string): CoopPlayerState | null {
    return this.playersBySocket.get(socketId) ?? null;
  }

  setReady(socketId: string, ready: boolean) {
    const player = this.playersBySocket.get(socketId);
    if (!player) {
      return false;
    }

    player.ready = ready;
    return true;
  }

  claimHero(socketId: string, heroId: string) {
    const player = this.playersBySocket.get(socketId);
    const hero = getHero(heroId);

    if (!player || !hero) {
      return false;
    }

    const ownerId = this.heroClaims.get(heroId);
    if (ownerId && ownerId !== player.id) {
      return false;
    }

    this.heroClaims.set(heroId, player.id);
    player.claimedHeroIds.add(heroId);
    return true;
  }

  releaseHero(socketId: string, heroId: string) {
    const player = this.playersBySocket.get(socketId);
    if (!player) {
      return false;
    }

    if (this.heroClaims.get(heroId) !== player.id) {
      return false;
    }

    this.heroClaims.delete(heroId);
    player.claimedHeroIds.delete(heroId);
    return true;
  }

  canControlHero(socketId: string, heroId: string) {
    const player = this.playersBySocket.get(socketId);
    if (!player) {
      return false;
    }

    const ownerId = this.heroClaims.get(heroId);
    return !ownerId || ownerId === player.id;
  }

  getSnapshot(): CoopStateSnapshot {
    const players: CoopPlayerSnapshot[] = Array.from(this.playersBySocket.values())
      .sort((left, right) => left.connectedAt - right.connectedAt)
      .map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        connectedAt: player.connectedAt,
        claimedHeroIds: Array.from(player.claimedHeroIds).filter((heroId) => this.heroClaims.get(heroId) === player.id),
      }));

    return {
      players,
      onlineCount: players.length,
      readyCount: players.filter((player) => player.ready).length,
    };
  }
}

export const coopState = new CoopState();
