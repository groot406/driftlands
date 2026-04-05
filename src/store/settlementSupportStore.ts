import { terrainPositions, variantPositions } from '../core/terrainRegistry';
import { tileIndex } from '../core/world';
import { axialDistanceCoords } from '../shared/game/hex';
import { isTileWalkable } from '../shared/game/navigation';
import type { Tile, TileActivationState, TileSupportBand } from '../core/types/Tile';

// Mission 4 asks the first settlement to push to 100 discovered tiles before
// watchtowers unlock, so a fully housed starter town needs enough headroom to
// keep that frontier online instead of collapsing the moment it gets there.
export const TC_FREE_ACTIVE_TILES = 60;
export const SUPPORT_PER_SETTLER = 5;
export const WATCHTOWER_SUPPORT_BONUS = 12;
export const ACTIVE_TILE_COST = 1;
export const FRAGILE_TILE_COUNT = 3;

export type PressureState = 'stable' | 'strained' | 'collapsing';

export interface SettlementSupportCounts {
    settlementId: string;
    ownedTileCount: number;
    activeTileCount: number;
    inactiveTileCount: number;
    fragileTileCount: number;
    uncontrolledTileCount: number;
}

export interface SettlementSupportSnapshot {
    supportCapacity: number;
    activeTileCount: number;
    inactiveTileCount: number;
    pressureState: PressureState;
    settlements: SettlementSupportCounts[];
}

interface RecalculateResult {
    changedTileIds: string[];
    newlyInactiveTileIds: string[];
    newlyActiveTileIds: string[];
    restoredTileIds: string[];
    snapshot: SettlementSupportSnapshot;
}

interface SupportSelectionResult {
    supportCapacity: number;
    activeNonTowncenterIds: Set<string>;
    activeWatchtowerIds: Set<string>;
}

const WATCHTOWER_VARIANT_KEYS = ['plains_watchtower', 'dirt_watchtower', 'mountains_watchtower'] as const;
const HOUSE_VARIANT_KEYS = ['plains_house', 'dirt_house'] as const;

const BUILDING_VARIANT_KEYS = new Set<string>([
    'plains_well',
    'dirt_well',
    'plains_depot',
    'dirt_depot',
    'plains_bakery',
    'dirt_bakery',
    'plains_house',
    'dirt_house',
    'forest_lumber_camp',
    'grain_granary',
    'mountains_with_mine',
    'water_dock_a',
    'water_dock_b',
    'water_dock_c',
    'water_dock_d',
    'water_dock_e',
    'water_dock_f',
]);

let lastSnapshot: SettlementSupportSnapshot = {
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
};

function addTilesInRadius(centerQ: number, centerR: number, radius: number, set: Set<string>) {
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            set.add(`${centerQ + dq},${centerR + dr}`);
        }
    }
}

function getTownCenters(): Tile[] {
    const townCenters: Tile[] = [];
    for (const tcId of terrainPositions.towncenter) {
        const tc = tileIndex[tcId];
        if (tc?.discovered && tc.terrain === 'towncenter') {
            townCenters.push(tc);
        }
    }

    townCenters.sort((a, b) => a.id.localeCompare(b.id));
    return townCenters;
}

function getWatchtowerTiles(): Tile[] {
    const watchtowerTiles: Tile[] = [];
    for (const variantKey of WATCHTOWER_VARIANT_KEYS) {
        const positions = variantPositions[variantKey];
        if (!positions) continue;
        for (const tileId of positions) {
            const tile = tileIndex[tileId];
            if (tile?.discovered) {
                watchtowerTiles.push(tile);
            }
        }
    }

    watchtowerTiles.sort((a, b) => a.id.localeCompare(b.id));
    return watchtowerTiles;
}

