import { axialKey, tileIndex } from '../../world';
import { heroes } from '../../../store/heroStore';
import { selectedHeroId } from '../../../store/uiStore';
import { heroAnimationSet, heroAnimName, resolveActivity, shouldFlip } from '../../heroSprite';
import { taskStore } from '../../../store/taskStore';
import { isHeroWorkingTask } from '../../../shared/game/heroTaskState';
import { camera, hexDistance } from '../../camera';
import type { Hero } from '../../types/Hero';

export interface HeroOverlayRecord {
    source: CanvasImageSource;
    x: number;
    y: number;
    width: number;
    height: number;
    q: number;
    r: number;
    opacity: number;
    z: number;
}

interface HeroRendererDependencies {
    queueMissingHeroAssets(): void;
    heroImagesLoaded: boolean;
    heroImages: Record<string, HTMLImageElement>;
    heroLayouts: Map<string, Record<string, { x: number; y: number }>>;
    setHeroLayouts(next: Map<string, Record<string, { x: number; y: number }>>): void;
    setSortedHeroes(next: Hero[]): void;
    setLastHeroFrame(frameIndex: number): void;
    computeTileHeroOffsets(list: Hero[]): Record<string, { x: number; y: number }>;
    getActorOpacity(dist: number, applyCameraFade: boolean): number;
    getHeroInterpolatedPixelPosition(hero: Hero, now: number): { x: number; y: number };
    hasMovementStarted(hero: Hero, now: number): boolean;
    isDustyWalkingTerrain(tile: NonNullable<(typeof tileIndex)[string]>, key: string): boolean;
    drawWalkingDust(
        ctx: CanvasRenderingContext2D,
        hero: Hero,
        interp: { x: number; y: number },
        pos: { x: number; y: number },
        opacity: number,
        now: number,
        tile: NonNullable<(typeof tileIndex)[string]>,
        tileKey: string,
    ): void;
    drawHeroSelectionAura(
        ctx: CanvasRenderingContext2D,
        interp: { x: number; y: number },
        pos: { x: number; y: number },
        opacity: number,
        selected: boolean,
        now: number,
    ): void;
    getTileImageKey(tile: NonNullable<(typeof tileIndex)[string]>): string | null;
    heroFrameSize: number;
    heroZoom: number;
    heroShadowOpacity: number;
    heroShadowWidthFactor: number;
    heroShadowHeightFactor: number;
    heroShadowYOffset: number;
    currentRenderQuality: {
        enableHeroAuras: boolean;
    };
    resourceIconMap: Record<string, string>;
    heroAnimStart: number;
}

