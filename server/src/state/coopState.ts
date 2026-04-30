import type { Socket } from 'socket.io';
import { getHero } from '../../../src/shared/game/state/heroStore';
import type { CoopPlayerSnapshot, CoopStateSnapshot } from '../../../src/shared/coop/types';
import type { Hero } from '../../../src/shared/game/types/Hero';

/** Seconds of inactivity before a claimed hero is auto-released. */
const IDLE_RELEASE_SECONDS = 10;

interface CoopPlayerState {
  socketId: string;
  id: string;
  name: string;
  color?: string;
  settlementId?: string | null;
  ready: boolean;
  connectedAt: number;
  claimedHeroIds: Set<string>;
}

class CoopState {
  private readonly playersBySocket = new Map<string, CoopPlayerState>();
  private readonly heroClaims = new Map<string, string>();
  /** Timestamp (ms) of the last player-initiated action per claimed hero. */
  private readonly heroLastCommandAt = new Map<string, number>();

  resetHeroClaims() {
    for (const player of this.playersBySocket.values()) {
      player.claimedHeroIds.clear();
    }

    this.heroClaims.clear();
    this.heroLastCommandAt.clear();
  }

  upsertPlayer(socket: Socket, name: string, playerId: string = socket.id, color?: string, settlementId?: string | null) {
    const existing = this.playersBySocket.get(socket.id);

    this.playersBySocket.set(socket.id, {
      socketId: socket.id,
      id: playerId,
      name,
      color,
      settlementId: settlementId ?? null,
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
      this.heroLastCommandAt.delete(heroId);
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

  updatePlayerSettlement(playerId: string, settlementId: string | null) {
    for (const player of this.playersBySocket.values()) {
      if (player.id === playerId) {
        player.settlementId = settlementId;
      }
    }
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
    this.heroLastCommandAt.set(heroId, Date.now());
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
    this.heroLastCommandAt.delete(heroId);
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

  /**
   * Record that a player issued a command (move, task, etc.) for a claimed
   * hero. Resets the idle auto-release timer for that hero.
   */
  touchHeroActivity(heroId: string) {
    if (this.heroClaims.has(heroId)) {
      this.heroLastCommandAt.set(heroId, Date.now());
    }
  }

  /**
   * Release every claimed hero that has been idle (no task, no movement) for
   * longer than {@link IDLE_RELEASE_SECONDS}.
   *
   * @returns list of hero IDs that were auto-released (empty if none).
   */
  releaseIdleHeroes(heroes: Hero[], now: number = Date.now()): string[] {
    const released: string[] = [];
    const cutoff = now - IDLE_RELEASE_SECONDS * 1000;

    for (const [heroId, playerId] of this.heroClaims) {
      const lastCommand = this.heroLastCommandAt.get(heroId) ?? 0;
      if (lastCommand > cutoff) {
        continue; // Player has been active recently
      }

      const hero = heroes.find((h) => h.id === heroId);
      if (!hero) {
        continue;
      }

      // Hero is still busy — don't release
      if (hero.movement || hero.currentTaskId || hero.pendingTask || hero.carryingPayload) {
        // Keep the timer alive while the hero is busy
        this.heroLastCommandAt.set(heroId, now);
        continue;
      }

      // Find the owning player and remove the claim
      for (const player of this.playersBySocket.values()) {
        if (player.id === playerId) {
          player.claimedHeroIds.delete(heroId);
          break;
        }
      }

      this.heroClaims.delete(heroId);
      this.heroLastCommandAt.delete(heroId);
      released.push(heroId);
    }

    return released;
  }

  getSnapshot(): CoopStateSnapshot {
    const players: CoopPlayerSnapshot[] = Array.from(this.playersBySocket.values())
      .sort((left, right) => left.connectedAt - right.connectedAt)
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        settlementId: player.settlementId ?? null,
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