function computeReachTileIdsFromTownCenters(
    townCenters: Array<Pick<Tile, 'q' | 'r'>>,
    canActivateWatchtower: (tile: Tile) => boolean,
): Set<string> {
    const reachSet = new Set<string>();
    const watchtowerTiles = getWatchtowerTiles();
    const activatedWatchtowers = new Set<string>();

    for (const tc of townCenters) {
        addTilesInRadius(tc.q, tc.r, 8, reachSet);
    }

    let changed = true;
    while (changed) {
        changed = false;

        for (const watchtower of watchtowerTiles) {
            if (activatedWatchtowers.has(watchtower.id)) continue;
            if (!reachSet.has(watchtower.id)) continue;
            if (!canActivateWatchtower(watchtower)) continue;

            activatedWatchtowers.add(watchtower.id);
            addTilesInRadius(watchtower.q, watchtower.r, 5, reachSet);
            changed = true;
        }
    }

    return reachSet;
}

function isWatchtowerTile(tile: Tile | null | undefined) {
    if (!tile?.variant) return false;
    return WATCHTOWER_VARIANT_KEYS.includes(tile.variant as (typeof WATCHTOWER_VARIANT_KEYS)[number]);
}

function isBuildingPriorityTile(tile: Tile | null | undefined) {
    if (!tile?.variant) return false;
    if (isWatchtowerTile(tile)) return false;
    return BUILDING_VARIANT_KEYS.has(tile.variant);
}

function compareTileIds(a: string, b: string) {
    return a.localeCompare(b);
}

function compareActivationPriority(
    a: Tile,
    b: Tile,
    townCenterBySettlementId: Map<string, Tile>,
    ownerByTileId: Map<string, string | null>,
) {
    const aOwner = ownerByTileId.get(a.id);
    const bOwner = ownerByTileId.get(b.id);
    const aTownCenter = aOwner ? townCenterBySettlementId.get(aOwner) : null;
    const bTownCenter = bOwner ? townCenterBySettlementId.get(bOwner) : null;
    const aDistance = aTownCenter ? axialDistanceCoords(a.q, a.r, aTownCenter.q, aTownCenter.r) : Number.POSITIVE_INFINITY;
    const bDistance = bTownCenter ? axialDistanceCoords(b.q, b.r, bTownCenter.q, bTownCenter.r) : Number.POSITIVE_INFINITY;

    if (aDistance !== bDistance) {
        return aDistance - bDistance;
    }

    const aRank = isBuildingPriorityTile(a) ? 0 : isWatchtowerTile(a) ? 2 : 1;
    const bRank = isBuildingPriorityTile(b) ? 0 : isWatchtowerTile(b) ? 2 : 1;
    if (aRank !== bRank) {
        return aRank - bRank;
    }

    return compareTileIds(a.id, b.id);
}

function setsEqual(a: Set<string>, b: Set<string>) {
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function selectActiveTiles(
    townCenters: Tile[],
    populationCurrent: number,
    controlledTileIds: Set<string>,
    townCenterBySettlementId: Map<string, Tile>,
    ownerByTileId: Map<string, string | null>,
): SupportSelectionResult {
    let remainingCapacity = Math.max(0, (townCenters.length * TC_FREE_ACTIVE_TILES) + (populationCurrent * SUPPORT_PER_SETTLER));

    const activeNonTowncenterIds = new Set<string>();
    const activeWatchtowerIds = new Set<string>();

    const candidates = Array.from(controlledTileIds)
        .map((tileId) => tileIndex[tileId])
        .filter((tile): tile is Tile => {
            if (!tile || tile.terrain === 'towncenter') {
                return false;
            }

            return true;
        })
        .sort((a, b) => compareActivationPriority(a, b, townCenterBySettlementId, ownerByTileId));

    for (const tile of candidates) {
        if (remainingCapacity < ACTIVE_TILE_COST) {
            break;
        }

        activeNonTowncenterIds.add(tile.id);
        remainingCapacity -= ACTIVE_TILE_COST;

        if (isWatchtowerTile(tile)) {
            activeWatchtowerIds.add(tile.id);
            remainingCapacity += WATCHTOWER_SUPPORT_BONUS;
        }
    }

    return {
        supportCapacity: (townCenters.length * TC_FREE_ACTIVE_TILES)
            + (populationCurrent * SUPPORT_PER_SETTLER)
            + (activeWatchtowerIds.size * WATCHTOWER_SUPPORT_BONUS),
        activeNonTowncenterIds,
        activeWatchtowerIds,
    };
}

function getOwnedDiscoveredTiles() {
    return Object.values(tileIndex)
        .filter((tile) => tile.discovered && !!tile.terrain);
}

function chooseOwnerSettlement(
    tile: Tile,
    staticReachBySettlementId: Map<string, Set<string>>,
    townCenters: Tile[],
): string | null {
    if (tile.terrain === 'towncenter') {
        return tile.id;
    }

    let bestSettlementId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const townCenter of townCenters) {
        const reach = staticReachBySettlementId.get(townCenter.id);
        if (!reach?.has(tile.id)) continue;

        const distance = axialDistanceCoords(tile.q, tile.r, townCenter.q, townCenter.r);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSettlementId = townCenter.id;
            continue;
        }

        if (distance === bestDistance && bestSettlementId && townCenter.id < bestSettlementId) {
            bestSettlementId = townCenter.id;
        }
    }

    return bestSettlementId;
}

