import { applyVariant } from '../../core/variants';
import { discoverTile, ensureTileExists } from '../../core/world';
import { terrainPositions } from '../../core/terrainRegistry';
import { isTileWalkable } from '../game/navigation';
import { onBuildingCompleted as onPopulationBuildingCompleted } from '../../store/populationStore';
import type { Hero } from '../../core/types/Hero';
import type { ResourceAmount } from '../../core/types/Resource';
import { SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile';
import type { TaskDefinition, TaskInstance, TaskType } from '../../core/types/Task';
import type { TileUpdatedMessage } from '../protocol.ts';
import { broadcastGameMessage as broadcast } from '../game/runtime';

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
    requiredPopulation?: number; // minimum population to build
    canPlace(tile: Tile, hero: Hero): boolean;
    requiredXp(distance: number): number;
    heroRate(hero: Hero, tile: Tile): number;
    requiredResources(distance: number): ResourceAmount[];
    onStart?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;
    onComplete?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;
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

    // Use approach side only if the neighbor on that side is walkable
    if (preferredSide) {
        const preferredNeighbor = neighbors[preferredSide];
        if (preferredNeighbor && isTileWalkable(preferredNeighbor)) {
            return `water_dock_${preferredSide}`;
        }
    }

    // Fallback: find any walkable neighbor side
    for (const side of SIDE_NAMES) {
        const neighbor = neighbors[side];
        if (neighbor && isTileWalkable(neighbor)) {
            return `water_dock_${side}`;
        }
    }

    return 'water_dock_a';
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
    tile.variantSetMs = undefined;
    tile.discovered = true;
    terrainPositions.towncenter.add(tile.id);

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
                !tile.variant &&
                !hasAdjacentNaturalWater(tile)
            );
        },
        requiredXp(distance: number) {
            return Math.max(2600, 2200 * distance);
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: Math.max(6, 4 * distance) }];
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
        canPlace(tile, _hero) {
            return (
                (tile.terrain === 'plains' || tile.terrain === 'dirt' || tile.terrain === 'mountain') &&
                !tile.variant
            );
        },
        requiredXp(distance: number) {
            return Math.max(3000, 2400 * distance);
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: Math.max(5, 4 * distance) }];
        },
        onComplete(tile) {
            if (tile.terrain === 'plains') {
                applyVariant(tile, 'plains_watchtower', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'dirt') {
                applyVariant(tile, 'dirt_watchtower', { stagger: false, respectBiome: false });
            } else if (tile.terrain === 'mountain') {
                applyVariant(tile, 'mountains_watchtower', { stagger: false, respectBiome: false });
            }

            revealTilesAround(tile, 2);
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
                !tile.variant
            );
        },
        requiredXp(distance: number) {
            return Math.max(12000, 7000 * Math.max(1, distance));
        },
        heroRate(hero: Hero) {
            return 14 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [
                { type: 'wood', amount: Math.max(60, 12 * Math.max(1, distance)) },
                { type: 'ore', amount: Math.max(24, 6 * Math.max(1, distance)) },
                { type: 'food', amount: Math.max(18, 4 * Math.max(1, distance)) },
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
        variantKeys: ['plains_depot', 'dirt_depot'],
        renderDecoration: 'depot',
        overlayAssetKey: 'building_depot_overlay',
        providesWarehouse: true,
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && !tile.variant;
        },
        requiredXp(distance: number) {
            return Math.max(3400, 2800 * distance);
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: Math.max(8, 6 * distance) }];
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
        summary: 'Creates a landing point and unlocks fishing on the shoreline.',
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
        canPlace(tile, _hero) {
            return tile.terrain === 'water' && !tile.variant;
        },
        requiredXp(distance: number) {
            return Math.max(3000, 3000 * distance);
        },
        heroRate(hero: Hero) {
            return 20 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: Math.max(5, 5 * distance) }];
        },
        onStart(tile, instance, participants) {
            const starter = participants[0];
            if (!starter) return;

            const movement = starter.movement;
            const neighbors = tile.neighbors;
            if (!movement || !neighbors) return;

            const path = movement.path;
            const previousCoord = path && path.length >= 2 ? path[path.length - 2] : movement.origin;
            if (!previousCoord) return;

            for (const side of SIDE_NAMES) {
                const neighbor = neighbors[side];
                if (neighbor && neighbor.q === previousCoord.q && neighbor.r === previousCoord.r) {
                    instance.context = instance.context || {};
                    instance.context.approachSide = side;
                    return;
                }
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
        summary: 'Claims a forest tile as a permanent timber site for repeat wood gathering.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildLumberCamp',
        buildTaskLabel: 'Build Lumber Camp',
        sortOrder: 30,
        requiredPopulation: 3,
        variantKeys: ['forest_lumber_camp'],
        renderDecoration: 'lumberCamp',
        overlayAssetKey: 'building_lumber_camp_overlay',
        canPlace(tile, _hero) {
            return tile.terrain === 'forest' && !tile.variant;
        },
        requiredXp(distance: number) {
            return Math.max(3200, 2600 * distance);
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: Math.max(6, 4 * distance) }];
        },
        onComplete(tile) {
            if (tile.terrain === 'forest') {
                applyVariant(tile, 'forest_lumber_camp', { stagger: false, respectBiome: false });
            }
        },
    },
    {
        key: 'granary',
        label: 'Granary',
        summary: 'Secures a grain tile as a lasting ration site that produces food.',
        categoryLabel: 'Agriculture',
        buildTaskKey: 'buildGranary',
        buildTaskLabel: 'Build Granary',
        sortOrder: 35,
        requiredPopulation: 3,
        variantKeys: ['grain_granary'],
        renderDecoration: 'granary',
        overlayAssetKey: 'building_granary_overlay',
        canPlace(tile, _hero) {
            return tile.terrain === 'grain' && !tile.variant;
        },
        requiredXp(distance: number) {
            return Math.max(3200, 2500 * distance);
        },
        heroRate(hero: Hero) {
            return 16 * Math.max(1, hero.stats.spd);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: Math.max(7, 5 * distance) }];
        },
        onComplete(tile) {
            if (tile.terrain === 'grain') {
                applyVariant(tile, 'grain_granary', { stagger: false, respectBiome: false });
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
        variantKeys: ['plains_house', 'dirt_house'],
        canPlace(tile, _hero) {
            return (tile.terrain === 'plains' || tile.terrain === 'dirt') && !tile.variant;
        },
        requiredXp(distance: number) {
            return Math.max(2000, 1600 * distance);
        },
        heroRate(hero: Hero) {
            return 18 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [
                { type: 'wood', amount: Math.max(4, 3 * distance) },
                { type: 'stone', amount: Math.max(2, 2 * distance) },
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
        key: 'mine',
        label: 'Mine',
        summary: 'Turns a mountain into a permanent ore extraction site.',
        categoryLabel: 'Industry',
        buildTaskKey: 'buildMine',
        buildTaskLabel: 'Build Mine',
        sortOrder: 40,
        requiredPopulation: 5,
        variantKeys: ['mountains_with_mine'],
        canPlace(tile, _hero) {
            return tile.terrain === 'mountain' && !tile.variant;
        },
        requiredXp(distance: number) {
            return 5000 * distance;
        },
        heroRate(hero: Hero) {
            return 20 * Math.max(1, hero.stats.atk);
        },
        requiredResources(distance: number) {
            return [{ type: 'wood', amount: 10 * distance }];
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
