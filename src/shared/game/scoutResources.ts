import type { Hero } from '../../core/types/Hero';
import type { ResourceType } from '../../core/types/Resource';
import { SIDE_NAMES, type Terrain, type Tile, type TileSide } from '../../core/types/Tile';
import { terrainPositions } from '../../core/terrainRegistry';
import { ensureTileExists, tileIndex } from '../../core/world';
import { resolveWorldTile } from '../../core/worldGeneration';
import type { CoopPingMessage, HeroScoutResourceUpdateMessage, TileUpdatedMessage } from '../protocol';
import { axialDistanceCoords } from './hex';
import { PathService } from './PathService';
import { listScoutingFrontierTiles } from './explorationFrontier';
import { isTileWalkable } from './navigation';
import { broadcastGameMessage as broadcast, moveHeroWithRuntime } from './runtime';
import { isTileActive } from './state/settlementSupportStore';
import { getDistanceToNearestTowncenter } from './worldQueries';

export const SCOUT_RESOURCE_TASK_TYPE = 'scoutResource';
export const SCOUT_PING_DURATION_MS = 30000;
export const SCOUT_TILE_SURVEY_MS = 1200;

export const SCOUTABLE_RESOURCE_TYPES = [
    'wood',
    'water',
    'grain',
    'stone',
    'ore',
    'crystal',
    'sand',
] as const satisfies readonly ResourceType[];

export type ScoutableResourceType = typeof SCOUTABLE_RESOURCE_TYPES[number];

const SCOUTABLE_RESOURCE_SET = new Set<ResourceType>(SCOUTABLE_RESOURCE_TYPES);

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
    a: [0, -1],
    b: [1, -1],
    c: [1, 0],
    d: [0, 1],
    e: [-1, 1],
    f: [-1, 0],
};

const scoutPathService = new PathService();
const scoutPathOptions = { allowScouted: true };

export function shouldStopScoutResourceForMovement(
    hero: Pick<Hero, 'scoutResourceIntent'>,
    taskType?: string | null,
) {
    return !!hero.scoutResourceIntent && taskType !== SCOUT_RESOURCE_TASK_TYPE;
}

export function getScoutCancelMovementPathOptions(
    hero: Pick<Hero, 'scoutResourceIntent'>,
    taskType?: string | null,
) {
    return shouldStopScoutResourceForMovement(hero, taskType)
        ? scoutPathOptions
        : {};
}

export function isScoutableResourceType(resourceType: string): resourceType is ScoutableResourceType {
    return SCOUTABLE_RESOURCE_SET.has(resourceType as ResourceType);
}

export function getScoutResourceLabel(resourceType: ResourceType) {
    switch (resourceType) {
        case 'wood':
            return 'Wood';
        case 'water':
            return 'Water';
        case 'grain':
            return 'Grain';
        case 'stone':
            return 'Stone';
        case 'ore':
            return 'Ore';
        case 'crystal':
            return 'Crystal';
        case 'sand':
            return 'Sand';
        case 'water_lily':
            return 'Water Lilies';
        default:
            return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
    }
}

export function doesScoutResourceMatchTerrain(resourceType: ResourceType, terrain: Terrain | null | undefined) {
    switch (resourceType) {
        case 'wood':
            return terrain === 'forest';
        case 'water':
            return terrain === 'water';
        case 'grain':
            return terrain === 'grain';
        case 'stone':
        case 'ore':
            return terrain === 'mountain';
        case 'crystal':
            return terrain === 'vulcano';
        case 'sand':
            return terrain === 'dessert';
        default:
            return false;
    }
}

export function hasTileBeenScoutedForResource(tile: Tile, resourceType: ResourceType) {
    return tile.scoutedResourceTypes?.includes(resourceType)
        || tile.scoutedForResource === resourceType
        || tile.scoutFoundResource === resourceType;
}

export function broadcastHeroScoutResourceUpdate(hero: Hero) {
    broadcast({
        type: 'hero:scout_resource_update',
        heroId: hero.id,
        intent: hero.scoutResourceIntent ? { ...hero.scoutResourceIntent } : null,
    } as HeroScoutResourceUpdateMessage);
}

export function stopScoutResourceSearch(hero: Hero, options: { returnToTowncenter?: boolean } = {}) {
    if (hero.delayedMovementTimer) {
        clearTimeout(hero.delayedMovementTimer);
        hero.delayedMovementTimer = undefined;
    }
    const shouldReturnToTowncenter = options.returnToTowncenter === true;
    hero.scoutResourceIntent = undefined;
    hero.pendingTask = undefined;
    hero.pendingExploreTarget = undefined;
    hero.movement = undefined;
    broadcastHeroScoutResourceUpdate(hero);

    if (shouldReturnToTowncenter) {
        returnHeroToKnownGround(hero);
    }
}

