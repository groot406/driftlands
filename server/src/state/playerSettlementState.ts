import {
  getDistinctPlayerColor,
  getPlayerColor,
  sanitizePlayerNickname,
  type PlayerEntitySnapshot,
} from '../../../src/shared/multiplayer/player';
import type { Hero } from '../../../src/core/types/Hero';
import type { LooperlandsHeroSelection } from '../../../src/shared/looperlands';
import type { StoryHeroId } from '../../../src/shared/story/heroRoster';

interface PlayerEntityState {
  id: string;
  nickname: string;
  color: string;
  connectedSocketIds: Set<string>;
  settlementId: string | null;
  lastSeenChangelogAt: number | null;
}

export interface PlayerSettlementPersistenceSnapshot {
  players: Array<{
    id: string;
    nickname: string;
    color: string;
    settlementId: string | null;
    lastSeenChangelogAt?: number | null;
  }>;
  settlements: Array<{
    playerId: string;
    settlementId: string;
  }>;
}

class PlayerSettlementState {
  private readonly players = new Map<string, PlayerEntityState>();
  private readonly playerIdBySocketId = new Map<string, string>();
  private readonly settlementByPlayerId = new Map<string, string>();
  private readonly ownerBySettlementId = new Map<string, { playerId: string; playerName: string; playerColor: string }>();
  private readonly starterHeroesByPlayerId = new Map<string, LooperlandsHeroSelection[]>();
  private readonly starterStoryHeroIdsByPlayerId = new Map<string, StoryHeroId[]>();
  private readonly spectatorSocketIds = new Set<string>();

  registerPlayer(socketId: string, requestedPlayerId: string, playerName: string, spectator: boolean = false) {
    const playerId = requestedPlayerId;
    this.detachSocketFromCurrentPlayer(socketId, playerId);
    const nickname = sanitizePlayerNickname(playerName);
    let player = this.players.get(playerId);
    if (!player) {
      const usedColors = Array.from(this.players.values()).map((entry) => entry.color);
      player = {
        id: playerId,
        nickname,
        color: getDistinctPlayerColor(playerId, usedColors),
        connectedSocketIds: new Set<string>(),
        settlementId: this.settlementByPlayerId.get(playerId) ?? null,
        lastSeenChangelogAt: null,
      };
      this.players.set(playerId, player);
    } else if (this.isColorUsedByAnotherPlayer(player.id, player.color)) {
      const usedColors = Array.from(this.players.values())
        .filter((entry) => entry.id !== playerId)
        .map((entry) => entry.color);
      player.color = getDistinctPlayerColor(playerId, usedColors);
    }

    player.nickname = nickname;
    this.ensureDistinctPlayerColors();
    player.connectedSocketIds.add(socketId);
    this.playerIdBySocketId.set(socketId, playerId);
    if (spectator) {
      this.spectatorSocketIds.add(socketId);
    } else {
      this.spectatorSocketIds.delete(socketId);
    }

    const settlementId = this.settlementByPlayerId.get(playerId);
    if (settlementId) {
      player.settlementId = settlementId;
      this.ownerBySettlementId.set(settlementId, {
        playerId,
        playerName: nickname,
        playerColor: player.color,
      });
    }

    return player;
  }

  private detachSocketFromCurrentPlayer(socketId: string, nextPlayerId?: string) {
    const currentPlayerId = this.playerIdBySocketId.get(socketId);
    if (!currentPlayerId || currentPlayerId === nextPlayerId) {
      return;
    }

    this.players.get(currentPlayerId)?.connectedSocketIds.delete(socketId);
    this.playerIdBySocketId.delete(socketId);
    this.spectatorSocketIds.delete(socketId);
    this.removeUnassignedOfflinePlayer(currentPlayerId);
  }

