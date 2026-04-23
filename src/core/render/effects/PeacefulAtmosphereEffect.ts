import { HexProjection } from '../math/HexProjection';
import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile, TerrainTileRenderItem } from '../RenderTypes';
import { toRgba, type GlowColor } from './EffectUtils';
import type { WorldEffect } from './WorldEffect';

interface AtmosphereMood {
    lush: number;
    water: number;
    warm: number;
    cold: number;
}

interface ScreenBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
}

const GLOW_TERRAINS = new Set([
    'plains',
    'forest',
    'grain',
    'water',
    'towncenter',
    'snow',
]);

export class PeacefulAtmosphereEffect implements WorldEffect {
    readonly name = 'PeacefulAtmosphereEffect';

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableBackdropGlows || quality.expensiveAtmosphere;
    }

    apply(context: RenderPassContext) {
        const surface = context.effectSurface;
        if (!surface) {
            return;
        }

        const discoveredTiles = context.scene.visibleTiles.filter((tile) => tile.flags.discovered && !!tile.terrainType);
        if (!discoveredTiles.length) {
            return;
        }

        const bounds = this.getDiscoveredScreenBounds(context, discoveredTiles);
        if (!bounds) {
            return;
        }

        const mood = this.sampleMood(discoveredTiles);
        const ctx = surface.ctx;
        const now = context.scene.frameInfo.effectNowMs;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        this.drawBreathingWash(ctx, surface.canvas, bounds, mood, now, context.quality);

        this.withDiscoveredClip(ctx, context, discoveredTiles, () => {
            this.drawSunShafts(ctx, surface.canvas, bounds, mood, now, context.quality);
            this.drawLivingTileGlints(ctx, context, discoveredTiles, mood, now);
        });
        ctx.restore();
    }

    private drawBreathingWash(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        bounds: ScreenBounds,
        mood: AtmosphereMood,
        now: number,
        quality: RenderQualityProfile,
    ) {
        const breath = 0.72 + (Math.sin(now / 5200) * 0.08);
        const cool: GlowColor = [
            Math.round(96 + (mood.water * 48) + (mood.cold * 28)),
            Math.round(158 + (mood.lush * 26) + (mood.water * 34)),
            Math.round(154 + (mood.water * 58) + (mood.cold * 44)),
        ];
        const warm: GlowColor = [
            Math.round(184 + (mood.warm * 46)),
            Math.round(156 + (mood.lush * 18) + (mood.warm * 34)),
            Math.round(98 + (mood.water * 16) + (mood.warm * 24)),
        ];
        const radius = Math.max(bounds.width, bounds.height) * (quality.expensiveAtmosphere ? 0.72 : 0.58);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const coolGlow = ctx.createRadialGradient(
            bounds.centerX - (bounds.width * 0.22),
            bounds.centerY - (bounds.height * 0.2),
            0,
            bounds.centerX - (bounds.width * 0.22),
            bounds.centerY - (bounds.height * 0.2),
            radius,
        );
        coolGlow.addColorStop(0, toRgba(cool, (0.044 + (mood.water * 0.026) + (mood.lush * 0.014)) * breath));
        coolGlow.addColorStop(0.56, toRgba(cool, 0.018 * breath));
        coolGlow.addColorStop(1, toRgba(cool, 0));
        ctx.fillStyle = coolGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const warmGlow = ctx.createRadialGradient(
            bounds.centerX + (bounds.width * 0.24),
            bounds.minY + (bounds.height * 0.12),
            0,
            bounds.centerX + (bounds.width * 0.24),
            bounds.minY + (bounds.height * 0.12),
            radius * 0.78,
        );
        warmGlow.addColorStop(0, toRgba(warm, (0.04 + (mood.warm * 0.034)) * breath));
        warmGlow.addColorStop(0.6, toRgba(warm, 0.012 * breath));
        warmGlow.addColorStop(1, toRgba(warm, 0));
        ctx.fillStyle = warmGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.restore();
    }

    private drawSunShafts(
        ctx: CanvasRenderingContext2D,
        _canvas: HTMLCanvasElement,
        bounds: ScreenBounds,
        mood: AtmosphereMood,
        now: number,
        quality: RenderQualityProfile,
    ) {
        const beamCount = quality.expensiveAtmosphere ? 4 : 2;
        const beamAlpha = quality.expensiveAtmosphere ? 0.05 : 0.034;
        const beamColor: GlowColor = [
            Math.round(236 + (mood.warm * 16)),
            Math.round(218 + (mood.lush * 12)),
            Math.round(166 + (mood.water * 22)),
        ];
        const pad = Math.max(bounds.width, bounds.height) * 0.28;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = `blur(${quality.expensiveAtmosphere ? 10 : 7}px)`;
        ctx.translate(bounds.centerX, bounds.centerY);
        ctx.rotate(-0.18);
        ctx.translate(-bounds.centerX, -bounds.centerY);

        for (let i = 0; i < beamCount; i++) {
            const phase = (now / (8200 + (i * 1300))) + (i * 1.73);
            const drift = Math.sin(phase) * 24;
            const beamWidth = bounds.width * (0.12 + (i * 0.018));
            const x = bounds.minX + ((bounds.width / Math.max(1, beamCount - 0.4)) * i) + drift;
            const beam = ctx.createLinearGradient(x - beamWidth, bounds.minY, x + beamWidth, bounds.maxY);
            beam.addColorStop(0, toRgba(beamColor, 0));
            beam.addColorStop(0.42, toRgba(beamColor, beamAlpha * (0.78 + (mood.warm * 0.35))));
            beam.addColorStop(0.58, toRgba([180, 238, 218], beamAlpha * (0.34 + (mood.lush * 0.18))));
            beam.addColorStop(1, toRgba(beamColor, 0));
            ctx.fillStyle = beam;
            ctx.fillRect(x - beamWidth, bounds.minY - pad, beamWidth * 2, bounds.height + (pad * 2));
        }

        ctx.restore();
    }

    private drawLivingTileGlints(
        ctx: CanvasRenderingContext2D,
        context: RenderPassContext,
        tiles: readonly TerrainTileRenderItem[],
        mood: AtmosphereMood,
        now: number,
    ) {
        const candidates = tiles.filter((tile) => tile.terrainType && GLOW_TERRAINS.has(tile.terrainType));
        if (!candidates.length) {
            return;
        }

        const dpr = context.viewport.dpr;
        const cap = context.quality.expensiveAtmosphere ? 70 : 38;
        const step = Math.max(1, Math.floor(candidates.length / cap));

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = 'blur(0.45px)';

        for (let i = 0; i < candidates.length; i += step) {
            const tile = candidates[i]!;
            const seed = this.hashTile(tile);
            const phase = ((now * 0.00017) + this.seedUnit(seed, 3)) % 1;
            const pulse = Math.max(0, Math.sin(phase * Math.PI * 2));
            if (pulse < 0.38) {
                continue;
            }

            const screen = HexProjection.worldToScreen(tile.worldX, tile.worldY, context.viewport);
            const offsetX = (this.seedUnit(seed, 11) - 0.5) * context.config.tileDrawSize * 0.48 * dpr;
            const offsetY = (this.seedUnit(seed, 17) - 0.5) * context.config.tileDrawSize * 0.34 * dpr;
            const x = (screen.x * dpr) + offsetX;
            const y = (screen.y * dpr) + offsetY;
            const color = this.getGlintColor(tile, mood);
            const radius = (2.8 + (this.seedUnit(seed, 23) * 5.8)) * dpr;
            const alpha = (0.026 + (this.seedUnit(seed, 29) * 0.04)) * pulse;

            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
            glow.addColorStop(0, toRgba(color, alpha * 1.4));
            glow.addColorStop(0.45, toRgba(color, alpha * 0.58));
            glow.addColorStop(1, toRgba(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            if (tile.terrainType === 'water') {
                ctx.globalAlpha = alpha * 2.2;
                ctx.strokeStyle = toRgba([224, 255, 255], 0.55);
                ctx.lineWidth = Math.max(0.8, dpr);
                ctx.beginPath();
                ctx.moveTo(x - (radius * 0.9), y + (radius * 0.1));
                ctx.quadraticCurveTo(x, y - (radius * 0.32), x + (radius * 0.95), y + (radius * 0.06));
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        ctx.restore();
    }

    private getDiscoveredScreenBounds(
        context: RenderPassContext,
        tiles: readonly TerrainTileRenderItem[],
    ): ScreenBounds | null {
        const dpr = context.viewport.dpr;
        const pad = context.config.tileDrawSize * dpr * 2;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const tile of tiles) {
            const screen = HexProjection.worldToScreen(tile.worldX, tile.worldY, context.viewport);
            const x = screen.x * dpr;
            const y = screen.y * dpr;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return null;
        }

        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        };
    }

    private withDiscoveredClip(
        ctx: CanvasRenderingContext2D,
        context: RenderPassContext,
        tiles: readonly TerrainTileRenderItem[],
        draw: () => void,
    ) {
        const dpr = context.viewport.dpr;
        const hexSize = context.config.hexSize * dpr;
        const tileDrawSize = context.config.tileDrawSize * dpr;

        ctx.save();
        ctx.beginPath();
        for (const tile of tiles) {
            const screen = HexProjection.worldToScreen(tile.worldX, tile.worldY, context.viewport);
            this.drawHexPath(ctx, screen.x * dpr, screen.y * dpr, hexSize, tileDrawSize);
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

    private sampleMood(tiles: readonly TerrainTileRenderItem[]): AtmosphereMood {
        const mood: AtmosphereMood = {
            lush: 0,
            water: 0,
            warm: 0,
            cold: 0,
        };
        const step = Math.max(1, Math.floor(tiles.length / 140));
        let samples = 0;

        for (let i = 0; i < tiles.length; i += step) {
            const terrain = tiles[i]?.terrainType;
            if (!terrain) continue;

            if (terrain === 'plains' || terrain === 'forest' || terrain === 'grain' || terrain === 'towncenter') {
                mood.lush += terrain === 'forest' ? 1.2 : terrain === 'grain' ? 0.72 : 0.9;
            }
            if (terrain === 'water') mood.water += 1.15;
            if (terrain === 'grain' || terrain === 'dirt' || terrain === 'dessert' || terrain === 'towncenter') mood.warm += 0.86;
            if (terrain === 'snow' || terrain === 'mountain' || terrain === 'water') mood.cold += terrain === 'snow' ? 1.1 : 0.42;
            samples += 1;
        }

        if (!samples) {
            return mood;
        }

        return {
            lush: Math.min(1, mood.lush / samples),
            water: Math.min(1, mood.water / samples),
            warm: Math.min(1, mood.warm / samples),
            cold: Math.min(1, mood.cold / samples),
        };
    }

    private getGlintColor(tile: TerrainTileRenderItem, mood: AtmosphereMood): GlowColor {
        switch (tile.terrainType) {
            case 'water':
                return [170, 236, 255];
            case 'forest':
                return [166, 224, 128];
            case 'grain':
                return [255, 228, 126];
            case 'snow':
                return [238, 252, 255];
            case 'towncenter':
                return [255, 218, 146];
            default:
                return mood.water > mood.warm ? [180, 242, 210] : [226, 238, 156];
        }
    }

    private hashTile(tile: TerrainTileRenderItem) {
        let hash = 2166136261;
        const value = `${tile.tileId}:${tile.q},${tile.r}:${tile.terrainType ?? ''}`;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    private seedUnit(seed: number, salt: number) {
        let hash = seed ^ Math.imul(salt, 2246822519);
        hash = Math.imul(hash ^ (hash >>> 15), 3266489917);
        return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
    }
}
