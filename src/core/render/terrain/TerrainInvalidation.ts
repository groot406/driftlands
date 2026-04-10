import { createTerrainChunkKey, getTerrainChunkCoordForTile } from './TerrainChunkKey';

const NEIGHBOR_DELTAS: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
];

export interface DirtyTile {
    q: number;
    r: number;
}

export function getDirtyChunkKeysForTile(tile: DirtyTile, chunkSize: number) {
    const dirtyKeys = new Set<string>();

    for (const [deltaQ, deltaR] of NEIGHBOR_DELTAS) {
        const chunk = getTerrainChunkCoordForTile(tile.q + deltaQ, tile.r + deltaR, chunkSize);
        dirtyKeys.add(createTerrainChunkKey(chunk.chunkQ, chunk.chunkR));
    }

    return [...dirtyKeys].sort();
}

export function getDirtyChunkKeysForTiles(tiles: readonly DirtyTile[], chunkSize: number) {
    const dirtyKeys = new Set<string>();

    for (const tile of tiles) {
        for (const key of getDirtyChunkKeysForTile(tile, chunkSize)) {
            dirtyKeys.add(key);
        }
    }

    return [...dirtyKeys].sort();
}
