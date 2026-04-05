import type { TerrainKey } from './terrainDefs';
import { axialDistanceFromOrigin } from '../shared/game/hex';

export interface ClimateProfile {
    moisture: number;
    temperature: number;
    continentalness: number;
    erosion: number;
    weirdness: number;
    ruggedness: number;
    fertility: number;
    basin: number;
    canopy: number;
    uplands: number;
    peaks: number;
}

const climateCache = new Map<string, ClimateProfile>();
let worldGenerationSeed = 123456789;
const SQRT3_OVER_2 = Math.sqrt(3) / 2;
const PERLIN_NORMALIZER = Math.SQRT1_2;
const BIOME_SIZE_SCALE = 0.6;

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function scaledBiomeSize(value: number): number {
    return Math.max(1.6, value * BIOME_SIZE_SCALE);
}

export function hash32(q: number, r: number): number {
    let x = Math.imul(q, 374761393) ^ Math.imul(r, 668265263);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x ^= x >>> 16;
    return x >>> 0;
}

export function noise01(q: number, r: number, salt = 0): number {
    return hash32(q + salt * 17, r - salt * 31) / 0xffffffff;
}

export function setWorldGenerationSeed(seed: number) {
    worldGenerationSeed = seed >>> 0;
    climateCache.clear();
}

export function getWorldGenerationSeed() {
    return worldGenerationSeed;
}

export function worldNoise01(q: number, r: number, salt = 0): number {
    let x = Math.imul(q, 374761393) ^ ((worldGenerationSeed + Math.imul(salt, 1442695041)) | 0);
    let y = Math.imul(r, 668265263) ^ Math.imul(worldGenerationSeed, 2246822519);
    let n = Math.imul(x ^ y, 1274126177);
    n = Math.imul(n ^ (n >>> 16), 2246822519);
    n ^= n >>> 13;
    return (n >>> 0) / 0xffffffff;
}