export function startScoutResourceSearch(hero: Hero) {
    const intent = hero.scoutResourceIntent;
    if (!intent) {
        return false;
    }

    if (hero.delayedMovementTimer) {
        clearTimeout(hero.delayedMovementTimer);
        hero.delayedMovementTimer = undefined;
    }
    hero.pendingExploreTarget = undefined;
    const hadSurveyTiming = clearScoutSurveyTiming(intent);

    const nextTile = pickNextScoutTile(hero, intent.resourceType);
    if (!nextTile) {
        stopScoutResourceSearch(hero, { returnToTowncenter: true });
        return false;
    }

    if (hadSurveyTiming) {
        broadcastHeroScoutResourceUpdate(hero);
    }

    hero.pendingTask = {
        tileId: nextTile.id,
        taskType: SCOUT_RESOURCE_TASK_TYPE,
    };

    if (hero.q === nextTile.q && hero.r === nextTile.r) {
        handleScoutResourceArrival(hero, nextTile);
        return true;
    }

    moveHeroWithRuntime(hero, nextTile, SCOUT_RESOURCE_TASK_TYPE, { q: nextTile.q, r: nextTile.r });
    return true;
}

export function handleScoutResourceArrival(hero: Hero, tile: Tile) {
    const intent = hero.scoutResourceIntent;
    hero.pendingExploreTarget = undefined;

    if (!intent) {
        stopScoutResourceSearch(hero, { returnToTowncenter: true });
        return;
    }

    if (hero.delayedMovementTimer) {
        clearTimeout(hero.delayedMovementTimer);
    }

    hero.pendingTask = {
        tileId: tile.id,
        taskType: SCOUT_RESOURCE_TASK_TYPE,
    };
    intent.surveyTileId = tile.id;
    intent.surveyStartedAt = Date.now();
    intent.surveyDurationMs = getScoutSurveyMs(hero);
    broadcastHeroScoutResourceUpdate(hero);

    hero.delayedMovementTimer = setTimeout(() => {
        hero.delayedMovementTimer = undefined;
        completeScoutResourceArrival(hero, tile, intent.resourceType);
    }, intent.surveyDurationMs);
}

export function getScoutSurveyMs(hero: Pick<Hero, 'stats'>) {
    return Math.max(650, SCOUT_TILE_SURVEY_MS - (Math.max(0, hero.stats.spd - 1) * 75));
}

export function getScoutSurveyProgress(hero: Pick<Hero, 'movement' | 'scoutResourceIntent'>, tileId: string, now: number = Date.now()) {
    const intent = hero.scoutResourceIntent;
    if (!intent?.surveyTileId || intent.surveyTileId !== tileId || hero.movement) {
        return null;
    }

    const startedAt = intent.surveyStartedAt;
    const durationMs = intent.surveyDurationMs;
    if (typeof startedAt !== 'number' || typeof durationMs !== 'number' || durationMs <= 0) {
        return null;
    }

    return Math.min(1, Math.max(0, (now - startedAt) / durationMs));
}

export function isHeroSurveyingScoutResource(hero: Pick<Hero, 'movement' | 'scoutResourceIntent'>, now: number = Date.now()) {
    const intent = hero.scoutResourceIntent;
    if (!intent?.surveyTileId) {
        return false;
    }

    const progress = getScoutSurveyProgress(hero, intent.surveyTileId, now);
    return progress !== null && progress < 1;
}

function completeScoutResourceArrival(hero: Hero, tile: Tile, resourceType: ResourceType) {
    const intent = hero.scoutResourceIntent;
    hero.pendingTask = undefined;

    if (!intent || intent.resourceType !== resourceType) {
        stopScoutResourceSearch(hero, { returnToTowncenter: true });
        return;
    }

    if (hero.q !== tile.q || hero.r !== tile.r) {
        startScoutResourceSearch(hero);
        return;
    }

    if (!tile.discovered && !hasTileBeenScoutedForResource(tile, intent.resourceType)) {
        const generated = resolveWorldTile(tile.q, tile.r);
        const found = doesScoutResourceMatchTerrain(intent.resourceType, generated.terrain);
        const ensuredNeighbors = markTileScouted(tile, intent.resourceType, found);
        broadcastScoutedTileUpdates(tile, ensuredNeighbors);

        if (found) {
            broadcastScoutFoundPing(hero, tile, intent.resourceType);
            stopScoutResourceSearch(hero, { returnToTowncenter: true });
            return;
        }
    }

    if (!startScoutResourceSearch(hero)) {
        hero.movement = undefined;
    }
}

