import type { TickContext } from '../tick';
import { tiles, tileIndex } from '../../../src/shared/game/world.ts';
import { axialDistanceCoords } from '../../../src/shared/game/hex.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';
import { terrainPositions, updateTileVariantIndex } from '../../../src/core/terrainRegistry.ts';
import { TERRAIN_DEFS, type TerrainKey } from '../../../src/core/terrainDefs.ts';
import type { ResourceAmount, ResourceType } from '../../../src/shared/game/types/Resource.ts';
import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime.ts';
import type { CalamityEventMessage, CalamityKind, ResourceWithdrawMessage, TileUpdatedMessage } from '../../../src/shared/protocol.ts';
import {
  broadcastPopulationState,
  getPopulationBySettlementInput,
  getPopulationSnapshot,
  getSettlementHungerInput,
  killSettler,
  recalculatePopulationLimits,
  setSupportMetrics,
} from '../../../src/shared/game/state/populationStore.ts';
import {
  getSettlementResourceInventory,
  withdrawResourceAcrossStoragesForSettlement,
} from '../../../src/shared/game/state/resourceStore.ts';
import { recalculateSettlementSupport } from '../../../src/shared/game/state/settlementSupportStore.ts';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events.ts';
import { isStudyCompleted } from '../../../src/shared/game/state/studyStore.ts';
import { isWaterSourceBuildingTile } from '../../../src/shared/buildings/water.ts';
import {
  clampBuildingCondition,
  initializeBuildingCondition,
  isMaintainedBuildingTile,
  updateTileCondition,
} from '../../../src/shared/buildings/maintenance.ts';
import { hasActivePlayers } from '../state/attendanceState.ts';
import { seasonState } from '../state/seasonState.ts';

type CalamitySeverity = CalamityEventMessage['severity'];

interface CalamityOutcome {
  kind: CalamityKind;
  phase?: CalamityEventMessage['phase'];
  severity: CalamitySeverity;
  title: string;
  message: string;
  settlementId: string | null;
  affectedTileIds: string[];
  resourceLosses?: ResourceAmount[];
  populationLoss?: number;
  impactAt?: number;
}

interface CalamityRng {
  next(): number;
  int?(min: number, max: number): number;
}

interface TriggerCalamityOptions {
  now?: number;
  settlementId?: string | null;
  rng?: CalamityRng;
  targetTileId?: string | null;
}

interface ResolvedCalamityOptions {
  now: number;
  settlementId: string | null;
  rng: CalamityRng;
  targetTileId?: string | null;
}

interface PendingCalamity {
  id: string;
  kind: CalamityKind;
  settlementId: string | null;
  targetTileId?: string | null;
  impactAt: number;
}

const INITIAL_CALAMITY_DELAY_MS = 12 * 60_000;
const CALAMITY_ROLL_INTERVAL_MS = 9 * 60_000;
const CALAMITY_ROLL_CHANCE = 0.28;
const CALAMITY_WARNING_LEAD_MS = 3 * 60_000;
const CROP_TERRAINS = new Set<TerrainKey>(['grain', 'hops', 'grapes']);
const FOOD_RESOURCE_TYPES: ResourceType[] = ['fish', 'meat', 'bread', 'grain'];
const ROAD_VARIANTS = new Set([
  'road',
  'road_ad',
  'road_be',
  'road_ce',
  'road_cf',
  'stone_road',
  'stone_road_ad',
  'stone_road_be',
  'stone_road_ce',
  'stone_road_cf',
]);
const CROP_BUILDING_VARIANTS = new Set([
  'grain_granary',
  'plains_bakery',
  'dirt_bakery',
  'plains_brewery',
  'dirt_brewery',
  'plains_winery',
  'dirt_winery',
]);

let nextRollAtMs = Date.now() + INITIAL_CALAMITY_DELAY_MS;
let lastAutomaticKind: CalamityKind | null = null;
let nextPendingId = 1;
let pendingCalamities: PendingCalamity[] = [];

