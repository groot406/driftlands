export type CoopPingKind = 'assist' | 'gather' | 'scout';

export interface CoopPlayerSnapshot {
  id: string;
  name: string;
  color?: string;
  settlementId?: string | null;
  ready: boolean;
  connectedAt: number;
  claimedHeroIds: string[];
}

export interface CoopStateSnapshot {
  players: CoopPlayerSnapshot[];
  onlineCount: number;
  readyCount: number;
}

export interface CoopPingSnapshot {
  id: string;
  playerId: string;
  playerName: string;
  kind: CoopPingKind;
  q: number;
  r: number;
  label: string;
  createdAt: number;
  expiresAt: number;
  heroId?: string;
}