export function pickNextScoutTile(hero: Hero, resourceType: ResourceType) {
    const localTile = pickRandomReachableScoutingNeighbor(hero, resourceType);
    if (localTile) {
        return localTile;
    }

    const candidates = listScoutingFrontierTiles()
        .map((tile) => createReachableScoutCandidate(hero, tile, resourceType))
        .filter((candidate): candidate is ScoutCandidate => !!candidate);

    if (!candidates.length) {
        return null;
    }

    const nearestTownDistance = Math.min(...candidates.map((candidate) => candidate.townDistance));
    const closestRingCandidates = candidates.filter((candidate) => candidate.townDistance === nearestTownDistance);

    return pickRandomScoutCandidate(closestRingCandidates);
}

interface ScoutCandidate {
    tile: Tile;
    pathLength: number;
    axialDistance: number;
    townDistance: number;
}

function pickRandomReachableScoutingNeighbor(hero: Hero, resourceType: ResourceType) {
    const currentTile = ensureTileExists(hero.q, hero.r);
    const candidates = SIDE_NAMES
        .map((side) => getScoutNeighbor(currentTile, side))
        .map((tile) => tile ? createReachableScoutCandidate(hero, tile, resourceType) : null)
        .filter((candidate): candidate is ScoutCandidate => !!candidate);

    return pickRandomScoutCandidate(candidates);
}

function getScoutNeighbor(tile: Tile, side: TileSide) {
    const [dq, dr] = SIDE_DELTAS[side];
    return tile.neighbors?.[side] ?? ensureTileExists(tile.q + dq, tile.r + dr);
}

function createReachableScoutCandidate(hero: Hero, tile: Tile, resourceType: ResourceType): ScoutCandidate | null {
    if (tile.discovered || hasTileBeenScoutedForResource(tile, resourceType)) {
        return null;
    }

    const atTile = hero.q === tile.q && hero.r === tile.r;
    const path = atTile
        ? []
        : scoutPathService.findWalkablePath(hero.q, hero.r, tile.q, tile.r, scoutPathOptions);

    if (!atTile && !path.length) {
        return null;
    }

    return {
        tile,
        pathLength: atTile ? 0 : path.length,
        axialDistance: scoutPathService.axialDistance(hero.q, hero.r, tile.q, tile.r),
        townDistance: getDistanceToNearestTowncenter(tile.q, tile.r),
    };
}

function pickRandomScoutCandidate(candidates: ScoutCandidate[]) {
    if (!candidates.length) {
        return null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)]?.tile ?? null;
}

function returnHeroToNearestOnlineTowncenter(hero: Hero) {
    const towncenter = findNearestReachableOnlineTowncenter(hero);
    if (!towncenter || (hero.q === towncenter.q && hero.r === towncenter.r)) {
        return false;
    }

    moveHeroWithRuntime(hero, towncenter, undefined, undefined, scoutPathOptions);
    return true;
}

function returnHeroToKnownGround(hero: Hero) {
    if (isHeroOnDiscoveredWalkableTile(hero)) {
        return true;
    }

    return returnHeroToNearestOnlineTowncenter(hero)
        || returnHeroToNearestReachableDiscoveredWalkableTile(hero);
}

function returnHeroToNearestReachableDiscoveredWalkableTile(hero: Hero) {
    const target = findNearestReachableDiscoveredWalkableTile(hero);
    if (!target || (hero.q === target.q && hero.r === target.r)) {
        return false;
    }

    moveHeroWithRuntime(hero, target, undefined, undefined, scoutPathOptions);
    return true;
}

function findNearestReachableOnlineTowncenter(hero: Hero) {
    let best: { tile: Tile; pathLength: number; distance: number } | null = null;

    for (const tileId of terrainPositions.towncenter) {
        const tile = ensureTileExistsFromIndex(tileId);
        if (!isOnlineTowncenter(tile)) {
            continue;
        }

        const atTile = hero.q === tile.q && hero.r === tile.r;
        const path = atTile
            ? []
            : scoutPathService.findWalkablePath(hero.q, hero.r, tile.q, tile.r, scoutPathOptions);

        if (!atTile && !path.length) {
            continue;
        }

        const pathLength = atTile ? 0 : path.length;
        const distance = axialDistanceCoords(hero.q, hero.r, tile.q, tile.r);
        if (
            !best
            || pathLength < best.pathLength
            || (pathLength === best.pathLength && distance < best.distance)
            || (pathLength === best.pathLength && distance === best.distance && tile.id.localeCompare(best.tile.id) < 0)
        ) {
            best = { tile, pathLength, distance };
        }
    }

    return best?.tile ?? null;
}

