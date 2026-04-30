import { registerTask } from '../taskRegistry';
import { applyVariant } from '../../../core/variants';
import type { Hero } from '../../../core/types/Hero';
import type { ResourceAmount } from '../../../core/types/Resource';
import type { TaskDefinition } from '../../../core/types/Task';
import { resolveTunnelVariantFromAccessTile } from '../../game/bridges.ts';
import { isTileControlled } from '../../game/state/settlementSupportStore';
import { findNearestTaskAccessTile } from '../taskAccess';

const buildTunnelTask: TaskDefinition = {
    key: 'buildTunnel',
    label: 'Build Tunnel',
    chainAdjacentSameTerrain: false,

    canStart(tile, hero) {
        if (
            tile.terrain !== 'mountain'
            || !tile.discovered
            || !tile.isBaseTile
            || !isTileControlled(tile)
        ) {
            return false;
        }

        const accessTile = findNearestTaskAccessTile('buildTunnel', tile, hero.q, hero.r, hero.settlementId ?? null);
        return !!accessTile && !!resolveTunnelVariantFromAccessTile(tile, accessTile);
    },

    requiredXp(_distance: number) {
        return 2400;
    },

    heroRate(hero: Hero) {
        return 16 * Math.max(1, hero.stats.atk);
    },

    requiredResources(_distance: number): ResourceAmount[] {
        return [{ type: 'wood', amount: 4 }];
    },

    onStart(tile, instance, participants) {
        const starter = participants[0];
        const accessTile = starter
            ? findNearestTaskAccessTile('buildTunnel', tile, starter.q, starter.r, starter.settlementId ?? null)
            : null;
        const tunnelVariant = resolveTunnelVariantFromAccessTile(tile, accessTile);

        instance.context = {
            ...(instance.context ?? {}),
            adjacentActiveAccess: true,
            tunnelVariant,
        };
    },

    onComplete(tile, instance) {
        if (tile.terrain !== 'mountain' || !tile.isBaseTile) {
            return;
        }

        const tunnelVariant = typeof instance.context?.tunnelVariant === 'string'
            ? instance.context.tunnelVariant
            : null;

        if (!tunnelVariant) {
            return;
        }

        applyVariant(tile, tunnelVariant, { stagger: false, respectBiome: false });
    },
};

registerTask(buildTunnelTask);
