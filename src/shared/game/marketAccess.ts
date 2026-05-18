import type { Tile } from '../../core/types/Tile.ts';
import { tileIndex } from '../../core/world.ts';
import { getTileSettlementId } from './settlement.ts';

export function hasSettlementMarketAccess(settlementId: string | null | undefined): boolean {
  if (!settlementId) {
    return false;
  }

  const townCenter = tileIndex[settlementId];
  return !!townCenter?.marketCharterUnlocked;
}

export function canGrantMarketCharter(tile: Tile | null | undefined): boolean {
  return !!tile
    && tile.discovered
    && tile.terrain === 'towncenter'
    && !!getTileSettlementId(tile)
    && !tile.marketCharterUnlocked;
}

export function grantMarketCharter(tile: Tile): void {
  tile.marketCharterUnlocked = true;
}
