import type { TerrainKey } from '../../core/terrainDefs.ts';
import { axialDistanceCoords } from '../game/hex.ts';

export type SettlementStartBand = 'home' | 'near' | 'frontier' | 'remote';

export interface SettlementStartMarker {
  settlementId: string;
  q: number;
  r: number;
  playerId?: string | null;
  playerName?: string | null;
  playerColor?: string | null;
}

export interface SettlementStartCandidate {
  id: string;
  q: number;
  r: number;
  label: string;
  description: string;
  distanceBand: SettlementStartBand;
  distanceFromNearestSettlement: number;
  terrain: TerrainKey;
  available: boolean;
  occupiedByPlayerId?: string | null;
  occupiedByPlayerName?: string | null;
  occupiedByPlayerColor?: string | null;
}

export interface SettlementStartTerrainTile {
  id: string;
  q: number;
  r: number;
  terrain: TerrainKey;
}

interface CandidateBandConfig {
  band: SettlementStartBand;
  minDistance: number;
  maxDistance: number;
  targetCount: number;
}

export interface GenerateSettlementStartCandidatesOptions {
  settlements: SettlementStartMarker[];
  resolveTerrain: (q: number, r: number, origin?: { q: number; r: number }) => TerrainKey;
  isSettlementClaimed?: (settlementId: string) => boolean;
  getSettlementOwner?: (settlementId: string) => { playerId: string; playerName: string; playerColor?: string | null } | null;
}

interface CandidateDraft {
  q: number;
  r: number;
  terrain: TerrainKey;
  distanceFromNearestSettlement: number;
  score: number;
}

const START_BANDS: CandidateBandConfig[] = [
  { band: 'near', minDistance: 23, maxDistance: 28, targetCount: 2 },
  { band: 'frontier', minDistance: 40, maxDistance: 50, targetCount: 2 },
  { band: 'remote', minDistance: 65, maxDistance: 85, targetCount: 2 },
];

const AXIAL_DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const FOUNDABLE_TERRAINS = new Set<TerrainKey>(['plains', 'dirt']);
const STARTER_LAND_TERRAINS = new Set<TerrainKey>(['plains', 'dirt', 'forest', 'grain', 'snow', 'dessert']);
const START_SAFETY_RADIUS = 6;
const MIN_CONNECTED_STARTER_LAND = 25;
const MIN_OUTER_LAND_EXITS = 1;
const MAX_START_WATER_TILES = 44;
const START_TERRAIN_PREVIEW_PADDING = 8;

export function getSettlementStartCandidateId(q: number, r: number) {
  return `settlement-start:${q}:${r}`;
}

export function getSettlementIdFromStartCandidateId(candidateId: string) {
  const match = /^settlement-start:(-?\d+):(-?\d+)$/.exec(candidateId);
  if (!match) {
    return null;
  }

  return `${Number.parseInt(match[1]!, 10)},${Number.parseInt(match[2]!, 10)}`;
}

function createSettlementId(q: number, r: number) {
  return `${q},${r}`;
}

function hashCoord(q: number, r: number, salt: number) {
  let hash = 2166136261;
  const value = `${q}:${r}:${salt}`;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0xffffffff;
}

function getBandLabel(band: SettlementStartBand) {
  switch (band) {
    case 'home':
      return 'Original Landing';
    case 'near':
      return 'Nearby Claim';
    case 'frontier':
      return 'Frontier Claim';
    case 'remote':
      return 'Remote Claim';
  }
}

function getBandDescription(band: SettlementStartBand, distance: number) {
  switch (band) {
    case 'home':
      return 'Take responsibility for the first shared landing.';
    case 'near':
      return `${distance} tiles from the nearest settlement, close enough for quick cooperation.`;
    case 'frontier':
      return `${distance} tiles out, with room to grow without being isolated.`;
    case 'remote':
      return `${distance} tiles away, suited for a quiet independent start.`;
  }
}

function listAxialRing(centerQ: number, centerR: number, radius: number) {
  if (radius <= 0) {
    return [{ q: centerQ, r: centerR }];
  }

  const result: Array<{ q: number; r: number }> = [];
  let q = centerQ + AXIAL_DIRECTIONS[4]![0] * radius;
  let r = centerR + AXIAL_DIRECTIONS[4]![1] * radius;

  for (const [dq, dr] of AXIAL_DIRECTIONS) {
    for (let step = 0; step < radius; step++) {
      result.push({ q, r });
      q += dq;
      r += dr;
    }
  }

  return result;
}

function getNearestSettlementDistance(q: number, r: number, settlements: SettlementStartMarker[]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const settlement of settlements) {
    nearest = Math.min(nearest, axialDistanceCoords(q, r, settlement.q, settlement.r));
  }

  return nearest;
}

