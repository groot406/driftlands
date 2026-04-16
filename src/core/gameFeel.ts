import type {Hero} from './types/Hero';
import type {ResourceType} from './types/Resource';

export type GameplayImpactKind = 'deposit' | 'handin' | 'work' | 'complete';

interface TimedEffect {
    id: number;
    startedMs: number;
    durationMs: number;
}

export interface ImpactRingEffect extends TimedEffect {
    q: number;
    r: number;
    color: string;
    startRadius: number;
    endRadius: number;
    lineWidth: number;
    maxAlpha: number;
}

export interface TileFlashEffect extends TimedEffect {
    q: number;
    r: number;
    color: string;
    maxAlpha: number;
}

export interface ResourceFlightEffect extends TimedEffect {
    q: number;
    r: number;
    resourceType: ResourceType;
    icon: string;
    color: string;
    scatter: number;
}

interface HeroImpactEffect extends TimedEffect {
    heroId: string;
    intensity: number;
    kind: GameplayImpactKind;
}

export interface TerrainBurstRequest {
    id: number;
    q: number;
    r: number;
    terrain?: string | null;
    kind: GameplayImpactKind;
    intensity: number;
}

export interface CameraNudgeRequest {
    id: number;
    q: number;
    r: number;
    strength: number;
}

export interface GameplayImpactOptions {
    q: number;
    r: number;
    kind: GameplayImpactKind;
    terrain?: string | null;
    resourceType?: ResourceType;
    amount?: number;
    heroIds?: string[];
}

const RESOURCE_META: Record<ResourceType, {icon: string; color: string}> = {
    wood: {icon: '\uD83C\uDF32', color: '#85c46c'},
    ore: {icon: '\u26CF\uFE0F', color: '#9aa6c7'},
    stone: {icon: '\uD83E\uDEA8', color: '#b9b3a1'},
    tools: {icon: '\uD83D\uDEE0\uFE0F', color: '#d8b46a'},
    food: {icon: '\uD83C\uDF56', color: '#ffb56e'},
    crystal: {icon: '\uD83D\uDC8E', color: '#8cd6ff'},
    artifact: {icon: '\uD83C\uDFFA', color: '#e5d489'},
    water: {icon: '\uD83D\uDCA7', color: '#70d6ff'},
    grain: {icon: '\uD83C\uDF3E', color: '#f4d36b'},
    water_lily: {icon: '\uD83E\uDEB7', color: '#8fd9a8'},
};

const hitStopByKind: Record<GameplayImpactKind, number> = {
    deposit: 42,
    handin: 52,
    work: 0,
    complete: 82,
};

let nextEffectId = 1;
let hitStopUntilMs = 0;
let lastRealSampleMs = 0;
let visualNowMs = 0;

const impactRings: ImpactRingEffect[] = [];
const tileFlashes: TileFlashEffect[] = [];
const resourceFlights: ResourceFlightEffect[] = [];
const heroImpacts: HeroImpactEffect[] = [];
const pendingTerrainBursts: TerrainBurstRequest[] = [];
const pendingCameraNudges: CameraNudgeRequest[] = [];
const resourceTargets = new Map<ResourceType, HTMLElement>();

function makeId() {
    return nextEffectId++;
}

function pruneTimedEffects<T extends TimedEffect>(effects: T[], nowMs: number) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i]!;
        if ((nowMs - effect.startedMs) >= effect.durationMs) {
            effects.splice(i, 1);
        }
    }
}

function getImpactPalette(kind: GameplayImpactKind, resourceType?: ResourceType) {
    if (resourceType) {
        return RESOURCE_META[resourceType];
    }

    if (kind === 'complete') {
        return {icon: '', color: '#ffe08a'};
    }

    if (kind === 'work') {
        return {icon: '', color: '#d6f2ff'};
    }

    return {icon: '', color: kind === 'deposit' ? '#8fc8ff' : '#9ee37d'};
}

export function triggerHitStop(durationMs: number) {
    const nowMs = Date.now();
    hitStopUntilMs = Math.max(hitStopUntilMs, nowMs + Math.max(0, durationMs));
}

export function isHitStopActive(nowMs: number = Date.now()) {
    return nowMs < hitStopUntilMs;
}

export function sampleGameFeelTime(realNowMs: number = Date.now()) {
    if (!lastRealSampleMs) {
        lastRealSampleMs = realNowMs;
        visualNowMs = realNowMs;
        return visualNowMs;
    }

    const previousRealMs = lastRealSampleMs;
    lastRealSampleMs = realNowMs;

    if (previousRealMs < hitStopUntilMs) {
        if (realNowMs <= hitStopUntilMs) {
            return visualNowMs;
        }

        visualNowMs += realNowMs - hitStopUntilMs;
        return visualNowMs;
    }

    visualNowMs += realNowMs - previousRealMs;
    return visualNowMs;
}

export function getGameFeelNow() {
    return visualNowMs || Date.now();
}

export function registerResourceTarget(type: ResourceType, element: HTMLElement | null) {
    if (!element) {
        resourceTargets.delete(type);
        return;
    }

    resourceTargets.set(type, element);
}

export function getResourceTargetCenter(type: ResourceType) {
    const element = resourceTargets.get(type);
    if (!element || !element.isConnected) {
        if (element && !element.isConnected) {
            resourceTargets.delete(type);
        }
        return null;
    }

    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
    };
}

