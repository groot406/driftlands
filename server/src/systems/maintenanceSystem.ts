import type { TickContext } from '../tick';
import type { TileUpdatedMessage } from '../../../src/shared/protocol';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import { tileIndex } from '../../../src/shared/game/world';
import {
    clampBuildingCondition,
    getTileMaintenanceDecayPerMinute,
    initializeBuildingCondition,
    isMaintainedBuildingTile,
    updateTileCondition,
} from '../../../src/shared/buildings/maintenance';

export const maintenanceSystem = {
    name: 'maintenance',

    init: () => {
        const now = Date.now();
        for (const tile of Object.values(tileIndex)) {
            initializeBuildingCondition(tile, now);
        }
    },

    tick: (ctx: TickContext) => {
        for (const tile of Object.values(tileIndex)) {
            if (!isMaintainedBuildingTile(tile)) {
                continue;
            }

            initializeBuildingCondition(tile, ctx.now);
            const decayPerMinute = getTileMaintenanceDecayPerMinute(tile);
            if (decayPerMinute <= 0) {
                continue;
            }

            const current = clampBuildingCondition(tile.condition);
            const degraded = current - ((decayPerMinute * ctx.dt) / 60_000);
            if (!updateTileCondition(tile, degraded, ctx.now)) {
                continue;
            }

            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        }
    },
};
