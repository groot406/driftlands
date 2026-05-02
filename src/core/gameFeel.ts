import type {Hero} from './types/Hero';
import type {ResourceType} from './types/Resource';
import {GROWTH_HYBRID_STYLE} from './render/visualStyle';
import { getInventoryEntryDefinition } from '../shared/game/inventoryPresentation';

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
    wood: {icon: getInventoryEntryDefinition('wood').icon, color: '#85c46c'},
    ore: {icon: getInventoryEntryDefinition('ore').icon, color: '#9aa6c7'},
    stone: {icon: getInventoryEntryDefinition('stone').icon, color: '#b9b3a1'},
    tools: {icon: getInventoryEntryDefinition('tools').icon, color: '#d8b46a'},
    food: {icon: getInventoryEntryDefinition('food').icon, color: '#ffb56e'},
    bread: {icon: getInventoryEntryDefinition('bread').icon, color: '#f6c572'},
    meat: {icon: getInventoryEntryDefinition('meat').icon, color: '#e78974'},
    beer: {icon: getInventoryEntryDefinition('beer').icon, color: '#f2b948'},
    wine: {icon: getInventoryEntryDefinition('wine').icon, color: '#cc7fe7'},
    crystal: {icon: getInventoryEntryDefinition('crystal').icon, color: '#8cd6ff'},
    artifact: {icon: getInventoryEntryDefinition('artifact').icon, color: '#e5d489'},
    sand: {icon: getInventoryEntryDefinition('sand').icon, color: '#e7c979'},
    glass: {icon: getInventoryEntryDefinition('glass').icon, color: '#b7f2ff'},
    water: {icon: getInventoryEntryDefinition('water').icon, color: '#70d6ff'},
    grain: {icon: getInventoryEntryDefinition('grain').icon, color: '#f4d36b'},
    hops: {icon: getInventoryEntryDefinition('hops').icon, color: '#7ccb70'},
    grapes: {icon: getInventoryEntryDefinition('grapes').icon, color: '#aa77ec'},
    water_lily: {icon: getInventoryEntryDefinition('water_lily').icon, color: '#8fd9a8'},
};

const hitStopByKind: Record<GameplayImpactKind, number> = {
    deposit: 18,
    handin: 24,
    work: 0,
    complete: 54,
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
        return {icon: '', color: GROWTH_HYBRID_STYLE.text.rewardGold};
    }

    if (kind === 'work') {
        return {icon: '', color: GROWTH_HYBRID_STYLE.text.rewardAqua};
    }

    return {icon: '', color: kind === 'deposit' ? GROWTH_HYBRID_STYLE.text.rewardAqua : GROWTH_HYBRID_STYLE.text.rewardGreen};
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
    const ringStrength = options.kind === 'complete' ? 1.15 : options.kind === 'handin' ? 0.9 : options.kind === 'work' ? 0.65 : 0.78;
    const isWorkImpact = options.kind === 'work';

    impactRings.push({
        id: makeId(),
        q: options.q,
        r: options.r,
        color: palette.color,
        startedMs: nowMs,
        durationMs: options.kind === 'complete' ? 430 : options.kind === 'work' ? 150 : 300,
        startRadius: 12,
        endRadius: options.kind === 'complete' ? 58 : options.kind === 'work' ? 23 : 42,
        lineWidth: options.kind === 'work' ? 1.35 : 1.45 + ringStrength,
        maxAlpha: options.kind === 'complete' ? 0.36 : options.kind === 'work' ? 0.11 : 0.24,
    });

    tileFlashes.push({
        id: makeId(),
        q: options.q,
        r: options.r,
        color: palette.color,
        startedMs: nowMs,
        durationMs: options.kind === 'complete' ? 220 : options.kind === 'work' ? 90 : 150,
        maxAlpha: options.kind === 'complete' ? 0.24 : options.kind === 'work' ? 0.06 : 0.14,
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
            intensity: options.kind === 'complete' ? 6.4 : options.kind === 'handin' ? 4 : options.kind === 'work' ? 1.6 : 3.2,
            kind: options.kind,
            startedMs: nowMs,
            durationMs: options.kind === 'complete' ? 240 : options.kind === 'work' ? 130 : 190,
        });
    }

    pendingTerrainBursts.push({
        id: makeId(),
        q: options.q,
        r: options.r,
        terrain: options.terrain,
        kind: options.kind,
        intensity: options.kind === 'complete' ? 1 : options.kind === 'handin' ? 0.78 : options.kind === 'work' ? 0.55 : 0.7,
    });

    if (options.kind === 'complete') {
        pendingCameraNudges.push({
            id: makeId(),
            q: options.q,
            r: options.r,
            strength: 0.72,
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
