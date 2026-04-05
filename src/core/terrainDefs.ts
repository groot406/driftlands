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
    decorativeVariants?: TerrainVariationDef[];
    decorativeBaseWeight?: number;
    assetKey?: string;
    // optional second render layer (unmasked) drawn with vertical stacking among heroes/other overlays
    overlayAssetKey?: string; // image key (filename without extension) for overlay (e.g. 'cactus_top')
    overlayOffset?: { x: number; y: number }; // optional pixel offset applied to overlay drawing (top-left origin)
    heroOffset?: { x: number; y: number }; // optional pixel offset applied to hero drawing on this terrain
    // --- Road connection (optional) ---
    connectsToRoad?: boolean; // if true, roads will attempt to connect to tiles of this terrain
    // --- Fencing (optional) ---
    fencedEdges?: Partial<Record<TerrainSide, boolean>>; // default fences applied to tiles of this terrain
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
    minMoisture?: number;
    maxMoisture?: number;
    minTemperature?: number;
    decorative?: boolean; // if true, this variation is purely decorative and does not replace base terrain logic
    maxTemperature?: number;
    minRuggedness?: number;
    maxRuggedness?: number;
    assetKey?: string; // optional override for image filename base if different from key
    growth?: { next: string | null; ageMs?: number, ageMsRange?: number[] }; // biome scaling moved to biomes

    overlayAssetKey?: string|false; // optional overlay image key for this specific variant (overrides base terrain overlayAssetKey if present)
    overlayOffset?: { x: number; y: number }; // variant-specific overlay offset overrides base terrain overlayOffset
    heroOffset?: { x: number; y: number }; // optional pixel offset applied to hero drawing on this terrain
    // --- Road connection (optional) ---
    connectsToRoad?: boolean; // if specified, overrides base terrain road connection
    // --- Fencing (optional) ---
    fencedEdges?: Partial<Record<TerrainSide, boolean>>; // default fences applied when this variant is selected
    // --- Movement override (optional) ---
    walkable?: boolean; // if specified, overrides base terrain walkability
    moveCost?: number; // if specified, overrides base terrain move cost
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
        heroOffset: { x: 0, y: 10},
        connectsToRoad: true,
        fencedEdges: { a: true, b: true }
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
            {key: 'young_forest', weight: 2, growth: {next: null, ageMsRange: [600000, 2000000]}, overlayAssetKey: false},
            {key: 'forest_lumber_camp', weight: 0, assetKey: 'forest', overlayAssetKey: false, heroOffset: { x: 0, y: 6 }},
            { key: 'forest_mushrooms', weight: 1, minMoisture: 0.62, maxTemperature: 0.72, maxRuggedness: 0.48, decorative: true },
        ],
        decorativeBaseWeight: 34,
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
        connectsToRoad: false,
        variations: [
            { key: 'road', weight: 0, moveCost: 0.35 },
            { key: 'plains_well', weight: 0, assetKey: 'plains' },
            { key: 'plains_watchtower', weight: 0, assetKey: 'plains', walkable: false, connectsToRoad: true },
            { key: 'plains_depot', weight: 0, assetKey: 'plains', connectsToRoad: true },
            { key: 'plains_bakery', weight: 0, assetKey: 'plains', connectsToRoad: true },
            { key: 'plains_house', weight: 0, assetKey: 'house', walkable: false, connectsToRoad: true },
            { key: 'plains2', weight: 4, minMoisture: 0.3, maxMoisture: 0.7, decorative: true },
            { key: 'plains_wildflowers', weight: 12, minMoisture: 0.48, minTemperature: 0.38, maxRuggedness: 0.48, decorative: true },
            { key: 'plains_drygrass', weight: 6, maxMoisture: 0.42, minTemperature: 0.54, decorative: true },
            { key: 'plains_meadow', weight: 10, minMoisture: 0.38, maxRuggedness: 0.56, decorative: true },
            { key: 'plains_clover', weight: 16, minMoisture: 0.52, maxRuggedness: 0.38, decorative: true },
            { key: 'plains_rock', weight: 8, minRuggedness: 0.52, decorative: true },
        ],
        decorativeBaseWeight: 52,
    },
    water: {
        minDistanceFromCenter: 2,
        color: '#0ea5e9',
        baseWeight: 30,
        assetKey: 'water-v2',
        walkable: false,
        adjacency: {
            water: 60,
            plains: 20,
            dirt: 25,
        },
        frameTime: 220,
        connectsToRoad: false,
        variations: [
            {key: 'water_lily', weight: 2, decorative: true, walkable: true},
            {key: 'water_dock_a', weight: 0, walkable: true, connectsToRoad: true, fencedEdges: { b: true, c: true, d: true, e: true, f: true }},
            {key: 'water_dock_b', weight: 0, walkable: true, connectsToRoad: true, fencedEdges: { a: true, c: true, d: true, e: true, f: true }},
            {key: 'water_dock_c', weight: 0, walkable: true, connectsToRoad: true, fencedEdges: { a: true, b: true, d: true, e: true, f: true }},
            {key: 'water_dock_d', weight: 0, walkable: true, connectsToRoad: true, fencedEdges: { a: true, b: true, c: true, e: true, f: true }},
            {key: 'water_dock_e', weight: 0, walkable: true, connectsToRoad: true, fencedEdges: { a: true, b: true, c: true, d: true, f: true }},
            {key: 'water_dock_f', weight: 0, walkable: true, connectsToRoad: true, fencedEdges: { a: true, b: true, c: true, d: true, e: true }},
            {key: 'water_bridge_ad', weight: 0, walkable: true, moveCost: 0.45, connectsToRoad: true, fencedEdges: { b: true, c: true, e: true, f: true }},
            {key: 'water_bridge_be', weight: 0, walkable: true, moveCost: 0.45, connectsToRoad: true, fencedEdges: { a: true, c: true, d: true, f: true }},
            {key: 'water_bridge_cf', weight: 0, walkable: true, moveCost: 0.45, connectsToRoad: true, fencedEdges: { a: true, b: true, d: true, e: true }},
        ],
        decorativeBaseWeight: 30,
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
        assetKey: 'mountains-v2',
        overlayAssetKey: 'mountains_overhang',
        overlayOffset: { x: 0, y: -4 },
        heroOffset: { x: 0, y: 10 },
        variations: [
            {key: 'mountains_with_mine', weight: 0, heroOffset: { x:0, y: 15 }},
            {key: 'mountains_watchtower', weight: 0, assetKey: 'mountains-v2', overlayAssetKey: false, heroOffset: { x:0, y: 15 }},
            { key: 'mountains_ridge', weight: 8, minRuggedness: 0.54, decorative: true },
            { key: 'mountains_scree', weight: 7, minRuggedness: 0.62, maxMoisture: 0.6, decorative: true },
            { key: 'mountains_ashen', weight: 5, maxTemperature: 0.5, minRuggedness: 0.45, decorative: true },
            { key: 'mountains_lichen', weight: 5, minMoisture: 0.42, maxTemperature: 0.68, minRuggedness: 0.46, decorative: true },
        ],
        decorativeBaseWeight: 30,
    },
    vulcano: {
        minDistanceFromCenter: 4,
        color: '#475569',
        baseWeight: 7,
        walkable: false,
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
        minDistanceFromCenter: 1,
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
            {key: 'dirt_well', weight: 0, assetKey: 'dirt'},
            {key: 'dirt_watchtower', weight: 0, assetKey: 'dirt'},
            {key: 'dirt_depot', weight: 0, assetKey: 'dirt'},
            {key: 'dirt_bakery', weight: 0, assetKey: 'dirt', connectsToRoad: true},
            {key: 'dirt_house', weight: 0, assetKey: 'house', walkable: false},
            { key: 'dirt_cracked', weight: 7, maxMoisture: 0.42, minTemperature: 0.44, decorative: true },
            { key: 'dirt_pebbles', weight: 8, minRuggedness: 0.38, decorative: true },
            { key: 'dirt_mossy', weight: 5, minMoisture: 0.56, maxRuggedness: 0.52, decorative: true },
        ],
        decorativeBaseWeight: 24,
    },
    grain: {
        minDistanceFromCenter: 6,
        color: '#fbbf24',
        baseWeight: 20,
        assetKey: 'grain-v2',
        walkable: true,
        adjacency: {
            plains: 5,
            dirt: 3,
            grain: 50,
        },
        variations: [
            { key: 'grain_granary', weight: 0, assetKey: 'grain-v2', overlayAssetKey: false, heroOffset: { x: 0, y: 8 } },
            { key: 'grain_dense', weight: 7, minMoisture: 0.42, maxTemperature: 0.74, decorative: true },
            { key: 'grain_bloom', weight: 5, minMoisture: 0.5, minTemperature: 0.4, maxRuggedness: 0.46, decorative: true },
            {key: 'grain_planted', weight: 3, growth: {next: 'grain_small', ageMs: 100000}, overlayAssetKey: false},
            {key: 'grain_small', weight: 3, growth: {next: 'grain_small2', ageMs: 100000}, overlayAssetKey: false},
            {key: 'grain_small2', weight: 3, growth: {next: null, ageMs: 100000}, overlayAssetKey: false},
        ],
        overlayAssetKey: 'grain_overhang',
        overlayOffset: { x: 0, y: 6 },
        decorativeBaseWeight: 18,
    },
    snow: {
        minDistanceFromCenter: 15,
        color: '#a0522d',
        baseWeight: 10,
        assetKey: 'snow',
        walkable: true,
        adjacency: {
            plains: 5,
            mountain: 10,
            snow: 100,
        },
        decorativeBaseWeight: 32,
        variations: [
            { key: 'snow_rock', weight: 5, minRuggedness: 0.3, decorative: true },
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
        decorativeBaseWeight: 54,
        variations: [
            { key: 'dessert_rock', weight: 8, minRuggedness: 0.34, decorative: true },
            { key: 'dessert_rock2', weight: 8, minRuggedness: 0.44, decorative: true },
            { key: 'cactus', weight: 7, minTemperature: 0.58, maxMoisture: 0.42, decorative: true },
            { key: 'dessert2', weight: 8, minTemperature: 0.5, maxMoisture: 0.48, decorative: true },
            { key: 'dessert_dunes', weight: 9, minTemperature: 0.56, maxMoisture: 0.44, maxRuggedness: 0.42, decorative: true },
            { key: 'dessert_shrubs', weight: 6, minTemperature: 0.52, minMoisture: 0.22, maxMoisture: 0.5, decorative: true },
            { key: 'dessert_stones', weight: 6, minRuggedness: 0.5, maxMoisture: 0.45, decorative: true },
            { key: 'dessert_windcarved', weight: 7, minTemperature: 0.58, maxMoisture: 0.36, maxRuggedness: 0.38, decorative: true },
            { key: 'dessert_oasis', weight: 3, minTemperature: 0.56, minMoisture: 0.28, maxRuggedness: 0.34, decorative: true },
        ]
    }
};

export type TerrainKey = keyof TerrainDefsMap;