function findNearestReachableDiscoveredWalkableTile(hero: Hero) {
    let best: { tile: Tile; pathLength: number; distance: number } | null = null;

    for (const tile of Object.values(tileIndex)) {
        if (!isDiscoveredWalkableTile(tile)) {
            continue;
        }

        const atTile = hero.q === tile.q && hero.r === tile.r;
        const path = atTile
            ? []
            : scoutPathService.findWalkablePath(hero.q, hero.r, tile.q, tile.r, scoutPathOptions);

        if (!atTile && !path.length) {
            continue;
        }

        const pathLength = atTile ? 0 : path.length;
        const distance = axialDistanceCoords(hero.q, hero.r, tile.q, tile.r);
        if (
            !best
            || pathLength < best.pathLength
            || (pathLength === best.pathLength && distance < best.distance)
            || (pathLength === best.pathLength && distance === best.distance && tile.id.localeCompare(best.tile.id) < 0)
        ) {
            best = { tile, pathLength, distance };
        }
    }

    return best?.tile ?? null;
}

function ensureTileExistsFromIndex(tileId: string) {
    const [qRaw, rRaw] = tileId.split(',');
    const q = Number(qRaw);
    const r = Number(rRaw);
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
        return null;
    }

    return ensureTileExists(q, r);
}

function isHeroOnDiscoveredWalkableTile(hero: Hero) {
    return isDiscoveredWalkableTile(tileIndex[`${hero.q},${hero.r}`]);
}

function isDiscoveredWalkableTile(tile: Tile | null | undefined): tile is Tile {
    return !!tile
        && tile.discovered
        && isTileWalkable(tile);
}

function isOnlineTowncenter(tile: Tile | null | undefined): tile is Tile {
    return !!tile
        && tile.discovered
        && tile.terrain === 'towncenter'
        && isTileWalkable(tile)
        && isTileActive(tile);
}

function markTileScouted(tile: Tile, resourceType: ResourceType, found: boolean) {
    tile.scouted = true;
    tile.scoutedForResource = resourceType;
    tile.scoutedResourceTypes = tile.scoutedResourceTypes
        ? tile.scoutedResourceTypes.slice()
        : [];

    if (!tile.scoutedResourceTypes.includes(resourceType)) {
        tile.scoutedResourceTypes.push(resourceType);
    }

    if (found) {
        tile.scoutFoundResource = resourceType;
    }

    return ensureScoutingNeighbors(tile);
}

function clearScoutSurveyTiming(intent: NonNullable<Hero['scoutResourceIntent']>) {
    const changed = !!(intent.surveyTileId || intent.surveyStartedAt || intent.surveyDurationMs);
    delete intent.surveyTileId;
    delete intent.surveyStartedAt;
    delete intent.surveyDurationMs;
    return changed;
}

function ensureScoutingNeighbors(tile: Tile) {
    const neighbors: Tile[] = [];

    for (const side of SIDE_NAMES) {
        const [dq, dr] = SIDE_DELTAS[side];
        neighbors.push(ensureTileExists(tile.q + dq, tile.r + dr));
    }

    return neighbors;
}

function broadcastScoutedTileUpdates(tile: Tile, neighbors: Tile[]) {
    const seen = new Set<string>();

    for (const neighbor of neighbors) {
        if (seen.has(neighbor.id)) {
            continue;
        }
        seen.add(neighbor.id);
        broadcast({ type: 'tile:updated', tile: neighbor } as TileUpdatedMessage);
    }

    broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
}

function broadcastScoutFoundPing(hero: Hero, tile: Tile, resourceType: ResourceType) {
    const now = Date.now();
    const intent = hero.scoutResourceIntent;
    const label = `Found ${getScoutResourceLabel(resourceType)}`;

    broadcast({
        type: 'coop:ping',
        ping: {
            id: `scout-${hero.id}-${tile.id}-${now}`,
            playerId: intent?.playerId ?? hero.id,
            playerName: intent?.playerName ?? hero.name,
            kind: 'scout',
            q: tile.q,
            r: tile.r,
            label,
            createdAt: now,
            expiresAt: now + SCOUT_PING_DURATION_MS,
            heroId: hero.id,
        },
        timestamp: now,
    } as CoopPingMessage);
}
