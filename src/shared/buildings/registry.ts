import { applyVariant } from '../../core/variants';
import { discoverTile, ensureTileExists } from '../../core/world';
import { terrainPositions, updateTileVariantIndex } from '../../core/terrainRegistry';
import { listDockAccessTiles, isDockLandAccessTile } from '../game/docks.ts';
import { onBuildingCompleted as onPopulationBuildingCompleted } from '../../store/populationStore';
import {
    isTileActive,
    isTileControlled,
} from '../game/state/settlementSupportStore';
import { getTileSettlementId } from '../game/settlement';
import type { Hero } from '../../core/types/Hero';
import type { ResourceAmount } from '../../core/types/Resource';
import { SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile';
import type { TaskDefinition, TaskInstance, TaskType } from '../../core/types/Task';
import type { TileAnimationDef } from '../../core/terrainDefs.ts';
import type { TileUpdatedMessage } from '../protocol.ts';
import { broadcastGameMessage as broadcast } from '../game/runtime';
import { getMineOrePerCycle } from './mine.ts';
import { STUDY_WORK_CYCLE_MS } from '../studies/studies.ts';
import {
    ensureBarracksMilitaryState,
    ensureTownCenterMilitaryState,
    ensureWatchtowerMilitaryState,
} from '../game/military.ts';
import { hasLargeWaterBodyAdjacent } from '../game/harbor.ts';
import {
    countActiveAdjacentRevealedModifier,
    countActiveAdjacentRevealedSpecial,
    hasRevealedModifier,
    hasRevealedSpecial,
} from '../game/tileFeatures.ts';
import { hasAdjacentWallBuildAnchor } from '../game/walls.ts';
import type { StorageKind } from '../game/storage.ts';

export interface BuildingDefinition {
    key: string;
    label: string;
    summary: string;
    categoryLabel: string;
    buildTaskKey: TaskType;
    buildTaskLabel: string;
    sortOrder: number;
    variantKeys: string[];
    renderDecoration?: 'well' | 'watchtower' | 'depot' | 'lumberCamp' | 'granary';
    overlayAssetKey?: string;
    variantOverlayAssetKeys?: Partial<Record<string, string>>;
    overlayAssetAnimations?: Partial<Record<string, TileAnimationDef>>;
    overlayAnimation?: TileAnimationDef;
    overlayOffset?: { x: number; y: number };
    providesWaterSource?: boolean;
    providesWarehouse?: boolean;
    storageKind?: StorageKind;
    maxIncomingRoads?: number;
    requiredPopulation?: number; // minimum population to build
    jobSlots?: number;
    cycleMs?: number;
    consumes?: ResourceAmount[];
    produces?: ResourceAmount[];
    jobLabel?: string;
    jobKind?: 'production' | 'study' | 'service';
    jobPresentation?: 'indoor' | 'outdoor' | 'field';
    serviceConsumes?: ResourceAmount[];
    serviceConsumeMode?: 'all' | 'any';
    serviceCapacity?: number;
    repairResources?: ResourceAmount[];
    maintenanceDecayPerMinute?: number;
    getJobResources?(tile: Tile, assignedWorkers: number): { consumes?: ResourceAmount[]; produces?: ResourceAmount[] };
    canPlace(tile: Tile, hero: Hero): boolean;
    requiredXp(distance: number): number;
    heroRate(hero: Hero, tile: Tile): number;
    requiredResources(distance: number): ResourceAmount[];
    onStart?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;
    onComplete?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;
}

const STORAGE_BUILDING_VARIANTS = [
    'plains_food_storehouse',
    'dirt_food_storehouse',
    'plains_materials_yard',
    'dirt_materials_yard',
    'plains_crop_silo',
    'dirt_crop_silo',
    'plains_crafted_goods_storehouse',
    'dirt_crafted_goods_storehouse',
] as const;

function createStorehouseBuildingDefinition(config: {
    key: string;
    label: string;
    summary: string;
    buildTaskKey: TaskType;
    buildTaskLabel: string;
    sortOrder: number;
    storageKind: StorageKind;
    plainsVariant: typeof STORAGE_BUILDING_VARIANTS[number];
    dirtVariant: typeof STORAGE_BUILDING_VARIANTS[number];
    overlayAssetKey: string;
    requiredResources: ResourceAmount[];
}): BuildingDefinition {
    return {
        key: config.key,
        label: config.label,
        summary: config.summary,
        categoryLabel: 'Logistics',
        buildTaskKey: config.buildTaskKey,
        buildTaskLabel: config.buildTaskLabel,
        sortOrder: config.sortOrder,
        requiredPopulation: 3,
        variantKeys: [config.plainsVariant, config.dirtVariant],
        renderDecoration: 'depot',
        overlayAssetKey: config.overlayAssetKey,
        providesWarehouse: true,
        storageKind: config.storageKind,
        maxIncomingRoads: 1,
        repairResources: getStandardRepairResources(config.requiredResources),
        maintenanceDecayPerMinute: 1.2,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return config.requiredResources.map(cloneResource);
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, config.plainsVariant, { stagger: false, respectBiome: false });
                return;
            }

            if (tile.terrain === 'dirt') {
                applyVariant(tile, config.dirtVariant, { stagger: false, respectBiome: false });
            }
        },
    };
}

