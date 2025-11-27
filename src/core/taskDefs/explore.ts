import {type Hero, persistHeroes, startHeroMovement} from '../../store/heroStore';
import {discoverTile, hexDistance, type Tile, type TileSide} from '../world';
import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import {TERRAIN_DEFS} from '../terrainDefs';
import {HexMapService} from '../HexMapService';

const service = new HexMapService();

// Explore task definition separated for modularity.
const exploreTask: TaskDefinition = {
    key: 'explore',
    label: 'Explore',
    chainAdjacentSameTerrain: true,
    requiredXp(distance: number) {
        return (Math.pow(distance * 4, 3));
    },
    heroRate(hero: Hero, _tile) {
        return 10 * Math.max(1, hero.stats.xp);
    },
    totalRewardedStats(distance: number) {
        let rewardedXp = distance - 1;
        const tilesInRing = 6 * distance;
        rewardedXp /= tilesInRing;

        return {xp: Math.ceil(5 * (distance * distance) / (6 * distance)), hp: 0, atk: 0, spd: 0};
    },

    canStart(tile: Tile, hero: Hero): boolean {
        return !hero.carryingPayload && !tile.discovered;
    },

    onStart(_tile, _participants) {
        if(_tile.discovered) {
            // Tile already discovered; abort explore task implicitly by not setting any special flags.
            continueExploration(_tile, _participants);
        }
        return;
    },
    onComplete(tile, _instance, participants) {
        discoverTile(tile);

        // After discovery, if terrain is non-walkable, move heroes back to their previous tile (if recorded)
        const def = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
        if (def && def.walkable) {
            // Clear prevPos snapshot on successful, walkable discovery
            for (const hero of participants) {
                hero.prevPos = undefined;
            }
            persistHeroes();
        }

        continueExploration(tile, participants);
        persistHeroes();
    },
};

function continueExploration(tile: Tile, participants: Hero[]) {
    // find lowest distance neighboring tile that is not discovered and start moving there to chain
    for (const participant of participants) {
        const nm = tile.neighbors;
        let closestUndiscovered: Tile|null = null;

        let sides: TileSide[] = ['a', 'b', 'c', 'd', 'e', 'f'];
        // shuffle sides to add some randomness to exploration direction
        sides = sides.sort(() => Math.random() - 0.5);
        for (const side of sides) {
            if(!nm) break;
            const neighbor = nm[side];

            if (neighbor && !neighbor.discovered) {
                if (!closestUndiscovered) {
                    closestUndiscovered = neighbor;
                } else if(!neighbor.discovered && hexDistance(neighbor.q, neighbor.r) < hexDistance(closestUndiscovered.q, closestUndiscovered.r)) {
                    closestUndiscovered = neighbor;
                }
            }
        }

        if (closestUndiscovered && !closestUndiscovered.discovered) {
            const path = service.findWalkablePath(participant.q, participant.r, closestUndiscovered.q, closestUndiscovered.r);
            if (path && path.length) {
                startHeroMovement(participant.id, path, {
                    q: closestUndiscovered.q,
                    r: closestUndiscovered.r
                }, 'explore');
            }
        }
    }
}

registerTask(exploreTask);
