import type { Tile } from './types/Tile';

export function getTileSettlementId(
    tile: Pick<Tile, 'terrain' | 'id' | 'ownerSettlementId' | 'controlledBySettlementId'> | null | undefined,
) {
    if (!tile) {
        return null;
    }

    return tile.ownerSettlementId
        ?? tile.controlledBySettlementId
        ?? (tile.terrain === 'towncenter' ? tile.id : null)
        ?? null;
}

export function isTileInSettlement(
    tile: Pick<Tile, 'terrain' | 'id' | 'ownerSettlementId' | 'controlledBySettlementId'> | null | undefined,
    settlementId: string | null | undefined,
) {
    if (!settlementId) {
        return false;
    }

    return getTileSettlementId(tile) === settlementId;
}
