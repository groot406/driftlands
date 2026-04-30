import {
  getDistinctPlayerColor,
  getPlayerColor,
  sanitizePlayerNickname,
  type PlayerEntitySnapshot,
} from '../../../src/shared/multiplayer/player';
import type { Hero } from '../../../src/core/types/Hero';

interface PlayerEntityState {
  id: string;
  nickname: string;
  color: string;
  connectedSocketIds: Set<string>;
  settlementId: string | null;
}

class PlayerSettlementState {
  private readonly players = new Map<string, PlayerEntityState>();
  private readonly playerIdBySocketId = new Map<string, string>();
  private readonly settlementByPlayerId = new Map<string, string>();
  private readonly ownerBySettlementId = new Map<string, { playerId: string; playerName: string; playerColor: string }>();

  registerPlayer(socketId: string, requestedPlayerId: string, playerName: string) {
    const playerId = requestedPlayerId;
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

  unregisterSocket(socketId: string) {
    const playerId = this.playerIdBySocketId.get(socketId);
    this.playerIdBySocketId.delete(socketId);
    if (!playerId) {
      return;
    }

    this.players.get(playerId)?.connectedSocketIds.delete(socketId);
  }

  reset() {
    this.players.clear();
    this.playerIdBySocketId.clear();
    this.settlementByPlayerId.clear();
    this.ownerBySettlementId.clear();
  }

  clearAssignments() {
    this.settlementByPlayerId.clear();
    this.ownerBySettlementId.clear();
    for (const player of this.players.values()) {
      player.settlementId = null;
    }
  }

  getSocketPlayerId(socketId: string) {
    return this.playerIdBySocketId.get(socketId) ?? null;
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