export function triggerGameplayImpact(options: GameplayImpactOptions) {
    const nowMs = getGameFeelNow();
    const palette = getImpactPalette(options.kind, options.resourceType);
    const baseAmount = Math.max(1, options.amount ?? 1);
    const ringStrength = options.kind === 'complete' ? 1.4 : options.kind === 'handin' ? 1.1 : options.kind === 'work' ? 0.85 : 0.95;
    const isWorkImpact = options.kind === 'work';

    impactRings.push({
        id: makeId(),
        q: options.q,
        r: options.r,
        color: palette.color,
        startedMs: nowMs,
        durationMs: options.kind === 'complete' ? 520 : options.kind === 'work' ? 170 : 360,
        startRadius: 12,
        endRadius: options.kind === 'complete' ? 70 : options.kind === 'work' ? 28 : 52,
        lineWidth: options.kind === 'work' ? 2 : 2 + ringStrength,
        maxAlpha: options.kind === 'complete' ? 0.48 : options.kind === 'work' ? 0.16 : 0.35,
    });

    tileFlashes.push({
        id: makeId(),
        q: options.q,
        r: options.r,
        color: palette.color,
        startedMs: nowMs,
        durationMs: options.kind === 'complete' ? 260 : options.kind === 'work' ? 100 : 180,
        maxAlpha: options.kind === 'complete' ? 0.36 : options.kind === 'work' ? 0.1 : 0.22,
    });

    if (options.resourceType) {
        const meta = RESOURCE_META[options.resourceType];
        const flightCount = Math.min(4, Math.max(1, Math.round(baseAmount / (options.kind === 'complete' ? 4 : 2))));
        for (let i = 0; i < flightCount; i++) {
            resourceFlights.push({
                id: makeId(),
                q: options.q,
                r: options.r,
                resourceType: options.resourceType,
                icon: meta.icon,
                color: meta.color,
                scatter: (i - ((flightCount - 1) / 2)) * 14,
                startedMs: nowMs + (i * 36),
                durationMs: 720,
            });
        }
    }

    for (const heroId of options.heroIds || []) {
        heroImpacts.push({
            id: makeId(),
            heroId,
            intensity: options.kind === 'complete' ? 9 : options.kind === 'handin' ? 6.5 : options.kind === 'work' ? 2.6 : 5.5,
            kind: options.kind,
            startedMs: nowMs,
            durationMs: options.kind === 'complete' ? 280 : options.kind === 'work' ? 140 : 220,
        });
    }

    pendingTerrainBursts.push({
        id: makeId(),
        q: options.q,
        r: options.r,
        terrain: options.terrain,
        kind: options.kind,
        intensity: options.kind === 'complete' ? 1.25 : options.kind === 'handin' ? 1.05 : options.kind === 'work' ? 0.78 : 0.95,
    });

    if (!isWorkImpact) {
        pendingCameraNudges.push({
            id: makeId(),
            q: options.q,
            r: options.r,
            strength: options.kind === 'complete' ? 1 : 0.75,
        });
    }

    triggerHitStop(hitStopByKind[options.kind]);
}

export function getActiveImpactRings(nowMs: number = getGameFeelNow()) {
    pruneTimedEffects(impactRings, nowMs);
    return impactRings;
}

export function getActiveTileFlashes(nowMs: number = getGameFeelNow()) {
    pruneTimedEffects(tileFlashes, nowMs);
    return tileFlashes;
}

export function getActiveResourceFlights(nowMs: number = getGameFeelNow()) {
    pruneTimedEffects(resourceFlights, nowMs);
    return resourceFlights;
}

export function getHeroImpactOffset(heroId: string, facing: Hero['facing'], nowMs: number = getGameFeelNow()) {
    pruneTimedEffects(heroImpacts, nowMs);

    let offsetX = 0;
    let offsetY = 0;
    const facingVector = facing === 'up'
        ? {x: 0, y: -1}
        : facing === 'down'
            ? {x: 0, y: 1}
            : facing === 'left'
                ? {x: -1, y: 0}
                : {x: 1, y: 0};

    for (const impact of heroImpacts) {
        if (impact.heroId !== heroId) continue;
        const age = nowMs - impact.startedMs;
        if (age < 0 || age >= impact.durationMs) continue;

        const progress = age / impact.durationMs;
        const anticipation = progress < 0.22
            ? -impact.intensity * (progress / 0.22) * 0.35
            : 0;
        const releaseProgress = progress < 0.22 ? 0 : (progress - 0.22) / 0.78;
        const release = Math.sin(releaseProgress * Math.PI) * impact.intensity * (1 - progress) * 0.82;
        const direction = anticipation + release;

        offsetX += facingVector.x * direction;
        offsetY += facingVector.y * direction;
        if (impact.kind === 'complete') {
            offsetY -= Math.sin(progress * Math.PI) * impact.intensity * 0.16;
        }
    }

    return {x: offsetX, y: offsetY};
}

export function consumePendingTerrainBursts() {
    return pendingTerrainBursts.splice(0, pendingTerrainBursts.length);
}

export function consumePendingCameraNudges() {
    return pendingCameraNudges.splice(0, pendingCameraNudges.length);
}

export function resetGameFeelState() {
    impactRings.length = 0;
    tileFlashes.length = 0;
    resourceFlights.length = 0;
    heroImpacts.length = 0;
    pendingTerrainBursts.length = 0;
    pendingCameraNudges.length = 0;
    hitStopUntilMs = 0;
    lastRealSampleMs = 0;
    visualNowMs = 0;
}