function buildSupportSnapshot(
    supportCapacity: number,
    activeNonTowncenterIds: Set<string>,
    ownerByTileId: Map<string, string | null>,
    controlledByTileId: Map<string, string | null>,
    hungerMs: number,
): SettlementSupportSnapshot {
    const countsBySettlementId = new Map<string, SettlementSupportCounts>();

    for (const tile of getOwnedDiscoveredTiles()) {
        if (tile.terrain === 'towncenter') continue;

        const ownerSettlementId = ownerByTileId.get(tile.id);
        if (!ownerSettlementId) continue;

        let counts = countsBySettlementId.get(ownerSettlementId);
        if (!counts) {
            counts = {
                settlementId: ownerSettlementId,
                ownedTileCount: 0,
                activeTileCount: 0,
                inactiveTileCount: 0,
                fragileTileCount: 0,
                uncontrolledTileCount: 0,
            };
            countsBySettlementId.set(ownerSettlementId, counts);
        }

        counts.ownedTileCount += 1;
        if (activeNonTowncenterIds.has(tile.id)) {
            counts.activeTileCount += 1;
        } else {
            counts.inactiveTileCount += 1;
        }

        if (!controlledByTileId.get(tile.id)) {
            counts.uncontrolledTileCount += 1;
        }

        if (tile.supportBand === 'fragile') {
            counts.fragileTileCount += 1;
        }
    }

    const settlements = Array.from(countsBySettlementId.values())
        .sort((a, b) => a.settlementId.localeCompare(b.settlementId));
    const ownedTileCount = settlements.reduce((sum, settlement) => sum + settlement.ownedTileCount, 0);
    const activeTileCount = settlements.reduce((sum, settlement) => sum + settlement.activeTileCount, 0);
    const inactiveTileCount = settlements.reduce((sum, settlement) => sum + settlement.inactiveTileCount, 0);

    let pressureState: PressureState = 'stable';
    if (hungerMs > 0 || inactiveTileCount >= Math.ceil(Math.max(1, ownedTileCount) * 0.25)) {
        pressureState = 'collapsing';
    } else if (inactiveTileCount > 0) {
        pressureState = 'strained';
    }

    return {
        supportCapacity,
        activeTileCount,
        inactiveTileCount,
        pressureState,
        settlements,
    };
}

export function resetSettlementSupportState() {
    lastSnapshot = {
        supportCapacity: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        pressureState: 'stable',
        settlements: [],
    };
}

export function getSettlementSupportSnapshot(): SettlementSupportSnapshot {
    return {
        ...lastSnapshot,
        settlements: lastSnapshot.settlements.map((settlement) => ({ ...settlement })),
    };
}

