import {type Hero, persistHeroes, startHeroMovement} from '../../store/heroStore';
import {discoverTile, hexDistance, type Tile, type TileNeighborMap} from '../world';
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
        // Reduced required XP to fit real-time (per-second) progression; original was very high for tick-based system.
        return (distance * distance) * Math.max(1, distance * 6 * distance); // simple linear scaling for now
    },
    heroRate(hero: Hero, _tile) {
        return 10 * Math.max(1, hero.stats.xp);
    },
    totalRewardedStats(distance: number) {
        let rewardedXp = distance - 1;
        const tilesInRing = 6 * distance;
        rewardedXp /= tilesInRing;

        return {xp: Math.ceil(10 * (distance * distance) / (6 * distance)), hp: 0, atk: 0, spd: 0};
    },

    canStart(tile: Tile, hero: Hero): boolean {
        return !hero.carryingPayload && hero.carryingResources === false && !tile.discovered;
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
        if (def && def.walkable === false) {
            for (const hero of participants) {
                if (hero.prevPos) {
                    const path = service.findWalkablePath(hero.q, hero.r, hero.prevPos.q, hero.prevPos.r);
                    startHeroMovement(hero.id, path, hero.prevPos, 'explore');
                }
            }
            persistHeroes();
        } else {
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

        let sides = ['a', 'b', 'c', 'd', 'e', 'f'];
        // shuffle sides to add some randomness to exploration direction
        sides = sides.sort(() => Math.random() - 0.5);
        for (const side of sides as const) {
            const neighbor = (nm as TileNeighborMap)[side];

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