export class HeroRenderer {
    drawHeroes(
        ctx: CanvasRenderingContext2D,
        hoveredHero: Hero | null,
        overlayRecords: readonly HeroOverlayRecord[],
        applyCameraFade: boolean,
        now: number,
        deps: HeroRendererDependencies,
    ) {
        deps.queueMissingHeroAssets();

        if (!deps.heroImagesLoaded) {
            for (const ov of overlayRecords) {
                ctx.globalAlpha = ov.opacity;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(ov.source, ov.x, ov.y, ov.width, ov.height);
            }
            ctx.globalAlpha = 1;
            return;
        }

        const radius = camera.radius + 1;
        const layoutMap = new Map<string, Hero[]>();
        for (const hero of heroes) {
            const key = axialKey(hero.q, hero.r);
            let list = layoutMap.get(key);
            if (!list) {
                list = [];
                layoutMap.set(key, list);
            }
            list.push(hero);
        }

        const nextLayouts = new Map<string, Record<string, { x: number; y: number }>>();
        for (const [key, list] of layoutMap) {
            nextLayouts.set(key, deps.computeTileHeroOffsets(list));
        }
        deps.setHeroLayouts(nextLayouts);

        const renderRecords: Array<{
            hero: Hero;
            dist: number;
            img: HTMLImageElement;
            pos: { x: number; y: number };
            interp: { x: number; y: number };
            destX: number;
            destY: number;
            opacity: number;
            animRow: number;
            frameIndex: number;
        }> = [];

        for (const hero of heroes) {
            const dist = hexDistance(camera, hero);
            if (dist > radius) continue;

            const img = deps.heroImages[hero.avatar];
            if (!img) continue;

            const layout = nextLayouts.get(axialKey(hero.q, hero.r)) || {};
            const pos = layout[hero.id] || { x: 0, y: 0 };
            const opacity = deps.getActorOpacity(dist, applyCameraFade);
            const interp = deps.getHeroInterpolatedPixelPosition(hero, now);
            const x = interp.x;
            const y = interp.y;
            const destX = x - (deps.heroFrameSize * deps.heroZoom) / 2 + pos.x - (deps.heroFrameSize / 2);
            const destY = y - (deps.heroFrameSize * 2) + (deps.heroFrameSize / 2) + pos.y;
            const movementStarted = deps.hasMovementStarted(hero, now);
            let remaining = movementStarted && hero.movement ? hero.movement.path.length : 0;
            let activity = resolveActivity(remaining);
            if (!hero.movement && hero.currentTaskId) {
                const inst = taskStore.taskIndex[hero.currentTaskId];
                if (isHeroWorkingTask(hero, inst)) activity = 'attack';
            }

            const animName = heroAnimName(activity, hero.facing);
            const anim = heroAnimationSet.get(animName) || heroAnimationSet.get('idleDown')!;
            const elapsed = now - deps.heroAnimStart;
            const frames = anim.frames;
            const frameDuration = anim.frameDuration;
            const cycle = frames * frameDuration + (anim.cooldown || 0);
            const inCycle = elapsed % cycle;
            const frameIndex = frames <= 1 ? 0 : (inCycle >= frames * frameDuration ? frames - 1 : Math.floor(inCycle / frameDuration));
            deps.setLastHeroFrame(frameIndex);

            renderRecords.push({
                hero,
                dist,
                img,
                pos,
                interp,
                destX,
                destY,
                opacity,
                animRow: anim.row,
                frameIndex,
            });
        }

        type LayerRec = { kind: 'overlay'; ov: HeroOverlayRecord } | { kind: 'hero'; rec: typeof renderRecords[number] };
        const layers: LayerRec[] = [];
        for (const ov of overlayRecords) layers.push({ kind: 'overlay', ov });
        for (const rec of renderRecords) layers.push({ kind: 'hero', rec });

        layers.sort((a, b) => {
            const ar = a.kind === 'overlay' ? a.ov.r : a.rec.hero.r;
            const br = b.kind === 'overlay' ? b.ov.r : b.rec.hero.r;
            if (ar !== br) return ar - br;
            const aq = a.kind === 'overlay' ? a.ov.q : a.rec.hero.q;
            const bq = b.kind === 'overlay' ? b.ov.q : b.rec.hero.q;
            if (aq !== bq) return aq - bq;
            if (a.kind === 'overlay' && b.kind === 'overlay' && a.ov.z !== b.ov.z) return a.ov.z - b.ov.z;
            if (a.kind !== b.kind) return a.kind === 'overlay' ? -1 : 1;
            if (a.kind === 'hero' && b.kind === 'hero') return a.rec.hero.id.localeCompare(b.rec.hero.id);
            return 0;
        });

        deps.setSortedHeroes(layers.filter((layer): layer is Extract<LayerRec, { kind: 'hero' }> => layer.kind === 'hero').map((layer) => layer.rec.hero));

        for (const layer of layers) {
            if (layer.kind === 'overlay') {
                const { ov } = layer;
                ctx.globalAlpha = ov.opacity;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(ov.source, ov.x, ov.y, ov.width, ov.height);
                continue;
            }

            const { hero, img, pos, interp, destX, destY, opacity, frameIndex, animRow } = layer.rec;
            const x = interp.x;
            const y = interp.y;

            ctx.save();
            const shadowScale = deps.heroZoom;
            const shadowW = deps.heroFrameSize * shadowScale * deps.heroShadowWidthFactor;
            const shadowH = deps.heroFrameSize * shadowScale * deps.heroShadowHeightFactor;
            const baseX = x + pos.x - 15;
            const baseY = y + pos.y + deps.heroFrameSize * deps.heroShadowYOffset;
            ctx.globalAlpha = opacity * deps.heroShadowOpacity;
            ctx.translate(baseX, baseY);
            ctx.beginPath();
            ctx.ellipse(0, 0, shadowW / 2.8, shadowH / 2.2, 0, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(0, 0, shadowH * 0.05, 0, 0, shadowW / 2);
            grad.addColorStop(0, 'rgba(0,0,0,0.8)');
            grad.addColorStop(0.8, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();

            const tile = tileIndex[axialKey(hero.q, hero.r)];
            const tileKey = tile ? (deps.getTileImageKey(tile) ?? tile.terrain ?? '') : '';
            if (hero.movement && tile && deps.isDustyWalkingTerrain(tile, tileKey)) {
                deps.drawWalkingDust(ctx, hero, interp, pos, opacity, now, tile, tileKey);
            }

            const selected = selectedHeroId.value === hero.id;
            const hovered = hoveredHero?.id === hero.id;
            if (selected || (deps.currentRenderQuality.enableHeroAuras && hovered)) {
                deps.drawHeroSelectionAura(ctx, interp, pos, opacity, selected, now);
            }

            ctx.globalAlpha = opacity;
            ctx.imageSmoothingEnabled = false;
            const frameSize = deps.heroFrameSize;
            const sx = frameIndex * frameSize;
            const sy = animRow * frameSize;
            if (shouldFlip(hero.facing)) {
                ctx.save();
                ctx.translate(destX + frameSize * deps.heroZoom, destY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, frameSize * deps.heroZoom, frameSize * deps.heroZoom);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy, frameSize, frameSize, destX, destY, frameSize * deps.heroZoom, frameSize * deps.heroZoom);
            }

            if (hero.carryingPayload) {
                ctx.save();
                ctx.globalAlpha = opacity;
                const iconY = destY;
                const iconX = destX + (deps.heroFrameSize * deps.heroZoom) / 2;
                ctx.beginPath();
                ctx.arc(iconX, iconY, 14, 0, Math.PI * 2);
                ctx.fillStyle = hero.carryingPayload.amount > 0 ? 'rgba(29,29,33,0.95)' : 'rgba(122,122,122,0.55)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = hero.carryingPayload.amount > 0 ? 'rgba(70,70,70,0.9)' : 'rgba(75,0,0,0.85)';
                ctx.stroke();
                ctx.font = '700 16px system-ui';
                ctx.fillStyle = '#fff6d7';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(deps.resourceIconMap[hero.carryingPayload.type] ?? '?', iconX, iconY + 1);
                ctx.restore();
            }
        }

        ctx.globalAlpha = 1;
    }
}
