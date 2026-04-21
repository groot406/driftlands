import { axialKey, tileIndex } from '../../world';
import { heroes } from '../../../store/heroStore';
import { settlers } from '../../../store/settlerStore';
import { selectedHeroId } from '../../../store/uiStore';
import { heroAnimationSet, heroAnimName, resolveActivity, shouldFlip } from '../../heroSprite';
import { taskStore } from '../../../store/taskStore';
import { isHeroWorkingTask } from '../../../shared/game/heroTaskState';
import { isHeroSurveyingScoutResource } from '../../../shared/game/scoutResources';
import { camera, hexDistance } from '../../camera';
import { SETTLER_FRAME_SIZE, settlerAnimationSet, settlerAnimName } from '../../settlerSprite';
import type { Hero } from '../../types/Hero';
import type { Settler } from '../../types/Settler';
import { getSettlerDisplayName } from '../../../shared/game/settlerNames.ts';
import {
    computeTileSettlerOffsets,
    getSettlerRenderCoords,
    getSettlerRenderFacing,
    getSettlerInterpolatedPixelPosition,
    isSettlerVisibleOnMap,
} from './settlerRender';

const SETTLER_PALETTES = [
    { cloak: '#5b6b8c', trim: '#d7c6a2', cap: '#3d4f74' },
    { cloak: '#7f5539', trim: '#e3c39a', cap: '#5e3b2c' },
    { cloak: '#5f7a43', trim: '#ead7a7', cap: '#42562d' },
    { cloak: '#8a5a74', trim: '#f0c0c8', cap: '#5e3e56' },
    { cloak: '#4d7a74', trim: '#d6efe5', cap: '#31524f' },
];

const TOOL_FRAME_SIZE = 48;
const SETTLER_SPRITE_ZOOM = 2;
type HeroWorkTool = 'axe' | 'fishing_rod';
type FacingOffsetMap = Record<Hero['facing'], { x: number; y: number }>;

const TOOL_ANCHOR_OFFSET_BY_TOOL: Record<HeroWorkTool, FacingOffsetMap> = {
    axe: {
        right: { x: 0, y: 10 },
        left: { x: 0, y: 10 },
        up: { x: 0, y: 10 },
        down: { x: 0, y: 10 },
    },
    fishing_rod: {
        right: { x: 0, y: 0 },
        left: { x: 0, y: 0 },
        up: { x: 0, y: 0 },
        down: { x: 0, y: 0 },
    },
};
const AXE_WORK_TASKS = new Set([
    'breakDirtRock',
    'buildBridge',
    'buildRoad',
    'buildTunnel',
    'chopWood',
    'clearRocks',
    'convertToGrass',
    'dig',
    'dismantle',
    'gatherTimber',
    'mineOre',
    'removeTrunks',
    'tillLand',
]);

function getSettlerPalette(seed: number) {
    return SETTLER_PALETTES[Math.abs(seed) % SETTLER_PALETTES.length] ?? SETTLER_PALETTES[0]!;
}

