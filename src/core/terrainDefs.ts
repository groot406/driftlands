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
    frames?: number; // number of animation frames (>=2 for animation)
    frameTime?: number; // ms per frame
    // --- Movement (optional) ---
    moveCost?: number;
    // --- Variations (optional) ---
    // Lightweight variant tiles that inherit all properties of the base terrain.
    // Variants provide alternate art (and potentially future overrides) selected AFTER terrain generation.
    // Each variant has a relative weight and optional neighbor side constraints controlling placement.
    // Example use: coastline versions of plains that only appear when a given side borders water OR an undiscovered tile.
    variations?: TerrainVariationDef[];
    // Relative weight for choosing "no variation" when variants are available. Defaults to sum(variant weights) if omitted.
    variationBaseWeight?: number;
}

// Side names reused from world.ts (keep string literals to avoid circular import)
export type TerrainSide = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export interface TerrainVariationConstraint {
    side: TerrainSide; // oriented side to test
    anyOf: string[]; // neighbor terrains that satisfy condition (e.g. ['water'])
    allowUndiscovered?: boolean; // if true, an undiscovered neighbor also satisfies
}

export interface TerrainVariationDef {
    key: string; // unique variant image key (e.g. 'plains_coast_a')
    weight?: number; // relative selection weight among other valid variants
    constraints?: TerrainVariationConstraint[]; // all constraints must pass for variant to be eligible
}

interface TerrainDefsMap {
    forest: TerrainDef;
    chopped_forest: TerrainDef;
    plains: TerrainDef;
    water: TerrainDef;
    mountain: TerrainDef;
    towncenter: TerrainDef;
    dirt: TerrainDef;
    snow: TerrainDef;
    dessert: TerrainDef;
}

export const TERRAIN_DEFS: TerrainDefsMap = {
    towncenter: {
        color: '#eab308',
        walkable: true,
        baseWeight: 0,
        adjacency: {},
        preserveIsolation: true,
        moveCost: 3,
    },
    forest: {
        color: '#14532d',
        baseWeight: 30,
        walkable: true,
        adjacency: {
            forest: 40,
            plains: 10,
        },
        moveCost: 2.5,
        variations: [
            { key: 'chopped_forest', weight: 5 },
        ],
    },
    chopped_forest: {
        color: '#14532d',
        baseWeight: 0,
        walkable: true,
        moveCost: 1.2,
        adjacency: {},
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
        variations: [
            { key: 'plains2', weight: 5 },
            { key: 'plains_puddle', weight: 1 },
        ]
    },
    water: {
        minDistanceFromCenter: 5,
        color: '#0ea5e9',
        baseWeight: 30,
        walkable: false,
        adjacency: {
            water: 60,
            plains: 20,
            dirt:25,
        },
        frameTime: 220,
        variations: [
            { key: 'water_lily', weight: 2 },
        ]
    },
    mountain: {
        minDistanceFromCenter: 3,
        color: '#475569',
        baseWeight: 40,
        walkable: true,
        adjacency: {
            mountain: 30,
        },
        moveCost: 5,
    },
    dirt: {
        minDistanceFromCenter: 6,
        color: '#a0522d',
        baseWeight: 25,
        walkable: true,
        adjacency: {
            forest: 5,
            plains: 5,
            dirt: 60,
            water:20
        },
        variations: [
            { key: 'dirt2', weight: 20 },
            { key: 'dirt_rock', weight: 2 },
        ]
    },
    snow: {
        minDistanceFromCenter: 18,
        color: '#a0522d',
        baseWeight: 10,
        walkable: true,
        adjacency: {
            plains: 5,
            mountains: 5,
            snow: 100,
        },
        variations: [
            { key: 'snow_rock', weight: 2 },
        ]
    },
    dessert: {
        minDistanceFromCenter: 25,
        color: '#a0522d',
        baseWeight: 20,
        walkable: true,
        adjacency: {
            plains: 5,
            dessert: 50,
        },
        variations: [
            { key: 'dessert_rock', weight: 10 },
            { key: 'dessert_rock2', weight: 10 },
            { key: 'cactus', weight: 10 },
            { key: 'dessert2', weight: 10 },
        ]
    }
};

export type TerrainKey = keyof TerrainDefsMap;
