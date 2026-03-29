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
    maxTemperature?: number;
    minRuggedness?: number;
    maxRuggedness?: number;
    assetKey?: string; // optional override for image filename base if different from key
    growth?: { next: string | null; ageMs?: number, ageMsRange?: number[] }; // biome scaling moved to biomes

    overlayAssetKey?: string|false; // optional overlay image key for this specific variant (overrides base terrain overlayAssetKey if present)
    overlayOffset?: { x: number; y: number }; // variant-specific overlay offset overrides base terrain overlayOffset
    heroOffset?: { x: number; y: number }; // optional pixel offset applied to hero drawing on this terrain
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
            {key: 'young_forest', weight: 2, growth: {next: null, ageMsRange: [600000, 6000000]}, overlayAssetKey: false},
            {key: 'forest_lumber_camp', weight: 0, assetKey: 'forest', overlayAssetKey: false, heroOffset: { x: 0, y: 6 }},
        ],
        decorativeBaseWeight: 34,
        decorativeVariants: [
            { key: 'forest_ferns', weight: 8, minMoisture: 0.52, maxTemperature: 0.78 },
            { key: 'forest_moss', weight: 7, minMoisture: 0.58, maxRuggedness: 0.58 },
            { key: 'forest_mushrooms', weight: 5, minMoisture: 0.62, maxTemperature: 0.72, maxRuggedness: 0.48 },
            { key: 'forest_pines', weight: 6, maxTemperature: 0.5, minRuggedness: 0.42 },
            { key: 'forest_bog', weight: 4, minMoisture: 0.68, maxTemperature: 0.66, maxRuggedness: 0.44, overlayAssetKey: false },
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
            { key: 'road', weight: 0, moveCost: 0.35 },
            { key: 'road_ad', weight: 0, moveCost: 0.35 },
            { key: 'road_be', weight: 0, moveCost: 0.35 },
            { key: 'road_ce', weight: 0, moveCost: 0.35 },
            { key: 'road_cf', weight: 0, moveCost: 0.35 },
            { key: 'plains_well', weight: 0, assetKey: 'plains' },
            { key: 'plains_watchtower', weight: 0, assetKey: 'plains' },
            { key: 'plains_depot', weight: 0, assetKey: 'plains' },
        ],
        decorativeBaseWeight: 52,
        decorativeVariants: [
            { key: 'plains2', weight: 8, minMoisture: 0.3, maxMoisture: 0.7 },
            { key: 'plains_rock', weight: 6, minRuggedness: 0.38 },
            { key: 'plains_puddle', weight: 4, minMoisture: 0.72, maxTemperature: 0.7 },
            { key: 'plains_wildflowers', weight: 7, minMoisture: 0.48, minTemperature: 0.38, maxRuggedness: 0.48 },
            { key: 'plains_drygrass', weight: 6, maxMoisture: 0.42, minTemperature: 0.54 },
            { key: 'plains_meadow', weight: 10, minMoisture: 0.38, maxRuggedness: 0.56 },
            { key: 'plains_clover', weight: 6, minMoisture: 0.52, maxRuggedness: 0.38 },
            { key: 'plains_stones', weight: 5, minRuggedness: 0.52 },
            { key: 'plains_orchard', weight: 4, minMoisture: 0.42, minTemperature: 0.34, maxRuggedness: 0.38 },
            { key: 'plains_creek', weight: 3, minMoisture: 0.64, maxTemperature: 0.76, maxRuggedness: 0.34 },
        ]
    },
    water: {
        minDistanceFromCenter: 5,
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
        variations: [
            {key: 'water_lily', weight: 2},
            {key: 'water_dock_a', weight: 0, walkable: true, fencedEdges: { b: true, c: true, d: true, e: true, f: true }},
            {key: 'water_dock_b', weight: 0, walkable: true, fencedEdges: { a: true, c: true, d: true, e: true, f: true }},
            {key: 'water_dock_c', weight: 0, walkable: true, fencedEdges: { a: true, b: true, d: true, e: true, f: true }},
            {key: 'water_dock_d', weight: 0, walkable: true, fencedEdges: { a: true, b: true, c: true, e: true, f: true }},
            {key: 'water_dock_e', weight: 0, walkable: true, fencedEdges: { a: true, b: true, c: true, d: true, f: true }},
            {key: 'water_dock_f', weight: 0, walkable: true, fencedEdges: { a: true, b: true, c: true, d: true, e: true }},
        ],
        decorativeBaseWeight: 30,
        decorativeVariants: [
            { key: 'water_reeds', weight: 5, minTemperature: 0.45, minMoisture: 0.58, maxRuggedness: 0.44 },
            { key: 'water_shallows', weight: 6, minTemperature: 0.48, maxRuggedness: 0.52 },
            { key: 'water_reflections', weight: 8, minMoisture: 0.42, maxTemperature: 0.8 },
            { key: 'water_foam', weight: 4, minRuggedness: 0.56, minTemperature: 0.42 },
            { key: 'water_islets', weight: 3, minTemperature: 0.52, maxRuggedness: 0.38 },
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
        assetKey: 'mountains-v2',
        overlayAssetKey: 'mountains_overhang',
        overlayOffset: { x: 0, y: -4 },
        heroOffset: { x: 0, y: 10 },
        variations: [
            {key: 'mountains_with_mine', weight: 0, heroOffset: { x:0, y: 15 }},
            {key: 'mountains_watchtower', weight: 0, assetKey: 'mountains-v2', overlayAssetKey: false, heroOffset: { x:0, y: 15 }},
        ],
        decorativeBaseWeight: 30,
        decorativeVariants: [
            { key: 'mountains_ridge', weight: 8, minRuggedness: 0.54 },
            { key: 'mountains_scree', weight: 7, minRuggedness: 0.62, maxMoisture: 0.6 },
            { key: 'mountains_ashen', weight: 5, maxTemperature: 0.5, minRuggedness: 0.45 },
            { key: 'mountains_lichen', weight: 5, minMoisture: 0.42, maxTemperature: 0.68, minRuggedness: 0.46 },
        ]
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
            {key: 'dirt_well', weight: 0, assetKey: 'dirt'},
            {key: 'dirt_watchtower', weight: 0, assetKey: 'dirt'},
            {key: 'dirt_depot', weight: 0, assetKey: 'dirt'},
        ],
        decorativeBaseWeight: 24,
        decorativeVariants: [
            { key: 'dirt_cracked', weight: 7, maxMoisture: 0.42, minTemperature: 0.44 },
            { key: 'dirt_pebbles', weight: 8, minRuggedness: 0.38 },
            { key: 'dirt_mossy', weight: 5, minMoisture: 0.56, maxRuggedness: 0.52 },
        ]
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
        ],
        overlayAssetKey: 'grain_overhang',
        overlayOffset: { x: 0, y: 6 },
        decorativeBaseWeight: 18,
        decorativeVariants: [
            { key: 'grain_dense', weight: 7, minMoisture: 0.42, maxTemperature: 0.74 },
            { key: 'grain_bloom', weight: 5, minMoisture: 0.5, minTemperature: 0.4, maxRuggedness: 0.46 },
            { key: 'grain_patchwork', weight: 4, minMoisture: 0.46, maxTemperature: 0.74, maxRuggedness: 0.4, overlayAssetKey: false },
        ]
    },
    snow: {
        minDistanceFromCenter: 15,
        color: '#a0522d',
        baseWeight: 10,
        assetKey: 'snow-v2',
        walkable: true,
        adjacency: {
            plains: 5,
            mountain: 10,
            snow: 100,
        },
        decorativeBaseWeight: 32,
        decorativeVariants: [
            { key: 'snow_rock', weight: 5, minRuggedness: 0.3 },
            { key: 'snow_drift', weight: 8, maxTemperature: 0.42, maxRuggedness: 0.52 },
            { key: 'snow_ice', weight: 6, maxTemperature: 0.34, minRuggedness: 0.26 },
            { key: 'snow_pines', weight: 4, maxTemperature: 0.36, minRuggedness: 0.28 },
            { key: 'snow_thicket', weight: 3, maxTemperature: 0.32, minRuggedness: 0.22, maxRuggedness: 0.56 },
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
        decorativeVariants: [
            { key: 'dessert_rock', weight: 8, minRuggedness: 0.34 },
            { key: 'dessert_rock2', weight: 8, minRuggedness: 0.44 },
            { key: 'cactus', weight: 7, minTemperature: 0.58, maxMoisture: 0.42 },
            { key: 'dessert2', weight: 8, minTemperature: 0.5, maxMoisture: 0.48 },
            { key: 'dessert_dunes', weight: 9, minTemperature: 0.56, maxMoisture: 0.44, maxRuggedness: 0.42 },
            { key: 'dessert_shrubs', weight: 6, minTemperature: 0.52, minMoisture: 0.22, maxMoisture: 0.5 },
            { key: 'dessert_stones', weight: 6, minRuggedness: 0.5, maxMoisture: 0.45 },
            { key: 'dessert_windcarved', weight: 7, minTemperature: 0.58, maxMoisture: 0.36, maxRuggedness: 0.38 },
            { key: 'dessert_oasis', weight: 3, minTemperature: 0.56, minMoisture: 0.28, maxRuggedness: 0.34 },
        ]
    }
};

export type TerrainKey = keyof TerrainDefsMap;
