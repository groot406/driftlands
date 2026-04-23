import { applyVariant } from '../../core/variants';
import { discoverTile, ensureTileExists } from '../../core/world';
import { terrainPositions } from '../../core/terrainRegistry';
import { listDockAccessTiles, isDockLandAccessTile } from '../game/docks.ts';
import { onBuildingCompleted as onPopulationBuildingCompleted } from '../../store/populationStore';
import {
    isTileActive,
    isTileControlled,
} from '../game/state/settlementSupportStore';
import type { Hero } from '../../core/types/Hero';
import type { ResourceAmount } from '../../core/types/Resource';
import { SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile';
import type { TaskDefinition, TaskInstance, TaskType } from '../../core/types/Task';
import type { TileUpdatedMessage } from '../protocol.ts';
import { broadcastGameMessage as broadcast } from '../game/runtime';
import { getMineOrePerCycle } from './mine.ts';
import { STUDY_WORK_CYCLE_MS } from '../studies/studies.ts';
import {
    countActiveAdjacentRevealedModifier,
    countActiveAdjacentRevealedSpecial,
    hasRevealedModifier,
    hasRevealedSpecial,
} from '../game/tileFeatures.ts';

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
    overlayOffset?: { x: number; y: number };
    providesWaterSource?: boolean;
    providesWarehouse?: boolean;
    maxIncomingRoads?: number;
    requiredPopulation?: number; // minimum population to build
    jobSlots?: number;
    cycleMs?: number;
    consumes?: ResourceAmount[];
    produces?: ResourceAmount[];
    jobLabel?: string;
    jobKind?: 'production' | 'study';
    jobPresentation?: 'indoor' | 'outdoor' | 'field';
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

function cloneResource(resource: ResourceAmount): ResourceAmount {
    return {
        type: resource.type,
        amount: resource.amount,
    };
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
    return (Math.min(4, Math.max(1, countActiveConnectedTiles(tile, 'mountain'))) + rockyBonus) * assignedWorkers;
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

function revealTilesAround(tile: Tile, radius: number) {
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            const target = ensureTileExists(tile.q + dq, tile.r + dr);
            discoverTile(target);
        }
    }
}

function promoteTileToTowncenter(tile: Tile) {
    const previousTerrain = tile.terrain;
    if (previousTerrain && previousTerrain !== 'towncenter') {
        terrainPositions[previousTerrain].delete(tile.id);
    }

    tile.terrain = 'towncenter';
    tile.variant = null;
    tile.isBaseTile = true;
    tile.variantSetMs = undefined;
    tile.discovered = true;
    terrainPositions.towncenter.add(tile.id);

    broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
}

const buildings: BuildingDefinition[] = [
    {
        key: 'campfire',
        label: 'Campfire',
        summary: 'Lights a temporary frontier hearth that keeps nearby controlled tiles online for a few minutes.',
        categoryLabel: 'Frontier',
        buildTaskKey: 'buildCampfire',
        buildTaskLabel: 'Build Campfire',
        sortOrder: 12,
        variantKeys: ['plains_campfire', 'dirt_campfire'],
        overlayAssetKey: 'building_campfire',
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && tile.isBaseTile;
        },
        requiredXp(_distance: number) {
            return 1200;
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(_distance: number) {
            return [{ type: 'wood', amount: 3 }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_campfire', { stagger: false, respectBiome: false });
                return;
            }

            if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_campfire', { stagger: false, respectBiome: false });
            }
        },
    },
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
        variantKeys: ['plains_watchtower', 'dirt_watchtower', 'mountains_watchtower'],
        renderDecoration: 'watchtower',
        overlayAssetKey: 'building_watchtower_overlay',
        maxIncomingRoads: 1,
        canPlace(tile, _hero) {
            return (
                (tile.terrain === 'plains' || tile.terrain === 'dirt' || tile.terrain === 'mountain') &&
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
            }

            revealTilesAround(tile, 3);
            onPopulationBuildingCompleted();
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
        onComplete(tile) {
            promoteTileToTowncenter(tile);
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
        overlayAssetKey: 'building_depot_overlay',
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
                produces: [{ type: 'food', amount: Math.max(1, nearbyWaterTiles) * assignedWorkers }],
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
        jobSlots: 1,
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
                produces: [{ type: 'wood', amount: (countActiveConnectedTiles(tile, 'forest') + denseForestBonus) * assignedWorkers }],
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
        summary: 'Claims a forest tile as a permanent hunting site whose food output scales with nearby woods.',
        categoryLabel: 'Food',
        buildTaskKey: 'buildHuntersHut',
        buildTaskLabel: 'Build Hunter Hut',
        sortOrder: 31,
        requiredPopulation: 3,
        variantKeys: ['forest_hunters_hut'],
        overlayAssetKey: 'building_hunters_hut',
        jobSlots: 1,
        cycleMs: 60_000,
        produces: [{ type: 'food', amount: 1 }],
        jobLabel: 'Hunter',
        jobPresentation: 'field',
        repairResources: [{ type: 'wood', amount: 1 }],
        maintenanceDecayPerMinute: 1.4,
        getJobResources(tile, assignedWorkers) {
            const denseForestBonus = hasRevealedModifier(tile, 'dense_forest')
                || countActiveAdjacentRevealedModifier(tile, 'dense_forest') > 0
                ? 1
                : 0;
            return {
                produces: [{ type: 'food', amount: (countActiveConnectedTiles(tile, 'forest') + denseForestBonus) * assignedWorkers }],
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
        overlayAssetKey: 'building_granary_overlay',
        jobSlots: 1,
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
        summary: 'Turns stored grain into food once a settler staffs the ovens.',
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
        produces: [{ type: 'food', amount: 3 }],
        jobLabel: 'Baker',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'stone', amount: 1 }],
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
        repairResources: [{ type: 'stone', amount: 1 }],
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
        repairResources: [{ type: 'stone', amount: 1 }],
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
        overlayAssetKey: 'building_library_overlay',
        maxIncomingRoads: 1,
        jobSlots: 2,
        cycleMs: STUDY_WORK_CYCLE_MS,
        jobLabel: 'Scholar',
        jobKind: 'study',
        jobPresentation: 'indoor',
        repairResources: [{ type: 'wood', amount: 1 }],
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
        repairResources: [{ type: 'stone', amount: 1 }],
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
        repairResources: [{ type: 'stone', amount: 1 }],
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
