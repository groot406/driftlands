// Centralized terrain definitions with full properties.
// If you add new terrain types, update TerrainKey and definitions here.

export interface TerrainDef {
    color: string;
    baseWeight: number;
    adjacency: Record<string, number>; // neighbor terrain -> weight delta
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
    },
    water: {
        color: '#0ea5e9',
        baseWeight: 30,
        walkable: false,
        adjacency: {
            water: 60,
            plains: 20,
        },
    },
    mountain: {
        color: '#475569',
        baseWeight: 40,
        walkable: true,
        adjacency: {
            mountain: 30,
            mine: 20,
            ruin: -5,
        },
    },
    mine: {
        color: '#525252',
        baseWeight: 5,
        walkable: true,
        adjacency: {
            mountain: 10,
            mine: -100, // discourage clustering
        },
    },
    ruin: {
        color: '#7f1d1d',
        baseWeight: 1,
        walkable: true,
        adjacency: {
            forest: 20,
            ruin: -100, // discourage clustering
        },
    },
    towncenter: {
        color: '#eab308',
        walkable: true,
        baseWeight: 0, // never randomly generated
        adjacency: {},
    },
};

export type TerrainKey = keyof TerrainDefsMap;
