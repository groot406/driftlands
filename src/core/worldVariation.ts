import type { TerrainKey } from './terrainDefs';
import { axialDistanceFromOrigin } from '../shared/game/hex';

export interface ClimateProfile {
    moisture: number;
    temperature: number;
    ruggedness: number;
    fertility: number;
    basin: number;
    canopy: number;
    uplands: number;
}

const climateCache = new Map<string, ClimateProfile>();

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function hash32(q: number, r: number): number {
    let x = (q * 374761393) ^ (r * 668265263);
    x = (x ^ (x >>> 13)) * 1274126177;
    x = (x ^ (x >>> 16));
    return x >>> 0;
}

export function noise01(q: number, r: number, salt = 0): number {
    return hash32(q + salt * 17, r - salt * 31) / 0xffffffff;
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function valueNoise(q: number, r: number, scale: number, salt: number): number {
    const x = q / scale;
    const y = r / scale;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);

    const n00 = noise01(x0, y0, salt);
    const n10 = noise01(x0 + 1, y0, salt);
    const n01v = noise01(x0, y0 + 1, salt);
    const n11 = noise01(x0 + 1, y0 + 1, salt);

    const nx0 = lerp(n00, n10, tx);
    const nx1 = lerp(n01v, n11, tx);
    return lerp(nx0, nx1, ty);
}

function layeredNoise(q: number, r: number, salt: number, scales: number[], weights: number[]): number {
    let total = 0;
    let weightSum = 0;

    for (let i = 0; i < scales.length; i++) {
        const scale = scales[i] ?? 1;
        const weight = weights[i] ?? 1;
        total += valueNoise(q, r, scale, salt + i * 19) * weight;
        weightSum += weight;
    }

    if (weightSum <= 0) return 0.5;
    return total / weightSum;
}

function ridgedNoise(q: number, r: number, salt: number, scales: number[], weights: number[]): number {
    const base = layeredNoise(q, r, salt, scales, weights);
    return 1 - Math.abs((base * 2) - 1);
}

function axialDistanceFromCenter(q: number, r: number): number {
    return axialDistanceFromOrigin(q, r);
}

export function getClimateProfile(q: number, r: number): ClimateProfile {
    const cacheKey = `${q},${r}`;
    const cached = climateCache.get(cacheKey);
    if (cached) return cached;

    const dist = axialDistanceFromCenter(q, r);
    const distNorm = clamp01(dist / 28);

    const moistureBase = layeredNoise(q + 9, r - 6, 101, [9, 17, 30], [0.5, 0.35, 0.15]);
    const heatBase = layeredNoise(q - 12, r + 4, 211, [11, 21, 38], [0.5, 0.3, 0.2]);
    const ruggedBase = layeredNoise(q + 3, r + 17, 307, [8, 16, 28], [0.55, 0.3, 0.15]);
    const basinBase = layeredNoise(q - 17, r + 23, 401, [16, 30, 52], [0.55, 0.3, 0.15]);
    const canopyBase = layeredNoise(q + 21, r - 15, 509, [14, 27, 46], [0.5, 0.35, 0.15]);
    const uplandBase = ridgedNoise(q - 8, r + 11, 613, [12, 22, 38], [0.55, 0.3, 0.15]);

    const temperature = clamp01(0.78 - (distNorm * 0.48) + ((heatBase - 0.5) * 0.4));
    const moisture = clamp01((moistureBase * 0.82) + ((1 - distNorm) * 0.12) - Math.max(0, ruggedBase - 0.72) * 0.1);
    const ruggedness = clamp01((ruggedBase * 0.86) + (distNorm * 0.08));
    const fertility = clamp01(
        (moisture * 0.6)
        + ((1 - ruggedness) * 0.25)
        + (Math.max(0, 0.7 - Math.abs(temperature - 0.58)) * 0.2)
        - (distNorm * 0.08)
    );
    const basin = clamp01((moisture * 0.45) + (basinBase * 0.55) + ((1 - ruggedness) * 0.12));
    const canopy = clamp01((moisture * 0.22) + (fertility * 0.22) + (canopyBase * 0.56) - (ruggedness * 0.12));
    const uplands = clamp01((ruggedness * 0.42) + (uplandBase * 0.62) + (distNorm * 0.08));

    const profile = { moisture, temperature, ruggedness, fertility, basin, canopy, uplands };
    climateCache.set(cacheKey, profile);
    return profile;
}

export function getDecorativePatchNoise(q: number, r: number, salt = 0): number {
    return layeredNoise(
        q + (salt * 7),
        r - (salt * 11),
        907 + (salt * 13),
        [4.5, 9, 16],
        [0.55, 0.3, 0.15],
    );
}

function applyBias(weights: Partial<Record<TerrainKey, number>>, terrain: TerrainKey, delta: number) {
    weights[terrain] = Math.max(0, (weights[terrain] ?? 0) + delta);
}

export function applyRegionalTerrainBias(
    weights: Partial<Record<TerrainKey, number>>,
    q: number,
    r: number,
): Partial<Record<TerrainKey, number>> {
    const climate = getClimateProfile(q, r);
    const dist = axialDistanceFromCenter(q, r);
    const cold = clamp01((0.42 - climate.temperature) / 0.42);
    const warm = clamp01((climate.temperature - 0.58) / 0.42);
    const wet = clamp01((climate.moisture - 0.52) / 0.48);
    const dry = clamp01((0.46 - climate.moisture) / 0.46);
    const rugged = clamp01((climate.ruggedness - 0.46) / 0.54);
    const flat = 1 - climate.ruggedness;
    const frontierVolcanoBand = clamp01(1 - (Math.abs(dist - 7) / 5.5));

    applyBias(weights, 'plains', (climate.fertility * 14) + (flat * 5) + ((1 - climate.canopy) * 2) - (climate.uplands * 8) - (climate.basin * 4));
    applyBias(weights, 'forest', (wet * 14) + (climate.canopy * 18) + (climate.fertility * 5) - (warm * 3) - (dry * 3));
    applyBias(weights, 'water', (wet * 14) + (climate.basin * 18) + ((1 - rugged) * 3) - (dry * 8) - (climate.uplands * 4));
    applyBias(weights, 'dirt', (dry * 8) + (climate.uplands * 4) + ((1 - climate.fertility) * 6) - (climate.basin * 4));
    applyBias(weights, 'grain', (climate.fertility * 16) + (flat * 5) + (climate.canopy * 2) - (cold * 4) - (climate.uplands * 6));
    applyBias(weights, 'mountain', (rugged * 14) + (climate.uplands * 22) + (dry * 2) - (wet * 4));
    applyBias(weights, 'snow', (cold * 26) + (climate.uplands * 6) - (warm * 14));
    applyBias(weights, 'dessert', (warm * 12) + (dry * 14) + ((1 - climate.canopy) * 4) - (wet * 12));
    applyBias(weights, 'vulcano', (climate.uplands * 8) + (rugged * 8) + (warm * 4) - (wet * 4) + (frontierVolcanoBand * 6));

    return weights;
}
