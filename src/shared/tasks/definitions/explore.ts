import {discoverTile, ensureTileExists, getTile} from '../../../core/world';
import { resolveWorldTile } from '../../../core/worldGeneration';
import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";
import { SIDE_NAMES, type Tile } from "../../../core/types/Tile";
import { PathService } from '../../game/PathService';
import { moveHeroWithRuntime } from '../../game/runtime';
import { computeControlledTileIds, isPositionControlled } from '../../game/state/settlementSupportStore';
import { findNearestTaskAccessTile, listTaskAccessTiles } from '../taskAccess';

const EXPLORE_CHAIN_DELAY_MS = 60;
const EXPLORE_BASE_REQUIRED_XP = 795;
const EXPLORE_DISTANCE_XP_RATE = 0.08;
const EXPLORE_REWARDED_XP = 1;
const EXPLORE_SCOUTING_RATE = 24;
const EXPLORE_WATER_SURVEY_RADIUS = 2;
const EXPLORE_WATER_SURVEY_MAX_EXTRA_TILES = 7;

const explorePathService = new PathService();

export function getExploreRequiredXp(distance: number) {
    const distanceFactor = 1 + Math.max(0, distance) * EXPLORE_DISTANCE_XP_RATE;
    return Math.round(EXPLORE_BASE_REQUIRED_XP * distanceFactor);
}

export function getExploreHeroRate(hero: Pick<Hero, 'stats'>) {
    const experience = Math.max(1, hero.stats.xp);
    const speed = Math.max(1, hero.stats.spd);

    // Exploration should benefit from experience, but not snowball linearly off the same stat it rewards.
    return Math.round(EXPLORE_SCOUTING_RATE * (Math.sqrt(experience) + (2 * speed))) * 2;
}

export function getExploreRewardedXp(_distance: number) {
    return EXPLORE_REWARDED_XP;
}

// Explore task definition separated for modularity.
const exploreTask: TaskDefinition = {
    key: 'explore',
    label: 'Explore',
    chainAdjacentSameTerrain: false,
    requiredXp(_distance: number) {
        return getExploreRequiredXp(_distance);
    },
    heroRate(hero: Hero, _tile) {
        return getExploreHeroRate(hero);
    },
    totalRewardedStats(_distance: number) {
        return {xp: getExploreRewardedXp(_distance), hp: 0, atk: 0, spd: 0};
    },

    canStart(tile: Tile, _hero: Hero): boolean {
        return !tile.discovered
            && isPositionControlled(tile.q, tile.r)
            && listTaskAccessTiles('explore', tile).length > 0;
    },

    onStart(_tile, _instance, _participants) {
        if (_tile.discovered) {
            // Tile already discovered; abort explore task implicitly by not setting any special flags.
            let timer = setTimeout(() => continueExploration(_tile, _participants), EXPLORE_CHAIN_DELAY_MS);
            for (const hero of _participants) {
                hero.delayedMovementTimer = timer;
            }
        }
        return;
    },

    onComplete(tile, _instance, participants) {
        discoverTile(tile);
        revealNearbyWaterFromShore(tile);

        let timer = setTimeout(() => continueExploration(tile, participants), EXPLORE_CHAIN_DELAY_MS);
        for (const hero of participants) {
            hero.delayedMovementTimer = timer;
        }
    },
};

function continueExploration(tile: Tile, participants: Hero[]) {
    for (const participant of participants) {
        if (!participant.delayedMovementTimer) {
            continue;
        }
        participant.delayedMovementTimer = undefined;
        const nextUndiscovered = pickNextExploreTile(tile, participant);

        if (nextUndiscovered) {
            moveHeroToExploreTile(participant, nextUndiscovered);
        } else {
            participant.pendingExploreTarget = undefined;
        }
    }
}

function moveHeroToExploreTile(hero: Hero, tile: Tile) {
    const accessTile = findNearestTaskAccessTile('explore', tile, hero.q, hero.r) ?? tile;
    moveHeroWithRuntime(
        hero,
        accessTile,
        'explore',
        accessTile.id === tile.id ? undefined : { q: tile.q, r: tile.r },
    );
}

function pickNextExploreTile(tile: Tile, hero: Hero): Tile | null {
    const target = hero.pendingExploreTarget;
    if (target) {
        const directed = pickDirectedControlledUndiscoveredTile(hero, target);
        if (directed) {
            return directed;
        }
    }

    return pickRandomControlledUndiscoveredNeighbor(tile, hero);
}

