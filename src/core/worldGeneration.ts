import type { BiomeKey } from './biomes';
import type { TerrainKey } from './terrainDefs';
import { getClimateProfile, getDecorativePatchNoise } from './worldVariation';
import { axialDistanceCoords, axialDistanceFromOrigin } from '../shared/game/hex';

export interface GeneratedWorldTile {
    biome: BiomeKey;
    terrain: TerrainKey;
}

const RARE_TERRAIN_CHECK_OFFSETS: Array<[number, number]> = [];
const STARTER_GROVE_DIRECTIONS: Array<[number, number]> = [
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
];

for (let dq = -2; dq <= 2; dq++) {
    for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
        if (dq === 0 && dr === 0) continue;
        RARE_TERRAIN_CHECK_OFFSETS.push([dq, dr]);
    }
}

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function getStarterGroveCenters(origin: {q:number, r:number} = {q:0, r:0}): Array<[number, number]> {
    const primaryIndex = Math.floor(getClimateProfile(origin.q, origin.r).weirdness * STARTER_GROVE_DIRECTIONS.length) % STARTER_GROVE_DIRECTIONS.length;
    const secondaryIndex = (primaryIndex + 1 + Math.floor(getClimateProfile(origin.q, origin.r).temperature * 2)) % STARTER_GROVE_DIRECTIONS.length;
    const primaryDirection = STARTER_GROVE_DIRECTIONS[primaryIndex] ?? STARTER_GROVE_DIRECTIONS[0]!;
    const secondaryDirection = STARTER_GROVE_DIRECTIONS[secondaryIndex] ?? STARTER_GROVE_DIRECTIONS[1]!;

    return [
        [origin.q + primaryDirection[0] * 3, origin.r + primaryDirection[1] * 3],
        [origin.q + primaryDirection[0] * 4, origin.r + primaryDirection[1] * 4],
        [origin.q + secondaryDirection[0] * 3, origin.r + secondaryDirection[1] * 3],
    ];
}

function isStarterForestTile(q: number, r: number, origin: {q:number, r:number} = {q:0, r:0}) {
    const distance = axialDistanceCoords(q, r, origin.q, origin.r);
    if (distance < 2 || distance > 4) {
        return false;
    }

    for (const [centerQ, centerR] of getStarterGroveCenters(origin)) {
        if (axialDistanceCoords(q, r, centerQ, centerR) <= 1) {
            return true;
        }
    }

    return false;
}

function getStarterPondTiles(origin: {q:number, r:number} = {q:0, r:0}): Array<[number, number]> {
    const originClimate = getClimateProfile(origin.q, origin.r);
    const groveIndex = Math.floor(originClimate.weirdness * STARTER_GROVE_DIRECTIONS.length) % STARTER_GROVE_DIRECTIONS.length;
    const pondIndex = (groveIndex + 2 + Math.floor(originClimate.basin * 2)) % STARTER_GROVE_DIRECTIONS.length;
    const outward = STARTER_GROVE_DIRECTIONS[pondIndex] ?? STARTER_GROVE_DIRECTIONS[0]!;
    const clockwise = STARTER_GROVE_DIRECTIONS[(pondIndex + 2) % STARTER_GROVE_DIRECTIONS.length] ?? STARTER_GROVE_DIRECTIONS[2]!;
    const counterClockwise = STARTER_GROVE_DIRECTIONS[(pondIndex + 4) % STARTER_GROVE_DIRECTIONS.length] ?? STARTER_GROVE_DIRECTIONS[4]!;
    const centerQ = origin.q + outward[0] * 6;
    const centerR = origin.r + outward[1] * 6;

    return [
        [origin.q + outward[0] * 5, origin.r + outward[1] * 5],
        [centerQ, centerR],
        [centerQ + clockwise[0], centerR + clockwise[1]],
        [centerQ + counterClockwise[0], centerR + counterClockwise[1]],
    ];
}

function isStarterPondTile(q: number, r: number, origin: {q:number, r:number} = {q:0, r:0}) {
    for (const [pondQ, pondR] of getStarterPondTiles(origin)) {
        if (q === pondQ && r === pondR) {
            return true;
        }
    }

    return false;
}

function isStarterPondShoreTile(q: number, r: number, origin: {q:number, r:number} = {q:0, r:0}) {
    if (isStarterPondTile(q, r, origin)) {
        return false;
    }

    for (const [pondQ, pondR] of getStarterPondTiles(origin)) {
        if (axialDistanceCoords(q, r, pondQ, pondR) <= 1) {
            return true;
        }
    }

    return false;
}

function getSeaWaterScore(q: number, r: number) {
    const climate = getClimateProfile(q, r);
    const distance = axialDistanceFromOrigin(q, r);
    return ((1 - climate.continentalness) * 0.6)
        + (climate.basin * 0.56)
        + ((1 - climate.erosion) * 0.08)
        - (climate.uplands * 0.26)
        - (distance < 4 ? 0.78 : 0);
}

