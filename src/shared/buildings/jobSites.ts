import type { Tile } from '../../core/types/Tile.ts';

export function isJobSiteEnabled(tile: Tile | null | undefined) {
    return tile?.jobSiteEnabled !== false;
}