function randomInt(rng: CalamityRng, min: number, max: number) {
  if (max <= min) return min;
  return rng.int ? rng.int(min, max) : Math.floor(rng.next() * (max - min + 1)) + min;
}

function chooseOne<T>(rng: CalamityRng, values: T[]) {
  if (!values.length) {
    return null;
  }

  return values[randomInt(rng, 0, values.length - 1)] ?? null;
}

function takeRandom<T>(rng: CalamityRng, values: T[], count: number) {
  const pool = values.slice();
  const selected: T[] = [];
  while (pool.length > 0 && selected.length < count) {
    const index = randomInt(rng, 0, pool.length - 1);
    const [value] = pool.splice(index, 1);
    if (value !== undefined) {
      selected.push(value);
    }
  }
  return selected;
}

function getDiscoveredSettlementIds() {
  return Array.from(terrainPositions.towncenter)
    .map((tileId) => tileIndex[tileId])
    .filter((tile): tile is Tile => !!tile?.discovered && tile.terrain === 'towncenter')
    .map((tile) => getTileSettlementId(tile) ?? tile.id)
    .sort((left, right) => left.localeCompare(right));
}

function getSettlementTiles(settlementId: string | null | undefined) {
  return tiles.filter((tile) => (
    tile.discovered
    && !!tile.terrain
    && (!settlementId || getTileSettlementId(tile) === settlementId)
  ));
}

function getSettlementWaterSourceCount(settlementId: string | null | undefined) {
  return getSettlementTiles(settlementId).filter(isWaterSourceBuildingTile).length;
}

function hasSettlementVariant(settlementId: string | null | undefined, variants: readonly string[]) {
  const variantSet = new Set(variants);
  return getSettlementTiles(settlementId).some((tile) => !!tile.variant && variantSet.has(tile.variant));
}

function hasFloodControlNear(target: Tile | null | undefined, settlementId: string | null | undefined) {
  if (!target) {
    return getSettlementWaterSourceCount(settlementId) > 0;
  }

  return getSettlementTiles(settlementId).some((tile) => (
    isWaterSourceBuildingTile(tile)
    && axialDistanceCoords(tile.q, tile.r, target.q, target.r) <= 4
  ));
}

function hasFoodStorage(settlementId: string | null | undefined) {
  return hasSettlementVariant(settlementId, [
    'grain_granary',
    'plains_food_storehouse',
    'dirt_food_storehouse',
    'plains_crop_silo',
    'dirt_crop_silo',
  ]);
}

function getCalamityWarning(kind: CalamityKind, impactAt: number): CalamityOutcome {
  switch (kind) {
    case 'volcano_eruption':
      return {
        kind,
        phase: 'warning',
        severity: 'severe',
        title: 'Rumbling ridge',
        message: 'The volcanic ridge is shaking. Reinforced buildings and masonry study will reduce structural damage before the eruption.',
        settlementId: null,
        affectedTileIds: [],
        impactAt,
      };
    case 'flood':
      return {
        kind,
        phase: 'warning',
        severity: 'major',
        title: 'River surge warning',
        message: 'Water is rising near the shore. Wells and water works near the flood path will divert the worst of it.',
        settlementId: null,
        affectedTileIds: [],
        impactAt,
      };
    case 'lost_harvest':
      return {
        kind,
        phase: 'warning',
        severity: 'major',
        title: 'Crop blight warning',
        message: 'Fields are showing stress. Frontier Almanacs and nearby water sources reduce harvest loss.',
        settlementId: null,
        affectedTileIds: [],
        impactAt,
      };
    case 'food_spoilage':
      return {
        kind,
        phase: 'warning',
        severity: 'major',
        title: 'Damp stores warning',
        message: 'Food stores are at risk. Granaries, food storehouses, and crop silos reduce spoilage.',
        settlementId: null,
        affectedTileIds: [],
        impactAt,
      };
    case 'forest_fire':
      return {
        kind,
        phase: 'warning',
        severity: 'major',
        title: 'Smoke on the treeline',
        message: 'A forest fire may spread soon. Wells and water access limit the burn area.',
        settlementId: null,
        affectedTileIds: [],
        impactAt,
      };
    case 'outbreak':
      return {
        kind,
        phase: 'warning',
        severity: 'severe',
        title: 'Fever signs reported',
        message: 'Settlers are falling ill. Complete Field Medicine before the fever peaks to prevent deaths.',
        settlementId: null,
        affectedTileIds: [],
        impactAt,
      };
  }
}

