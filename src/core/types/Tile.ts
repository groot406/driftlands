import type {TerrainKey} from '../terrainDefs';
export interface TileNeighborMap { a: Tile; b: Tile; c: Tile; d: Tile; e: Tile; f: Tile; }
export type Terrain = TerrainKey;

export const SIDE_NAMES = ['a','b','c','d','e','f'] as const;
export type TileSide = typeof SIDE_NAMES[number];
export const OPPOSITE_SIDE: Record<TileSide, TileSide> = { a: 'd', b: 'e', c: 'f', d: 'a', e: 'b', f: 'c' };

export interface Tile {
    id: string;
    q: number;
    r: number;
    pixel?: { x: number; y: number };
    biome: string | null;
    terrain: Terrain | null;
    discovered: boolean;
    // Functional terrain state such as crops, docks, rocks, or mines. Purely decorative art is resolved separately.
    isBaseTile: boolean; // whether tile is a base tile (or decorative variant) for terrain generation and task logic
    variant?: string | null;
    // Timestamp when current variant was set (for growth progression)
    variantSetMs?: number;
    // Effective duration for the current growth stage, chosen once when the variant is applied.
    variantAgeMs?: number;
    // Cached direct neighbor tiles mapped by side (a-f clockwise). Populated lazily.
    neighbors?: TileNeighborMap;
    // Optional per-edge fencing: when true for a side, movement cannot cross that edge.
    fencedEdges?: Partial<Record<TileSide, boolean>>;
}
