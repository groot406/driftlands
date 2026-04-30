import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { ensureTileExists, loadWorld, tileIndex } from '../../core/world.ts';
import { getBuildingDefinitionByKey, promoteTileToTowncenter } from './registry.ts';

function createOwnedTile(q: number, r: number, terrain: Tile['terrain'], settlementId: string): Tile {
  return {
    id: `${q},${r}`,
    q,
    r,
    biome: terrain === 'water' ? 'lake' : 'plains',
    terrain,
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    ownerSettlementId: settlementId,
    controlledBySettlementId: settlementId,
    variant: null,
  };
}

test.afterEach(() => {
  loadWorld([]);
});

test('watchtower discoveries inherit the watchtower settlement ownership', () => {
  const settlementId = '5,5';
  const watchtower = createOwnedTile(5, 5, 'plains', settlementId);
  loadWorld([watchtower]);

  const building = getBuildingDefinitionByKey('watchtower');
  building?.onComplete?.(watchtower, {} as never, []);

  const revealedTile = tileIndex[ensureTileExists(8, 5).id];
  assert.equal(revealedTile?.discovered, true);
  assert.equal(revealedTile?.ownerSettlementId, settlementId);
  assert.equal(revealedTile?.controlledBySettlementId, settlementId);
});

test('promoting a tile to towncenter establishes settlement ownership', () => {
  const frontierTile: Tile = {
    id: '12,-3',
    q: 12,
    r: -3,
    biome: 'plains',
    terrain: 'plains',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    variant: null,
  };

  loadWorld([frontierTile]);
  promoteTileToTowncenter(frontierTile);

  assert.equal(frontierTile.terrain, 'towncenter');
  assert.equal(frontierTile.ownerSettlementId, frontierTile.id);
  assert.equal(frontierTile.controlledBySettlementId, frontierTile.id);
});
