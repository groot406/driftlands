import type { Hero } from '../../core/types/Hero.ts';
import type { TaskDefinition } from '../../core/types/Task.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { isTileActive } from '../game/state/settlementSupportStore.ts';

export function canTaskUseTileState(def: TaskDefinition, tile: Tile | null | undefined) {
    if (!tile?.discovered || !tile.terrain) {
        return true;
    }

    if (tile.terrain === 'towncenter' || def.allowInactiveTile) {
        return true;
    }

    return isTileActive(tile);
}

export function canStartTaskDefinition(def: TaskDefinition | null | undefined, tile: Tile | null | undefined, hero: Hero) {
    return !!def
        && !!tile
        && canTaskUseTileState(def, tile)
        && def.canStart(tile, hero);
}