export function syncSettlementSupportSnapshot(snapshot: Partial<SettlementSupportSnapshot> | null | undefined) {
    lastSnapshot = {
        supportCapacity: snapshot?.supportCapacity ?? 0,
        activeTileCount: snapshot?.activeTileCount ?? 0,
        inactiveTileCount: snapshot?.inactiveTileCount ?? 0,
        pressureState: snapshot?.pressureState ?? 'stable',
        settlements: snapshot?.settlements?.map((settlement) => ({ ...settlement })) ?? [],
    };
}

export function recalculateSettlementSupport(populationCurrent: number, hungerMs: number): RecalculateResult {
    const townCenters = getTownCenters();
    const townCenterBySettlementId = new Map<string, Tile>(townCenters.map((townCenter) => [townCenter.id, townCenter]));
    const staticReachBySettlementId = new Map<string, Set<string>>();
    for (const townCenter of townCenters) {
        staticReachBySettlementId.set(
            townCenter.id,
            computeReachTileIdsFromTownCenters([townCenter], () => true),
        );
    }

    const ownerByTileId = new Map<string, string | null>();
    for (const tile of getOwnedDiscoveredTiles()) {
        ownerByTileId.set(tile.id, chooseOwnerSettlement(tile, staticReachBySettlementId, townCenters));
    }

    let activeWatchtowerIds = new Set(getWatchtowerTiles().map((tile) => tile.id));
    let controlledByTileId = new Map<string, string | null>();
    let selection: SupportSelectionResult = {
        supportCapacity: townCenters.length * TC_FREE_ACTIVE_TILES + (populationCurrent * SUPPORT_PER_SETTLER),
        activeNonTowncenterIds: new Set<string>(),
        activeWatchtowerIds: new Set<string>(),
    };

    for (let iteration = 0; iteration <= getWatchtowerTiles().length + 1; iteration++) {
        const liveReachBySettlementId = new Map<string, Set<string>>();
        for (const townCenter of townCenters) {
            liveReachBySettlementId.set(
                townCenter.id,
                computeReachTileIdsFromTownCenters(
                    [townCenter],
                    (watchtower) => activeWatchtowerIds.has(watchtower.id),
                ),
            );
        }

        controlledByTileId = new Map<string, string | null>();
        const controlledTileIds = new Set<string>();
        for (const tile of getOwnedDiscoveredTiles()) {
            const ownerSettlementId = ownerByTileId.get(tile.id);
            if (!ownerSettlementId) {
                controlledByTileId.set(tile.id, null);
                continue;
            }

            if (tile.terrain === 'towncenter') {
                controlledByTileId.set(tile.id, ownerSettlementId);
                controlledTileIds.add(tile.id);
                continue;
            }

            const liveReach = liveReachBySettlementId.get(ownerSettlementId);
            const controlledSettlementId = liveReach?.has(tile.id) ? ownerSettlementId : null;
            controlledByTileId.set(tile.id, controlledSettlementId);
            if (controlledSettlementId) {
                controlledTileIds.add(tile.id);
            }
        }

        selection = selectActiveTiles(
            townCenters,
            populationCurrent,
            controlledTileIds,
            townCenterBySettlementId,
            ownerByTileId,
        );

        if (setsEqual(selection.activeWatchtowerIds, activeWatchtowerIds)) {
            activeWatchtowerIds = selection.activeWatchtowerIds;
            break;
        }

        activeWatchtowerIds = selection.activeWatchtowerIds;
    }

    const activeBySettlementId = new Map<string, Tile[]>();
    for (const tileId of selection.activeNonTowncenterIds) {
        const tile = tileIndex[tileId];
        const ownerSettlementId = ownerByTileId.get(tileId);
        if (!tile || !ownerSettlementId) continue;

        const tiles = activeBySettlementId.get(ownerSettlementId) ?? [];
        tiles.push(tile);
        activeBySettlementId.set(ownerSettlementId, tiles);
    }

    const fragileTileIds = new Set<string>();
    for (const [settlementId, tiles] of activeBySettlementId.entries()) {
        tiles.sort((a, b) => compareActivationPriority(a, b, townCenterBySettlementId, ownerByTileId));
        for (let i = Math.max(0, tiles.length - FRAGILE_TILE_COUNT); i < tiles.length; i++) {
            const tile = tiles[i];
            if (tile) {
                fragileTileIds.add(tile.id);
            }
        }
        activeBySettlementId.set(settlementId, tiles);
    }

    const restoredTileIds: string[] = [];
    const changedTileIds: string[] = [];
    const newlyInactiveTileIds: string[] = [];
    const newlyActiveTileIds: string[] = [];

    for (const tile of Object.values(tileIndex)) {
        if (!tile.discovered || !tile.terrain) continue;

        const nextOwnerSettlementId = ownerByTileId.get(tile.id) ?? null;
        const nextControlledBySettlementId = controlledByTileId.get(tile.id) ?? null;
        const nextActivationState: TileActivationState = tile.terrain === 'towncenter' || selection.activeNonTowncenterIds.has(tile.id)
            ? 'active'
            : 'inactive';

        let nextSupportBand: TileSupportBand = 'stable';
        if (tile.terrain !== 'towncenter') {
            if (!nextControlledBySettlementId) {
                nextSupportBand = 'uncontrolled';
            } else if (nextActivationState === 'inactive') {
                nextSupportBand = 'inactive';
            } else if (fragileTileIds.has(tile.id)) {
                nextSupportBand = 'fragile';
            }
        }

        const previousActivationState = tile.activationState ?? 'active';
        const previousOwnerSettlementId = tile.ownerSettlementId ?? null;
        const previousControlledBySettlementId = tile.controlledBySettlementId ?? null;
        const previousSupportBand = tile.supportBand ?? null;

        if (previousActivationState !== nextActivationState) {
            if (nextActivationState === 'inactive') {
                newlyInactiveTileIds.push(tile.id);
            } else {
                newlyActiveTileIds.push(tile.id);
                if (previousActivationState === 'inactive') {
                    restoredTileIds.push(tile.id);
                }
            }
        }

        tile.ownerSettlementId = nextOwnerSettlementId;
        tile.controlledBySettlementId = nextControlledBySettlementId;
        tile.activationState = nextActivationState;
        tile.supportBand = nextSupportBand;

        if (
            previousActivationState !== nextActivationState
            || previousOwnerSettlementId !== nextOwnerSettlementId
            || previousControlledBySettlementId !== nextControlledBySettlementId
            || previousSupportBand !== nextSupportBand
        ) {
            changedTileIds.push(tile.id);
        }
    }

    lastSnapshot = buildSupportSnapshot(
        selection.supportCapacity,
        selection.activeNonTowncenterIds,
        ownerByTileId,
        controlledByTileId,
        hungerMs,
    );

    return {
        changedTileIds,
        newlyInactiveTileIds,
        newlyActiveTileIds,
        restoredTileIds,
        snapshot: getSettlementSupportSnapshot(),
    };
}

