export interface PlayerEntitySnapshot {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
  settlementId: string | null;
}

export const PLAYER_COLOR_PALETTE = [
  '#7dd3fc',
  '#a7f3d0',
  '#facc15',
  '#f0abfc',
  '#fdba74',
  '#c4b5fd',
  '#93c5fd',
  '#fda4af',
] as const;

export function sanitizePlayerNickname(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (!trimmed) {
    return 'Pioneer';
  }

  return trimmed.slice(0, 24);
}

export function sanitizeTemporaryPlayerId(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9:_-]/g, '') ?? '';
  if (normalized.length >= 6 && normalized.length <= 80) {
    return normalized;
  }

  return fallback;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getPlayerColor(playerId: string) {
  return PLAYER_COLOR_PALETTE[hashString(playerId) % PLAYER_COLOR_PALETTE.length] ?? PLAYER_COLOR_PALETTE[0];
}

function createGeneratedPlayerColor(playerId: string, attempt: number) {
  const hue = (hashString(`${playerId}:${attempt}`) + (attempt * 137)) % 360;
  return `hsl(${hue} 78% 68%)`;
}

export function getDistinctPlayerColor(playerId: string, usedColors: Iterable<string>) {
  const used = new Set(Array.from(usedColors).map((color) => color.toLowerCase()));
  const startIndex = hashString(playerId) % PLAYER_COLOR_PALETTE.length;

  for (let offset = 0; offset < PLAYER_COLOR_PALETTE.length; offset++) {
    const color = PLAYER_COLOR_PALETTE[(startIndex + offset) % PLAYER_COLOR_PALETTE.length]!;
    if (!used.has(color.toLowerCase())) {
      return color;
    }
  }

  for (let attempt = 0; attempt < 360; attempt++) {
    const color = createGeneratedPlayerColor(playerId, attempt);
    if (!used.has(color.toLowerCase())) {
      return color;
    }
  }

  return createGeneratedPlayerColor(playerId, used.size);
}
