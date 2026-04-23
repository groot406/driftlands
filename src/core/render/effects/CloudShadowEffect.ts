import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile, TerrainTileRenderItem } from '../RenderTypes';
import type { WorldEffect } from './WorldEffect';

interface CameraCompositeStateLike {
    offsetX: number;
    offsetY: number;
    roll: number;
    zoom: number;
}

interface CloudShadowEffectDependencies {
    getDpr(): number;
    getCanvasCenter(): { cx: number; cy: number };
    getCameraFx(context: RenderPassContext): CameraCompositeStateLike;
    applyWorldTransform(
        ctx: CanvasRenderingContext2D,
        translateX: number,
        translateY: number,
        cameraFx: CameraCompositeStateLike,
    ): void;
}

const CLOUD_FIELD_TEXTURE_SIZE = 300;
const CLOUD_FIELD_TEXTURE_CACHE_MAX = 4;
const CLOUD_FIELD_MORPH_MS = 90_000;

interface CloudFieldProfile {
    baseOffsetU: number;
    baseOffsetV: number;
    detailOffsetU: number;
    detailOffsetV: number;
    erosionOffsetU: number;
    erosionOffsetV: number;
    baseGain: number;
    detailGain: number;
    erosionGain: number;
    thresholdStartRatio: number;
    thresholdWidthRatio: number;
    alphaPower: number;
}

interface CloudLayerMotion {
    opacity: number;
    scale: number;
    speedX: number;
    phaseX: number;
    phaseY: number;
    blurPx: number;
}

export class CloudShadowEffect implements WorldEffect {
    readonly name = 'CloudShadowEffect';

    private readonly deps: CloudShadowEffectDependencies;
    private readonly cloudNoiseTextures = new Map<number, HTMLCanvasElement>();
    private cloudMorphStartMs = 0;
    private cloudPrimarySeed: number;
    private cloudSecondarySeed: number;