export function computeControlledTileIds() {
    const settlementIds = getTownCenters();
    return computeReachTileIdsFromTownCenters(
        settlementIds,
        (watchtower) => isTileActive(watchtower),
    );
}

export function computeControlledTileIdsForTC(tcQ: number, tcR: number) {
    return computeReachTileIdsFromTownCenters(
        [{ q: tcQ, r: tcR }],
        (watchtower) => isTileActive(watchtower),
    );
}

export function computeOwnedTileIds() {
    const owned = new Set<string>();

    for (const tile of getOwnedDiscoveredTiles()) {
        if (tile.ownerSettlementId) {
            owned.add(tile.id);
        }
    }

    return owned;
}

export function computeOwnedTileIdsForSettlement(settlementId: string | null | undefined) {
    if (!settlementId) {
        return new Set<string>();
    }

    const owned = new Set<string>();
    for (const tile of getOwnedDiscoveredTiles()) {
        if (tile.ownerSettlementId === settlementId) {
            owned.add(tile.id);
        }
    }

    return owned;
}

export function computeOwnedTileIdsForTC(tcQ: number, tcR: number) {
    return computeOwnedTileIdsForSettlement(`${tcQ},${tcR}`);
}

function findSettlementIdForWatchtower(wtQ: number, wtR: number) {
    const tile = tileIndex[`${wtQ},${wtR}`];
    return tile?.ownerSettlementId ?? null;
}