function fade(t: number): number {
    return t * t * t * (t * ((t * 6) - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function axialToNoiseSpace(q: number, r: number) {
    return {
        x: q + (r * 0.5),
        y: r * SQRT3_OVER_2,
    };
}

function gradientDot(ix: number, iy: number, x: number, y: number, salt: number) {
    const angle = worldNoise01(ix, iy, salt) * Math.PI * 2;
    const gx = Math.cos(angle);
    const gy = Math.sin(angle);
    return ((x - ix) * gx) + ((y - iy) * gy);
}

function perlinSigned(x: number, y: number, scale: number, salt: number): number {
    const scaledX = x / Math.max(scale, 0.0001);
    const scaledY = y / Math.max(scale, 0.0001);
    const x0 = Math.floor(scaledX);
    const y0 = Math.floor(scaledY);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const tx = fade(scaledX - x0);
    const ty = fade(scaledY - y0);

    const n00 = gradientDot(x0, y0, scaledX, scaledY, salt);
    const n10 = gradientDot(x1, y0, scaledX, scaledY, salt);
    const n01 = gradientDot(x0, y1, scaledX, scaledY, salt);
    const n11 = gradientDot(x1, y1, scaledX, scaledY, salt);

    const nx0 = lerp(n00, n10, tx);
    const nx1 = lerp(n01, n11, tx);
    return Math.max(-1, Math.min(1, lerp(nx0, nx1, ty) / PERLIN_NORMALIZER));
}

function perlin01(
    x: number,
    y: number,
    salt: number,
    baseScale: number,
    octaves = 4,
    persistence = 0.55,
    lacunarity = 2,
): number {
    let total = 0;
    let amplitude = 1;
    let amplitudeSum = 0;
    let scale = baseScale;

    for (let octave = 0; octave < octaves; octave++) {
        total += perlinSigned(x, y, scale, salt + (octave * 97)) * amplitude;
        amplitudeSum += amplitude;
        amplitude *= persistence;
        scale = Math.max(1.6, scale / lacunarity);
    }

    if (amplitudeSum <= 0) {
        return 0.5;
    }

    return clamp01(((total / amplitudeSum) * 0.5) + 0.5);
}

function ridgedPerlin01(
    x: number,
    y: number,
    salt: number,
    baseScale: number,
    octaves = 4,
    persistence = 0.55,
    lacunarity = 2,
): number {
    let total = 0;
    let amplitude = 1;
    let amplitudeSum = 0;
    let scale = baseScale;

    for (let octave = 0; octave < octaves; octave++) {
        const signal = 1 - Math.abs(perlinSigned(x, y, scale, salt + (octave * 101)));
        total += signal * amplitude;
        amplitudeSum += amplitude;
        amplitude *= persistence;
        scale = Math.max(1.6, scale / lacunarity);
    }

    if (amplitudeSum <= 0) {
        return 0.5;
    }

    return clamp01(total / amplitudeSum);
}

function axialDistanceFromCenter(q: number, r: number): number {
    return axialDistanceFromOrigin(q, r);
}

export function getClimateProfile(q: number, r: number): ClimateProfile {
    const cacheKey = `${q},${r}`;
    const cached = climateCache.get(cacheKey);
    if (cached) return cached;

    const dist = axialDistanceFromCenter(q, r);
    const distNorm = clamp01(dist / 34);
    const point = axialToNoiseSpace(q, r);
    const warpAmplitude = 14 * BIOME_SIZE_SCALE;
    const warpX = (perlin01(point.x + 47.2, point.y - 31.4, 31, scaledBiomeSize(48), 2, 0.55, 2.1) - 0.5) * warpAmplitude;
    const warpY = (perlin01(point.x - 63.8, point.y + 19.6, 37, scaledBiomeSize(48), 2, 0.55, 2.1) - 0.5) * warpAmplitude;
    const x = point.x + warpX;
    const y = point.y + warpY;

    const continentalBase = perlin01(x - 11.8, y + 17.4, 101, scaledBiomeSize(42), 4, 0.58, 2.02);
    const moistureBase = perlin01(x + 52.7, y - 39.2, 211, scaledBiomeSize(28), 4, 0.55, 2.08);
    const heatBase = perlin01(x - 71.3, y + 48.1, 307, scaledBiomeSize(30), 4, 0.55, 2.05);
    const erosionBase = perlin01(x + 81.5, y + 13.9, 401, scaledBiomeSize(24), 4, 0.52, 2.15);
    const weirdnessBase = perlin01(x - 103.7, y - 27.6, 509, scaledBiomeSize(20), 3, 0.6, 2.18);
    const peaksBase = ridgedPerlin01(x + 37.2, y + 92.4, 613, scaledBiomeSize(18), 4, 0.55, 2.08);
    const basinBase = perlin01(x - 127.4, y + 71.1, 701, scaledBiomeSize(32), 3, 0.58, 2);
    const canopyBase = perlin01(x + 141.6, y - 83.3, 809, scaledBiomeSize(22), 3, 0.52, 2.1);

    const continentalness = clamp01((continentalBase * 0.88) + ((1 - distNorm) * 0.1));
    const temperature = clamp01((heatBase * 0.86) + ((1 - distNorm) * 0.04) - (Math.max(0, continentalness - 0.74) * 0.06));
    const moisture = clamp01((moistureBase * 0.84) + ((1 - continentalness) * 0.08) + ((1 - distNorm) * 0.04) - (peaksBase * 0.04));
    const erosion = clamp01((erosionBase * 0.88) + ((1 - peaksBase) * 0.08));
    const weirdness = clamp01(weirdnessBase);
    const peaks = clamp01((peaksBase * 0.72) + ((1 - erosion) * 0.18) + (continentalness * 0.1));
    const ruggedness = clamp01((peaksBase * 0.58) + ((1 - erosion) * 0.42));
    const fertility = clamp01(
        (moisture * 0.46)
        + (erosion * 0.2)
        + ((1 - ruggedness) * 0.2)
        + (Math.max(0, 0.75 - Math.abs(temperature - 0.56)) * 0.18)
        - (continentalness * 0.06)
    );
    const basin = clamp01((basinBase * 0.52) + ((1 - continentalness) * 0.28) + ((1 - ruggedness) * 0.2));
    const canopy = clamp01((canopyBase * 0.44) + (moisture * 0.32) + (fertility * 0.2) - (ruggedness * 0.14));
    const uplands = clamp01((ruggedness * 0.54) + (continentalness * 0.16) + ((1 - erosion) * 0.18) + (peaksBase * 0.12));

    const profile = {
        moisture,
        temperature,
        continentalness,
        erosion,
        weirdness,
        ruggedness,
        fertility,
        basin,
        canopy,
        uplands,
        peaks,
    };
    climateCache.set(cacheKey, profile);
    return profile;
}

export function getDecorativePatchNoise(q: number, r: number, salt = 0): number {
    const point = axialToNoiseSpace(q, r);
    return perlin01(
        point.x + (salt * 7),
        point.y - (salt * 11),
        907 + (salt * 13),
        scaledBiomeSize(14),
        3,
        0.55,
        2.05,
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
    const coastal = clamp01(1 - Math.abs(climate.continentalness - 0.36) / 0.36);
    const inland = clamp01((climate.continentalness - 0.48) / 0.52);
    const frontierVolcanoBand = clamp01(1 - (Math.abs(dist - 7) / 5.5));

    applyBias(weights, 'plains', (climate.fertility * 14) + (flat * 5) + ((1 - climate.canopy) * 2) + (coastal * 3) - (climate.uplands * 8) - (climate.basin * 4));
    applyBias(weights, 'forest', (wet * 14) + (climate.canopy * 18) + (climate.fertility * 5) - (warm * 3) - (dry * 3));
    applyBias(weights, 'water', (wet * 12) + (climate.basin * 18) + (coastal * 10) + ((1 - rugged) * 3) - (dry * 8) - (climate.uplands * 4));
    applyBias(weights, 'dirt', (dry * 8) + (climate.uplands * 4) + ((1 - climate.fertility) * 6) + (inland * 3) - (climate.basin * 4));
    applyBias(weights, 'grain', (climate.fertility * 16) + (flat * 5) + (climate.erosion * 4) - (cold * 4) - (climate.uplands * 6));
    applyBias(weights, 'mountain', (rugged * 14) + (climate.uplands * 22) + (climate.peaks * 6) + (dry * 2) - (wet * 4));
    applyBias(weights, 'snow', (cold * 26) + (climate.uplands * 6) + (climate.peaks * 4) - (warm * 14));
    applyBias(weights, 'dessert', (warm * 12) + (dry * 14) + (inland * 4) + ((1 - climate.canopy) * 4) - (wet * 12));
    applyBias(weights, 'vulcano', (climate.uplands * 8) + (rugged * 8) + (climate.weirdness * 6) + (warm * 4) - (wet * 4) + (frontierVolcanoBand * 6));

    return weights;
}
