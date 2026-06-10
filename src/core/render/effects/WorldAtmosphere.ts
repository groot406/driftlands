import type { RenderQualityProfile } from '../RenderTypes';
import { GROWTH_HYBRID_STYLE } from '../visualStyle';

export type AtmosphereColor = readonly [number, number, number];

export type AtmosphereWeatherFlavor =
    | 'clear'
    | 'breezy'
    | 'mist'
    | 'snow'
    | 'sand'
    | 'ash'
    | 'warmHaze';

export interface AtmosphereTileSample {
    q: number;
    r: number;
    discovered: boolean;
    terrain: string | null;
}

export interface AtmosphereWeights {
    lush: number;
    water: number;
    cold: number;
    warm: number;
    stone: number;
    ember: number;
}

export interface WorldAtmosphere {
    weights: AtmosphereWeights;
    weatherFlavor: AtmosphereWeatherFlavor;
    timePulse: number;
    skyColor: AtmosphereColor;
    hazeColor: AtmosphereColor;
    glowColor: AtmosphereColor;
    shadowColor: AtmosphereColor;
    windX: number;
    windY: number;
    windStrength: number;
    lightTemperature: number;
    globalParticleIntensity: number;
    cloudDepthIntensity: number;
    foregroundIntensity: number;
}

export interface BuildWorldAtmosphereInput {
    tiles: readonly AtmosphereTileSample[];
    nowMs: number;
    cameraQ: number;
    cameraR: number;
    quality: RenderQualityProfile;
}

const EMPTY_WEIGHTS: AtmosphereWeights = {
    lush: 0,
    water: 0,
    cold: 0,
    warm: 0,
    stone: 0,
    ember: 0,
};

const TERRAIN_WEIGHTS: Readonly<Record<string, AtmosphereWeights>> = {
    plains: { lush: 0.64, water: 0, cold: 0, warm: 0.28, stone: 0.04, ember: 0 },
    forest: { lush: 1, water: 0.04, cold: 0.02, warm: 0.08, stone: 0.02, ember: 0 },
    grain: { lush: 0.52, water: 0, cold: 0, warm: 0.62, stone: 0.02, ember: 0 },
    water: { lush: 0.08, water: 1, cold: 0.18, warm: 0, stone: 0, ember: 0 },
    dirt: { lush: 0.1, water: 0, cold: 0, warm: 0.36, stone: 0.42, ember: 0 },
    desert: { lush: 0.02, water: 0, cold: 0, warm: 1, stone: 0.28, ember: 0 },
    snow: { lush: 0.02, water: 0.06, cold: 1, warm: 0, stone: 0.24, ember: 0 },
    mountain: { lush: 0.06, water: 0, cold: 0.34, warm: 0.02, stone: 1, ember: 0 },
    volcano: { lush: 0, water: 0, cold: 0, warm: 0.72, stone: 0.72, ember: 1 },
    towncenter: { lush: 0.34, water: 0, cold: 0, warm: 0.44, stone: 0.26, ember: 0.08 },
};

const TERRAIN_ALIASES: Readonly<Record<string, string>> = {
    dessert: 'desert',
    sand: 'desert',
    vulcano: 'volcano',
    lava: 'volcano',
    rock: 'mountain',
    rocks: 'mountain',
    ice: 'snow',
};

const DEFAULT_TERRAIN_WEIGHTS: AtmosphereWeights = {
    lush: 0.22,
    water: 0,
    cold: 0,
    warm: 0.18,
    stone: 0.12,
    ember: 0,
};

const COLD_HAZE: AtmosphereColor = [190, 226, 236];
const MIST_HAZE: AtmosphereColor = [176, 218, 218];
const SAND_HAZE: AtmosphereColor = [226, 184, 116];
const ASH_HAZE: AtmosphereColor = [116, 104, 98];
const LUSH_GLOW: AtmosphereColor = [130, 202, 122];
const COLD_GLOW: AtmosphereColor = [184, 224, 240];
const EMBER_GLOW: AtmosphereColor = [232, 120, 62];
const DEEP_SHADOW: AtmosphereColor = [48, 56, 54];