function isRoadTile(tile: Tile) {
  return !!tile.variant && ROAD_VARIANTS.has(tile.variant);
}

function isCropBuildingVariant(variant: string | null | undefined) {
  return !!variant && CROP_BUILDING_VARIANTS.has(variant);
}

function isCropTile(tile: Tile) {
  return !!tile.terrain && CROP_TERRAINS.has(tile.terrain) && !isCropBuildingVariant(tile.variant);
}

function isPlantedCrop(tile: Tile) {
  return isCropTile(tile) && !!tile.variant;
}

function markTileVariant(tile: Tile, variant: string | null) {
  const previousVariant = tile.variant;
  tile.variant = variant;
  updateTileVariantIndex(tile.id, previousVariant, variant);
  tile.variantSetMs = undefined;
  tile.variantAgeMs = undefined;

  if (!variant) {
    tile.isBaseTile = true;
    return;
  }

  const variantDef = tile.terrain
    ? TERRAIN_DEFS[tile.terrain]?.variations?.find((candidate) => candidate.key === variant)
    : null;
  tile.isBaseTile = variantDef?.decorative ?? false;
}

function markTileTerrain(tile: Tile, terrain: TerrainKey, variant: string | null = null) {
  const previousTerrain = tile.terrain;
  if (previousTerrain && terrainPositions[previousTerrain]) {
    terrainPositions[previousTerrain].delete(tile.id);
  }

  tile.terrain = terrain;
  terrainPositions[terrain].add(tile.id);
  markTileVariant(tile, variant);
}

function damageBuilding(tile: Tile, amount: number, now: number) {
  if (!isMaintainedBuildingTile(tile)) {
    return false;
  }

  initializeBuildingCondition(tile, now);
  return updateTileCondition(tile, clampBuildingCondition(tile.condition) - amount, now);
}

function broadcastTile(tile: Tile | null | undefined) {
  if (!tile) {
    return;
  }

  broadcast({
    type: 'tile:updated',
    tile,
    timestamp: Date.now(),
  } satisfies TileUpdatedMessage);
}

function broadcastOutcome(outcome: CalamityOutcome) {
  broadcast({
    type: 'calamity:event',
    kind: outcome.kind,
    phase: outcome.phase ?? 'impact',
    severity: outcome.severity,
    title: outcome.title,
    message: outcome.message,
    settlementId: outcome.settlementId,
    affectedTileIds: outcome.affectedTileIds,
    resourceLosses: outcome.resourceLosses,
    populationLoss: outcome.populationLoss,
    impactAt: outcome.impactAt,
    timestamp: Date.now(),
  } satisfies CalamityEventMessage);
}

function syncSupportAndBroadcast(changedTileIds: Set<string>) {
  const support = recalculateSettlementSupport(getPopulationBySettlementInput(), getSettlementHungerInput());
  setSupportMetrics(support.snapshot);
  recalculatePopulationLimits();

  for (const tileId of support.changedTileIds) {
    changedTileIds.add(tileId);
  }

  for (const tileId of changedTileIds) {
    broadcastTile(tileIndex[tileId]);
  }

  if (support.changedTileIds.length > 0) {
    broadcastPopulationState();
  }
}

function aggregateLosses(losses: ResourceAmount[]) {
  const totals = new Map<ResourceType, number>();
  for (const loss of losses) {
    totals.set(loss.type, (totals.get(loss.type) ?? 0) + loss.amount);
  }
  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ type, amount }));
}

