export interface TerrainChunkCoord {
    chunkQ: number;
    chunkR: number;
}

export function getChunkIndexForAxial(value: number, chunkSize: number) {
    return Math.floor(value / chunkSize);
}

export function getTerrainChunkCoordForTile(q: number, r: number, chunkSize: number) {
    return {
        chunkQ: getChunkIndexForAxial(q, chunkSize),
        chunkR: getChunkIndexForAxial(r, chunkSize),
    };
}

export function createTerrainChunkKey(chunkQ: number, chunkR: number) {
    return `${chunkQ},${chunkR}`;
}

export function parseTerrainChunkKey(key: string): TerrainChunkCoord {
    const [rawQ = '0', rawR = '0'] = key.split(',');
    return {
        chunkQ: Number(rawQ),
        chunkR: Number(rawR),
    };
}

export function getTerrainChunkKeyForTile(q: number, r: number, chunkSize: number) {
    const coord = getTerrainChunkCoordForTile(q, r, chunkSize);
    return createTerrainChunkKey(coord.chunkQ, coord.chunkR);
}

export function getTerrainChunkBounds(chunkQ: number, chunkR: number, chunkSize: number) {
    return {
        minQ: chunkQ * chunkSize,
        maxQ: (chunkQ * chunkSize) + chunkSize - 1,
        minR: chunkR * chunkSize,
        maxR: (chunkR * chunkSize) + chunkSize - 1,
    };
}
