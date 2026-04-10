import { getClimateProfile } from '../../worldVariation';
import type { RenderQualityProfile, ViewportSnapshot } from '../RenderTypes';
import { drawGlow, type GlowColor, toRgba } from './EffectUtils';

interface BackdropTileLike {
    q: number;
    r: number;
    discovered: boolean;
    terrain: string | null;
}

interface BackdropCameraFxLike {
    vignetteBiasX: number;
    vignetteBiasY: number;
}

interface BackdropPaletteWeights {
    lush: number;
    water: number;
    cold: number;
    warm: number;
    stone: number;
    ember: number;
}

interface BackdropPaletteCache {
    key: string;
    expiresAtMs: number;
    weights: BackdropPaletteWeights;
}

interface BackdropFrameLike<TTile extends BackdropTileLike, TCameraFx extends BackdropCameraFxLike> {
    finalCtx: CanvasRenderingContext2D;
    visibleTiles: readonly TTile[];
    effectNowMs: number;
    cameraFx: TCameraFx;
    quality: RenderQualityProfile;
    viewport: ViewportSnapshot;
}

export class BackdropRenderer<TTile extends BackdropTileLike, TCameraFx extends BackdropCameraFxLike> {
    private paletteCache: BackdropPaletteCache | null = null;

    render(frame: BackdropFrameLike<TTile, TCameraFx>) {
        const width = frame.viewport.width;
        const height = frame.viewport.height;
        const weights = this.getBackdropPaletteWeights(
            frame.visibleTiles,
            frame.effectNowMs,
            frame.viewport.cameraQ,
            frame.viewport.cameraR,
        );
        const pulse = 0.78 + (Math.sin(frame.effectNowMs / 2600) * 0.06);

        const topColor: GlowColor = [
            Math.round(20 + (weights.warm * 94) + (weights.ember * 118) + (weights.lush * 34)),
            Math.round(28 + (weights.lush * 94) + (weights.water * 52) + (weights.warm * 34)),
            Math.round(46 + (weights.water * 122) + (weights.cold * 96) + (weights.stone * 32)),
        ];
        const bottomColor: GlowColor = [
            Math.round(8 + (weights.stone * 64) + (weights.ember * 40) + (weights.warm * 22)),
            Math.round(12 + (weights.water * 22) + (weights.lush * 26) + (weights.stone * 34)),
            Math.round(20 + (weights.water * 68) + (weights.cold * 72) + (weights.stone * 56)),
        ];

        const ctx = frame.finalCtx;
        ctx.save();
        ctx.imageSmoothingEnabled = true;

        const wash = ctx.createLinearGradient(0, 0, width, height);
        wash.addColorStop(0, toRgba(topColor, 0.18));
        wash.addColorStop(0.52, toRgba(topColor, 0.08));
        wash.addColorStop(1, toRgba(bottomColor, 0.26));
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, width, height);

        if (frame.quality.enableBackdropGlows) {
            ctx.globalCompositeOperation = 'screen';
            drawGlow(
                ctx,
                (width * 0.26) + (frame.cameraFx.vignetteBiasX * 0.1),
                (height * 0.3) + (frame.cameraFx.vignetteBiasY * 0.08),
                Math.min(width, height) * (0.34 + (weights.lush * 0.08)),
                [120, 188, 144],
                (0.03 + (weights.lush * 0.11)) * pulse,
            );
            drawGlow(
                ctx,
                (width * 0.34) - (frame.cameraFx.vignetteBiasX * 0.06),
                height * 0.26,
                Math.min(width, height) * (0.28 + (weights.water * 0.08)),
                [96, 182, 226],
                (0.03 + (weights.water * 0.12) + (weights.cold * 0.02)) * pulse,
            );
            drawGlow(
                ctx,
                width * 0.74,
                (height * 0.22) + (frame.cameraFx.vignetteBiasY * 0.06),
                Math.min(width, height) * (0.24 + (weights.warm * 0.06)),
                [255, 191, 122],
                (0.025 + (weights.warm * 0.09) + (weights.ember * 0.05)) * pulse,
            );
            if (weights.ember > 0.02) {
                drawGlow(
                    ctx,
                    width * 0.82,
                    height * 0.16,
                    Math.min(width, height) * 0.2,
                    [255, 128, 82],
                    (0.02 + (weights.ember * 0.11)) * pulse,
                );
            }
        }

