import { applyVariant } from '../../../src/core/variants';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';
import type { ResourceAmount } from '../../../src/shared/game/types/Resource';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { getTilesInRadius, tileIndex } from '../../../src/shared/game/world';
import type { ResolvedJobSite } from './jobSiteRuntime';

export type ForestryFieldPhase = 'chop_forest' | 'replant_forest';

export interface ForestryFieldAction {
    phase: ForestryFieldPhase;
    fieldTileId: string;
    durationMs: number;
}

export interface ForestryFieldCompletion {
    changed: boolean;
    tile: Tile | null;
    harvested: ResourceAmount | null;
}

export const FORESTRY_FIELD_SUBTASK_MS = 10_000;

const FORESTRY_WORK_RADIUS = 1;

function listManagedForestTiles(site: ResolvedJobSite, excludedTileIds: ReadonlySet<string>) {
    return getTilesInRadius(site.tile.q, site.tile.r, FORESTRY_WORK_RADIUS)
        .filter((tile) => tile.id !== site.tile.id)
        .filter((tile) => !excludedTileIds.has(tile.id))
        .filter((tile) => tile.discovered && isTileActive(tile))
        .filter((tile) => tile.terrain === 'forest')
        .sort((a, b) => a.id.localeCompare(b.id));
}

function isMatureForest(tile: Tile) {
    return tile.terrain === 'forest' && tile.isBaseTile;
}

function isChoppedForest(tile: Tile) {
    return tile.terrain === 'forest' && tile.variant === 'chopped_forest';
}

function makeForestryAction(phase: ForestryFieldPhase, tile: Tile): ForestryFieldAction {
    return {
        phase,
        fieldTileId: tile.id,
        durationMs: FORESTRY_FIELD_SUBTASK_MS,
    };
}

export function isForestryJobSite(site: ResolvedJobSite) {
    return site.building.key === 'lumberCamp';
}

export function chooseForestryFieldAction(
    site: ResolvedJobSite,
    excludedTileIds: ReadonlySet<string> = new Set(),
): ForestryFieldAction | null {
    if (!isForestryJobSite(site)) {
        return null;
    }

    const fields = listManagedForestTiles(site, excludedTileIds);
    const matureForest = fields.find(isMatureForest);
    if (matureForest) {
        return makeForestryAction('chop_forest', matureForest);
    }

    const choppedForest = fields.find(isChoppedForest);
    if (choppedForest) {
        return makeForestryAction('replant_forest', choppedForest);
    }

    return null;
}

export function getForestryFieldAction(site: ResolvedJobSite, phase: ForestryFieldPhase, fieldTileId: string) {
    if (!isForestryJobSite(site)) {
        return null;
    }

    const tile = tileIndex[fieldTileId] ?? null;
    if (!tile || !tile.discovered || !isTileActive(tile)) {
        return null;
    }

    switch (phase) {
        case 'chop_forest':
            return isMatureForest(tile) ? makeForestryAction(phase, tile) : null;
        case 'replant_forest':
            return isChoppedForest(tile) ? makeForestryAction(phase, tile) : null;
        default:
            return null;
    }
}

export function completeForestryFieldAction(
    site: ResolvedJobSite,
    action: ForestryFieldAction,
): ForestryFieldCompletion {
    if (!isForestryJobSite(site)) {
        return { changed: false, tile: null, harvested: null };
    }

    const tile = tileIndex[action.fieldTileId] ?? null;
    if (!tile) {
        return { changed: false, tile: null, harvested: null };
    }

    switch (action.phase) {
        case 'chop_forest': {
            if (!isMatureForest(tile)) {
                return { changed: false, tile, harvested: null };
            }
            applyVariant(tile, 'chopped_forest', { stagger: false, respectBiome: true });
            return { changed: true, tile, harvested: { type: 'wood', amount: 4 } };
        }
        case 'replant_forest': {
            if (!isChoppedForest(tile)) {
                return { changed: false, tile, harvested: null };
            }
            applyVariant(tile, 'young_forest', { stagger: false, respectBiome: true });
            return { changed: true, tile, harvested: null };
        }
        default:
            return { changed: false, tile, harvested: null };
    }
}
