import test from 'node:test';
import assert from 'node:assert/strict';

import type { TerrainKey } from '../../core/terrainDefs.ts';
import { axialDistanceCoords } from '../game/hex.ts';
import {
  generateSettlementStartCandidates,
  getSettlementIdFromStartCandidateId,
  getSettlementStartCandidateId,
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
