export interface TerrainChunkCacheEntry {
    key: string;
    canvas: HTMLCanvasElement;
    dirty: boolean;
    rebuildCount: number;
}

interface TerrainChunkRebuilder {
    rebuild(request: { canvas: HTMLCanvasElement }): void;
}

export class TerrainChunkCache {
    private readonly chunks = new Map<string, TerrainChunkCacheEntry>();
    private readonly createCanvas: () => HTMLCanvasElement;

    constructor(createCanvas: () => HTMLCanvasElement) {
        this.createCanvas = createCanvas;
    }

    markDirty(key: string) {
        const entry = this.chunks.get(key);
        if (entry) {
            entry.dirty = true;
        }
    }

    markDirtyMany(keys: readonly string[]) {
        for (const key of keys) {
            this.markDirty(key);
        }
    }

    markAllDirty() {
        for (const entry of this.chunks.values()) {
            entry.dirty = true;
        }
    }

    ensureChunk(key: string, builder: TerrainChunkRebuilder) {
        let entry = this.chunks.get(key);
        if (!entry) {
            entry = {
                key,
                canvas: this.createCanvas(),
                dirty: true,
                rebuildCount: 0,
            };
            this.chunks.set(key, entry);
        }

        if (entry.dirty) {
            builder.rebuild({
                canvas: entry.canvas,
            });
            entry.dirty = false;
            entry.rebuildCount++;
        }

        return entry;
    }

    getChunk(key: string) {
        return this.chunks.get(key) ?? null;
    }

    getDirtyCount() {
        let count = 0;
        for (const entry of this.chunks.values()) {
            if (entry.dirty) {
                count++;
            }
        }
        return count;
    }

    getTotalRebuildCount() {
        let count = 0;
        for (const entry of this.chunks.values()) {
            count += entry.rebuildCount;
        }
        return count;
    }

    get size() {
        return this.chunks.size;
    }
}