function getPondCenterScore(q: number, r: number) {
    const distance = axialDistanceFromOrigin(q, r);
    if (distance < 5 || distance > 18) {
        return -1;
    }

    const climate = getClimateProfile(q, r);
    if (climate.uplands > 0.46 || climate.peaks > 0.54 || climate.temperature < 0.3 || climate.temperature > 0.78) {
        return -1;
    }

    const openGround = 1 - climate.canopy;
    const flatness = 1 - climate.ruggedness;
    const plainsMoisture = clamp01(1 - (Math.abs(climate.moisture - 0.5) / 0.24));
    const plainsContinentalness = clamp01(1 - (Math.abs(climate.continentalness - 0.48) / 0.22));
    const shorelineBias = clamp01(1 - (Math.abs(getSeaWaterScore(q, r) - 0.48) / 0.2));
    const patch = getDecorativePatchNoise(q, r, 41);

    return (patch * 0.48)
        + (climate.basin * 0.2)
        + (plainsMoisture * 0.12)
        + (plainsContinentalness * 0.08)
        + (flatness * 0.06)
        + (openGround * 0.06)
        + (shorelineBias * 0.08);
}

function isPondCenter(q: number, r: number) {
    const score = getPondCenterScore(q, r);
    if (score < 0.74) {
        return false;
    }

    for (const [dq, dr] of RARE_TERRAIN_CHECK_OFFSETS) {
        if (getPondCenterScore(q + dq, r + dr) > score) {
            return false;
        }
    }

    return true;
}

function isProceduralPondTile(q: number, r: number) {
    const climate = getClimateProfile(q, r);
    const seaWaterScore = getSeaWaterScore(q, r);
    if (seaWaterScore > 0.57 || climate.uplands > 0.48 || climate.peaks > 0.54) {
        return false;
    }

    for (let dq = -2; dq <= 2; dq++) {
        for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
            const centerQ = q + dq;
            const centerR = r + dr;
            if (!isPondCenter(centerQ, centerR)) {
                continue;
            }

            const distanceFromCenter = axialDistanceCoords(q, r, centerQ, centerR);
            const edgeNoise = getDecorativePatchNoise(q, r, 53);
            if (distanceFromCenter === 0) {
                return true;
            }
            if (distanceFromCenter === 1 && edgeNoise > 0.32) {
                return true;
            }
            if (distanceFromCenter === 2 && edgeNoise > 0.83 && climate.basin > 0.48 && climate.canopy < 0.48) {
                return true;
            }
        }
    }

    return false;
}

function getAlpineScore(q: number, r: number) {
    const climate = getClimateProfile(q, r);
    return (climate.peaks * 0.56)
        + ((1 - climate.erosion) * 0.26)
        + (climate.continentalness * 0.18);
}

function getAridScore(q: number, r: number) {
    const climate = getClimateProfile(q, r);
    return (climate.temperature * 0.58)
        + ((1 - climate.moisture) * 0.62)
        + (climate.weirdness * 0.12)
        - (climate.basin * 0.08);
}

function getForestScore(q: number, r: number) {
    const climate = getClimateProfile(q, r);
    return (climate.moisture * 0.5)
        + (climate.canopy * 0.55)
        + (climate.fertility * 0.2)
        - (climate.ruggedness * 0.1);
}

function getDirtScore(q: number, r: number) {
    const climate = getClimateProfile(q, r);
    return ((1 - climate.moisture) * 0.36)
        + ((1 - climate.fertility) * 0.24)
        + (climate.ruggedness * 0.18)
        + (climate.weirdness * 0.1);
}

export function resolveBiomeFamily(q: number, r: number, origin: { q: number, r: number} = { q: 0, r: 0 }): BiomeKey {
    const climate = getClimateProfile(q, r);
    const distance = axialDistanceCoords(q, r, origin.q, origin.r);
    if (isStarterPondTile(q, r) || isProceduralPondTile(q, r)) {
        return 'lake';
    }

    const seaWaterScore = getSeaWaterScore(q, r);
    if (distance >= 7 && seaWaterScore > 0.54) {
        return 'lake';
    }

    const alpineScore = getAlpineScore(q, r);
    if (distance >= 12 && climate.temperature < 0.34 && alpineScore > 0.61) {
        return 'snow';
    }
    if (distance >= 6 && alpineScore > 0.68) {
        return 'mountain';
    }

    const aridScore = getAridScore(q, r);
    if (distance >= 12 && aridScore > 0.63) {
        return 'dessert';
    }

    const forestScore = getForestScore(q, r);
    if (forestScore > 0.47 && climate.moisture > 0.42) {
        return 'forest';
    }

    const dirtScore = getDirtScore(q, r);
    if (dirtScore > 0.54 && climate.moisture < 0.48) {
        return 'dirt';
    }

    return 'plains';
}

