import { registerTask } from '../taskRegistry';
import { applyVariant } from '../../../core/variants';
import type { Hero } from '../../../core/types/Hero';
import type { ResourceAmount } from '../../../core/types/Resource';
import type { TaskDefinition } from '../../../core/types/Task';
import { resolveBridgeVariantFromAccessTile } from '../../game/bridges.ts';
import { isTileControlled } from '../../game/state/settlementSupportStore';
import { findNearestTaskAccessTile } from '../taskAccess';
import { countActiveAdjacentRevealedSpecial, hasRevealedSpecial } from '../../game/tileFeatures.ts';

const buildBridgeTask: TaskDefinition = {
    key: 'buildBridge',
    label: 'Build Bridge',
    chainAdjacentSameTerrain: false,

    canStart(tile, hero) {
        if (
            tile.terrain !== 'water'
            || !tile.discovered
            || !tile.isBaseTile
            || !isTileControlled(tile)
        ) {
            return false;
        }

        const accessTile = findNearestTaskAccessTile('buildBridge', tile, hero.q, hero.r);
        return !!accessTile && !!resolveBridgeVariantFromAccessTile(tile, accessTile);
    },

    requiredXp(_distance: number) {
        return 2400;
    },

    heroRate(hero: Hero) {
        return 16 * Math.max(1, hero.stats.atk);
    },

    requiredResources(_distance: number, tile): ResourceAmount[] {
        const crossingBonus = hasRevealedSpecial(tile, 'natural_crossing')
            || countActiveAdjacentRevealedSpecial(tile, 'natural_crossing') > 0;
        return [{ type: 'wood', amount: crossingBonus ? 2 : 4 }];
    },

    onStart(tile, instance, participants) {
        const starter = participants[0];
        const accessTile = starter
            ? findNearestTaskAccessTile('buildBridge', tile, starter.q, starter.r)
            : null;
        const bridgeVariant = resolveBridgeVariantFromAccessTile(tile, accessTile);

        instance.context = {
            ...(instance.context ?? {}),
            adjacentActiveAccess: true,
            bridgeVariant,
        };
    },

    onComplete(tile, instance) {
        if (tile.terrain !== 'water' || !tile.isBaseTile) {
            return;
        }

        const bridgeVariant = typeof instance.context?.bridgeVariant === 'string'
            ? instance.context.bridgeVariant
            : null;

        if (!bridgeVariant) {
            return;
        }

        applyVariant(tile, bridgeVariant, { stagger: false, respectBiome: false });
    },
};

registerTask(buildBridgeTask);
