// Centralized terrain definitions with full properties.
// If you add new terrain types, update TerrainKey and definitions here.

export interface TerrainDef {
    color: string;
    baseWeight: number;
    adjacency: Record<string, number>; // neighbor terrain -> weight delta
    // Optional properties used for generation constraints & movement
    walkable?: boolean;
    minDistanceFromCenter?: number; // must be at least this far from (0,0)
    minSeparation?: number; // must be at least this far from any same-terrain tile
    preserveIsolation?: boolean; // if true, island reduction will not modify solitary instances
    // --- Animation (optional) ---
    // If provided, renderer will treat tile image as a horizontal sprite sheet consisting of `frames` equal-width frames.
    // frameTime is the duration (ms) per frame. If omitted or invalid, defaults are applied.
    frames?: number; // number of animation frames (>=2 for animation)
    frameTime?: number; // ms per frame
    // --- Movement (optional) ---
    // Multiplier applied to base hero step duration when entering this terrain (>= 0.1).
    // Lower values => faster traversal; higher => slower. Defaults to 1 if omitted.
    moveCost?: number;
}

interface TerrainDefsMap {
    forest: TerrainDef;
    plains: TerrainDef;
    water: TerrainDef;
    mountain: TerrainDef;
    mine: TerrainDef;
    ruin: TerrainDef;
    towncenter: TerrainDef;
}

export const TERRAIN_DEFS: TerrainDefsMap = {
    forest: {
        color: '#14532d',
        baseWeight: 30,
        walkable: true,
        adjacency: {
            forest: 40,
            plains: 10,
        },
        moveCost: 2.5,
    },
    plains: {
        color: '#16a34a',
        baseWeight: 40,
        walkable: true,
        adjacency: {
            water: 10,
            forest: 10,
            plains: 40,
        },
        moveCost: 1,
    },
    water: {
        minDistanceFromCenter: 5,
        color: '#0ea5e9',
        baseWeight: 30,
        walkable: false,
        adjacency: {
            water: 60,
            plains: 20,
        },
        frames: 4,
        frameTime: 220,
    },
    mountain: {
        minDistanceFromCenter: 3,
        color: '#475569',
        baseWeight: 40,
        walkable: true,
        adjacency: {
            mountain: 30,
            mine: 20,
            ruin: -5,
        },
        moveCost: 5,
    },
    mine: {
        minDistanceFromCenter: 4,
        minSeparation: 10,
        preserveIsolation: true,
        color: '#525252',
        baseWeight: 5,
        walkable: true,
        adjacency: {
            mountain: 10,
            mine: -100,
        },
        moveCost: 4,
    },
    ruin: {
        minDistanceFromCenter: 4,
        minSeparation: 10,
        preserveIsolation: true,
        color: '#7f1d1d',
        baseWeight: 1,
        walkable: true,
        adjacency: {
            forest: 20,
            ruin: -100,
        },
        moveCost: 4,
    },
    towncenter: {
        color: '#eab308',
        walkable: true,
        baseWeight: 0,
        adjacency: {},
        preserveIsolation: true,
        moveCost: 5,
    },
};

export type TerrainKey = keyof TerrainDefsMap;
