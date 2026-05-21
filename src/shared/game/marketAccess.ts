import type { Tile } from '../../core/types/Tile.ts';
import { tiles } from '../../core/world.ts';
import { getTileSettlementId } from './settlement.ts';

export function isTradeCenterTile(tile: Tile | null | undefined): boolean {
  return tile?.variant === 'plains_trade_center' || tile?.variant === 'dirt_trade_center';
}

export function hasSettlementMarketAccess(settlementId: string | null | undefined): boolean {
  if (!settlementId) {
    return false;
  }

  return tiles.some((tile) => getTileSettlementId(tile) === settlementId && isTradeCenterTile(tile));
}
