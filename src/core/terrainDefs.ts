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
    variations?: TerrainVariationDef[];
    variationBaseWeight?: number;
    assetKey?: string;
    // optional second render layer (unmasked) drawn with vertical stacking among heroes/other overlays
    overlayAssetKey?: string; // image key (filename without extension) for overlay (e.g. 'cactus_top')
    overlayOffset?: { x: number; y: number }; // optional pixel offset applied to overlay drawing (top-left origin)
    heroOffset?: { x: number; y: number }; // optional pixel offset applied to hero drawing on this terrain
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
    assetKey?: string; // optional override for image filename base if different from key
    growth?: { next: string | null; ageMs?: number, ageMsRange?: number[] }; // biome scaling moved to biomes

    overlayAssetKey?: string|false; // optional overlay image key for this specific variant (overrides base terrain overlayAssetKey if present)
    overlayOffset?: { x: number; y: number }; // variant-specific overlay offset overrides base terrain overlayOffset
    heroOffset?: { x: number; y: number }; // optional pixel offset applied to hero drawing on this terrain
}

interface TerrainDefsMap {
    towncenter: TerrainDef;
    plains: TerrainDef;
    forest: TerrainDef;
    water: TerrainDef;
    mountain: TerrainDef;
    dirt: TerrainDef;
    snow: TerrainDef;
    dessert: TerrainDef;
    vulcano: TerrainDef;
    grain: TerrainDef;
}

export const TERRAIN_DEFS: TerrainDefsMap = {
    towncenter: {
        color: '#eab308',
        walkable: true,
        baseWeight: 0,
        adjacency: {},
        preserveIsolation: true,
        moveCost: 3,
        overlayAssetKey: 'towncenter_overlay',
        overlayOffset: { x: 0, y: -11},
        heroOffset: { x: 0, y: 10}
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
            {key: 'chopped_forest', weight: 5, overlayAssetKey: false},
            {key: 'young_forest', weight: 2, growth: {next: null, ageMsRange: [600000, 6000000]}, overlayAssetKey: false},
        ],
        overlayAssetKey: 'forest_overlay',
        overlayOffset: { x: 0, y: -4}
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
            {key: 'plains2', weight: 5},
            {key: 'plains_rock', weight: 5},
            // { key: 'road_ad', weight: 4 },
            // { key: 'road_be', weight: 4 },
            // { key: 'road_cf', weight: 4 },
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
            dirt: 25,
        },
        frameTime: 220,
        variations: [
            {key: 'water_lily', weight: 2},
            {key: 'water_dock_a', weight: 0},
            {key: 'water_dock_b', weight: 0},
            {key: 'water_dock_c', weight: 0},
            {key: 'water_dock_d', weight: 0},
            {key: 'water_dock_e', weight: 0},
            {key: 'water_dock_f', weight: 0},
        ]
    },
    mountain: {
        minDistanceFromCenter: 3,
        color: '#475569',
        baseWeight: 15,
        walkable: true,
        adjacency: {
            mountain: 25,
        },
        moveCost: 50,
        assetKey: 'mountains',
        overlayAssetKey: 'mountains_overhang',
        overlayOffset: { x: 0, y: -4 },
        heroOffset: { x: 0, y: 10 },
        variations: [
            {key: 'mountains_with_mine', weight: 0, heroOffset: { x:0, y: 15 }},
        ]
    },
    vulcano: {
        minDistanceFromCenter: 7,
        color: '#475569',
        baseWeight: 7,
        walkable: true,
        preserveIsolation: true,
        adjacency: {
            mountain: 25,
        },
        overlayAssetKey: 'vulcano_overhang',
        overlayOffset: { x: 0, y: -18 },
        moveCost: 50,
        assetKey: 'vulcano',
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
            water: 20
        },
        variations: [
            {key: 'dirt_rocks', weight: 40},
            {key: 'dirt_big_rock', weight: 5},
            {key: 'dirt_tilled_draught', weight: 0},
            {key: 'dirt_tilled_hydrated', weight: 0},
            {key: 'dirt_tilled', weight: 0, growth: {next: 'dirt_tilled_draught', ageMs: 600000}},
        ]
    },
    grain: {
        minDistanceFromCenter: 6,
        color: '#fbbf24',
        baseWeight: 20,
        walkable: true,
        adjacency: {
            plains: 5,
            dirt: 3,
            grain: 50,
        },
        overlayAssetKey: 'grain_overhang',
        overlayOffset: { x: 0, y: 6 },
    },
    snow: {
        minDistanceFromCenter: 15,
        color: '#a0522d',
        baseWeight: 10,
        walkable: true,
        adjacency: {
            plains: 5,
            mountains: 5,
            snow: 100,
        },
        variations: [
            {key: 'snow_rock', weight: 2},
        ]
    },
    dessert: {
        minDistanceFromCenter: 12,
        color: '#a0522d',
        baseWeight: 20,
        walkable: true,
        adjacency: {
            plains: 5,
            dessert: 50,
        },
        variations: [
            {key: 'dessert_rock', weight: 10},
            {key: 'dessert_rock2', weight: 10},
            {key: 'cactus', weight: 10},
            {key: 'dessert2', weight: 10},
        ]
    }
};

export type TerrainKey = keyof TerrainDefsMap;
