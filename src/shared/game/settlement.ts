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

export function getSettlementTownCenterTile<T extends Pick<Tile, 'terrain' | 'id' | 'ownerSettlementId' | 'controlledBySettlementId'>>(
    tiles: Iterable<T>,
    settlementId: string | null | undefined,
) {
    if (!settlementId) {
        return null;
    }

    for (const tile of tiles) {
        if (tile.terrain === 'towncenter' && getTileSettlementId(tile) === settlementId) {
            return tile;
        }
    }

    return null;
}