function getSiteScore(
  q: number,
  r: number,
  terrain: TerrainKey,
  band: CandidateBandConfig,
  distanceFromNearestSettlement: number,
  resolveTerrain: (q: number, r: number) => TerrainKey,
) {
  let score = terrain === 'plains' ? 9 : 7;
  const midpoint = (band.minDistance + band.maxDistance) / 2;
  score += Math.max(0, 5 - Math.abs(distanceFromNearestSettlement - midpoint) * 0.45);

  for (const [dq, dr] of AXIAL_DIRECTIONS) {
    const neighborTerrain = resolveTerrain(q + dq, r + dr);
    if (neighborTerrain === 'forest') score += 2.2;
    if (neighborTerrain === 'grain') score += 1.8;
    if (neighborTerrain === 'water') score += 1.1;
    if (neighborTerrain === 'mountain' || neighborTerrain === 'vulcano') score -= 2.5;
    if (neighborTerrain === 'snow' || neighborTerrain === 'dessert') score -= 1.2;
  }

  return score + hashCoord(q, r, 991) * 1.5;
}

function axialKey(q: number, r: number) {
  return `${q},${r}`;
}

function listAxialDisk(centerQ: number, centerR: number, radius: number) {
  const result: Array<{ q: number; r: number; distance: number }> = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      result.push({
        q: centerQ + dq,
        r: centerR + dr,
        distance: axialDistanceCoords(centerQ, centerR, centerQ + dq, centerR + dr),
      });
    }
  }

  return result;
}

function isStarterLandTerrain(terrain: TerrainKey) {
  return STARTER_LAND_TERRAINS.has(terrain);
}

function getStartSafety(
  q: number,
  r: number,
  resolveTerrain: (q: number, r: number, origin?: { q: number; r: number }) => TerrainKey,
) {
  const origin = { q, r };
  const terrains = new Map<string, { q: number; r: number; distance: number; terrain: TerrainKey }>();
  let waterTiles = 0;

  for (const coord of listAxialDisk(q, r, START_SAFETY_RADIUS)) {
    const terrain = resolveTerrain(coord.q, coord.r, origin);
    if (terrain === 'water') {
      waterTiles++;
    }

    terrains.set(axialKey(coord.q, coord.r), { ...coord, terrain });
  }

  const start = terrains.get(axialKey(q, r));
  if (!start || !isStarterLandTerrain(start.terrain)) {
    return {
      safe: false,
      connectedLand: 0,
      outerLandExits: 0,
      waterTiles,
    };
  }

  const visited = new Set<string>([axialKey(q, r)]);
  const queue = [{ q, r }];
  let connectedLand = 0;
  let outerLandExits = 0;

  while (queue.length) {
    const current = queue.shift()!;
    const currentEntry = terrains.get(axialKey(current.q, current.r));
    if (!currentEntry) {
      continue;
    }

    connectedLand++;
    if (currentEntry.distance >= START_SAFETY_RADIUS - 1) {
      outerLandExits++;
    }

    for (const [dq, dr] of AXIAL_DIRECTIONS) {
      const nq = current.q + dq;
      const nr = current.r + dr;
      const key = axialKey(nq, nr);
      if (visited.has(key)) {
        continue;
      }

      const neighbor = terrains.get(key);
      if (!neighbor || !isStarterLandTerrain(neighbor.terrain)) {
        continue;
      }

      visited.add(key);
      queue.push({ q: nq, r: nr });
    }
  }

  return {
    safe: connectedLand >= MIN_CONNECTED_STARTER_LAND
      && outerLandExits >= MIN_OUTER_LAND_EXITS
      && waterTiles <= MAX_START_WATER_TILES,
    connectedLand,
    outerLandExits,
    waterTiles,
  };
}

function isFarEnoughFromSelected(candidate: Pick<CandidateDraft, 'q' | 'r'>, selected: CandidateDraft[]) {
  return selected.every((entry) => axialDistanceCoords(candidate.q, candidate.r, entry.q, entry.r) >= 15);
}

function pickBandCandidates(
  band: CandidateBandConfig,
  settlements: SettlementStartMarker[],
  resolveTerrain: (q: number, r: number, origin?: { q: number; r: number }) => TerrainKey,
) {
  const drafts = new Map<string, CandidateDraft>();

  for (const settlement of settlements) {
    for (let radius = band.minDistance; radius <= band.maxDistance; radius++) {
      for (const coord of listAxialRing(settlement.q, settlement.r, radius)) {
        const settlementId = createSettlementId(coord.q, coord.r);
        if (drafts.has(settlementId)) {
          continue;
        }

        const distanceFromNearestSettlement = getNearestSettlementDistance(coord.q, coord.r, settlements);
        if (distanceFromNearestSettlement < band.minDistance || distanceFromNearestSettlement > band.maxDistance) {
          continue;
        }

        const terrain = resolveTerrain(coord.q, coord.r);
        if (!FOUNDABLE_TERRAINS.has(terrain)) {
          continue;
        }

        const safety = getStartSafety(coord.q, coord.r, resolveTerrain);
        if (!safety.safe) {
          continue;
        }

        drafts.set(settlementId, {
          q: coord.q,
          r: coord.r,
          terrain,
          distanceFromNearestSettlement,
          score: getSiteScore(coord.q, coord.r, terrain, band, distanceFromNearestSettlement, resolveTerrain),
        });
      }
    }
  }

  const selected: CandidateDraft[] = [];
  const sorted = Array.from(drafts.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return createSettlementId(left.q, left.r).localeCompare(createSettlementId(right.q, right.r));
  });

  for (const candidate of sorted) {
    if (!isFarEnoughFromSelected(candidate, selected)) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= band.targetCount) {
      break;
    }
  }

  return selected;
}