export function computeControlledTileIdsForWatchtower(wtQ: number, wtR: number) {
    const settlementId = findSettlementIdForWatchtower(wtQ, wtR);
    const townCenter = settlementId ? tileIndex[settlementId] : null;
    if (!townCenter) {
        return new Set<string>();
    }

    return computeControlledTileIdsForTC(townCenter.q, townCenter.r);
}

export function isPositionControlled(q: number, r: number) {
    return computeControlledTileIds().has(`${q},${r}`);
}

export function isTileControlled(tile: Tile | null | undefined) {
    if (!tile) return false;
    if (!tile.discovered) {
        return isPositionControlled(tile.q, tile.r);
    }

    if (tile.terrain === 'towncenter') return true;
    if (typeof tile.controlledBySettlementId !== 'undefined') {
        return !!tile.controlledBySettlementId;
    }

    return isPositionControlled(tile.q, tile.r);
}

export function isTileActive(tile: Tile | null | undefined) {
    if (!tile) return false;
    if (!tile.discovered) return false;
    if (tile.terrain === 'towncenter') return true;
    return tile.activationState !== 'inactive';
}

export function countActiveHouseTiles() {
    let houseCount = 0;
    for (const variantKey of HOUSE_VARIANT_KEYS) {
        const positions = variantPositions[variantKey];
        if (!positions) continue;
        for (const tileId of positions) {
            if (isTileActive(tileIndex[tileId])) {
                houseCount++;
            }
        }
    }

    return houseCount;
}

export function listActiveAdjacentTiles(tile: Tile | null | undefined) {
    if (!tile?.neighbors) return [];
    const result: Tile[] = [];

    for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        const neighbor = tile.neighbors[side];
        if (neighbor?.discovered && isTileActive(neighbor)) {
            result.push(neighbor);
        }
    }

    result.sort((a, b) => compareTileIds(a.id, b.id));
    return result;
}

export function listActiveAdjacentAccessTiles(tile: Tile | null | undefined) {
    return listActiveAdjacentTiles(tile).filter((candidate) => isTileWalkable(candidate));
}

export function findNearestActiveAdjacentTile(tile: Tile | null | undefined, fromQ: number, fromR: number) {
    const candidates = listActiveAdjacentTiles(tile);
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const distance = axialDistanceCoords(fromQ, fromR, candidate.q, candidate.r);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
            continue;
        }

        if (distance === bestDistance && best && candidate.id < best.id) {
            best = candidate;
        }
    }

    return best;
}

export function findNearestActiveAdjacentAccessTile(tile: Tile | null | undefined, fromQ: number, fromR: number) {
    const candidates = listActiveAdjacentAccessTiles(tile);
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const distance = axialDistanceCoords(fromQ, fromR, candidate.q, candidate.r);
        if (distance < bestDistance || (distance === bestDistance && compareTileIds(candidate.id, best?.id ?? candidate.id) < 0)) {
            best = candidate;
            bestDistance = distance;
        }
    }

    return best;
}

export function findNearestActiveTileInSettlement(fromQ: number, fromR: number, settlementId: string | null | undefined) {
    if (!settlementId) return null;

    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const tile of getOwnedDiscoveredTiles()) {
        if (tile.ownerSettlementId !== settlementId) continue;
        if (!isTileActive(tile)) continue;

        const distance = axialDistanceCoords(fromQ, fromR, tile.q, tile.r);
        if (distance < bestDistance) {
            best = tile;
            bestDistance = distance;
            continue;
        }

        if (distance === bestDistance && best && tile.id < best.id) {
            best = tile;
        }
    }

    return best;
}