        ctx.globalCompositeOperation = 'multiply';
        const floorShadow = ctx.createLinearGradient(0, height * 0.18, 0, height);
        floorShadow.addColorStop(0, 'rgba(5, 8, 14, 0)');
        floorShadow.addColorStop(0.64, 'rgba(5, 8, 14, 0.1)');
        floorShadow.addColorStop(1, 'rgba(5, 8, 14, 0.22)');
        ctx.fillStyle = floorShadow;
        ctx.fillRect(0, 0, width, height);

        ctx.restore();
    }

    private getBackdropPaletteWeights(visibleTiles: readonly TTile[], nowMs: number, cameraQ: number, cameraR: number) {
        const cacheDurationMs = 240;
        const key = `${Math.round(cameraQ / 2)},${Math.round(cameraR / 2)}:${visibleTiles.length}`;
        if (
            this.paletteCache
            && this.paletteCache.key === key
            && this.paletteCache.expiresAtMs >= nowMs
        ) {
            return this.paletteCache.weights;
        }

        const weights = this.sampleBackdropPalette(visibleTiles);
        this.paletteCache = {
            key,
            expiresAtMs: nowMs + cacheDurationMs,
            weights,
        };
        return weights;
    }

    private sampleBackdropPalette(tiles: readonly TTile[]): BackdropPaletteWeights {
        const weights: BackdropPaletteWeights = {
            lush: 0,
            water: 0,
            cold: 0,
            warm: 0,
            stone: 0,
            ember: 0,
        };

        if (!tiles.length) {
            return weights;
        }

        const sampleCap = 120;
        const step = Math.max(1, Math.floor(tiles.length / sampleCap));
        let samples = 0;

        for (let i = 0; i < tiles.length; i += step) {
            const tile = tiles[i];
            if (!tile?.discovered || !tile.terrain) continue;

            const climate = getClimateProfile(tile.q, tile.r);
            const fertilityBoost = 0.82 + (climate.fertility * 0.45);

            switch (tile.terrain) {
                case 'forest':
                    weights.lush += 1.15 * fertilityBoost;
                    weights.cold += Math.max(0, 0.45 - climate.temperature) * 0.18;
                    break;
                case 'plains':
                    weights.lush += 0.92 * fertilityBoost;
                    weights.warm += climate.temperature * 0.12;
                    break;
                case 'grain':
                    weights.lush += 0.74 * fertilityBoost;
                    weights.warm += 0.34 + (climate.temperature * 0.16);
                    break;
                case 'water':
                    weights.water += 1.2 + (climate.moisture * 0.28);
                    weights.cold += Math.max(0, 0.58 - climate.temperature) * 0.26;
                    weights.warm += Math.max(0, climate.temperature - 0.58) * 0.18;
                    break;
                case 'snow':
                    weights.cold += 1.28;
                    weights.stone += 0.18 + (climate.ruggedness * 0.14);
                    break;
                case 'mountain':
                    weights.stone += 1.14 + (climate.ruggedness * 0.24);
                    weights.cold += Math.max(0, 0.5 - climate.temperature) * 0.18;
                    break;
                case 'dirt':
                    weights.warm += 0.48 + (climate.temperature * 0.12);
                    weights.stone += 0.34;
                    break;
                case 'dessert':
                    weights.warm += 1.18;
                    weights.stone += 0.2;
                    break;
                case 'vulcano':
                    weights.ember += 1.38;
                    weights.stone += 0.48;
                    weights.warm += 0.36;
                    break;
                case 'towncenter':
                    weights.warm += 0.82;
                    weights.lush += 0.22;
                    weights.water += 0.12;
                    break;
            }

            samples++;
        }

        if (!samples) {
            return weights;
        }

        return {
            lush: Math.min(1.2, weights.lush / samples),
            water: Math.min(1.2, weights.water / samples),
            cold: Math.min(1.2, weights.cold / samples),
            warm: Math.min(1.2, weights.warm / samples),
            stone: Math.min(1.2, weights.stone / samples),
            ember: Math.min(1.2, weights.ember / samples),
        };
    }
}