export function mixAtmosphereColor(from: AtmosphereColor, to: AtmosphereColor, amount: number): AtmosphereColor {
    const t = clamp01(amount);
    return [
        clampChannel(from[0] + ((to[0] - from[0]) * t)),
        clampChannel(from[1] + ((to[1] - from[1]) * t)),
        clampChannel(from[2] + ((to[2] - from[2]) * t)),
    ];
}

export function buildWorldAtmosphere(input: BuildWorldAtmosphereInput): WorldAtmosphere {
    const weights = buildAtmosphereWeights(input);
    const timePulse = buildTimePulse(input.nowMs, input.cameraQ, input.cameraR);
    const weatherFlavor = chooseWeatherFlavor(weights, timePulse);
    const qualityScale = getQualityScale(input.quality);
    const particleScale = input.quality.enableParticles ? Math.max(0.18, input.quality.particleBudgetScale) : 0.14;
    const cloudScale = input.quality.enableClouds ? qualityScale : qualityScale * 0.48;
    const foregroundScale = input.quality.enableTileRelief ? qualityScale : qualityScale * 0.5;

    const warmth = clamp01(weights.warm + (weights.ember * 0.4) - (weights.cold * 0.36));
    const skyColor = mixAtmosphereColor(
        GROWTH_HYBRID_STYLE.backdrop.washTop,
        getFlavorHazeColor(weatherFlavor),
        clamp01(0.18 + (weights.water * 0.2) + (weights.cold * 0.22) + (weights.warm * 0.14) + (weights.ember * 0.36)),
    );
    const hazeColor = mixAtmosphereColor(
        GROWTH_HYBRID_STYLE.backdrop.skyGlow,
        getFlavorHazeColor(weatherFlavor),
        clamp01(0.28 + (timePulse * 0.12) + (weights.water * 0.28) + (weights.ember * 0.3)),
    );
    const glowColor = mixAtmosphereColor(
        mixAtmosphereColor(GROWTH_HYBRID_STYLE.backdrop.meadowGlow, GROWTH_HYBRID_STYLE.backdrop.warmGlow, warmth),
        getFlavorGlowColor(weatherFlavor),
        clamp01(0.16 + (weights.ember * 0.38) + (weights.cold * 0.22)),
    );
    const shadowColor = mixAtmosphereColor(
        GROWTH_HYBRID_STYLE.backdrop.washBottom,
        DEEP_SHADOW,
        clamp01(0.32 + (weights.stone * 0.24) + (weights.ember * 0.18)),
    );
    const windAngle = (input.nowMs * 0.00018) + (input.cameraQ * 0.37) - (input.cameraR * 0.21);
    const windStrength = clamp01(0.3 + (weights.warm * 0.16) + (weights.water * 0.12) + (weights.cold * 0.1) + (timePulse * 0.18));

    return {
        weights,
        weatherFlavor,
        timePulse,
        skyColor,
        hazeColor,
        glowColor,
        shadowColor,
        windX: roundTo(Math.cos(windAngle), 4),
        windY: roundTo(Math.sin(windAngle), 4),
        windStrength: roundTo(windStrength, 4),
        lightTemperature: roundTo(clamp01(0.5 + (warmth * 0.34) - (weights.cold * 0.28) + (weights.ember * 0.24)), 4),
        globalParticleIntensity: roundTo(clamp01((0.32 + (weights.lush * 0.2) + (weights.water * 0.26) + (weights.warm * 0.18) + (weights.ember * 0.3)) * particleScale), 4),
        cloudDepthIntensity: roundTo(clamp01((0.34 + (weights.water * 0.34) + (weights.cold * 0.24) + (weights.warm * 0.12) + (weights.ember * 0.1)) * cloudScale), 4),
        foregroundIntensity: roundTo(clamp01((0.36 + (weights.lush * 0.26) + (weights.stone * 0.18) + (weights.warm * 0.12) + (weights.ember * 0.18)) * foregroundScale), 4),
    };
}