  private removeUnassignedOfflinePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player || player.connectedSocketIds.size > 0 || player.settlementId) {
      return;
    }

    this.players.delete(playerId);
    this.starterHeroesByPlayerId.delete(playerId);
    this.starterStoryHeroIdsByPlayerId.delete(playerId);
  }

  unregisterSocket(socketId: string) {
    const playerId = this.playerIdBySocketId.get(socketId);
    this.playerIdBySocketId.delete(socketId);
    this.spectatorSocketIds.delete(socketId);
    if (!playerId) {
      return;
    }

    this.players.get(playerId)?.connectedSocketIds.delete(socketId);
    this.removeUnassignedOfflinePlayer(playerId);
  }

  setStarterHeroes(playerId: string, heroes: LooperlandsHeroSelection[]) {
    this.starterHeroesByPlayerId.set(playerId, heroes.map((hero) => ({ ...hero })));
  }

  getStarterHeroes(playerId: string): LooperlandsHeroSelection[] {
    return this.starterHeroesByPlayerId.get(playerId)?.map((hero) => ({ ...hero })) ?? [];
  }

  setStarterStoryHeroIds(playerId: string, heroIds: StoryHeroId[]) {
    this.starterStoryHeroIdsByPlayerId.set(playerId, heroIds.slice());
  }

  getStarterStoryHeroIds(playerId: string): StoryHeroId[] {
    return this.starterStoryHeroIdsByPlayerId.get(playerId)?.slice() ?? [];
  }

  reset() {
    this.players.clear();
    this.playerIdBySocketId.clear();
    this.settlementByPlayerId.clear();
    this.ownerBySettlementId.clear();
    this.starterHeroesByPlayerId.clear();
    this.starterStoryHeroIdsByPlayerId.clear();
    this.spectatorSocketIds.clear();
  }

  getPersistenceSnapshot(): PlayerSettlementPersistenceSnapshot {
    return {
      players: Array.from(this.players.values())
        .filter((player) => !!player.settlementId)
        .map((player) => ({
          id: player.id,
          nickname: player.nickname,
          color: player.color,
          settlementId: player.settlementId,
          lastSeenChangelogAt: player.lastSeenChangelogAt,
        })),
      settlements: Array.from(this.settlementByPlayerId.entries()).map(([playerId, settlementId]) => ({
        playerId,
        settlementId,
      })),
    };
  }

  loadPersistenceSnapshot(snapshot: PlayerSettlementPersistenceSnapshot | null | undefined) {
    this.reset();
    if (!snapshot) {
      return;
    }

    for (const playerSnapshot of snapshot.players ?? []) {
      if (!playerSnapshot.id) {
        continue;
      }

      this.players.set(playerSnapshot.id, {
        id: playerSnapshot.id,
        nickname: sanitizePlayerNickname(playerSnapshot.nickname || 'Pioneer'),
        color: playerSnapshot.color || getPlayerColor(playerSnapshot.id),
        connectedSocketIds: new Set<string>(),
        settlementId: playerSnapshot.settlementId ?? null,
        lastSeenChangelogAt: normalizeChangelogTimestamp(playerSnapshot.lastSeenChangelogAt),
      });
    }

    for (const assignment of snapshot.settlements ?? []) {
      if (!assignment.playerId || !assignment.settlementId) {
        continue;
      }

      let player = this.players.get(assignment.playerId);
      if (!player) {
        player = {
          id: assignment.playerId,
          nickname: 'Pioneer',
          color: getPlayerColor(assignment.playerId),
          connectedSocketIds: new Set<string>(),
          settlementId: null,
          lastSeenChangelogAt: null,
        };
        this.players.set(assignment.playerId, player);
      }

      player.settlementId = assignment.settlementId;
      this.settlementByPlayerId.set(assignment.playerId, assignment.settlementId);
      this.ownerBySettlementId.set(assignment.settlementId, {
        playerId: assignment.playerId,
        playerName: player.nickname,
        playerColor: player.color,
      });
    }

    for (const playerId of Array.from(this.players.keys())) {
      this.removeUnassignedOfflinePlayer(playerId);
    }

    this.ensureDistinctPlayerColors();
  }

  clearAssignments() {
    this.settlementByPlayerId.clear();
    this.ownerBySettlementId.clear();
    for (const player of Array.from(this.players.values())) {
      player.settlementId = null;
      this.removeUnassignedOfflinePlayer(player.id);
    }
  }

  getSocketPlayerId(socketId: string) {
    return this.playerIdBySocketId.get(socketId) ?? null;
  }

  isSocketSpectator(socketId: string) {
    return this.spectatorSocketIds.has(socketId);
  }

  getPlayerSettlement(playerId: string) {
    return this.settlementByPlayerId.get(playerId) ?? null;
  }

  getPlayerName(playerId: string) {
    return this.players.get(playerId)?.nickname ?? null;
  }

  getPlayerColor(playerId: string) {
    return this.players.get(playerId)?.color ?? getPlayerColor(playerId);
  }

  private isColorUsedByAnotherPlayer(playerId: string, color: string) {
    return Array.from(this.players.values()).some((player) => player.id !== playerId && player.color === color);
  }

  private ensureDistinctPlayerColors() {
    const usedColors: string[] = [];
    const players = Array.from(this.players.values())
      .sort((left, right) => left.nickname.localeCompare(right.nickname) || left.id.localeCompare(right.id));

    for (const player of players) {
      if (usedColors.map((color) => color.toLowerCase()).includes(player.color.toLowerCase())) {
        player.color = getDistinctPlayerColor(player.id, usedColors);
      }

      usedColors.push(player.color);
      if (player.settlementId) {
        this.ownerBySettlementId.set(player.settlementId, {
          playerId: player.id,
          playerName: player.nickname,
          playerColor: player.color,
        });
      }
    }
  }

  getSettlementOwner(settlementId: string) {
    return this.ownerBySettlementId.get(settlementId) ?? null;
  }

  isSettlementClaimed(settlementId: string) {
    return this.ownerBySettlementId.has(settlementId);
  }

  assignPlayerSettlement(playerId: string, settlementId: string) {
    const currentSettlementId = this.settlementByPlayerId.get(playerId);
    if (currentSettlementId) {
      return currentSettlementId === settlementId;
    }

    const existingOwner = this.ownerBySettlementId.get(settlementId);
    if (existingOwner && existingOwner.playerId !== playerId) {
      return false;
    }

    let player = this.players.get(playerId);
    if (!player) {
      const usedColors = Array.from(this.players.values()).map((entry) => entry.color);
      player = {
        id: playerId,
        nickname: 'Pioneer',
        color: getDistinctPlayerColor(playerId, usedColors),
        connectedSocketIds: new Set<string>(),
        settlementId: null,
        lastSeenChangelogAt: null,
      };
      this.players.set(playerId, player);
    }

    const playerName = player.nickname;
    this.settlementByPlayerId.set(playerId, settlementId);
    player.settlementId = settlementId;
    this.ownerBySettlementId.set(settlementId, { playerId, playerName, playerColor: player.color });
    return true;
  }

  canPlayerControlHero(playerId: string | null | undefined, hero: Pick<Hero, 'playerId'> | null | undefined) {
    if (!playerId || !hero) {
      return false;
    }

    return !hero.playerId || hero.playerId === playerId;
  }

  getLastSeenChangelogAt(playerId: string | null | undefined) {
    if (!playerId) {
      return null;
    }

    return this.players.get(playerId)?.lastSeenChangelogAt ?? null;
  }

  setLastSeenChangelogAt(playerId: string | null | undefined, seenAt: number) {
    if (!playerId || !Number.isFinite(seenAt)) {
      return;
    }

    let player = this.players.get(playerId);
    if (!player) {
      const usedColors = Array.from(this.players.values()).map((entry) => entry.color);
      player = {
        id: playerId,
        nickname: 'Pioneer',
        color: getDistinctPlayerColor(playerId, usedColors),
        connectedSocketIds: new Set<string>(),
        settlementId: this.settlementByPlayerId.get(playerId) ?? null,
        lastSeenChangelogAt: null,
      };
      this.players.set(playerId, player);
    }

    player.lastSeenChangelogAt = Math.max(player.lastSeenChangelogAt ?? 0, Math.floor(seenAt));
  }

  listPlayers(): PlayerEntitySnapshot[] {
    return Array.from(this.players.values())
      .sort((left, right) => left.nickname.localeCompare(right.nickname) || left.id.localeCompare(right.id))
      .map((player) => ({
        id: player.id,
        nickname: player.nickname,
        color: player.color,
        connected: player.connectedSocketIds.size > 0,
        settlementId: player.settlementId,
      }));
  }
}

export const playerSettlementState = new PlayerSettlementState();

function normalizeChangelogTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
}