function cloneResource(resource: ResourceAmount): ResourceAmount {
    return {
        type: resource.type,
        amount: resource.amount,
    };
}

function getStandardRepairResources(requiredResources: ResourceAmount[]): ResourceAmount[] {
    return requiredResources.some((resource) => resource.type === 'stone')
        ? [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }]
        : [{ type: 'wood', amount: 1 }];
}

export function scaleJobResources(resources: ResourceAmount[] | undefined, multiplier: number): ResourceAmount[] {
    if (!resources?.length || multiplier <= 0) {
        return [];
    }

    return resources.map((resource) => ({
        type: resource.type,
        amount: resource.amount * multiplier,
    }));
}

export function resolveBuildingJobResources(
    building: Pick<BuildingDefinition, 'consumes' | 'produces' | 'getJobResources'>,
    tile: Tile | null | undefined,
    assignedWorkers: number,
) {
    const dynamic = tile ? building.getJobResources?.(tile, assignedWorkers) : null;

    return {
        consumes: dynamic?.consumes
            ? dynamic.consumes.map(cloneResource)
            : scaleJobResources(building.consumes, assignedWorkers),
        produces: dynamic?.produces
            ? dynamic.produces.map(cloneResource)
            : scaleJobResources(building.produces, assignedWorkers),
    };
}

function hasAdjacentNaturalWater(tile: Tile): boolean {
    const neighbors = tile.neighbors;
    if (!neighbors) return false;

    for (const side of SIDE_NAMES) {
        if (neighbors[side]?.terrain === 'water') {
            return true;
        }
    }

    return false;
}

function resolveDockVariant(tile: Tile, preferredSide?: TileSide) {
    const neighbors = tile.neighbors;
    if (!neighbors) return 'water_dock_a';

    // Docks must face a land tile so they cannot be chained from water-only access.
    if (preferredSide) {
        const preferredNeighbor = neighbors[preferredSide];
        if (isDockLandAccessTile(preferredNeighbor)) {
            return `water_dock_${preferredSide}`;
        }
    }

    // Fallback: find any adjacent land access tile.
    for (const side of SIDE_NAMES) {
        const neighbor = neighbors[side];
        if (isDockLandAccessTile(neighbor)) {
            return `water_dock_${side}`;
        }
    }

    return 'water_dock_a';
}

function findNeighborSideByCoords(tile: Tile, q: number, r: number): TileSide | null {
    const neighbors = tile.neighbors;
    if (!neighbors) return null;

    for (const side of SIDE_NAMES) {
        const neighbor = neighbors[side];
        if (neighbor && neighbor.q === q && neighbor.r === r) {
            return side;
        }
    }

    return null;
}

function resolveDockApproachSide(tile: Tile, hero: Hero): TileSide | null {
    const currentSide = findNeighborSideByCoords(tile, hero.q, hero.r);
    if (currentSide) {
        return currentSide;
    }

    const movement = hero.movement;
    if (!movement) {
        return null;
    }

    const path = movement.path;
    const destination = path.length > 0 ? path[path.length - 1] : movement.target;
    if (destination) {
        const destinationSide = findNeighborSideByCoords(tile, destination.q, destination.r);
        if (destinationSide) {
            return destinationSide;
        }
    }

    const previousCoord = path.length >= 2 ? path[path.length - 2] : movement.origin;
    if (!previousCoord) {
        return null;
    }

    return findNeighborSideByCoords(tile, previousCoord.q, previousCoord.r);
}

function countActiveConnectedTiles(tile: Tile, terrain: Tile['terrain']) {
    let count = tile.discovered && tile.terrain === terrain && isTileActive(tile) ? 1 : 0;
    const neighbors = tile.neighbors;
    if (!neighbors || !terrain) {
        return count;
    }

    for (const side of SIDE_NAMES) {
        const neighbor = neighbors[side];
        if (neighbor?.discovered && neighbor.terrain === terrain && isTileActive(neighbor)) {
            count += 1;
        }
    }

    return count;
}

function getQuarryStonePerCycle(tile: Tile, assignedWorkers: number) {
    if (assignedWorkers <= 0) {
        return 0;
    }

    const rockyBonus = hasRevealedModifier(tile, 'rocky_ground') ? 1 : 0;
    return (1 + Math.min(4, Math.max(1, countActiveConnectedTiles(tile, 'mountain'))) + rockyBonus) * assignedWorkers;
}

function countActiveAdjacentTiles(tile: Tile, terrain: Tile['terrain']) {
    let count = 0;
    const neighbors = tile.neighbors;
    if (!neighbors || !terrain) {
        return count;
    }

    for (const side of SIDE_NAMES) {
        const neighbor = neighbors[side];
        if (neighbor?.discovered && neighbor.terrain === terrain && isTileActive(neighbor)) {
            count += 1;
        }
    }

    return count;
}

function countApiaryForageTiles(tile: Tile) {
    return countActiveAdjacentTiles(tile, 'forest') + countActiveAdjacentTiles(tile, 'grain');
}

function getConnectedFieldCount(tile: Tile, terrain: Tile['terrain']) {
    return Math.max(1, countActiveConnectedTiles(tile, terrain));
}

function getBreweryBeerPerCycle(tile: Tile, assignedWorkers: number) {
    const connectedHops = getConnectedFieldCount(tile, 'hops');
    return Math.min(6, 2 + connectedHops) * assignedWorkers;
}