function buildAtmosphereWeights(input: BuildWorldAtmosphereInput): AtmosphereWeights {
    const totals = { ...EMPTY_WEIGHTS };
    let totalInfluence = 0;

    for (const tile of input.tiles) {
        if (!tile.discovered) {
            continue;
        }
        const terrainWeights = getTerrainWeights(tile.terrain);
        const influence = getTileInfluence(tile, input.cameraQ, input.cameraR);
        totals.lush += terrainWeights.lush * influence;
        totals.water += terrainWeights.water * influence;
        totals.cold += terrainWeights.cold * influence;
        totals.warm += terrainWeights.warm * influence;
        totals.stone += terrainWeights.stone * influence;
        totals.ember += terrainWeights.ember * influence;
        totalInfluence += influence;
    }

    if (totalInfluence === 0) {
        return { ...EMPTY_WEIGHTS };
    }

    return {
        lush: roundTo(totals.lush / totalInfluence, 4),
        water: roundTo(totals.water / totalInfluence, 4),
        cold: roundTo(totals.cold / totalInfluence, 4),
        warm: roundTo(totals.warm / totalInfluence, 4),
        stone: roundTo(totals.stone / totalInfluence, 4),
        ember: roundTo(totals.ember / totalInfluence, 4),
    };
}

function getTerrainWeights(terrain: string | null): AtmosphereWeights {
    const normalized = normalizeTerrain(terrain);
    return TERRAIN_WEIGHTS[normalized] ?? DEFAULT_TERRAIN_WEIGHTS;
}

function normalizeTerrain(terrain: string | null): string {
    const key = (terrain ?? '').trim().toLowerCase();
    return TERRAIN_ALIASES[key] ?? key;
}

function getTileInfluence(tile: AtmosphereTileSample, cameraQ: number, cameraR: number): number {
    const dq = tile.q - cameraQ;
    const dr = tile.r - cameraR;
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    return 1 / (1 + (distance * 0.4));
}

function chooseWeatherFlavor(weights: AtmosphereWeights, timePulse: number): AtmosphereWeatherFlavor {
    if (weights.ember >= 0.24) {
        return 'ash';
    }
    if (weights.cold >= 0.42) {
        return 'snow';
    }
    if (weights.warm >= 0.56 && weights.water < 0.18) {
        return 'sand';
    }
    if (weights.water >= 0.24) {
        return 'mist';
    }
    if (weights.warm >= 0.36) {
        return 'warmHaze';
    }
    if (weights.lush >= 0.34 || timePulse >= 0.66) {
        return 'breezy';
    }
    return 'clear';
}

function getFlavorHazeColor(flavor: AtmosphereWeatherFlavor): AtmosphereColor {
    if (flavor === 'mist') {
        return MIST_HAZE;
    }
    if (flavor === 'snow') {
        return COLD_HAZE;
    }
    if (flavor === 'sand' || flavor === 'warmHaze') {
        return SAND_HAZE;
    }
    if (flavor === 'ash') {
        return ASH_HAZE;
    }
    return GROWTH_HYBRID_STYLE.backdrop.skyGlow;
}

function getFlavorGlowColor(flavor: AtmosphereWeatherFlavor): AtmosphereColor {
    if (flavor === 'snow' || flavor === 'mist') {
        return COLD_GLOW;
    }
    if (flavor === 'ash') {
        return EMBER_GLOW;
    }
    if (flavor === 'sand' || flavor === 'warmHaze') {
        return GROWTH_HYBRID_STYLE.backdrop.warmGlow;
    }
    return LUSH_GLOW;
}

function buildTimePulse(nowMs: number, cameraQ: number, cameraR: number): number {
    return roundTo((Math.sin((nowMs * 0.001) + (cameraQ * 0.73) + (cameraR * 1.17)) + 1) / 2, 4);
}

function getQualityScale(quality: RenderQualityProfile): number {
    if (quality.expensiveAtmosphere) {
        return 1;
    }
    if (quality.name === 'medium') {
        return 0.72;
    }
    return 0.34;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function roundTo(value: number, precision: number): number {
    const scale = 10 ** precision;
    return Math.round(value * scale) / scale;
}