function isSettlerWalking(settler: Settler) {
    return !!settler.movement
        || settler.activity === 'commuting_home'
        || settler.activity === 'commuting_work'
        || settler.activity === 'fetching_food'
        || settler.activity === 'fetching_input'
        || settler.activity === 'delivering';
}

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
    toolImagesLoaded: boolean;
    toolImages: Record<string, HTMLImageElement>;
    settlerImagesLoaded: boolean;
    settlerImages: Record<string, HTMLImageElement>;
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
    private settlerHoverAlphaById = new Map<string, number>();
    private lastSettlerHoverUpdateMs = 0;

    drawHeroes(
        ctx: CanvasRenderingContext2D,
        hoveredHero: Hero | null,
        hoveredSettler: { id: string } | null,
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

        const settlerLayoutMap = new Map<string, Settler[]>();
        for (const settler of settlers) {
            if (!isSettlerVisibleOnMap(settler)) {
                continue;
            }
            const renderCoords = getSettlerRenderCoords(settler);
            const key = axialKey(renderCoords.q, renderCoords.r);
            let list = settlerLayoutMap.get(key);
            if (!list) {
                list = [];
                settlerLayoutMap.set(key, list);
            }
            list.push(settler);
        }

        const settlerLayouts = new Map<string, Record<string, { x: number; y: number }>>();
        for (const [key, list] of settlerLayoutMap) {
            settlerLayouts.set(key, computeTileSettlerOffsets(list));
        }

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
            workTool: HeroWorkTool | null;
        }> = [];
        const settlerRecords: Array<{
            settler: Settler;
            pos: { x: number; y: number };
            interp: { x: number; y: number };
            opacity: number;
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
            let workTool: HeroWorkTool | null = null;
            if (!hero.movement && hero.currentTaskId) {
                const inst = taskStore.taskIndex[hero.currentTaskId];
                if (inst && isHeroWorkingTask(hero, inst)) {
                    if (inst.type === 'fishAtDock') {
                        activity = 'idle';
                        workTool = 'fishing_rod';
                    } else {
                        activity = 'attack';
                        workTool = AXE_WORK_TASKS.has(inst.type) ? 'axe' : null;
                    }
                }
            } else if (!hero.movement && isHeroSurveyingScoutResource(hero, now)) {
                activity = 'attack';
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
                workTool,
            });
        }

        for (const settler of settlers) {
            if (!isSettlerVisibleOnMap(settler)) {
                continue;
            }
            const dist = hexDistance(camera, settler);
            if (dist > radius) continue;

            const renderCoords = getSettlerRenderCoords(settler);
            const layout = settlerLayouts.get(axialKey(renderCoords.q, renderCoords.r)) || {};
            const pos = layout[settler.id] || { x: -6, y: 7 };

            settlerRecords.push({
                settler,
                pos,
                interp: getSettlerInterpolatedPixelPosition(settler, now),
                opacity: deps.getActorOpacity(dist, applyCameraFade),
            });
        }

        const hoverDt = this.lastSettlerHoverUpdateMs > 0
            ? Math.max(0, Math.min(96, now - this.lastSettlerHoverUpdateMs))
            : 16;
        this.lastSettlerHoverUpdateMs = now;

        const trackedHoverIds = new Set<string>([
            ...this.settlerHoverAlphaById.keys(),
            ...settlerRecords.map((record) => record.settler.id),
        ]);
        if (hoveredSettler?.id) {
            trackedHoverIds.add(hoveredSettler.id);
        }

        for (const settlerId of trackedHoverIds) {
            const current = this.settlerHoverAlphaById.get(settlerId) ?? 0;
            const target = hoveredSettler?.id === settlerId ? 1 : 0;
            const easing = target > current
                ? 1 - Math.exp(-(hoverDt / 1000) * 20)
                : 1 - Math.exp(-(hoverDt / 1000) * 12);
            const next = current + ((target - current) * easing);
            if (next <= 0.02 && target <= 0) {
                this.settlerHoverAlphaById.delete(settlerId);
                continue;
            }

            this.settlerHoverAlphaById.set(settlerId, Math.max(0, Math.min(1, next)));
        }

        type LayerRec =
            | { kind: 'overlay'; ov: HeroOverlayRecord }
            | { kind: 'hero'; rec: typeof renderRecords[number] }
            | { kind: 'settler'; rec: typeof settlerRecords[number] };
        const layers: LayerRec[] = [];
        for (const ov of overlayRecords) layers.push({ kind: 'overlay', ov });
        for (const rec of settlerRecords) layers.push({ kind: 'settler', rec });
        for (const rec of renderRecords) layers.push({ kind: 'hero', rec });

        layers.sort((a, b) => {
            const ar = a.kind === 'overlay'
                ? a.ov.r
                : a.kind === 'hero'
                    ? a.rec.hero.r
                    : getSettlerRenderCoords(a.rec.settler).r;
            const br = b.kind === 'overlay'
                ? b.ov.r
                : b.kind === 'hero'
                    ? b.rec.hero.r
                    : getSettlerRenderCoords(b.rec.settler).r;
            if (ar !== br) return ar - br;
            const aq = a.kind === 'overlay'
                ? a.ov.q
                : a.kind === 'hero'
                    ? a.rec.hero.q
                    : getSettlerRenderCoords(a.rec.settler).q;
            const bq = b.kind === 'overlay'
                ? b.ov.q
                : b.kind === 'hero'
                    ? b.rec.hero.q
                    : getSettlerRenderCoords(b.rec.settler).q;
            if (aq !== bq) return aq - bq;
            if (a.kind === 'overlay' && b.kind === 'overlay' && a.ov.z !== b.ov.z) return a.ov.z - b.ov.z;
            if (a.kind !== b.kind) {
                const order = { overlay: 0, settler: 1, hero: 2 } as const;
                return order[a.kind] - order[b.kind];
            }
            if (a.kind === 'hero' && b.kind === 'hero') return a.rec.hero.id.localeCompare(b.rec.hero.id);
            if (a.kind === 'settler' && b.kind === 'settler') return a.rec.settler.id.localeCompare(b.rec.settler.id);
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

            if (layer.kind === 'settler') {
                const { settler, pos, interp, opacity } = layer.rec;
                const palette = getSettlerPalette(settler.appearanceSeed);
                const hoverAlpha = this.settlerHoverAlphaById.get(settler.id) ?? 0;
                const walking = isSettlerWalking(settler);
                const working = settler.activity === 'working' || settler.activity === 'repairing';
                const idling = !walking && !working;
                const renderFacing = getSettlerRenderFacing(settler, now);
                const phase = (now + settler.appearanceSeed) / 95;
                const walkBeat = walking ? Math.sin(phase) : 0;
                const walkBounce = walking ? Math.cos(phase * 2) : 0;
                const workBeat = working ? Math.sin(phase * 1.55) : 0;
                const idleBeat = idling ? Math.sin(phase * 0.38) : 0;
                const idleDrift = idling ? Math.cos(phase * 0.23) : 0;
                const sideSign = renderFacing === 'left' ? -1 : renderFacing === 'right' ? 1 : 0;
                const sideFacing = sideSign !== 0;
                const facingUp = renderFacing === 'up';
                const facingDown = renderFacing === 'down';
                const bodyWidth = sideFacing ? 8 : 9;
                const bodyHeight = 5;
                const bodyBob = walking
                    ? (walkBounce * 0.55)
                    : working
                        ? (Math.abs(workBeat) * 0.9)
                        : ((idleBeat * 0.95) + (idleDrift * 0.35));
                const swayPx = walking
                    ? Math.round(Math.cos(phase) * 0.7)
                    : working
                        ? Math.round(workBeat * 0.75)
                        : Math.round((idleBeat * 0.9) + (idleDrift * 0.9));
                const groundX = Math.round(interp.x + pos.x);
                const groundY = Math.round(interp.y + pos.y + bodyBob);
                const shadowY = groundY + 1;
                const bodyX = groundX - Math.floor(bodyWidth / 2) + swayPx + (sideFacing ? sideSign : 0);
                const bodyY = groundY - 13;
                const legTopY = bodyY + 10;
                const stridePx = walking ? Math.round(walkBeat * (sideFacing ? 1.9 : 1.45)) : 0;
                const leftFootLift = walking
                    ? Math.max(0, sideFacing ? Math.round(-walkBeat * 1.9) : -stridePx)
                    : working
                        ? Math.max(0, Math.round(workBeat * 1.4))
                        : 0;
                const rightFootLift = walking
                    ? Math.max(0, sideFacing ? Math.round(walkBeat * 1.9) : stridePx)
                    : working
                        ? Math.max(0, Math.round(-workBeat * 1.4))
                        : 0;
                const leftFootX = sideFacing
                    ? bodyX + 1 + (sideSign > 0 ? Math.max(0, stridePx) : Math.min(0, stridePx))
                    : bodyX + 1 + Math.max(0, stridePx);
                const rightFootX = sideFacing
                    ? bodyX + bodyWidth - 3 + (sideSign > 0 ? Math.min(0, stridePx) : Math.max(0, stridePx))
                    : bodyX + bodyWidth - 3 + Math.min(0, stridePx);
                const leftFootY = groundY - 1 - leftFootLift;
                const rightFootY = groundY - 1 - rightFootLift;
                const leftLegHeight = Math.max(2, leftFootY - legTopY + 1);
                const rightLegHeight = Math.max(2, rightFootY - legTopY + 1);
                const armSwing = walking
                    ? Math.round(-walkBeat * 1.6)
                    : working
                        ? Math.round(workBeat * 2.2)
                        : Math.round(idleBeat * 0.6);
                const frontArmLift = working ? Math.max(0, Math.round(workBeat * 2.5)) : Math.max(0, -armSwing);
                const rearArmLift = working ? Math.max(0, Math.round(-workBeat * 1.2)) : Math.max(0, armSwing);
                const rearArmX = sideFacing
                    ? (sideSign > 0 ? bodyX + 1 : bodyX + bodyWidth - 2)
                    : bodyX + 1;
                const frontArmX = sideFacing
                    ? (sideSign > 0 ? bodyX + bodyWidth - 1 : bodyX - 1)
                    : bodyX + bodyWidth - 2;
                const rearArmY = bodyY + 7 + rearArmLift;
                const frontArmY = bodyY + 7 - frontArmLift;
                const headX = sideFacing ? bodyX + (sideSign > 0 ? 3 : 1) : bodyX + 2;
                const headY = bodyY + (facingUp ? 1 : 3) - (working ? Math.max(0, Math.round(workBeat)) : 0);
                const faceX = sideFacing ? bodyX + (sideSign > 0 ? 4 : 1) : bodyX + 2;
                const faceWidth = sideFacing ? 2 : 5;
                const payloadX = sideFacing
                    ? (sideSign > 0 ? bodyX + bodyWidth : bodyX - 3)
                    : bodyX + bodyWidth - 1;
                const payloadY = bodyY + 8 - frontArmLift;
                const settlerSprite = deps.settlerImagesLoaded ? deps.settlerImages.default : undefined;

                if (settlerSprite) {
                    const activity = walking ? 'walk' : working ? 'attack' : 'idle';
                    const animName = settlerAnimName(activity, renderFacing);
                    const anim = settlerAnimationSet.get(animName) || settlerAnimationSet.get('idleDown')!;
                    const elapsed = now + settler.appearanceSeed - deps.heroAnimStart;
                    const frames = anim.frames;
                    const frameDuration = anim.frameDuration;
                    const cycle = frames * frameDuration + (anim.cooldown || 0);
                    const inCycle = elapsed % cycle;
                    const frameIndex = frames <= 1 ? 0 : (inCycle >= frames * frameDuration ? frames - 1 : Math.floor(inCycle / frameDuration));
                    const spriteWidth = SETTLER_FRAME_SIZE * SETTLER_SPRITE_ZOOM;
                    const spriteHeight = SETTLER_FRAME_SIZE * SETTLER_SPRITE_ZOOM;
                    const spriteX = groundX - (spriteWidth / 2);
                    const spriteY = groundY - 42;
                    const sx = frameIndex * SETTLER_FRAME_SIZE;
                    const sy = anim.row * SETTLER_FRAME_SIZE;

                    ctx.save();
                    ctx.globalAlpha = opacity * 0.38;
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.beginPath();
                    ctx.ellipse(
                        groundX,
                        shadowY,
                        walking ? 4.2 : working ? 4.55 : 5.05,
                        walking ? 1.4 : working ? 1.6 : 1.9,
                        0,
                        0,
                        Math.PI * 2,
                    );
                    ctx.fill();
                    ctx.restore();

                    if (hoverAlpha > 0.01) {
                        ctx.save();
                        ctx.globalAlpha = opacity * hoverAlpha * 0.95;
                        ctx.beginPath();
                        ctx.ellipse(groundX, shadowY - 1, 6.1 + (hoverAlpha * 0.7), 2.45 + (hoverAlpha * 0.35), 0, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
                        ctx.fill();
                        ctx.lineWidth = 1.5;
                        ctx.strokeStyle = 'rgba(186, 230, 253, 0.95)';
                        ctx.stroke();

                        const label = getSettlerDisplayName(settler.id, settler.nameSeed);
                        ctx.font = '600 9px system-ui, sans-serif';
                        const textWidth = ctx.measureText(label).width;
                        const labelWidth = Math.ceil(textWidth) + 10;
                        const labelHeight = 14;
                        const labelX = Math.round(groundX - (labelWidth / 2));
                        const labelY = Math.round(spriteY + 8 - (hoverAlpha * 4));
                        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                        ctx.beginPath();
                        ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 7);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = '#e0f2fe';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, groundX, labelY + (labelHeight / 2) + 0.5);
                        ctx.restore();
                    }

                    ctx.save();
                    ctx.globalAlpha = opacity;
                    ctx.imageSmoothingEnabled = false;
                    if (shouldFlip(renderFacing)) {
                        ctx.translate(spriteX + spriteWidth, spriteY);
                        ctx.scale(-1, 1);
                        ctx.drawImage(settlerSprite, sx, sy, SETTLER_FRAME_SIZE, SETTLER_FRAME_SIZE, 0, 0, spriteWidth, spriteHeight);
                    } else {
                        ctx.drawImage(settlerSprite, sx, sy, SETTLER_FRAME_SIZE, SETTLER_FRAME_SIZE, spriteX, spriteY, spriteWidth, spriteHeight);
                    }

                    if (settler.carryingKind) {
                        ctx.fillStyle = settler.carryingKind === 'output' ? '#f4d35e' : '#8ec07c';
                        ctx.fillRect(groundX + (sideFacing && sideSign < 0 ? -11 : 8), groundY - 16, 4, 4);
                    }
                    ctx.restore();
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = opacity * 0.38;
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.beginPath();
                ctx.ellipse(
                    groundX,
                    shadowY,
                    walking ? 4.2 : working ? 4.55 : 5.05,
                    walking ? 1.4 : working ? 1.6 : 1.9,
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
                ctx.restore();

                if (hoverAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = opacity * hoverAlpha * 0.95;
                    ctx.beginPath();
                    ctx.ellipse(groundX, shadowY - 1, 6.1 + (hoverAlpha * 0.7), 2.45 + (hoverAlpha * 0.35), 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = 'rgba(186, 230, 253, 0.95)';
                    ctx.stroke();

                    const label = getSettlerDisplayName(settler.id, settler.nameSeed);
                    ctx.font = '600 9px system-ui, sans-serif';
                    const textWidth = ctx.measureText(label).width;
                    const labelWidth = Math.ceil(textWidth) + 10;
                    const labelHeight = 14;
                    const labelX = Math.round(groundX - (labelWidth / 2));
                    const labelY = Math.round(bodyY - 7 - (hoverAlpha * 4));
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                    ctx.beginPath();
                    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 7);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = '#e0f2fe';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, groundX, labelY + (labelHeight / 2) + 0.5);
                    ctx.restore();
                }

                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.fillStyle = facingUp ? 'rgba(17,24,39,0.75)' : 'rgba(51, 65, 85, 0.65)';
                ctx.fillRect(rearArmX, rearArmY, 1, sideFacing ? 3 : 4);
                ctx.fillStyle = '#2a2320';
                ctx.fillRect(bodyX + 2, legTopY, 1, leftLegHeight);
                ctx.fillRect(bodyX + bodyWidth - 3, legTopY, 1, rightLegHeight);
                ctx.fillRect(leftFootX, leftFootY, 2, 1);
                ctx.fillRect(rightFootX, rightFootY, 2, 1);
                ctx.fillStyle = palette.cloak;
                ctx.fillRect(bodyX + 1, bodyY + 6, bodyWidth - 2, 1);
                ctx.fillRect(bodyX, bodyY + 7, bodyWidth, bodyHeight);
                ctx.fillStyle = palette.trim;
                if (facingDown) {
                    ctx.fillRect(bodyX + 1, bodyY + 9, bodyWidth - 2, 1);
                } else if (facingUp) {
                    ctx.fillRect(bodyX + 1, bodyY + 7, bodyWidth - 2, 1);
                } else if (sideSign > 0) {
                    ctx.fillRect(bodyX + bodyWidth - 2, bodyY + 8, 1, bodyHeight - 1);
                } else {
                    ctx.fillRect(bodyX + 1, bodyY + 8, 1, bodyHeight - 1);
                }
                ctx.fillStyle = palette.cap;
                if (sideFacing) {
                    ctx.fillRect(headX - 1, bodyY + 2, 4, 3);
                } else {
                    ctx.fillRect(bodyX + 2, bodyY + 1, 5, 3);
                }
                if (!facingUp) {
                    ctx.fillStyle = '#f4d3b0';
                    ctx.fillRect(faceX, headY, faceWidth - (sideFacing ? 0 : 1), 2);
                    ctx.fillStyle = '#2a2320';
                    if (sideFacing) {
                        ctx.fillRect(sideSign > 0 ? faceX + 1 : faceX, headY + 1, 1, 1);
                    } else {
                        ctx.fillRect(faceX + 1, headY + 1, 1, 1);
                        ctx.fillRect(faceX + 2, headY + 1, 1, 1);
                    }
                }
                ctx.fillStyle = working ? '#5b4636' : palette.cap;
                ctx.fillRect(frontArmX, frontArmY, 1, sideFacing ? 3 : 4);
                ctx.fillStyle = settler.carryingKind === 'output'
                    ? '#f4d35e'
                    : settler.carryingKind === 'input'
                        ? '#8ec07c'
                        : 'rgba(0,0,0,0)';
                if (settler.carryingKind) {
                    ctx.fillRect(payloadX, payloadY, 3, 3);
                } else if (working) {
                    const toolX = sideFacing ? (sideSign > 0 ? bodyX + bodyWidth : bodyX - 1) : bodyX + bodyWidth - 1;
                    const toolY = bodyY + 7 - Math.max(0, Math.round(workBeat * 2.5));
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillRect(toolX, toolY, 1, 4);
                    ctx.fillStyle = '#8b6a44';
                    ctx.fillRect(toolX - 1, toolY, 3, 1);
                }
                ctx.restore();
                continue;
            }

            const { hero, img, pos, interp, destX, destY, opacity, frameIndex, animRow, workTool } = layer.rec;
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
            const selectedBob = selected ? -0.8 + (Math.sin(now / 360) * 1.2) : 0;
            const heroDestY = destY + selectedBob;
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
                ctx.translate(destX + frameSize * deps.heroZoom, heroDestY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, frameSize * deps.heroZoom, frameSize * deps.heroZoom);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy, frameSize, frameSize, destX, heroDestY, frameSize * deps.heroZoom, frameSize * deps.heroZoom);
            }

            const toolImage = workTool && deps.toolImagesLoaded ? deps.toolImages[workTool] : undefined;
            if (toolImage) {
                const toolSx = Math.min(frameIndex, 4) * TOOL_FRAME_SIZE;
                const toolSy = animRow * TOOL_FRAME_SIZE;
                const toolWidth = TOOL_FRAME_SIZE * deps.heroZoom;
                const toolHeight = TOOL_FRAME_SIZE * deps.heroZoom;
                const anchorOffset = TOOL_ANCHOR_OFFSET_BY_TOOL[workTool][hero.facing];
                const toolDestX = x - toolWidth / 2 + pos.x - (deps.heroFrameSize / 2) + (anchorOffset.x * deps.heroZoom);
                const toolDestY = y - (TOOL_FRAME_SIZE * deps.heroZoom) + (deps.heroFrameSize / 2) + pos.y + (anchorOffset.y * deps.heroZoom) + selectedBob;

                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.imageSmoothingEnabled = false;
                if (shouldFlip(hero.facing)) {
                    ctx.translate(toolDestX + toolWidth, toolDestY);
                    ctx.scale(-1, 1);
                    ctx.drawImage(toolImage, toolSx, toolSy, TOOL_FRAME_SIZE, TOOL_FRAME_SIZE, 0, 0, toolWidth, toolHeight);
                } else {
                    ctx.drawImage(toolImage, toolSx, toolSy, TOOL_FRAME_SIZE, TOOL_FRAME_SIZE, toolDestX, toolDestY, toolWidth, toolHeight);
                }
                ctx.restore();
            }

            if (hero.carryingPayload) {
                ctx.save();
                ctx.globalAlpha = opacity;
                const iconY = heroDestY;
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