function shouldSpawnVolcano(q: number, r: number) {
    const distance = axialDistanceFromOrigin(q, r);
    if (distance < 9) return false;

    const climate = getClimateProfile(q, r);
    const score = (climate.weirdness * 0.54)
        + (climate.peaks * 0.28)
        + (climate.temperature * 0.18)
        - (climate.moisture * 0.16);

    if (score < 0.56 || climate.temperature < 0.36 || climate.moisture > 0.6) {
        return false;
    }

    for (const [dq, dr] of RARE_TERRAIN_CHECK_OFFSETS) {
        const neighbor = getClimateProfile(q + dq, r + dr);
        const neighborScore = (neighbor.weirdness * 0.54)
            + (neighbor.peaks * 0.28)
            + (neighbor.temperature * 0.18)
            - (neighbor.moisture * 0.16);
        if (neighborScore >= score) {
            return false;
        }
    }

    return true;
}

function resolveTerrainForBiome(q: number, r: number, biome: BiomeKey, origin: {q:number, r:number} = {q:0, r: 0}): TerrainKey {
    const climate = getClimateProfile(q, r);
    const distance = axialDistanceCoords(q, r, origin.q, origin.r);

    if ((biome === 'mountain' || biome === 'dessert') && shouldSpawnVolcano(q, r)) {
        return 'vulcano';
    }

    switch (biome) {
        case 'lake':
            return 'water';

        case 'snow':
            return 'snow';

        case 'mountain':
            if (distance >= 14 && climate.temperature < 0.32 && climate.peaks > 0.66) {
                return 'snow';
            }
            return 'mountain';

        case 'dessert':
            if (climate.moisture < 0.36 || climate.temperature > 0.56) {
                return 'dessert';
            }
            return 'dirt';

        case 'forest':
            if (climate.canopy > 0.34 || climate.moisture > 0.56) {
                return 'forest';
            }
            return 'plains';

        case 'dirt':
            if (
                distance >= 5
                && climate.fertility > 0.52
                && climate.erosion > 0.48
                && climate.moisture > 0.34
                && climate.moisture < 0.58
            ) {
                return 'grain';
            }
            return climate.moisture > 0.46 ? 'plains' : 'dirt';

        case 'plains':
        default:
            if (
                distance >= 5
                && climate.fertility > 0.5
                && climate.moisture > 0.36
                && climate.moisture < 0.62
                && climate.erosion > 0.44
                && climate.canopy < 0.42
            ) {
                return 'grain';
            }
            if (climate.canopy > 0.36 && climate.moisture > 0.48) {
                return 'forest';
            }
            if (climate.moisture < 0.36 && climate.ruggedness > 0.46) {
                return 'dirt';
            }
            return 'plains';
    }
}

function enforceSpawnSafety(tile: GeneratedWorldTile, q: number, r: number, origin: {q:number, r:number} = {q:0, r: 0}): GeneratedWorldTile {
    const distance = axialDistanceCoords(q, r, origin.q, origin.r);
    if (distance <= 2) {
        const climate = getClimateProfile(q, r);
        if (climate.canopy > 0.56) {
            return { biome: 'forest', terrain: 'forest' };
        }
        if (climate.moisture < 0.38) {
            return { biome: 'dirt', terrain: 'dirt' };
        }
        return { biome: 'plains', terrain: 'plains' };
    }

    if (isStarterForestTile(q, r, origin)) {
        return { biome: 'forest', terrain: 'forest' };
    }

    if (isStarterPondTile(q, r, origin)) {
        return { biome: 'lake', terrain: 'water' };
    }

    if (distance <= 8 && isStarterPondShoreTile(q, r, origin)) {
        return { biome: 'plains', terrain: 'plains' };
    }

    if (distance <= 4 && (tile.terrain === 'water' || tile.terrain === 'mountain' || tile.terrain === 'vulcano')) {
        return { biome: 'plains', terrain: 'plains' };
    }

    if (distance <= 6 && (tile.terrain === 'snow' || tile.terrain === 'dessert')) {
        return { biome: 'dirt', terrain: 'dirt' };
    }

    return tile;
}

// Simplified Minecraft-inspired generation:
// broad climate fields first, then a terrain choice inside that biome family.
export function resolveWorldTile(q: number, r: number, origin: { q: number, r: number} = { q: 0, r: 0}): GeneratedWorldTile {
    const biome = resolveBiomeFamily(q, r, origin);
    const terrain = resolveTerrainForBiome(q, r, biome, origin);
    return enforceSpawnSafety({ biome, terrain }, q, r, origin);
}