function getWineryWinePerCycle(tile: Tile, assignedWorkers: number) {
    const connectedGrapes = getConnectedFieldCount(tile, 'grapes');
    return Math.min(3, 1 + Math.floor(connectedGrapes / 2)) * assignedWorkers;
}

function revealTilesAround(tile: Tile, radius: number) {
    const settlementId = getTileSettlementId(tile);

    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            const target = ensureTileExists(tile.q + dq, tile.r + dr);
            discoverTile(target, {
                q: tile.q,
                r: tile.r,
                settlementId,
            });
        }
    }
}

export function promoteTileToTowncenter(tile: Tile, settlementId: string | null = getTileSettlementId(tile) ?? tile.id) {
    const previousTerrain = tile.terrain;
    const previousVariant = tile.variant;
    if (previousTerrain && previousTerrain !== 'towncenter') {
        terrainPositions[previousTerrain].delete(tile.id);
    }

    tile.terrain = 'towncenter';
    tile.variant = null;
    tile.isBaseTile = true;
    tile.variantSetMs = undefined;
    tile.discovered = true;
    tile.ownerSettlementId = settlementId;
    tile.controlledBySettlementId = settlementId;
    terrainPositions.towncenter.add(tile.id);
    updateTileVariantIndex(tile.id, previousVariant, null);
    ensureTownCenterMilitaryState(tile);

    broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
}

