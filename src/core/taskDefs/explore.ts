import {type Hero, startHeroMovement} from '../../store/heroStore';
import {discoverTile, type Tile} from '../world';
import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import { TERRAIN_DEFS } from '../terrainDefs';
import { persistHeroes } from '../../store/heroStore';
import {HexMapService} from '../HexMapService';

const service = new HexMapService();

// Explore task definition separated for modularity.
const exploreTask: TaskDefinition = {
    key: 'explore',
    label: 'Explore',
    requiredXp(distance: number) {
        // Reduced required XP to fit real-time (per-second) progression; original was very high for tick-based system.
        return (distance*distance) * Math.max(1, distance * 6 * distance); // simple linear scaling for now
    },
    heroRate(hero: Hero, _tile) {
        return 10 * Math.max(1, hero.stats.xp);
    },
    totalRewardedStats(distance: number) {
        let rewardedXp = distance - 1;
        const tilesInRing = 6 * distance;
        rewardedXp /= tilesInRing;

        return { xp: Math.ceil(10* (distance * distance) / (6 * distance)), hp: 0, atk: 0, spd: 0 };
    },

    canStart(tile: Tile, hero: Hero): boolean {
        return !hero.carryingPayload && hero.carryingResources === false && tile.discovered === false;
    },

    onStart(_tile, _participants) {
    },
    onComplete(tile, _instance, participants) {
        discoverTile(tile);
        // After discovery, if terrain is non-walkable, move heroes back to their previous tile (if recorded)
        const def = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
        if (def && def.walkable === false) {
            for (const hero of participants) {
                if (hero.prevPos) {
                    const path = service.findWalkablePath(hero.q, hero.r, hero.prevPos.q, hero.prevPos.r);
                    startHeroMovement(hero.id, path, hero.prevPos)
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
    }
};

registerTask(exploreTask);
