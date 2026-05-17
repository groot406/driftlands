import test from 'node:test';
import assert from 'node:assert/strict';

import type { TerrainKey } from '../../core/terrainDefs.ts';
import { axialDistanceCoords } from '../game/hex.ts';
import {
  generateSettlementStartCandidates,
  generateSettlementStartTerrainTiles,
  getSettlementIdFromStartCandidateId,
  getSettlementStartCandidateId,
  MIN_SETTLEMENT_START_CONNECTED_LAND,
  validateSettlementStartSite,
} from './settlementStart.ts';

function terrainFor(q: number, r: number): TerrainKey {
  if (q === 0 && r === 0) {
    return 'towncenter';
  }

  if ((q + r) % 11 === 0) {
    return 'water';
  }

  if (Math.abs(q - r) % 13 === 0) {
    return 'mountain';
  }

  if ((q + (r * 2)) % 5 === 0) {
    return 'forest';
  }

  return Math.abs(q + r) % 2 === 0 ? 'plains' : 'dirt';
}

test('settlement start candidates include home, near, frontier, and remote options', () => {
  const candidates = generateSettlementStartCandidates({
    settlements: [{ settlementId: '0,0', q: 0, r: 0 }],
    resolveTerrain: terrainFor,
  });

  assert.ok(candidates.some((candidate) => candidate.distanceBand === 'home'));
  assert.ok(candidates.some((candidate) => candidate.distanceBand === 'near'));
  assert.ok(candidates.some((candidate) => candidate.distanceBand === 'frontier'));
  assert.ok(candidates.some((candidate) => candidate.distanceBand === 'remote'));
  assert.ok(candidates.every((candidate) => candidate.distanceBand === 'home' || candidate.distanceFromNearestSettlement >= 13));
  assert.ok(candidates.every((candidate) => candidate.distanceBand === 'home' || candidate.terrain === 'plains' || candidate.terrain === 'dirt'));
});

test('settlement start candidates mark claimed settlements unavailable', () => {
  const originId = getSettlementStartCandidateId(0, 0);
  const candidates = generateSettlementStartCandidates({
    settlements: [{ settlementId: '0,0', q: 0, r: 0, playerId: 'player-1', playerName: 'Ada' }],
    resolveTerrain: terrainFor,
    getSettlementOwner: (settlementId) => settlementId === '0,0'
      ? { playerId: 'player-1', playerName: 'Ada' }
      : null,
  });

  const origin = candidates.find((candidate) => candidate.id === originId);
  assert.equal(origin?.available, false);
  assert.equal(origin?.occupiedByPlayerName, 'Ada');
  assert.equal(getSettlementIdFromStartCandidateId(originId), '0,0');
});

test('settlement start candidates reject waterlocked island starts', () => {
  const candidates = generateSettlementStartCandidates({
    settlements: [{ settlementId: '0,0', q: 0, r: 0 }],
    resolveTerrain(q, r, origin): TerrainKey {
      if (!origin) {
        return 'plains';
      }

      const distance = axialDistanceCoords(q, r, origin.q, origin.r);
      return distance >= 4 && distance <= 8 ? 'water' : 'plains';
    },
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.distanceBand),
    ['home'],
  );
});

test('settlement start validation rejects water, volcano, and small island starts', () => {
  assert.deepEqual(
    validateSettlementStartSite(0, 0, () => 'water'),
    {
      valid: false,
      terrain: 'water',
      connectedNonWaterTiles: 0,
      reason: 'water',
    },
  );

  assert.deepEqual(
    validateSettlementStartSite(0, 0, () => 'vulcano'),
    {
      valid: false,
      terrain: 'vulcano',
      connectedNonWaterTiles: 0,
      reason: 'vulcano',
    },
  );

  const smallIsland = validateSettlementStartSite(0, 0, (q, r) => (
    axialDistanceCoords(q, r, 0, 0) <= 1 ? 'plains' : 'water'
  ));
  assert.equal(smallIsland.valid, false);
  assert.equal(smallIsland.reason, 'small_island');
  assert.equal(smallIsland.connectedNonWaterTiles, 7);

  const largeEnoughIsland = validateSettlementStartSite(0, 0, (q, r) => (
    axialDistanceCoords(q, r, 0, 0) <= 2 ? 'plains' : 'water'
  ));
  assert.equal(largeEnoughIsland.valid, true);
  assert.equal(largeEnoughIsland.connectedNonWaterTiles, MIN_SETTLEMENT_START_CONNECTED_LAND);
});

test('settlement start terrain preview resolves tiles from the nearest candidate origin', () => {
  const terrainTiles = generateSettlementStartTerrainTiles({
    settlements: [{ settlementId: '0,0', q: 0, r: 0 }],
    candidates: [{ q: 30, r: 0 }],
    resolveTerrain(q, _r, origin): TerrainKey {
      return origin?.q === 30 && q >= 27 ? 'water' : 'plains';
    },
  });

  assert.equal(terrainTiles.find((tile) => tile.id === '30,0')?.terrain, 'water');
  assert.equal(terrainTiles.find((tile) => tile.id === '0,0')?.terrain, 'plains');
});

test('free settlement start terrain preview exposes a broad pickable map', () => {
  const terrainTiles = generateSettlementStartTerrainTiles({
    settlements: [{ settlementId: '0,0', q: 0, r: 0 }],
    candidates: [],
    resolveTerrain: terrainFor,
    freeStart: true,
  });

  assert.ok(terrainTiles.length > 20_000);
  assert.equal(terrainTiles.find((tile) => tile.id === '0,0')?.terrain, 'towncenter');
  assert.ok(terrainTiles.some((tile) => tile.id === '85,0'));
});

test('free settlement start terrain preview marks invalid founding tiles blocked', () => {
  const terrainTiles = generateSettlementStartTerrainTiles({
    settlements: [{ settlementId: '0,0', q: 0, r: 0 }],
    candidates: [],
    resolveTerrain(q, r): TerrainKey {
      if (q === 2 && r === 0) {
        return 'water';
      }

      if (q === 3 && r === 0) {
        return 'vulcano';
      }

      const islandDistance = axialDistanceCoords(q, r, 10, 0);
      if (islandDistance <= 1) {
        return 'plains';
      }
      if (islandDistance <= 2) {
        return 'water';
      }

      return 'plains';
    },
    freeStart: true,
  });

  assert.equal(terrainTiles.find((tile) => tile.id === '2,0')?.blockedReason, 'water');
  assert.equal(terrainTiles.find((tile) => tile.id === '3,0')?.blockedReason, 'vulcano');
  assert.equal(terrainTiles.find((tile) => tile.id === '10,0')?.blockedReason, 'small_island');
  assert.equal(terrainTiles.find((tile) => tile.id === '10,0')?.connectedNonWaterTiles, 7);
});