function withdrawResources(
  settlementId: string | null | undefined,
  requests: ResourceAmount[],
) {
  const losses: ResourceAmount[] = [];

  for (const request of requests) {
    const withdrawals = withdrawResourceAcrossStoragesForSettlement(settlementId, request.type, request.amount);
    for (const withdrawal of withdrawals) {
      if (withdrawal.amount <= 0) {
        continue;
      }

      losses.push({ type: request.type, amount: withdrawal.amount });
      broadcast({
        type: 'resource:withdraw',
        heroId: `calamity:${request.type}`,
        storageTileId: withdrawal.storageTileId,
        resource: { type: request.type, amount: withdrawal.amount },
      } satisfies ResourceWithdrawMessage);
    }
  }

  return aggregateLosses(losses);
}

function describeResourceLosses(losses: ResourceAmount[]) {
  if (losses.length <= 0) {
    return 'No stored supplies were lost.';
  }

  return losses.map((loss) => `${loss.amount} ${loss.type.replace('_', ' ')}`).join(', ');
}

function resolveSettlementId(options: TriggerCalamityOptions, rng: CalamityRng) {
  if (options.settlementId !== undefined) {
    return options.settlementId;
  }

  return chooseOne(rng, getDiscoveredSettlementIds());
}

function triggerVolcanoEruption(options: ResolvedCalamityOptions) {
  const settlementIds = getDiscoveredSettlementIds();
  const volcanoes = tiles.filter((tile) => tile.discovered && tile.terrain === 'vulcano');
  const candidates = volcanoes
    .map((volcano) => {
      const nearestSettlement = settlementIds
        .map((settlementId) => ({ settlementId, townCenter: tileIndex[settlementId] }))
        .filter((candidate): candidate is { settlementId: string; townCenter: Tile } => !!candidate.townCenter)
        .map((candidate) => ({
          ...candidate,
          distance: axialDistanceCoords(volcano.q, volcano.r, candidate.townCenter.q, candidate.townCenter.r),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
      return { volcano, nearestSettlement };
    })
    .filter((candidate) => (
      candidate.nearestSettlement
      && (!options.settlementId || candidate.nearestSettlement.settlementId === options.settlementId)
      && candidate.nearestSettlement.distance <= 10
    ));

  const target = options.targetTileId
    ? candidates.find((candidate) => candidate.volcano.id === options.targetTileId) ?? null
    : chooseOne(options.rng, candidates);
  if (!target?.nearestSettlement) {
    return null;
  }

  const changedTileIds = new Set<string>();
  const affected = tiles.filter((tile) => (
    tile.discovered
    && !!tile.terrain
    && tile.terrain !== 'towncenter'
    && axialDistanceCoords(tile.q, tile.r, target.volcano.q, target.volcano.r) <= 3
  ));

  let scorchedTiles = 0;
  let damagedBuildings = 0;
  const buildingDamage = isStudyCompleted('masonry_treatises', target.nearestSettlement.settlementId) ? 14 : 35;
  for (const tile of affected) {
    let changed = false;
    if (isCropTile(tile)) {
      markTileTerrain(tile, 'dirt', null);
      tile.modifier = 'rich_soil';
      tile.modifierRevealed = true;
      scorchedTiles++;
      changed = true;
    } else if (tile.terrain === 'forest' && !isMaintainedBuildingTile(tile)) {
      markTileTerrain(tile, 'dirt', null);
      tile.modifier = 'rich_soil';
      tile.modifierRevealed = true;
      scorchedTiles++;
      changed = true;
    } else if ((tile.terrain === 'plains' || tile.terrain === 'dirt') && !tile.modifier) {
      tile.modifier = 'rich_soil';
      tile.modifierRevealed = true;
      changed = true;
    }

    if (isRoadTile(tile)) {
      markTileVariant(tile, null);
      changed = true;
    }

    if (damageBuilding(tile, buildingDamage, options.now)) {
      damagedBuildings++;
      changed = true;
    }

    if (changed) {
      changedTileIds.add(tile.id);
    }
  }

  syncSupportAndBroadcast(changedTileIds);
  return {
    kind: 'volcano_eruption',
    severity: damagedBuildings > 0 || scorchedTiles >= 4 ? 'severe' : 'major',
    title: 'Volcano eruption',
    message: `${scorchedTiles} nearby tile${scorchedTiles === 1 ? '' : 's'} were scorched; ash left richer soil behind.${buildingDamage < 35 ? ' Masonry preparation reduced building damage.' : ''}`,
    settlementId: target.nearestSettlement.settlementId,
    affectedTileIds: Array.from(changedTileIds),
  } satisfies CalamityOutcome;
}

function triggerFlood(options: ResolvedCalamityOptions) {
  const waterTiles = getSettlementTiles(options.settlementId).filter((tile) => tile.terrain === 'water');
  const target = options.targetTileId
    ? waterTiles.find((tile) => tile.id === options.targetTileId) ?? null
    : chooseOne(options.rng, waterTiles);
  if (!target) {
    return null;
  }

  const floodControlled = hasFloodControlNear(target, options.settlementId) || isStudyCompleted('frontier_almanacs', options.settlementId);
  const maxRuinedCrops = floodControlled ? 1 : 4;
  const maxWashedRoads = floodControlled ? 1 : 4;
  const buildingDamage = floodControlled ? 8 : 20;

  const changedTileIds = new Set<string>();
  const affected = getSettlementTiles(options.settlementId).filter((tile) => (
    tile.terrain !== 'towncenter'
    && axialDistanceCoords(tile.q, tile.r, target.q, target.r) <= 2
  ));

  let hydrated = 0;
  let ruinedCrops = 0;
  let washedRoads = 0;
  for (const tile of affected) {
    let changed = false;
    if (tile.terrain === 'dirt' && (tile.variant === 'dirt_tilled' || tile.variant === 'dirt_tilled_draught')) {
      markTileVariant(tile, 'dirt_tilled_hydrated');
      hydrated++;
      changed = true;
    }

    if (isPlantedCrop(tile) && ruinedCrops < maxRuinedCrops) {
      markTileTerrain(tile, 'dirt', 'dirt_tilled_hydrated');
      ruinedCrops++;
      changed = true;
    }

    if (isRoadTile(tile) && washedRoads < maxWashedRoads) {
      markTileVariant(tile, null);
      washedRoads++;
      changed = true;
    }

    if (damageBuilding(tile, buildingDamage, options.now)) {
      changed = true;
    }

    if (changed) {
      changedTileIds.add(tile.id);
    }
  }

  syncSupportAndBroadcast(changedTileIds);
  return {
    kind: 'flood',
    severity: ruinedCrops > 0 || washedRoads > 1 ? 'major' : 'minor',
    title: 'Floodwater surge',
    message: `${washedRoads} road${washedRoads === 1 ? '' : 's'} washed out, ${ruinedCrops} crop plot${ruinedCrops === 1 ? '' : 's'} flooded, and ${hydrated} dry plot${hydrated === 1 ? '' : 's'} were watered.${floodControlled ? ' Water control reduced the surge.' : ''}`,
    settlementId: options.settlementId,
    affectedTileIds: Array.from(changedTileIds),
  } satisfies CalamityOutcome;
}

function triggerLostHarvest(options: ResolvedCalamityOptions) {
  const crops = getSettlementTiles(options.settlementId).filter(isCropTile);
  const protectedHarvest = isStudyCompleted('frontier_almanacs', options.settlementId) || getSettlementWaterSourceCount(options.settlementId) > 0;
  const baseTargetCount = Math.min(5, Math.max(2, Math.ceil(crops.length * 0.35)));
  const targets = takeRandom(options.rng, crops, protectedHarvest ? Math.max(1, Math.floor(baseTargetCount / 2)) : baseTargetCount);
  if (!targets.length) {
    return null;
  }

  const changedTileIds = new Set<string>();
  for (const tile of targets) {
    markTileTerrain(tile, 'dirt', 'dirt_tilled_draught');
    changedTileIds.add(tile.id);
  }

  syncSupportAndBroadcast(changedTileIds);
  return {
    kind: 'lost_harvest',
    severity: targets.length >= 4 ? 'major' : 'minor',
    title: 'Harvest failed',
    message: `${targets.length} crop plot${targets.length === 1 ? '' : 's'} withered before they could be gathered.${protectedHarvest ? ' Prepared field notes and water access contained the blight.' : ''}`,
    settlementId: options.settlementId,
    affectedTileIds: Array.from(changedTileIds),
  } satisfies CalamityOutcome;
}

function triggerFoodSpoilage(options: ResolvedCalamityOptions) {
  const inventory = getSettlementResourceInventory(options.settlementId);
  const protectedStores = hasFoodStorage(options.settlementId) || isStudyCompleted('warehouse_ledgers', options.settlementId);
  const requests = FOOD_RESOURCE_TYPES
    .map((type) => {
      const stock = Math.floor(inventory[type] ?? 0);
      const rate = protectedStores ? 0.08 : 0.22;
      const amount = Math.min(protectedStores ? 5 : 12, Math.max(0, Math.ceil(stock * rate)));
      return { type, amount };
    })
    .filter((request) => request.amount > 0);

  if (!requests.length) {
    return null;
  }

  const resourceLosses = withdrawResources(options.settlementId, requests);
  if (!resourceLosses.length) {
    return null;
  }

  return {
    kind: 'food_spoilage',
    severity: resourceLosses.reduce((sum, loss) => sum + loss.amount, 0) >= 10 ? 'major' : 'minor',
    title: 'Food stores spoiled',
    message: `Damp stores spoiled ${describeResourceLosses(resourceLosses)}.${protectedStores ? ' Dedicated storage kept most supplies dry.' : ''}`,
    settlementId: options.settlementId,
    affectedTileIds: [],
    resourceLosses,
  } satisfies CalamityOutcome;
}

function triggerForestFire(options: ResolvedCalamityOptions) {
  const forestTiles = getSettlementTiles(options.settlementId).filter((tile) => tile.terrain === 'forest');
  const target = options.targetTileId
    ? forestTiles.find((tile) => tile.id === options.targetTileId) ?? null
    : chooseOne(options.rng, forestTiles);
  if (!target) {
    return null;
  }

  const fireControlled = hasFloodControlNear(target, options.settlementId) || isStudyCompleted('frontier_almanacs', options.settlementId);
  const burnTargets = getSettlementTiles(options.settlementId)
    .filter((tile) => tile.terrain === 'forest' && axialDistanceCoords(tile.q, tile.r, target.q, target.r) <= 2)
    .slice(0, fireControlled ? 3 : 7);
  const changedTileIds = new Set<string>();
  let burnedForest = 0;
  let damagedBuildings = 0;

  for (const tile of burnTargets) {
    let changed = false;
    if (tile.variant === 'forest_lumber_camp' || tile.variant === 'forest_hunters_hut') {
      if (damageBuilding(tile, fireControlled ? 10 : 30, options.now)) {
        damagedBuildings++;
        changed = true;
      }
    } else {
      markTileVariant(tile, 'chopped_forest');
      burnedForest++;
      changed = true;
    }

    if (changed) {
      changedTileIds.add(tile.id);
    }
  }

  syncSupportAndBroadcast(changedTileIds);
  return {
    kind: 'forest_fire',
    severity: burnedForest >= 5 || damagedBuildings > 0 ? 'major' : 'minor',
    title: 'Forest fire',
    message: `${burnedForest} forest tile${burnedForest === 1 ? '' : 's'} burned, leaving salvageable trunks behind.${fireControlled ? ' Water access limited the spread.' : ''}`,
    settlementId: options.settlementId,
    affectedTileIds: Array.from(changedTileIds),
  } satisfies CalamityOutcome;
}

function triggerOutbreak(options: ResolvedCalamityOptions) {
  const population = getPopulationSnapshot();
  const settlement = options.settlementId
    ? population.settlements.find((candidate) => candidate.settlementId === options.settlementId)
    : null;
  const current = settlement?.current ?? population.current;
  if (current <= 0) {
    return null;
  }

  if (isStudyCompleted('field_medicine', options.settlementId)) {
    return {
      kind: 'outbreak',
      phase: 'averted',
      severity: 'minor',
      title: 'Fever contained',
      message: 'Field Medicine protocols contained the outbreak before it became fatal.',
      settlementId: options.settlementId,
      affectedTileIds: [],
      populationLoss: 0,
    } satisfies CalamityOutcome;
  }

  const hasStrongFood = (getSettlementResourceInventory(options.settlementId).bread ?? 0) >= Math.max(2, Math.ceil(current / 2));
  const deaths = hasStrongFood
    ? 1
    : Math.min(3, Math.max(1, Math.ceil(current * 0.2)));
  let killed = 0;
  for (let index = 0; index < deaths; index++) {
    if (killSettler(options.settlementId)) {
      killed++;
    }
  }

  if (killed <= 0) {
    return null;
  }

  broadcastPopulationState();
  emitGameplayEvent({ type: 'population:changed', settlementId: options.settlementId });

  return {
    kind: 'outbreak',
    severity: killed >= 3 ? 'severe' : 'major',
    title: 'Fever outbreak',
    message: `${killed} settler${killed === 1 ? '' : 's'} died before the fever broke.${hasStrongFood ? ' Strong food stores reduced the losses.' : ''}`,
    settlementId: options.settlementId,
    affectedTileIds: [],
    populationLoss: killed,
  } satisfies CalamityOutcome;
}

const CALAMITY_HANDLERS: Record<CalamityKind, (options: ResolvedCalamityOptions) => CalamityOutcome | null> = {
  volcano_eruption: triggerVolcanoEruption,
  flood: triggerFlood,
  lost_harvest: triggerLostHarvest,
  food_spoilage: triggerFoodSpoilage,
  forest_fire: triggerForestFire,
  outbreak: triggerOutbreak,
};

export function getAvailableCalamities(settlementId: string | null | undefined) {
  const settlementTiles = getSettlementTiles(settlementId);
  const inventory = getSettlementResourceInventory(settlementId);
  const population = getPopulationSnapshot();
  const settlementPopulation = settlementId
    ? population.settlements.find((candidate) => candidate.settlementId === settlementId)?.current ?? 0
    : population.current;

  return (Object.keys(CALAMITY_HANDLERS) as CalamityKind[]).filter((kind) => {
    switch (kind) {
      case 'volcano_eruption':
        return tiles.some((tile) => tile.discovered && tile.terrain === 'vulcano');
      case 'flood':
        return settlementTiles.some((tile) => tile.terrain === 'water');
      case 'lost_harvest':
        return settlementTiles.some(isCropTile);
      case 'food_spoilage':
        return FOOD_RESOURCE_TYPES.some((type) => (inventory[type] ?? 0) > 0);
      case 'forest_fire':
        return settlementTiles.some((tile) => tile.terrain === 'forest');
      case 'outbreak':
        return settlementPopulation > 0;
      default:
        return false;
    }
  });
}

export function resetCalamitySystem(now: number = Date.now()) {
  nextRollAtMs = now + getCalamityTiming().initialDelayMs;
  lastAutomaticKind = null;
  nextPendingId = 1;
  pendingCalamities = [];
}

export function triggerCalamity(kind: CalamityKind, options: TriggerCalamityOptions = {}) {
  const rng = options.rng ?? {
    next: Math.random,
    int: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
  };
  const settlementId = resolveSettlementId(options, rng);
  const handler = CALAMITY_HANDLERS[kind];
  const outcome = handler({
    now: options.now ?? Date.now(),
    rng,
    settlementId,
    targetTileId: options.targetTileId,
  });

  if (outcome) {
    broadcastOutcome(outcome);
  }

  return outcome;
}

function pickWarningTarget(kind: CalamityKind, settlementId: string | null, rng: CalamityRng) {
  switch (kind) {
    case 'volcano_eruption':
      return chooseOne(rng, tiles.filter((tile) => tile.discovered && tile.terrain === 'vulcano'))?.id ?? null;
    case 'flood':
      return chooseOne(rng, getSettlementTiles(settlementId).filter((tile) => tile.terrain === 'water'))?.id ?? null;
    case 'forest_fire':
      return chooseOne(rng, getSettlementTiles(settlementId).filter((tile) => tile.terrain === 'forest'))?.id ?? null;
    default:
      return null;
  }
}

export function warnCalamity(kind: CalamityKind, options: TriggerCalamityOptions = {}) {
  const rng = options.rng ?? {
    next: Math.random,
    int: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
  };
  const settlementId = resolveSettlementId(options, rng);
  const now = options.now ?? Date.now();
  const impactAt = now + getCalamityTiming().warningLeadMs;
  const targetTileId = options.targetTileId ?? pickWarningTarget(kind, settlementId, rng);
  const pending: PendingCalamity = {
    id: `calamity:${nextPendingId++}`,
    kind,
    settlementId,
    targetTileId,
    impactAt,
  };
  pendingCalamities.push(pending);

  const warning = getCalamityWarning(kind, impactAt);
  broadcastOutcome({
    ...warning,
    settlementId,
    affectedTileIds: targetTileId ? [targetTileId] : [],
  });

  return pending;
}

function processPendingCalamities(ctx: TickContext) {
  if (!pendingCalamities.length) {
    return;
  }

  const due = pendingCalamities.filter((pending) => pending.impactAt <= ctx.now);
  if (!due.length) {
    return;
  }

  pendingCalamities = pendingCalamities.filter((pending) => pending.impactAt > ctx.now);
  for (const pending of due) {
    triggerCalamity(pending.kind, {
      now: ctx.now,
      settlementId: pending.settlementId,
      targetTileId: pending.targetTileId,
      rng: ctx.rng,
    });
  }
}

function getCalamityTiming() {
  const gameplay = seasonState.getCurrentStageConfig()?.gameplay;
  return {
    initialDelayMs: Math.max(0, Math.trunc(gameplay?.calamityInitialDelayMs ?? INITIAL_CALAMITY_DELAY_MS)),
    rollIntervalMs: Math.max(1_000, Math.trunc(gameplay?.calamityRollIntervalMs ?? CALAMITY_ROLL_INTERVAL_MS)),
    rollChance: Math.max(0, Math.min(1, Number(gameplay?.calamityRollChance ?? CALAMITY_ROLL_CHANCE))),
    warningLeadMs: Math.max(0, Math.trunc(gameplay?.calamityWarningLeadMs ?? CALAMITY_WARNING_LEAD_MS)),
  };
}

function triggerRandomCalamity(ctx: TickContext) {
  const pending: PendingCalamity[] = [];
  const previousAutomaticKind = lastAutomaticKind;
  let latestKind: CalamityKind | null = null;

  for (const settlementId of getDiscoveredSettlementIds()) {
    const settlementAvailable = getAvailableCalamities(settlementId);
    const available = settlementAvailable.filter((kind) => kind !== previousAutomaticKind);
    const fallbackAvailable = available.length > 0 ? available : settlementAvailable;
    const kind = chooseOne(ctx.rng, fallbackAvailable);
    if (!kind) {
      continue;
    }

    pending.push(warnCalamity(kind, { now: ctx.now, settlementId, rng: ctx.rng }));
    latestKind = kind;
  }

  if (latestKind) {
    lastAutomaticKind = latestKind;
  }

  return pending;
}

export const calamitySystem = {
  name: 'calamities',

  init: () => {
    resetCalamitySystem();
  },

  tick: (ctx: TickContext) => {
    if (!hasActivePlayers()) {
      nextRollAtMs = Math.max(nextRollAtMs, ctx.now + getCalamityTiming().rollIntervalMs);
      return;
    }

    processPendingCalamities(ctx);

    if (ctx.now < nextRollAtMs) {
      return;
    }

    const timing = getCalamityTiming();
    nextRollAtMs = ctx.now + timing.rollIntervalMs;
    if (ctx.rng.next() > timing.rollChance) {
      return;
    }

    triggerRandomCalamity(ctx);
  },
};