    constructor(deps: CloudShadowEffectDependencies) {
        this.deps = deps;
        this.cloudPrimarySeed = this.createRandomSeed();
        this.cloudSecondarySeed = this.nextCloudNoiseSeed(this.cloudPrimarySeed ^ this.createRandomSeed());
    }

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableClouds && quality.cloudsEnabled;
    }

    apply(context: RenderPassContext) {
        if (!context.effectSurface) {
            return;
        }

        const discoveredTiles = context.scene.visibleTiles.filter((tile) => tile.flags.discovered);
        if (!discoveredTiles.length) {
            return;
        }

        const bounds = this.getVisibleTileBounds(discoveredTiles, context.config.tileDrawSize);
        if (!bounds) {
            return;
        }

        const morph = this.getCloudMorphState(context.scene.frameInfo.effectNowMs);
        const primaryTexture = this.ensureCloudNoiseTexture(morph.primarySeed);
        const secondaryTexture = this.ensureCloudNoiseTexture(morph.secondarySeed);
        if (!primaryTexture || !secondaryTexture) {
            return;
        }

        const cameraFx = this.deps.getCameraFx(context);
        const { cx, cy } = this.deps.getCanvasCenter();
        const translateX = cx - context.viewport.cameraX;
        const translateY = cy - context.viewport.cameraY;
        const blurPx = context.quality.expensiveAtmosphere ? 3.1 : 2.2;
        const detailLayerEnabled = context.quality.expensiveAtmosphere;
        const ctx = context.effectSurface.ctx;
        const primaryMotion = this.getCloudLayerMotion(morph.primarySeed, false, blurPx);
        const secondaryMotion = this.getCloudLayerMotion(morph.secondarySeed, false, blurPx);
        const primaryDetailMotion = detailLayerEnabled
            ? this.getCloudLayerMotion(morph.primarySeed ^ 0x6ad5c431, true, 0.8)
            : null;
        const secondaryDetailMotion = detailLayerEnabled
            ? this.getCloudLayerMotion(morph.secondarySeed ^ 0x6ad5c431, true, 0.8)
            : null;
        const dpr = this.deps.getDpr();

        ctx.save();
        ctx.scale(dpr, dpr);
        this.deps.applyWorldTransform(ctx, translateX, translateY, cameraFx);
        this.withDiscoveredClip(ctx, discoveredTiles, context.config.hexSize, context.config.tileDrawSize, () => {
            ctx.globalCompositeOperation = 'source-over';
            this.drawCloudShadowLayer(
                ctx,
                primaryTexture,
                bounds,
                context.scene.frameInfo.effectNowMs,
                primaryMotion.opacity * (1 - morph.blend),
                primaryMotion.scale,
                primaryMotion.speedX,
                primaryMotion.phaseX,
                primaryMotion.phaseY,
                primaryMotion.blurPx,
            );
            this.drawCloudShadowLayer(
                ctx,
                secondaryTexture,
                bounds,
                context.scene.frameInfo.effectNowMs,
                secondaryMotion.opacity * morph.blend,
                secondaryMotion.scale,
                secondaryMotion.speedX,
                secondaryMotion.phaseX,
                secondaryMotion.phaseY,
                secondaryMotion.blurPx,
            );

            if (primaryDetailMotion && secondaryDetailMotion) {
                this.drawCloudShadowLayer(
                    ctx,
                    primaryTexture,
                    bounds,
                    context.scene.frameInfo.effectNowMs,
                    primaryDetailMotion.opacity * (1 - morph.blend),
                    primaryDetailMotion.scale,
                    primaryDetailMotion.speedX,
                    primaryDetailMotion.phaseX,
                    primaryDetailMotion.phaseY,
                    primaryDetailMotion.blurPx,
                );
                this.drawCloudShadowLayer(
                    ctx,
                    secondaryTexture,
                    bounds,
                    context.scene.frameInfo.effectNowMs,
                    secondaryDetailMotion.opacity * morph.blend,
                    secondaryDetailMotion.scale,
                    secondaryDetailMotion.speedX,
                    secondaryDetailMotion.phaseX,
                    secondaryDetailMotion.phaseY,
                    secondaryDetailMotion.blurPx,
                );
            }
        });

        ctx.restore();
    }

    private getVisibleTileBounds(visibleTiles: readonly TerrainTileRenderItem[], tileDrawSize: number) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const tile of visibleTiles) {
            if (tile.worldX < minX) minX = tile.worldX;
            if (tile.worldY < minY) minY = tile.worldY;
            if (tile.worldX > maxX) maxX = tile.worldX;
            if (tile.worldY > maxY) maxY = tile.worldY;
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return null;
        }

        const padding = tileDrawSize * 2.8;
        return {
            minX: minX - padding,
            minY: minY - padding,
            width: (maxX - minX) + (padding * 2),
            height: (maxY - minY) + (padding * 2),
        };
    }

    private getCloudMorphState(now: number) {
        if (!this.cloudMorphStartMs) {
            this.cloudMorphStartMs = now;
        }

        while ((now - this.cloudMorphStartMs) >= CLOUD_FIELD_MORPH_MS) {
            this.cloudMorphStartMs += CLOUD_FIELD_MORPH_MS;
            this.cloudPrimarySeed = this.cloudSecondarySeed;
            this.cloudSecondarySeed = this.nextCloudNoiseSeed(this.cloudSecondarySeed);
        }

        return {
            primarySeed: this.cloudPrimarySeed,
            secondarySeed: this.cloudSecondarySeed,
            blend: Math.max(0, Math.min(1, (now - this.cloudMorphStartMs) / CLOUD_FIELD_MORPH_MS)),
        };
    }

    private ensureCloudNoiseTexture(seed: number) {
        const cached = this.cloudNoiseTextures.get(seed);
        if (cached) {
            return cached;
        }
        if (typeof document === 'undefined') {
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = CLOUD_FIELD_TEXTURE_SIZE;
        canvas.height = CLOUD_FIELD_TEXTURE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        const profile = this.getCloudFieldProfile(seed);
        const signalValues = new Float32Array(CLOUD_FIELD_TEXTURE_SIZE * CLOUD_FIELD_TEXTURE_SIZE);
        let signalMin = Infinity;
        let signalMax = -Infinity;

        for (let y = 0; y < CLOUD_FIELD_TEXTURE_SIZE; y++) {
            const v = y / CLOUD_FIELD_TEXTURE_SIZE;
            for (let x = 0; x < CLOUD_FIELD_TEXTURE_SIZE; x++) {
                const u = x / CLOUD_FIELD_TEXTURE_SIZE;
                const baseNoise = this.sampleCloudDensity(
                    this.wrapUnit(u + profile.baseOffsetU),
                    this.wrapUnit(v + profile.baseOffsetV),
                    seed,
                );
                const detailNoise = this.sampleCloudDensity(
                    this.wrapUnit(u + profile.detailOffsetU),
                    this.wrapUnit(v + profile.detailOffsetV),
                    seed ^ 0x9e3779b9,
                );
                const erosionNoise = this.sampleCloudDensity(
                    this.wrapUnit(u + profile.erosionOffsetU),
                    this.wrapUnit(v + profile.erosionOffsetV),
                    seed ^ 0x7f4a7c15,
                );
                const densitySignal = (baseNoise * profile.baseGain)
                    - (detailNoise * profile.detailGain)
                    - (erosionNoise * profile.erosionGain);
                const index = (y * CLOUD_FIELD_TEXTURE_SIZE) + x;
                signalValues[index] = densitySignal;
                if (densitySignal < signalMin) signalMin = densitySignal;
                if (densitySignal > signalMax) signalMax = densitySignal;
            }
        }

        const signalRange = Math.max(0.0001, signalMax - signalMin);
        const thresholdStart = signalMin + (signalRange * profile.thresholdStartRatio);
        const thresholdEnd = Math.min(
            signalMax,
            thresholdStart + (signalRange * profile.thresholdWidthRatio),
        );
        const image = ctx.createImageData(CLOUD_FIELD_TEXTURE_SIZE, CLOUD_FIELD_TEXTURE_SIZE);
        const data = image.data;

        for (let index = 0; index < signalValues.length; index++) {
            const density = this.smoothstep(thresholdStart, thresholdEnd, signalValues[index] ?? 0);
            const alpha = Math.pow(Math.max(0, density), profile.alphaPower);
            const pixelIndex = index * 4;
            data[pixelIndex] = 20;
            data[pixelIndex + 1] = 24;
            data[pixelIndex + 2] = 32;
            data[pixelIndex + 3] = Math.round(alpha * 246);
        }

        ctx.putImageData(image, 0, 0);

        this.cloudNoiseTextures.set(seed, canvas);
        for (const cachedSeed of [...this.cloudNoiseTextures.keys()]) {
            if (this.cloudNoiseTextures.size <= CLOUD_FIELD_TEXTURE_CACHE_MAX) {
                break;
            }
            if (cachedSeed === this.cloudPrimarySeed || cachedSeed === this.cloudSecondarySeed) {
                continue;
            }
            this.cloudNoiseTextures.delete(cachedSeed);
        }

        return canvas;
    }

    private getCloudFieldProfile(seed: number): CloudFieldProfile {
        return {
            baseOffsetU: this.seedUnit(seed, 11),
            baseOffsetV: this.seedUnit(seed, 17),
            detailOffsetU: this.seedUnit(seed, 23),
            detailOffsetV: this.seedUnit(seed, 29),
            erosionOffsetU: this.seedUnit(seed, 31),
            erosionOffsetV: this.seedUnit(seed, 37),
            baseGain: 1.06 + (this.seedUnit(seed, 41) * 0.2),
            detailGain: 0.18 + (this.seedUnit(seed, 43) * 0.18),
            erosionGain: 0.08 + (this.seedUnit(seed, 47) * 0.16),
            thresholdStartRatio: 0.56 + (this.seedUnit(seed, 53) * 0.12),
            thresholdWidthRatio: 0.12 + (this.seedUnit(seed, 59) * 0.08),
            alphaPower: 1.35 + (this.seedUnit(seed, 61) * 0.85),
        };
    }

    private getCloudLayerMotion(seed: number, detail: boolean, baseBlurPx: number): CloudLayerMotion {
        const direction = this.seedUnit(seed, 71) > 0.42 ? 1 : -1;

        return {
            opacity: detail
                ? 0.14 + (this.seedUnit(seed, 73) * 0.08)
                : 0.28 + (this.seedUnit(seed, 73) * 0.12),
            scale: detail
                ? 0.9 + (this.seedUnit(seed, 79) * 0.35)
                : 1.7 + (this.seedUnit(seed, 79) * 0.6),
            speedX: direction * (
                detail
                    ? 2.8 + (this.seedUnit(seed, 83) * 2.2)
                    : 10.5 + (this.seedUnit(seed, 83) * 4.5)
            ),
            phaseX: this.seedUnit(seed, 89),
            phaseY: this.seedUnit(seed, 97),
            blurPx: detail
                ? Math.max(0.35, baseBlurPx * (0.85 + (this.seedUnit(seed, 101) * 0.3)))
                : Math.max(1, baseBlurPx * (0.9 + (this.seedUnit(seed, 101) * 0.35))),
        };
    }

    private drawCloudShadowLayer(
        ctx: CanvasRenderingContext2D,
        texture: HTMLCanvasElement,
        bounds: { minX: number; minY: number; width: number; height: number },
        now: number,
        alpha: number,
        scale: number,
        speedX: number,
        phaseX: number = 0,
        phaseY: number = 0,
        blurPx: number = 0,
    ) {
        if (alpha <= 0.001) return;

        const pattern = ctx.createPattern(texture, 'repeat');
        if (!pattern) return;

        const spanX = texture.width * scale;
        const spanY = texture.height * scale;
        const offsetX = this.wrapValue(((now * speedX) / 1000) + (phaseX * spanX), spanX);
        const offsetY = this.wrapValue(phaseY * spanY, spanY);
        const paddingX = spanX * 1.5;
        const paddingY = spanY * 1.5;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = true;
        ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        ctx.fillStyle = pattern;
        ctx.fillRect(
            (bounds.minX - paddingX - offsetX) / scale,
            (bounds.minY - paddingY - offsetY) / scale,
            (bounds.width + (paddingX * 2)) / scale,
            (bounds.height + (paddingY * 2)) / scale,
        );
        ctx.restore();
    }

    private sampleCloudDensity(u: number, v: number, seed: number) {
        const warpX = this.sampleTileablePerlin((u * 2.2) + 0.13, (v * 2.2) + 0.07, seed ^ 0x68bc21eb, 2) * 0.085;
        const warpY = this.sampleTileablePerlin((u * 2.2) + 0.41, (v * 2.2) + 0.29, seed ^ 0x02e5be93, 2) * 0.085;
        const warpedU = this.wrapUnit(u + warpX);
        const warpedV = this.wrapUnit(v + warpY);
        let total = 0;
        let weight = 0;
        let amplitude = 1;

        for (let octave = 0; octave < 3; octave++) {
            const frequency = 1 << octave;
            const sample = (this.sampleTileablePerlin(
                warpedU * frequency,
                warpedV * frequency,
                seed + (octave * 1013),
                frequency,
            ) * 0.5) + 0.5;
            total += sample * amplitude;
            weight += amplitude;
            amplitude *= 0.46;
        }

        return weight > 0 ? (total / weight) : 0;
    }

    private sampleTileablePerlin(x: number, y: number, seed: number, period: number) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const sx = x - x0;
        const sy = y - y0;

        const g00 = this.getNoiseGradient(this.wrapInt(x0, period), this.wrapInt(y0, period), seed);
        const g10 = this.getNoiseGradient(this.wrapInt(x1, period), this.wrapInt(y0, period), seed);
        const g01 = this.getNoiseGradient(this.wrapInt(x0, period), this.wrapInt(y1, period), seed);
        const g11 = this.getNoiseGradient(this.wrapInt(x1, period), this.wrapInt(y1, period), seed);

        const n00 = (g00.x * sx) + (g00.y * sy);
        const n10 = (g10.x * (sx - 1)) + (g10.y * sy);
        const n01 = (g01.x * sx) + (g01.y * (sy - 1));
        const n11 = (g11.x * (sx - 1)) + (g11.y * (sy - 1));

        const u = this.fade(sx);
        const v = this.fade(sy);
        return this.lerp(this.lerp(n00, n10, u), this.lerp(n01, n11, u), v);
    }

    private getNoiseGradient(x: number, y: number, seed: number) {
        const hash = this.hashNoise(x, y, seed);
        const angle = (hash / 0xffffffff) * Math.PI * 2;
        return {
            x: Math.cos(angle),
            y: Math.sin(angle),
        };
    }

    private hashNoise(x: number, y: number, seed: number) {
        let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
        hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
        return (hash ^ (hash >>> 16)) >>> 0;
    }

    private nextCloudNoiseSeed(seed: number) {
        return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    }

    private createRandomSeed() {
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const values = new Uint32Array(1);
            crypto.getRandomValues(values);
            return values[0] ?? 0;
        }

        return Math.floor(Math.random() * 0xffffffff) >>> 0;
    }

    private seedUnit(seed: number, salt: number) {
        let hash = seed ^ Math.imul(salt, 2246822519);
        hash = Math.imul(hash ^ (hash >>> 15), 3266489917);
        return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
    }

    private fade(value: number) {
        return value * value * value * (value * ((value * 6) - 15) + 10);
    }

    private lerp(a: number, b: number, t: number) {
        return a + ((b - a) * t);
    }

    private smoothstep(edge0: number, edge1: number, value: number) {
        if (edge0 === edge1) {
            return value >= edge1 ? 1 : 0;
        }
        const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - (2 * t));
    }

    private wrapInt(value: number, period: number) {
        return ((value % period) + period) % period;
    }

    private wrapValue(value: number, span: number) {
        if (span <= 0) return 0;
        return ((value % span) + span) % span;
    }

    private wrapUnit(value: number) {
        return this.wrapValue(value, 1);
    }

    private withDiscoveredClip(
        ctx: CanvasRenderingContext2D,
        visibleTiles: readonly TerrainTileRenderItem[],
        hexSize: number,
        tileDrawSize: number,
        draw: () => void,
    ) {
        if (!visibleTiles.length) return;

        ctx.save();
        ctx.beginPath();
        for (const tile of visibleTiles) {
            this.drawHexPath(ctx, tile.worldX, tile.worldY, hexSize, tileDrawSize);
        }
        ctx.clip();
        draw();
        ctx.restore();
    }

    private drawHexPath(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        hexSize: number,
        tileDrawSize: number,
    ) {
        ctx.moveTo(x + (0.5 * tileDrawSize) - hexSize, y - hexSize);
        ctx.lineTo(x + tileDrawSize - hexSize, y + (0.25 * tileDrawSize) - hexSize);
        ctx.lineTo(x + tileDrawSize - hexSize, y + (0.75 * tileDrawSize) - hexSize);
        ctx.lineTo(x + (0.5 * tileDrawSize) - hexSize, y + tileDrawSize - hexSize);
        ctx.lineTo(x - hexSize, y + (0.75 * tileDrawSize) - hexSize);
        ctx.lineTo(x - hexSize, y + (0.25 * tileDrawSize) - hexSize);
        ctx.closePath();
    }
}
