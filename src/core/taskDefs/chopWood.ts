import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../tasks';
import { startHeroMovement, persistHeroes } from '../../store/heroStore';
import type { Hero } from '../../store/heroStore';
import { terrainPositions, tileIndex, worldVersion } from '../world';
import { HexMapService } from '../HexMapService';

// Service instance for pathfinding (stateless enough to create locally)
const service = new HexMapService();

// Helper to find nearest towncenter tile (warehouse)
function findNearestTowncenter(q: number, r: number) {
    let best: { q: number; r: number } | null = null;
    let bestDist = Infinity;
    for (const id of terrainPositions.towncenter) {
        const t = tileIndex[id];
        if (!t) continue;
        const dq = Math.abs(t.q - q);
        const dr = Math.abs(t.r - r);
        const ds = Math.abs((-t.q - t.r) - (-q - r));
        const dist = Math.max(dq, dr, ds);
        if (dist < bestDist) { bestDist = dist; best = { q: t.q, r: t.r }; }
    }
    return best;
}

const chopWoodTask: TaskDefinition = {
    key: 'chopWood',
    label: 'Chop Wood',
    requiredXp(_distance: number) {
        // Fixed effort per forest tile for now
        return 120; // tune later
    },
    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 8 + hero.stats.atk * 2;
    },
    totalRewardedStats(_distance: number) {
        // Provide modest xp reward; other stats unchanged
        return { xp: 10, hp: 0, atk: 0, spd: 0 };
    },
    onStart(tile, participants) {
        // Ensure tile is forest; otherwise abort by marking inactive immediately (fallback safety)
        if (tile.terrain !== 'forest') {
            // Not forest: mark task instantly complete with zero rewards
            // (Rely on onComplete to convert terrain, but we skip here)
        }
        for (const hero of participants) {
            // Snapshot original position before chopping (for return after delivery)
            if (!hero.returnPos) hero.returnPos = { q: hero.q, r: hero.r };
        }
        persistHeroes();
    },
    onComplete(tile, _instance, participants) {
        // Replace forest with chopped_forest (only if still forest)
        if (tile.terrain === 'forest') {
            terrainPositions.forest.delete(tile.id);
            tile.terrain = 'chopped_forest';
            terrainPositions.chopped_forest.add(tile.id);
            worldVersion.value++; // trigger redraw
        }
        // For each participating hero: mark carrying wood and send to nearest towncenter
        for (const hero of participants) {
            hero.carryingWood = true;
            if (!hero.returnPos) hero.returnPos = { q: hero.q, r: hero.r }; // fallback
            const tc = findNearestTowncenter(hero.q, hero.r);
            if (tc) {
                const path = service.findWalkablePath(hero.q, hero.r, tc.q, tc.r);
                if (path && path.length) {
                    startHeroMovement(hero.id, path, tc);
                }
            }
        }
        persistHeroes();
    }
};

registerTask(chopWoodTask);