function pickDirectedControlledUndiscoveredTile(hero: Hero, target: { q: number; r: number }): Tile | null {
    const targetTile = getTile(target);
    if (targetTile?.discovered) {
        hero.pendingExploreTarget = undefined;
        return null;
    }

    const candidates = listReachableControlledUndiscoveredTiles(hero);
    if (!candidates.length) {
        return null;
    }

    return candidates
        .slice()
        .sort((a, b) => {
            const distanceDelta = explorePathService.axialDistance(a.q, a.r, target.q, target.r)
                - explorePathService.axialDistance(b.q, b.r, target.q, target.r);
            if (distanceDelta !== 0) return distanceDelta;

            const accessDelta = getExploreAccessDistance(hero, a) - getExploreAccessDistance(hero, b);
            if (accessDelta !== 0) return accessDelta;

            return a.id.localeCompare(b.id);
        })[0] ?? null;
}

function pickRandomControlledUndiscoveredNeighbor(tile: Tile, hero: Hero): Tile | null {
    const candidates = listReachableControlledUndiscoveredNeighbors(tile, hero);
    if (!candidates.length) {
        return null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function listReachableControlledUndiscoveredTiles(hero: Hero): Tile[] {
    const candidates: Tile[] = [];

    for (const tileId of computeControlledTileIds()) {
        const [qRaw, rRaw] = tileId.split(',');
        const q = Number(qRaw);
        const r = Number(rRaw);
        if (!Number.isFinite(q) || !Number.isFinite(r)) {
            continue;
        }

        const tile = ensureTileExists(q, r);
        if (isReachableControlledUndiscoveredTile(tile, hero)) {
            candidates.push(tile);
        }
    }

    return candidates;
}

function listReachableControlledUndiscoveredNeighbors(tile: Tile, hero: Hero): Tile[] {
    return SIDE_NAMES
        .map((side) => tile.neighbors?.[side] ?? null)
        .filter((neighbor): neighbor is Tile => !!neighbor && isReachableControlledUndiscoveredTile(neighbor, hero));
}

function isReachableControlledUndiscoveredTile(tile: Tile, hero: Hero): boolean {
    if (tile.discovered || !isPositionControlled(tile.q, tile.r)) {
        return false;
    }

    const accessTile = findNearestTaskAccessTile('explore', tile, hero.q, hero.r);
    if (!accessTile) {
        return false;
    }

    return accessTile.q === hero.q && accessTile.r === hero.r
        || explorePathService.findWalkablePath(hero.q, hero.r, accessTile.q, accessTile.r).length > 0;
}

function getExploreAccessDistance(hero: Hero, tile: Tile) {
    const accessTile = findNearestTaskAccessTile('explore', tile, hero.q, hero.r);
    if (!accessTile) {
        return Number.POSITIVE_INFINITY;
    }

    return explorePathService.axialDistance(hero.q, hero.r, accessTile.q, accessTile.r);
}

function revealNearbyWaterFromShore(origin: Tile) {
    if (origin.terrain !== 'water') {
        return;
    }

    const queue: Tile[] = [origin];
    const visited = new Set<string>([origin.id]);
    let revealedCount = 0;

    while (queue.length && revealedCount < EXPLORE_WATER_SURVEY_MAX_EXTRA_TILES) {
        const current = queue.shift()!;
        const currentDistance = Math.max(Math.abs(current.q - origin.q), Math.abs(current.r - origin.r), Math.abs((current.q + current.r) - (origin.q + origin.r)));

        if (currentDistance >= EXPLORE_WATER_SURVEY_RADIUS) {
            continue;
        }

        for (const side of SIDE_NAMES) {
            const neighbor = current.neighbors?.[side] ?? null;
            if (!neighbor || visited.has(neighbor.id)) {
                continue;
            }

            visited.add(neighbor.id);
            const resolvedTerrain = neighbor.terrain ?? resolveWorldTile(neighbor.q, neighbor.r).terrain;
            if (resolvedTerrain !== 'water') {
                continue;
            }

            discoverTile(neighbor);
            revealedCount += 1;
            if (revealedCount >= EXPLORE_WATER_SURVEY_MAX_EXTRA_TILES) {
                break;
            }

            queue.push(neighbor);
        }
    }
}

registerTask(exploreTask);
