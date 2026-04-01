import {discoverTile} from '../../../core/world';
import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";
import type {Tile, TileSide} from "../../../core/types/Tile";
import { moveHeroWithRuntime } from '../../game/runtime';
import { getDistanceToNearestTowncenter } from '../../game/worldQueries';
import { isTileWithinReach } from '../../../store/populationStore';

const EXPLORE_CHAIN_DELAY_MS = 120;
const EXPLORE_BASE_REQUIRED_XP = 250;
const EXPLORE_REQUIRED_XP_PER_DISTANCE = 850;
const EXPLORE_REQUIRED_XP_PER_DISTANCE_SQUARED = 25;
const EXPLORE_MAX_REQUIRED_XP = 999999;
const EXPLORE_SCOUTING_RATE = 30;

export function getExploreRequiredXp(distance: number) {
    const clampedDistance = Math.max(0, distance);
    return Math.min(
        EXPLORE_MAX_REQUIRED_XP,
        EXPLORE_BASE_REQUIRED_XP
        + (clampedDistance * EXPLORE_REQUIRED_XP_PER_DISTANCE)
        + (clampedDistance * clampedDistance * EXPLORE_REQUIRED_XP_PER_DISTANCE_SQUARED),
    );
}

export function getExploreHeroRate(hero: Pick<Hero, 'stats'>) {
    const experience = Math.max(1, hero.stats.xp);
    const speed = Math.max(1, hero.stats.spd);

    // Exploration should benefit from experience, but not snowball linearly off the same stat it rewards.
    return Math.round(EXPLORE_SCOUTING_RATE * (Math.sqrt(experience) + (2 * speed)));
}

export function getExploreRewardedXp(distance: number) {
    return Math.max(1, distance / 4);
}

// Explore task definition separated for modularity.
const exploreTask: TaskDefinition = {
    key: 'explore',
    label: 'Explore',
    chainAdjacentSameTerrain: false,
    requiredXp(distance: number) {
        return getExploreRequiredXp(distance);
    },
    heroRate(hero: Hero, _tile) {
        return getExploreHeroRate(hero);
    },
    totalRewardedStats(distance: number) {
        return {xp: getExploreRewardedXp(distance), hp: 0, atk: 0, spd: 0};
    },

    canStart(tile: Tile, _hero: Hero): boolean {
        return !tile.discovered && isTileWithinReach(tile.q, tile.r);
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

        let timer = setTimeout(() => continueExploration(tile, participants), EXPLORE_CHAIN_DELAY_MS);
        for (const hero of participants) {
            hero.delayedMovementTimer = timer;
        }
    },
};

function continueExploration(tile: Tile, participants: Hero[]) {
    // find lowest distance neighboring tile that is not discovered and start moving there to chain
    for (const participant of participants) {
        if (!participant.delayedMovementTimer) {
            continue;
        }
        participant.delayedMovementTimer = undefined;
        const nm = tile.neighbors;
        let closestUndiscovered: Tile | null = null;

        let sides: TileSide[] = ['a', 'b', 'c', 'd', 'e', 'f'];
        // shuffle sides to add some randomness to exploration direction
        sides = sides.sort(() => Math.random() - 0.5);
        for (const side of sides) {
            if (!nm) break;
            const neighbor = nm[side];

            if (neighbor && !neighbor.discovered && isTileWithinReach(neighbor.q, neighbor.r)) {
                if (!closestUndiscovered) {
                    closestUndiscovered = neighbor;
                } else if (
                    !neighbor.discovered &&
                    getDistanceToNearestTowncenter(neighbor.q, neighbor.r) < getDistanceToNearestTowncenter(closestUndiscovered.q, closestUndiscovered.r)
                ) {
                    closestUndiscovered = neighbor;
                }
            }
        }

        if (closestUndiscovered && !closestUndiscovered.discovered && isTileWithinReach(closestUndiscovered.q, closestUndiscovered.r)) {
            moveHeroWithRuntime(participant, closestUndiscovered, 'explore');
        }
    }
}

registerTask(exploreTask);
