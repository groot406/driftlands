import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import { getBuildingDefinitionForTile } from '../../../src/shared/buildings/registry.ts';
import { isJobSiteEnabled } from '../../../src/shared/buildings/jobSites.ts';
import { tileIndex } from '../../../src/shared/game/world.ts';
import type { SetJobSiteEnabledMessage, TileUpdatedMessage } from '../../../src/shared/protocol.ts';
import { refreshWorkforceState, resetJobSiteRuntime } from '../systems/jobSystem';
import { playerSettlementState } from '../state/playerSettlementState';

function isToggleableJobSite(tileId: string) {
    const tile = tileIndex[tileId];
    const building = getBuildingDefinitionForTile(tile);

    return !!tile
        && !!building
        && (building.jobSlots ?? 0) > 0
        && (building.cycleMs ?? 0) > 0;
}

export class ServerJobHandler {
    constructor(_io: Server) {}

    init(): void {
        serverMessageRouter.on('jobs:set_site_enabled', this.handleSetJobSiteEnabled.bind(this));
    }

    private handleSetJobSiteEnabled(socket: Socket, message: SetJobSiteEnabledMessage): void {
        if (!isToggleableJobSite(message.tileId)) {
            return;
        }

        const tile = tileIndex[message.tileId]!;
        const playerId = playerSettlementState.getSocketPlayerId(socket.id);
        const settlementId = playerSettlementState.getPlayerSettlement(playerId ?? '');
        if (!canSettlementManageTile(tile, settlementId)) {
            return;
        }

        if (isJobSiteEnabled(tile) === message.enabled) {
            return;
        }

        tile.jobSiteEnabled = message.enabled;
        resetJobSiteRuntime(tile.id);

        broadcast({
            type: 'tile:updated',
            tile,
        } satisfies TileUpdatedMessage);

        refreshWorkforceState();
    }
}

function canSettlementManageTile(
    tile: { id: string; terrain?: string | null; ownerSettlementId?: string | null; controlledBySettlementId?: string | null } | null | undefined,
    settlementId: string | null | undefined,
) {
    if (!tile || !settlementId) {
        return false;
    }

    if (tile.terrain === 'towncenter') {
        return tile.id === settlementId;
    }

    if (tile.ownerSettlementId) {
        return tile.ownerSettlementId === settlementId;
    }

    return tile.controlledBySettlementId === settlementId;
}