function toCandidate(draft: CandidateDraft, band: SettlementStartBand, options: GenerateSettlementStartCandidatesOptions): SettlementStartCandidate {
  const settlementId = createSettlementId(draft.q, draft.r);
  const owner = options.getSettlementOwner?.(settlementId) ?? null;
  const available = !owner && !(options.isSettlementClaimed?.(settlementId) ?? false);

  return {
    id: getSettlementStartCandidateId(draft.q, draft.r),
    q: draft.q,
    r: draft.r,
    label: getBandLabel(band),
    description: getBandDescription(band, draft.distanceFromNearestSettlement),
    distanceBand: band,
    distanceFromNearestSettlement: draft.distanceFromNearestSettlement,
    terrain: draft.terrain,
    available,
    occupiedByPlayerId: owner?.playerId ?? null,
    occupiedByPlayerName: owner?.playerName ?? null,
    occupiedByPlayerColor: owner?.playerColor ?? null,
  };
}

export function generateSettlementStartCandidates(options: GenerateSettlementStartCandidatesOptions): SettlementStartCandidate[] {
  const settlements = options.settlements.slice().sort((left, right) => left.settlementId.localeCompare(right.settlementId));
  if (settlements.length === 0) {
    return [];
  }

  const candidates: SettlementStartCandidate[] = [];
  const origin = settlements.find((settlement) => settlement.q === 0 && settlement.r === 0);
  if (origin) {
    const owner = options.getSettlementOwner?.(origin.settlementId) ?? null;
    candidates.push({
      id: getSettlementStartCandidateId(origin.q, origin.r),
      q: origin.q,
      r: origin.r,
      label: getBandLabel('home'),
      description: getBandDescription('home', 0),
      distanceBand: 'home',
      distanceFromNearestSettlement: 0,
      terrain: 'towncenter',
      available: !owner && !(options.isSettlementClaimed?.(origin.settlementId) ?? false),
      occupiedByPlayerId: owner?.playerId ?? null,
      occupiedByPlayerName: owner?.playerName ?? null,
      occupiedByPlayerColor: owner?.playerColor ?? null,
    });
  }

  for (const band of START_BANDS) {
    for (const draft of pickBandCandidates(band, settlements, options.resolveTerrain)) {
      candidates.push(toCandidate(draft, band.band, options));
    }
  }

  return candidates;
}

export function generateSettlementStartTerrainTiles(options: {
  settlements: SettlementStartMarker[];
  candidates: Array<Pick<SettlementStartCandidate, 'q' | 'r'>>;
  resolveTerrain: (q: number, r: number, origin?: { q: number; r: number }) => TerrainKey;
}): SettlementStartTerrainTile[] {
  const points = [
    ...options.settlements.map((settlement) => ({ q: settlement.q, r: settlement.r })),
    ...options.candidates.map((candidate) => ({ q: candidate.q, r: candidate.r })),
  ];

  if (points.length === 0) {
    return [];
  }

  const resolvePreviewOrigin = (q: number, r: number) => {
    let best = points[0]!;
    let bestDistance = axialDistanceCoords(q, r, best.q, best.r);

    for (const point of points.slice(1)) {
      const distance = axialDistanceCoords(q, r, point.q, point.r);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }

    return { q: best.q, r: best.r };
  };

  const projected = points.map((point) => ({
    x: point.q + point.r * 0.5,
    y: point.r * 0.866,
  }));
  const minX = Math.min(...projected.map((point) => point.x)) - START_TERRAIN_PREVIEW_PADDING;
  const maxX = Math.max(...projected.map((point) => point.x)) + START_TERRAIN_PREVIEW_PADDING;
  const minY = Math.min(...projected.map((point) => point.y)) - START_TERRAIN_PREVIEW_PADDING;
  const maxY = Math.max(...projected.map((point) => point.y)) + START_TERRAIN_PREVIEW_PADDING;
  const minR = Math.floor(minY / 0.866) - 1;
  const maxR = Math.ceil(maxY / 0.866) + 1;
  const tiles: SettlementStartTerrainTile[] = [];

  for (let r = minR; r <= maxR; r++) {
    const minQ = Math.floor(minX - r * 0.5) - 1;
    const maxQ = Math.ceil(maxX - r * 0.5) + 1;

    for (let q = minQ; q <= maxQ; q++) {
      const x = q + r * 0.5;
      const y = r * 0.866;
      if (x < minX || x > maxX || y < minY || y > maxY) {
        continue;
      }

      tiles.push({
        id: createSettlementId(q, r),
        q,
        r,
        terrain: options.resolveTerrain(q, r, resolvePreviewOrigin(q, r)),
      });
    }
  }

  return tiles.sort((left, right) => left.q - right.q || left.r - right.r);
}