const buildings: BuildingDefinition[] = [
    {
        key: 'well',
        label: 'Well',
        summary: 'Brings water inland and hydrates nearby farm plots.',
        categoryLabel: 'Utility',
        buildTaskKey: 'buildWell',
        buildTaskLabel: 'Build Well',
        sortOrder: 10,
        variantKeys: ['plains_well', 'dirt_well'],
        renderDecoration: 'well',
        overlayAssetKey: 'building_well_overlay',
        providesWaterSource: true,
        canPlace(tile, _hero) {
            return (
                (tile.terrain === 'plains' || tile.terrain === 'dirt') &&
                tile.isBaseTile &&
                !hasAdjacentNaturalWater(tile)
            );
        },
        requiredXp(_distance: number) {
            return 2600;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 6 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_well', { stagger: false, respectBiome: false });
                return;
            }

            if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_well', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'watchtower',
        label: 'Watchtower',
        summary: 'Raises a lookout that immediately reveals a ring of nearby frontier.',
        categoryLabel: 'Frontier',
        buildTaskKey: 'buildWatchtower',
        buildTaskLabel: 'Build Watchtower',
        sortOrder: 15,
        requiredPopulation: 3,
        variantKeys: ['plains_watchtower', 'dirt_watchtower', 'mountains_watchtower', 'snow_watchtower', 'dessert_watchtower'],
        renderDecoration: 'watchtower',
        overlayAssetKey: 'building_watchtower_overlay',
        maxIncomingRoads: 1,
        canPlace(tile, _hero) {
            return (
                (tile.terrain === 'plains'
                    || tile.terrain === 'dirt'
                    || tile.terrain === 'mountain'
                    || tile.terrain === 'snow'
                    || tile.terrain === 'dessert') &&
                tile.isBaseTile
            );
        },
        requiredXp(_distance: number) {
            return 3000;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 5 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_watchtower', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_watchtower', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'mountain') {
                applyVariant(tile, 'mountains_watchtower', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'snow') {
                applyVariant(tile, 'snow_watchtower', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dessert') {
                applyVariant(tile, 'dessert_watchtower', { stagger: false, respectBiome: false });
            }

            revealTilesAround(tile, 3);
            ensureWatchtowerMilitaryState(tile);
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
            onPopulationBuildingCompleted();
        },
    },
    {
        key: 'beacon',
        label: 'Beacon',
        summary: 'Anchors a signal light that reveals nearby waters and extends your border watch.',
        categoryLabel: 'Frontier',
        buildTaskKey: 'buildBeacon',
        buildTaskLabel: 'Build Beacon',
        sortOrder: 15.5,
        requiredPopulation: 3,
        variantKeys: ['water_beacon'],
        overlayAssetKey: 'building_beacon',
        overlayOffset: { x: 0, y: -10 },
        canPlace(tile, _hero) {
            return tile.terrain === 'water' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3000;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 5 }];
        },
        onComplete(tile) {
            applyVariant(tile, 'water_beacon', { stagger: false, respectBiome: false });
            revealTilesAround(tile, 3);
            ensureWatchtowerMilitaryState(tile);
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
            onPopulationBuildingCompleted();
        },
    },
    {
        key: 'wall',
        label: 'Wall',
        summary: 'Raises a linked timber wall segment that blocks passage and extends from nearby defenses.',
        categoryLabel: 'Defense',
        buildTaskKey: 'buildWall',
        buildTaskLabel: 'Build Wall',
        sortOrder: 16,
        variantKeys: [
            'plains_wall',
            'plains_wall_ad',
            'plains_wall_be',
            'plains_wall_ce',
            'plains_wall_cf',
            'dirt_wall',
            'dirt_wall_ad',
            'dirt_wall_be',
            'dirt_wall_ce',
            'dirt_wall_cf',
            'plains_stone_wall',
            'plains_stone_wall_ad',
            'plains_stone_wall_be',
            'plains_stone_wall_ce',
            'plains_stone_wall_cf',
            'dirt_stone_wall',
            'dirt_stone_wall_ad',
            'dirt_stone_wall_be',
            'dirt_stone_wall_ce',
            'dirt_stone_wall_cf',
        ],
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt')
                && tile.isBaseTile
                && isTileControlled(tile)
                && hasAdjacentWallBuildAnchor(tile);
        },
        requiredXp(_distance: number) {
            return 1900;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 4 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_wall', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_wall', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'townCenter',
        label: 'Town Center',
        summary: 'Establishes a new settlement anchor and resets nearby tile levels to this frontier base.',
        categoryLabel: 'Settlement',
        buildTaskKey: 'buildTownCenter',
        buildTaskLabel: 'Found Town Center',
        sortOrder: 18,
        requiredPopulation: 7,
        variantKeys: [],
        canPlace(tile, _hero) {
            return (
                (tile.terrain === 'plains' || tile.terrain === 'dirt') &&
                tile.isBaseTile
            );
        },
        requiredXp(_distance: number) {
            return 12000;
        },
        heroRate(hero: Hero) {
            return 14 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 60 },
                { type: 'ore', amount: 12 },
                { type: 'tools', amount: 8 },
                { type: 'food', amount: 18 },
            ];
        },
        onComplete(tile, _instance, participants) {
            const settlementId = participants.find((hero) => !!hero.settlementId)?.settlementId
                ?? getTileSettlementId(tile)
                ?? tile.id;
            promoteTileToTowncenter(tile, settlementId);
            onPopulationBuildingCompleted();
        },
    },
    {
        key: 'supplyDepot',
        label: 'Supply Depot',
        summary: 'Adds a forward warehouse stop for deliveries and construction pickups.',
        categoryLabel: 'Logistics',
        buildTaskKey: 'buildSupplyDepot',
        buildTaskLabel: 'Build Supply Depot',
        sortOrder: 20,
        requiredPopulation: 3,
        variantKeys: ['plains_depot', 'dirt_depot', 'plains_warehouse', 'dirt_warehouse'],
        renderDecoration: 'depot',
        overlayAssetKey: 'building_supply_depot',
        variantOverlayAssetKeys: {
            plains_warehouse: 'building_warehouse',
            dirt_warehouse: 'building_warehouse',
        },
        providesWarehouse: true,
        maxIncomingRoads: 1,
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.2,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3400;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 8 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_depot', { stagger: false, respectBiome: false });
                return;
            }

            if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_depot', { stagger: false, respectBiome: false });
            }
        },
    },
    createStorehouseBuildingDefinition({
        key: 'foodStorehouse',
        label: 'Food Storehouse',
        summary: 'Stores fish, meat, bread, and drinks away from the general depot.',
        buildTaskKey: 'buildFoodStorehouse',
        buildTaskLabel: 'Build Food Storehouse',
        sortOrder: 21,
        storageKind: 'food_storehouse',
        plainsVariant: 'plains_food_storehouse',
        dirtVariant: 'dirt_food_storehouse',
        overlayAssetKey: 'building_food_storehouse',
        requiredResources: [{ type: 'wood', amount: 6 }],
    }),
    createStorehouseBuildingDefinition({
        key: 'materialsYard',
        label: 'Materials Yard',
        summary: 'Stores raw materials like wood, stone, ore, sand, and glass.',
        buildTaskKey: 'buildMaterialsYard',
        buildTaskLabel: 'Build Materials Yard',
        sortOrder: 22,
        storageKind: 'materials_yard',
        plainsVariant: 'plains_materials_yard',
        dirtVariant: 'dirt_materials_yard',
        overlayAssetKey: 'building_materials_yard',
        requiredResources: [{ type: 'wood', amount: 6 }],
    }),
    createStorehouseBuildingDefinition({
        key: 'cropSilo',
        label: 'Crop Silo',
        summary: 'Stores grain, hops, grapes, and water lilies in a dedicated crop store.',
        buildTaskKey: 'buildCropSilo',
        buildTaskLabel: 'Build Crop Silo',
        sortOrder: 23,
        storageKind: 'crop_silo',
        plainsVariant: 'plains_crop_silo',
        dirtVariant: 'dirt_crop_silo',
        overlayAssetKey: 'building_crop_silo',
        requiredResources: [{ type: 'wood', amount: 6 }],
    }),
    createStorehouseBuildingDefinition({
        key: 'craftedGoodsStorehouse',
        label: 'Crafted Goods Storehouse',
        summary: 'Stores tools and weapons separately from raw materials.',
        buildTaskKey: 'buildCraftedGoodsStorehouse',
        buildTaskLabel: 'Build Crafted Goods Storehouse',
        sortOrder: 24,
        storageKind: 'crafted_goods_storehouse',
        plainsVariant: 'plains_crafted_goods_storehouse',
        dirtVariant: 'dirt_crafted_goods_storehouse',
        overlayAssetKey: 'building_crafted_goods_storehouse',
        requiredResources: [
            { type: 'wood', amount: 6 },
            { type: 'stone', amount: 2 },
        ],
    }),
    {
        key: 'dock',
        label: 'Dock',
        summary: 'Creates a landing point from adjacent shore and lets fishermen bring in steady food.',
        categoryLabel: 'Harbor',
        buildTaskKey: 'buildDock',
        buildTaskLabel: 'Build Dock',
        sortOrder: 25,
        variantKeys: [
            'water_dock_a',
            'water_dock_b',
            'water_dock_c',
            'water_dock_d',
            'water_dock_e',
            'water_dock_f',
        ],
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 60_000,
        jobLabel: 'Fisher',
        jobPresentation: 'outdoor',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 2.4,
        getJobResources(tile, assignedWorkers) {
            const nearbyWaterTiles = countActiveAdjacentTiles(tile, 'water');
            return {
                produces: [{ type: 'fish', amount: Math.max(1, nearbyWaterTiles) * assignedWorkers }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'water'
                && tile.isBaseTile
                && isTileControlled(tile)
                && listDockAccessTiles(tile).some((candidate) => isTileActive(candidate));
        },
        requiredXp(_distance: number) {
            return 3000;
        },
        heroRate(hero: Hero) {
            return 20 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 5 }];
        },
        onStart(tile, instance, participants) {
            const starter = participants[0];
            if (!starter) return;

            instance.context = {
                ...(instance.context ?? {}),
                adjacentActiveAccess: true,
            };

            const approachSide = resolveDockApproachSide(tile, starter);
            if (approachSide) {
                instance.context.approachSide = approachSide;
            }
        },
        onComplete(tile, instance) {
            if (tile.terrain !== 'water') return;

            const approachSide = instance.context?.approachSide as TileSide | undefined;
            applyVariant(tile, resolveDockVariant(tile, approachSide), {
                stagger: false,
                respectBiome: false,
            });
        },
    },
    {
        key: 'harbor',
        label: 'Harbor',
        summary: 'Builds a trade harbor on large open water so the settlement can load cargo for arriving ships.',
        categoryLabel: 'Harbor',
        buildTaskKey: 'buildHarbor',
        buildTaskLabel: 'Build Harbor',
        sortOrder: 26,
        requiredPopulation: 5,
        variantKeys: ['plains_harbor', 'dirt_harbor'],
        overlayAssetKey: 'building_harbor',
        maxIncomingRoads: 1,
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.8,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt')
                && tile.isBaseTile
                && isTileControlled(tile)
                && hasLargeWaterBodyAdjacent(tile);
        },
        requiredXp(_distance: number) {
            return 5200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 18 },
                { type: 'stone', amount: 6 },
                { type: 'tools', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_harbor', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_harbor', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'tradeCenter',
        label: 'Trade Center',
        summary: 'Opens direct resource exchange for the settlement.',
        categoryLabel: 'Logistics',
        buildTaskKey: 'buildTradeCenter',
        buildTaskLabel: 'Build Trade Center',
        sortOrder: 27,
        requiredPopulation: 4,
        variantKeys: ['plains_trade_center', 'dirt_trade_center'],
        overlayAssetKey: 'building_trade_center',
        maxIncomingRoads: 1,
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.3,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt')
                && tile.isBaseTile
                && isTileControlled(tile);
        },
        requiredXp(_distance: number) {
            return 4200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 12 },
                { type: 'stone', amount: 8 },
                { type: 'tools', amount: 4 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_trade_center', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_trade_center', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'lumberCamp',
        label: 'Lumber Camp',
        summary: 'Claims a forest tile as a permanent timber site whose output scales with nearby woods.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildLumberCamp',
        buildTaskLabel: 'Build Lumber Camp',
        sortOrder: 30,
        requiredPopulation: 3,
        variantKeys: ['forest_lumber_camp', 'forest_sawmill'],
        renderDecoration: 'lumberCamp',
        overlayAssetKey: 'building_lumber_camp_overlay',
        variantOverlayAssetKeys: {
            forest_sawmill: 'building_sawmill_overlay',
        },
        jobSlots: 2,
        cycleMs: 60_000,
        jobLabel: 'Timber crew',
        jobPresentation: 'field',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 2.1,
        getJobResources(tile, assignedWorkers) {
            const denseForestBonus = hasRevealedModifier(tile, 'dense_forest')
                || countActiveAdjacentRevealedModifier(tile, 'dense_forest') > 0
                ? 1
                : 0;
            return {
                produces: [{ type: 'wood', amount: (countActiveConnectedTiles(tile, 'forest') + denseForestBonus) * 2 * assignedWorkers }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'forest' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 6 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'forest') {
                applyVariant(tile, 'forest_lumber_camp', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'huntersHut',
        label: 'Hunter Hut',
        summary: 'Claims a forest tile as a permanent hunting site whose meat output scales with nearby woods.',
        categoryLabel: 'Food',
        buildTaskKey: 'buildHuntersHut',
        buildTaskLabel: 'Build Hunter Hut',
        sortOrder: 31,
        requiredPopulation: 3,
        variantKeys: ['forest_hunters_hut'],
        overlayAssetKey: 'building_hunters_hut',
        jobSlots: 2,
        cycleMs: 60_000,
        produces: [{ type: 'meat', amount: 1 }],
        jobLabel: 'Hunter',
        jobPresentation: 'field',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.4,
        getJobResources(tile, assignedWorkers) {
            const denseForestBonus = hasRevealedModifier(tile, 'dense_forest')
                || countActiveAdjacentRevealedModifier(tile, 'dense_forest') > 0
                ? 1
                : 0;
            const meatPerWorker = Math.min(3, countActiveConnectedTiles(tile, 'forest') + denseForestBonus);
            return {
                produces: [{ type: 'meat', amount: meatPerWorker * assignedWorkers }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'forest' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 6 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'forest') {
                applyVariant(tile, 'forest_hunters_hut', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'granary',
        label: 'Granary',
        summary: 'Secures a grain tile as a grain store whose output scales with nearby fields.',
        categoryLabel: 'Agriculture',
        buildTaskKey: 'buildGranary',
        buildTaskLabel: 'Build Granary',
        sortOrder: 35,
        requiredPopulation: 3,
        variantKeys: ['grain_granary'],
        renderDecoration: 'granary',
        overlayAssetKey: 'building_granary_overlay_animated',
        overlayAnimation: { frames: 8, frameMs: 90 },
        jobSlots: 2,
        cycleMs: 60_000,
        jobLabel: 'Grain keeper',
        jobPresentation: 'field',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.9,
        getJobResources(tile, assignedWorkers) {
            const soilBonus = hasRevealedModifier(tile, 'rich_soil') ? 1 : 0;
            const basinBonus = countActiveAdjacentRevealedSpecial(tile, 'fertile_basin') > 0 ? 1 : 0;
            return {
                produces: [{ type: 'grain', amount: (countActiveConnectedTiles(tile, 'grain') + soilBonus + basinBonus) * assignedWorkers }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'grain' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3200;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 7 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'grain') {
                applyVariant(tile, 'grain_granary', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'bakery',
        label: 'Bakery',
        summary: 'Turns stored grain into bread once a settler staffs the ovens.',
        categoryLabel: 'Agriculture',
        buildTaskKey: 'buildBakery',
        buildTaskLabel: 'Build Bakery',
        sortOrder: 36,
        requiredPopulation: 3,
        variantKeys: ['plains_bakery', 'dirt_bakery'],
        overlayAssetKey: 'building_bakery',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 60_000,
        consumes: [{ type: 'grain', amount: 1 }],
        produces: [{ type: 'bread', amount: 4 }],
        jobLabel: 'Baker',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.6,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3000;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 6 },
                { type: 'stone', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_bakery', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_bakery', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'brewery',
        label: 'Brewery',
        summary: 'Anchors a hops field and turns stored grain into steady beer for colony morale.',
        categoryLabel: 'Hospitality',
        buildTaskKey: 'buildBrewery',
        buildTaskLabel: 'Build Brewery',
        sortOrder: 36.2,
        requiredPopulation: 6,
        variantKeys: ['hops_brewery', 'plains_brewery', 'dirt_brewery'],
        overlayAssetKey: 'building_brewery',
        maxIncomingRoads: 1,
        jobSlots: 2,
        cycleMs: 60_000,
        consumes: [{ type: 'grain', amount: 1 }],
        produces: [{ type: 'beer', amount: 6 }],
        jobLabel: 'Brewer',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.7,
        getJobResources(tile, assignedWorkers) {
            return {
                consumes: [{ type: 'grain', amount: assignedWorkers }],
                produces: [{ type: 'beer', amount: getBreweryBeerPerCycle(tile, assignedWorkers) }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'hops' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3600;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 8 },
                { type: 'stone', amount: 4 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'hops') {
                applyVariant(tile, 'hops_brewery', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'winery',
        label: 'Winery',
        summary: 'Anchors a grape field and presses steady wine for stronger colony morale.',
        categoryLabel: 'Hospitality',
        buildTaskKey: 'buildWinery',
        buildTaskLabel: 'Build Winery',
        sortOrder: 36.25,
        requiredPopulation: 6,
        variantKeys: ['grapes_winery', 'plains_winery', 'dirt_winery'],
        overlayAssetKey: 'building_winery',
        maxIncomingRoads: 1,
        jobSlots: 2,
        cycleMs: 60_000,
        produces: [{ type: 'wine', amount: 3 }],
        jobLabel: 'Vintner',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.7,
        getJobResources(tile, assignedWorkers) {
            return {
                produces: [{ type: 'wine', amount: getWineryWinePerCycle(tile, assignedWorkers) }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'grapes' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3800;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 8 },
                { type: 'stone', amount: 4 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'grapes') {
                applyVariant(tile, 'grapes_winery', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'pub',
        label: 'Pub',
        summary: 'A staffed social hall where settlers recover happiness over shared drinks.',
        categoryLabel: 'Hospitality',
        buildTaskKey: 'buildPub',
        buildTaskLabel: 'Build Pub',
        sortOrder: 36.3,
        requiredPopulation: 6,
        variantKeys: ['plains_pub', 'dirt_pub'],
        overlayAssetKey: 'building_pub',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 20_000,
        jobKind: 'service',
        serviceConsumes: [
            { type: 'beer', amount: 1 },
            { type: 'wine', amount: 1 },
        ],
        serviceConsumeMode: 'any',
        serviceCapacity: 3,
        jobLabel: 'Publican',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.4,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3200;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 7 },
                { type: 'stone', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_pub', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_pub', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'shop',
        label: 'Shop',
        summary: 'A staffed counter where settlers buy imported luxuries from trade ships.',
        categoryLabel: 'Hospitality',
        buildTaskKey: 'buildShop',
        buildTaskLabel: 'Build Shop',
        sortOrder: 36.35,
        requiredPopulation: 6,
        variantKeys: ['plains_shop', 'dirt_shop'],
        overlayAssetKey: 'building_shop',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 20_000,
        jobKind: 'service',
        serviceConsumes: [
            { type: 'tea', amount: 1 },
            { type: 'pottery', amount: 1 },
            { type: 'spices', amount: 1 },
            { type: 'silk', amount: 1 },
        ],
        serviceConsumeMode: 'any',
        serviceCapacity: 3,
        jobLabel: 'Shopkeeper',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.3,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 3300;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 8 },
                { type: 'stone', amount: 3 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_shop', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_shop', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'apiary',
        label: 'Apiary',
        summary: 'Keeps hives beside forests or grain fields and turns nearby forage into steady food.',
        categoryLabel: 'Food',
        buildTaskKey: 'buildApiary',
        buildTaskLabel: 'Build Apiary',
        sortOrder: 36.5,
        requiredPopulation: 3,
        variantKeys: ['plains_apiary', 'dirt_apiary'],
        overlayAssetKey: 'building_apiary',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 60_000,
        jobLabel: 'Beekeeper',
        jobPresentation: 'outdoor',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.5,
        getJobResources(tile, assignedWorkers) {
            const forageTiles = countApiaryForageTiles(tile);
            const richSoilBonus = hasRevealedModifier(tile, 'rich_soil') ? 1 : 0;
            const foodPerWorker = Math.max(1, Math.min(4, forageTiles + richSoilBonus));

            return {
                produces: [{ type: 'bread', amount: foodPerWorker * assignedWorkers }],
            };
        },
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt')
                && tile.isBaseTile
                && countApiaryForageTiles(tile) > 0;
        },
        requiredXp(_distance: number) {
            return 2200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 4 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_apiary', { stagger: false, respectBiome: false });
                return;
            }

            if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_apiary', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'oven',
        label: 'Oven',
        summary: 'Turns desert sand and steady fuel into glass for advanced housing.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildOven',
        buildTaskLabel: 'Build Oven',
        sortOrder: 37,
        requiredPopulation: 6,
        variantKeys: ['plains_oven', 'dirt_oven'],
        overlayAssetKey: 'building_oven',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 60_000,
        consumes: [
            { type: 'sand', amount: 2 },
            { type: 'wood', amount: 1 },
        ],
        produces: [{ type: 'glass', amount: 1 }],
        jobLabel: 'Glassmaker',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.8,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 4200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 10 },
                { type: 'stone', amount: 6 },
                { type: 'tools', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_oven', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_oven', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'workshop',
        label: 'Workshop',
        summary: 'Turns ore into tools for expansion and advanced upgrades.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildWorkshop',
        buildTaskLabel: 'Build Workshop',
        sortOrder: 38,
        requiredPopulation: 5,
        variantKeys: ['plains_workshop', 'dirt_workshop'],
        overlayAssetKey: 'building_workshop',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 60_000,
        consumes: [{ type: 'ore', amount: 2 }],
        produces: [{ type: 'tools', amount: 1 }],
        jobLabel: 'Toolmaker',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.8,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 4200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 10 },
                { type: 'stone', amount: 4 },
                { type: 'ore', amount: 4 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_workshop', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_workshop', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'library',
        label: 'Library',
        summary: 'Lets settlers on duty study long-form subjects that unlock colony buffs and advanced work.',
        categoryLabel: 'Knowledge',
        buildTaskKey: 'buildLibrary',
        buildTaskLabel: 'Build Library',
        sortOrder: 39,
        requiredPopulation: 5,
        variantKeys: ['plains_library', 'dirt_library'],
        overlayAssetKey: 'building_library',
        maxIncomingRoads: 1,
        jobSlots: 2,
        cycleMs: STUDY_WORK_CYCLE_MS,
        jobLabel: 'Scholar',
        jobKind: 'study',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.5,
        getJobResources() {
            return {
                produces: [],
            };
        },
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 5200;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 18 },
                { type: 'stone', amount: 6 },
                { type: 'tools', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_library', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_library', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'weaponSmith',
        label: 'Weapon Smith',
        summary: 'Forges frontier arms that let the barracks turn trained settlers into properly equipped guards.',
        categoryLabel: 'Military',
        buildTaskKey: 'buildWeaponSmith',
        buildTaskLabel: 'Build Weapon Smith',
        sortOrder: 39.5,
        requiredPopulation: 5,
        variantKeys: ['plains_weapon_smith', 'dirt_weapon_smith'],
        overlayAssetKey: 'building_weapon_smith',
        maxIncomingRoads: 1,
        jobSlots: 1,
        cycleMs: 60_000,
        consumes: [
            { type: 'ore', amount: 2 },
            { type: 'wood', amount: 1 },
        ],
        produces: [{ type: 'weapons', amount: 1 }],
        jobLabel: 'Weaponsmith',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.8,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 4600;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 12 },
                { type: 'stone', amount: 6 },
                { type: 'tools', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_weapon_smith', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_weapon_smith', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'barracks',
        label: 'Barracks',
        summary: 'Turns stored meals into trained guard reserves that can garrison towers or pressure hostile border towers.',
        categoryLabel: 'Military',
        buildTaskKey: 'buildBarracks',
        buildTaskLabel: 'Build Barracks',
        sortOrder: 40,
        requiredPopulation: 5,
        variantKeys: ['plains_barracks', 'dirt_barracks'],
        overlayAssetKey: 'building_barracks',
        maxIncomingRoads: 1,
        repairResources: [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
        maintenanceDecayPerMinute: 1.5,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 5200;
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 16 },
                { type: 'stone', amount: 6 },
                { type: 'tools', amount: 2 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_barracks', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_barracks', { stagger: false, respectBiome: false });
            }

            ensureBarracksMilitaryState(tile);
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        },
    },
    {
        key: 'house',
        label: 'House',
        summary: 'Shelters settlers and raises the colony population cap by 2.',
        categoryLabel: 'Settlement',
        buildTaskKey: 'buildHouse',
        buildTaskLabel: 'Build House',
        sortOrder: 37,
        variantKeys: ['plains_house', 'dirt_house', 'plains_stone_house', 'dirt_stone_house', 'plains_glass_house', 'dirt_glass_house'],
        maxIncomingRoads: 1,
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.1,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 2000;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [
                { type: 'wood', amount: 4 },
            ];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_house', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_house', { stagger: false, respectBiome: false });
            }

            onPopulationBuildingCompleted();
        },
    },
    {
        key: 'quarry',
        label: 'Quarry',
        summary: 'Cuts steady stone from a mountain cluster and turns finite salvage into a real industry.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildQuarry',
        buildTaskLabel: 'Build Quarry',
        sortOrder: 39,
        requiredPopulation: 4,
        variantKeys: ['mountains_with_quarry'],
        jobSlots: 1,
        cycleMs: 60_000,
        jobLabel: 'Stone crew',
        jobPresentation: 'outdoor',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.4,
        getJobResources(tile, assignedWorkers) {
            return {
                produces: [{ type: 'stone', amount: getQuarryStonePerCycle(tile, assignedWorkers) }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'mountain' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 4400;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 8 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'mountain') {
                applyVariant(tile, 'mountains_with_quarry', { stagger: false, respectBiome: true });
            }
        },
    },
    {
        key: 'mine',
        label: 'Mine',
        summary: 'Turns a mountain into a permanent ore extraction site staffed by miners.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildMine',
        buildTaskLabel: 'Build Mine',
        sortOrder: 40,
        requiredPopulation: 5,
        variantKeys: ['mountains_with_mine', 'mountains_reinforced_mine'],
        jobSlots: 1,
        cycleMs: 60_000,
        jobLabel: 'Miner',
        jobPresentation: 'outdoor',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.4,
        getJobResources(tile, assignedWorkers) {
            const oreBonus = hasRevealedSpecial(tile, 'rich_ore_vein') ? 1 : 0;
            return {
                produces: [{ type: 'ore', amount: getMineOrePerCycle(tile, assignedWorkers) + (oreBonus * assignedWorkers) }],
            };
        },
        canPlace(tile, _hero) {
            return tile.terrain === 'mountain' && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 5000;
        },
        heroRate(hero: Hero) {
            return 20 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 10 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'mountain') {
                applyVariant(tile, 'mountains_with_mine', { stagger: false, respectBiome: true });
            }
        },
    },
];

export function listBuildingDefinitions() {
    return buildings;
}

export function getBuildingDefinitionByTaskKey(taskKey: TaskType) {
    return buildings.find((building) => building.buildTaskKey === taskKey) ?? null;
}

export function getBuildingDefinitionByKey(buildingKey: string) {
    return buildings.find((building) => building.key === buildingKey) ?? null;
}

export function getBuildingDefinitionForTile(tile: Tile | null | undefined) {
    if (!tile?.variant) return null;
    return buildings.find((building) => building.variantKeys.includes(tile.variant ?? '')) ?? null;
}

export function getBuildingOverlayAssetKeyForTile(tile: Tile | null | undefined) {
    const building = getBuildingDefinitionForTile(tile);
    if (!building) return null;

    if (building.key === 'watchtower' && (tile?.towerWallLevel ?? 0) > 0) {
        return 'building_watchtower_palisade_overlay';
    }

    if (tile?.variant) {
        return building.variantOverlayAssetKeys?.[tile.variant] ?? building.overlayAssetKey ?? null;
    }

    return building.overlayAssetKey ?? null;
}

export function isBuildingTask(taskKey: TaskType) {
    return !!getBuildingDefinitionByTaskKey(taskKey);
}

export function createBuildTaskDefinition(building: BuildingDefinition): TaskDefinition {
    return {
        key: building.buildTaskKey,
        label: building.buildTaskLabel,
        chainAdjacentSameTerrain: false,
        canStart(tile, hero) {
            return building.canPlace(tile, hero);
        },
        requiredXp(distance: number) {
            return building.requiredXp(distance);
        },
        heroRate(hero: Hero, tile: Tile) {
            return building.heroRate(hero, tile);
        },
        requiredResources(distance: number) {
            return building.requiredResources(distance);
        },
        onStart(tile, instance, participants) {
            building.onStart?.(tile, instance, participants);
        },
        onComplete(tile, instance, participants) {
            building.onComplete?.(tile, instance, participants);
        },
    };
}
