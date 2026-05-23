import type { Socket } from 'socket.io';
import { normalizeWalletAddress } from '../../../src/shared/looperlands';
import { playerSettlementState } from '../state/playerSettlementState';

function parseCsvEnv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const adminWallets = new Set(parseCsvEnv(process.env.DRIFTLANDS_ADMIN_WALLETS).map(normalizeWalletAddress));
const adminPlayerIds = new Set(parseCsvEnv(process.env.DRIFTLANDS_ADMIN_PLAYER_IDS));

export function getConfiguredAdminWallets() {
  return [...adminWallets];
}

export function isAdminPlayerId(playerId: string | null | undefined) {
  if (!playerId) {
    return false;
  }

  if (adminPlayerIds.has(playerId)) {
    return true;
  }

  const match = /^wallet:\d+:(.+)$/i.exec(playerId);
  return !!match && adminWallets.has(normalizeWalletAddress(match[1]!));
}

export function isAdminSocket(socket: Socket) {
  return isAdminPlayerId(playerSettlementState.getSocketPlayerId(socket.id));
}
