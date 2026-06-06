import type { TerrainKey } from '../../core/terrainDefs.ts';
import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { ObjectiveKind, ObjectiveSnapshot } from '../goals/types.ts';
import { getResourceRequirementStock } from '../game/resourceDefinitions.ts';
import type { StoryHeroId } from './heroRoster.ts';
import { getStoryHeroTemplate } from './heroRoster.ts';

export type BuildingKey =
  | 'well'
  | 'watchtower'
  | 'beacon'
  | 'wall'
  | 'townCenter'
  | 'supplyDepot'
  | 'foodStorehouse'
  | 'materialsYard'
  | 'cropSilo'
  | 'craftedGoodsStorehouse'
  | 'dock'
  | 'harbor'
  | 'tradeCenter'
  | 'lumberCamp'
  | 'huntersHut'
  | 'granary'
  | 'bakery'
  | 'brewery'
  | 'winery'
  | 'pub'
  | 'shop'
  | 'apiary'
  | 'workshop'
  | 'weaponSmith'
  | 'library'
  | 'mine'
  | 'quarry'
  | 'oven'
  | 'house'
  | 'road'
  | 'barracks';

export type UpgradeKey =
  | 'stone_house_upgrade'
  | 'glass_house_upgrade'
  | 'warehouse_upgrade'
  | 'sawmill_upgrade'
  | 'reinforced_mine_upgrade'
  | 'stone_road_upgrade'
  | 'stone_wall_upgrade';

export type ProgressionNodeKey =
  | 'landfall'
  | 'shoreline'
  | 'water_source'
  | 'farming'
  | 'irrigation'
  | 'stores'
  | 'baking'
  | 'brewing'
  | 'security'
  | 'mountain_frontier'
  | 'logistics'
  | 'timber_industry'
  | 'masonry'
  | 'harsh_frontier'
  | 'desert_industry'
  | 'hero_methods'
  | 'toolmaking'
  | 'expansion'
  | 'deep_frontier'
  | 'ancient_frontier';

export type ProgressionLane =
  | 'Settlement'
  | 'Food'
  | 'Logistics'
  | 'Industry'
  | 'Frontier'
  | 'Upgrades';

export type ProgressionUnlockKind = 'hero' | 'building' | 'task' | 'terrain' | 'upgrade';

export interface ProgressionUnlockRef {
  kind: ProgressionUnlockKind;
  key: string;
}

export interface StoryHookDefinition {
  introBeatKey?: string;
  unlockBeatKey?: string;
  completionBeatKey?: string;
}

export type RequirementDefinition =
  | { kind: 'population_at_least'; amount: number }
  | { kind: 'beds_at_least'; amount: number }
  | { kind: 'frontier_distance_at_least'; amount: number }
  | { kind: 'resource_stock_at_least'; resourceType: ResourceType; amount: number }
  | { kind: 'food_source_stock_at_least'; amount: number }
  | { kind: 'building_count_at_least'; buildingKey: BuildingKey; amount: number }
  | { kind: 'building_operational_at_least'; buildingKey: BuildingKey; amount: number }
  | { kind: 'terrain_discovered'; terrainKey: TerrainKey }
  | { kind: 'landing_terrain_discovered'; terrainKey: TerrainKey }
  | { kind: 'study_completed'; studyKey: string }
  | { kind: 'any_study_completed' }
  | { kind: 'any_hero_ability_charge_earned' }
  | { kind: 'any_of'; requirements: RequirementDefinition[] };

export interface RequirementProgress {
  kind: RequirementDefinition['kind'];
  label: string;
  current: number;
  target: number;
  satisfied: boolean;
  currentLabel: string;
}

export interface ProgressionNodeDefinition {
  key: ProgressionNodeKey;
  label: string;
  category: ProgressionLane;
  description: string;
  requirements: RequirementDefinition[];
  unlocks: ProgressionUnlockRef[];
  sortOrder: number;
  startsUnlocked?: boolean;
  storyHooks?: StoryHookDefinition;
}

export interface ProgressionNodeSnapshot {
  key: ProgressionNodeKey;
  label: string;
  category: ProgressionLane;
  description: string;
  unlocked: boolean;
  recentlyUnlocked: boolean;
  requirements: RequirementProgress[];
  unlocks: ProgressionUnlockDescriptor[];
}

export interface ProgressionUnlockDescriptor {
  kind: ProgressionUnlockKind;
  key: string;
  label: string;
  description: string;
}

export interface ProgressionUnlockedContent {
  heroes: StoryHeroId[];
  buildings: BuildingKey[];
  tasks: TaskType[];
  terrains: TerrainKey[];
  upgrades: UpgradeKey[];
}

export interface ProgressionCategorySnapshot<T extends string> {
  available: T[];
  newlyUnlocked: T[];
}

export interface ProgressionSnapshot {
  unlockedNodeKeys: ProgressionNodeKey[];
  recentlyUnlockedNodeKeys: ProgressionNodeKey[];
  availableUnlocks: ProgressionUnlockDescriptor[];
  nextRecommendedNodeKeys: ProgressionNodeKey[];
  unlocked: ProgressionUnlockedContent;
  heroes: ProgressionCategorySnapshot<StoryHeroId>;
  buildings: ProgressionCategorySnapshot<BuildingKey>;
  tasks: ProgressionCategorySnapshot<TaskType>;
  terrains: ProgressionCategorySnapshot<TerrainKey>;
  upgrades: ProgressionCategorySnapshot<UpgradeKey>;
  nodes: ProgressionNodeSnapshot[];
}

export interface ProgressionMetrics {
  population: number;
  beds: number;
  frontierDistance: number;
  resourceStock: Partial<Record<ResourceType, number>>;
  buildingCounts: Partial<Record<BuildingKey, number>>;
  operationalBuildingCounts: Partial<Record<BuildingKey, number>>;
  discoveredTerrains: TerrainKey[];
  landingTerrains: TerrainKey[];
  unlockedHeroIds: StoryHeroId[];
  completedStudyKeys: string[];
  heroAbilityChargesEarned: number;
}

export type StoryBuildingKey = BuildingKey;
export type StoryProgressionSnapshot = ProgressionSnapshot;
export type StoryUnlockDescriptor = ProgressionUnlockDescriptor;

const BUILDING_META: Record<BuildingKey, { label: string; description: string; taskKey: TaskType }> = {
  well: {
    label: 'Well',
    description: 'Brings water inland and supports the first true farmland.',
    taskKey: 'buildWell',
  },
  watchtower: {
    label: 'Watchtower',
    description: 'Raises a lookout that reveals nearby frontier at once.',
    taskKey: 'buildWatchtower',
  },
  beacon: {
    label: 'Beacon',
    description: 'Anchors a water lookout that reveals and secures nearby waters.',
    taskKey: 'buildBeacon',
  },
  wall: {
    label: 'Wall',
    description: 'Raises a connected defensive barrier that can later be rebuilt in stone.',
    taskKey: 'buildWall',
  },
  townCenter: {
    label: 'Town Center',
    description: 'Founds a new settlement anchor deeper in the frontier.',
    taskKey: 'buildTownCenter',
  },
  supplyDepot: {
    label: 'Supply Depot',
    description: 'Creates a forward warehouse for hauling and construction.',
    taskKey: 'buildSupplyDepot',
  },
  foodStorehouse: {
    label: 'Food Storehouse',
    description: 'Creates dedicated storage for food and drinks.',
    taskKey: 'buildFoodStorehouse',
  },
  materialsYard: {
    label: 'Materials Yard',
    description: 'Creates dedicated storage for raw materials.',
    taskKey: 'buildMaterialsYard',
  },
  cropSilo: {
    label: 'Crop Silo',
    description: 'Creates dedicated storage for crops and harvested plants.',
    taskKey: 'buildCropSilo',
  },
  craftedGoodsStorehouse: {
    label: 'Crafted Goods Storehouse',
    description: 'Creates dedicated storage for tools and weapons.',
    taskKey: 'buildCraftedGoodsStorehouse',
  },
  dock: {
    label: 'Dock',
    description: 'Opens the shoreline to fishing and steadier landings from active shore.',
    taskKey: 'buildDock',
  },
  harbor: {
    label: 'Harbor',
    description: 'Connects a large body of water to arriving trade ships and cargo orders.',
    taskKey: 'buildHarbor',
  },
  tradeCenter: {
    label: 'Trade Center',
    description: 'Gives the colony a formal exchange office for resource trading.',
    taskKey: 'buildTradeCenter',
  },
  lumberCamp: {
    label: 'Lumber Camp',
    description: 'Turns a forest tile into a permanent timber site.',
    taskKey: 'buildLumberCamp',
  },
  huntersHut: {
    label: 'Hunter Hut',
    description: 'Turns a forest tile into a staffed source of steady food.',
    taskKey: 'buildHuntersHut',
  },
  granary: {
    label: 'Granary',
    description: 'Turns grain fields into a staffed source of stored grain.',
    taskKey: 'buildGranary',
  },
  bakery: {
    label: 'Bakery',
    description: 'Turns stored grain into dependable food once workers staff it.',
    taskKey: 'buildBakery',
  },
  brewery: {
    label: 'Brewery',
    description: 'Turns grain and hops into beer for the colony.',
    taskKey: 'buildBrewery',
  },
  winery: {
    label: 'Winery',
    description: 'Turns grapes into wine for settlers who need a stronger morale boost.',
    taskKey: 'buildWinery',
  },
  pub: {
    label: 'Pub',
    description: 'Gives settlers a staffed place to socialize and restore happiness.',
    taskKey: 'buildPub',
  },
  shop: {
    label: 'Shop',
    description: 'Sells imported trade goods to settlers for a small happiness boost.',
    taskKey: 'buildShop',
  },
  apiary: {
    label: 'Apiary',
    description: 'Turns nearby forest and field forage into steady food with a staffed beekeeper.',
    taskKey: 'buildApiary',
  },
  workshop: {
    label: 'Workshop',
    description: 'Turns ore into tools for expansion and advanced upgrades.',
    taskKey: 'buildWorkshop',
  },
  weaponSmith: {
    label: 'Weapon Smith',
    description: 'Turns ore and timber into weapons for trained border guards.',
    taskKey: 'buildWeaponSmith',
  },
  library: {
    label: 'Library',
    description: 'Gives settlers a place to study long subjects that unlock colony knowledge.',
    taskKey: 'buildLibrary',
  },
  mine: {
    label: 'Mine',
    description: 'Establishes a lasting ore extraction point in the ridges.',
    taskKey: 'buildMine',
  },
  quarry: {
    label: 'Quarry',
    description: 'Establishes a lasting stone extraction point in the ridges.',
    taskKey: 'buildQuarry',
  },
  oven: {
    label: 'Oven',
    description: 'Turns desert sand and fuel into glass for advanced housing.',
    taskKey: 'buildOven',
  },
  house: {
    label: 'House',
    description: 'Shelters settlers and raises the colony population cap.',
    taskKey: 'buildHouse',
  },
  road: {
    label: 'Road',
    description: 'A laid route that can later be paved into faster stonework.',
    taskKey: 'buildRoad',
  },
  barracks: {
    label: 'Barracks',
    description: 'Trains reserve guards who can garrison towers and pressure hostile borders.',
    taskKey: 'buildBarracks',
  },
};

const TASK_META: Record<string, { label: string; description: string }> = {
  explore: {
    label: 'Explore',
    description: 'Scout the unknown and push the frontier outward.',
  },
  gatherDriftwood: {
    label: 'Gather Driftwood',
    description: 'Collect slow wood from shoreline plains.',
  },
  chopWood: {
    label: 'Chop Wood',
    description: 'Clear forest tiles into raw building stock.',
  },
  clearRocks: {
    label: 'Clear Rocks',
    description: 'Open rocky ground into usable work plots.',
  },
  breakDirtRock: {
    label: 'Break Rock',
    description: 'Break large boulders blocking rough dirt tiles.',
  },
  harvestWaterLilies: {
    label: 'Harvest Water Lilies',
    description: 'Cut lily pads from the shallows for bridge-making stock.',
  },
  placeWaterLilies: {
    label: 'Place Water Lilies',
    description: 'Lay harvested lily pads onto open water to create walkable stepping stones.',
  },
  plantTrees: {
    label: 'Plant Trees',
    description: 'Restore chopped forests into young woodland.',
  },
  removeTrunks: {
    label: 'Remove Trunks',
    description: 'Clear stumps and convert exhausted groves into open land.',
  },
  buildRoad: {
    label: 'Build Road',
    description: 'Lay safe lanes across open ground.',
  },
  buildWall: {
    label: 'Build Wall',
    description: 'Raise linked timber walls from nearby towers, town centers, or existing wall lines.',
  },
  buildBridge: {
    label: 'Build Bridge',
    description: 'Span straight timber bridges over controlled water from active shore or bridgeheads.',
  },
  buildTunnel: {
    label: 'Build Tunnel',
    description: 'Cut straight mountain tunnels from active approaches or existing tunnel mouths.',
  },
  dig: {
    label: 'Dig',
    description: 'Turn grass into rough dirt, revealing the ground beneath.',
  },
  convertToGrass: {
    label: 'Convert To Grass',
    description: 'Clear rough dirt into grass-ready ground for the next lane crews.',
  },
  hunt: {
    label: 'Hunt',
    description: 'Gather emergency food from nearby forests when the stores run thin.',
  },
  tillLand: {
    label: 'Prepare Land',
    description: 'Turn plains and dirt into workable farm plots.',
  },
  irregateDirtTask: {
    label: 'Irrigate',
    description: 'Carry water inland to revive dry plots.',
  },
  seedGrain: {
    label: 'Plant Seeds',
    description: 'Seed prepared earth and establish grain fields.',
  },
  harvestGrain: {
    label: 'Harvest Grain',
    description: 'Cut ripe grain into usable crop stock.',
  },
  seedHops: {
    label: 'Plant Hops',
    description: 'Seed prepared earth with hops for brewing.',
  },
  harvestHops: {
    label: 'Harvest Hops',
    description: 'Cut mature hops into brewing stock.',
  },
  seedGrapes: {
    label: 'Plant Grapes',
    description: 'Seed prepared earth with grape vines for future luxury drink production.',
  },
  harvestGrapes: {
    label: 'Harvest Grapes',
    description: 'Gather ripe grapes from mature vines.',
  },
  fishAtDock: {
    label: 'Fish At Dock',
    description: 'Turn shoreline works into steady food hauling.',
  },
  mineOre: {
    label: 'Mine Ore',
    description: 'Extract ore from completed mine heads.',
  },
  gatherSand: {
    label: 'Gather Sand',
    description: 'Collect usable sand from controlled desert ground.',
  },
  activateRuins: {
    label: 'Activate Ruins',
    description: 'Use a hero to turn ancient frontier notes into study progress.',
  },
};

const TERRAIN_META: Record<TerrainKey, { label: string; description: string }> = {
  towncenter: {
    label: 'Town Center',
    description: 'Settlement heartland already held by the colony.',
  },
  plains: {
    label: 'Plains',
    description: 'Open ground for roads, farms, and expansion.',
  },
  forest: {
    label: 'Forest',
    description: 'Timber stands that feed construction and regrowth.',
  },
  water: {
    label: 'Water',
    description: 'Shoals and coastlines that can later support harbor work.',
  },
  mountain: {
    label: 'Mountain',
    description: 'Ridges that hide veins of long-term industry.',
  },
  dirt: {
    label: 'Dirt',
    description: 'Rough earth that can be cleared and farmed.',
  },
  snow: {
    label: 'Snowfields',
    description: 'Cold outer reaches of the growing frontier.',
  },
  dessert: {
    label: 'Desert',
    description: 'Harsh dry stretches beyond the safer core rings.',
  },
  vulcano: {
    label: 'Volcano',
    description: 'A dangerous late-frontier landmark at the edge of expansion.',
  },
  grain: {
    label: 'Grain',
    description: 'Fertile crop ground once the colony learns to farm it.',
  },
  hops: {
    label: 'Hops',
    description: 'Bitter climbing crops that support brewing once fields mature.',
  },
  grapes: {
    label: 'Grapes',
    description: 'Vine crops that turn late frontier farms toward wine production.',
  },
};

const UPGRADE_META: Record<UpgradeKey, { label: string; description: string; taskKey: TaskType }> = {
  stone_house_upgrade: {
    label: 'Stone House',
    description: 'Rebuilds a basic house into sturdier stone housing with more beds.',
    taskKey: 'upgradeHouseToStone',
  },
  glass_house_upgrade: {
    label: 'Glass House',
    description: 'Rebuilds a stone house with glasswork for a larger household.',
    taskKey: 'upgradeHouseToGlass',
  },
  warehouse_upgrade: {
    label: 'Warehouse',
    description: 'Turns a frontier depot into a full-capacity warehouse.',
    taskKey: 'upgradeDepotToWarehouse',
  },
  sawmill_upgrade: {
    label: 'Sawmill',
    description: 'Mechanizes the lumber camp and boosts timber output.',
    taskKey: 'upgradeLumberCampToSawmill',
  },
  reinforced_mine_upgrade: {
    label: 'Reinforced Mine',
    description: 'Stabilizes the mine head and improves ore output.',
    taskKey: 'upgradeMineToReinforced',
  },
  stone_road_upgrade: {
    label: 'Stone Road',
    description: 'Paves a wooden road into a faster stone highway.',
    taskKey: 'upgradeRoadToStone',
  },
  stone_wall_upgrade: {
    label: 'Stone Wall',
    description: 'Rebuilds a timber wall in dressed stone for a stronger defensive line.',
    taskKey: 'upgradeWallToStone',
  },
};

const NODE_DEFINITIONS: readonly ProgressionNodeDefinition[] = [
  {
    key: 'landfall',
    label: 'Landfall',
    category: 'Settlement',
    description: 'Establish the first camp and basic frontier work.',
    requirements: [],
    startsUnlocked: true,
    sortOrder: 10,
    unlocks: [
      { kind: 'hero', key: 'h1' },
      { kind: 'hero', key: 'h2' },
      { kind: 'hero', key: 'h5' },
      { kind: 'building', key: 'house' },
      { kind: 'building', key: 'huntersHut' },
      { kind: 'task', key: 'explore' },
      { kind: 'task', key: 'gatherDriftwood' },
      { kind: 'task', key: 'chopWood' },
      { kind: 'task', key: 'clearRocks' },
      { kind: 'task', key: 'buildRoad' },
      { kind: 'task', key: 'dig' },
      { kind: 'task', key: 'convertToGrass' },
      { kind: 'task', key: 'hunt' },
      { kind: 'task', key: 'breakDirtRock' },
      { kind: 'task', key: 'plantTrees' },
      { kind: 'task', key: 'removeTrunks' },
      { kind: 'terrain', key: 'plains' },
      { kind: 'terrain', key: 'forest' },
      { kind: 'terrain', key: 'dirt' },
      { kind: 'terrain', key: 'water' },
    ],
    storyHooks: {
      introBeatKey: 'landfall-intro',
      unlockBeatKey: 'landfall-unlocked',
    },
  },
  {
    key: 'shoreline',
    label: 'Shoreline Works',
    category: 'Frontier',
    description: 'Turn the coast into part of the colony and start working over shallow water.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'house', amount: 1 },
      { kind: 'population_at_least', amount: 2 },
      {
        kind: 'any_of',
        requirements: [
          { kind: 'landing_terrain_discovered', terrainKey: 'water' },
          { kind: 'terrain_discovered', terrainKey: 'water' },
        ],
      },
    ],
    sortOrder: 20,
    unlocks: [
      { kind: 'building', key: 'dock' },
      { kind: 'task', key: 'fishAtDock' },
      { kind: 'task', key: 'harvestWaterLilies' },
      { kind: 'task', key: 'placeWaterLilies' },
      { kind: 'task', key: 'buildBridge' },
    ],
    storyHooks: {
      unlockBeatKey: 'shoreline-unlocked',
    },
  },
  {
    key: 'water_source',
    label: 'Field Wells',
    category: 'Food',
    description: 'Sink a local water source before opening dry plots.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'house', amount: 1 },
      { kind: 'population_at_least', amount: 2 },
    ],
    sortOrder: 25,
    unlocks: [
      { kind: 'building', key: 'well' },
    ],
  },
  {
    key: 'farming',
    label: 'Working Fields',
    category: 'Food',
    description: 'Turn the first shelter into a farming settlement.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'house', amount: 1 },
      { kind: 'population_at_least', amount: 2 },
      {
        kind: 'any_of',
        requirements: [
          { kind: 'landing_terrain_discovered', terrainKey: 'water' },
          { kind: 'terrain_discovered', terrainKey: 'water' },
          { kind: 'building_count_at_least', buildingKey: 'well', amount: 1 },
        ],
      },
    ],
    sortOrder: 30,
    unlocks: [
      { kind: 'task', key: 'tillLand' },
      { kind: 'task', key: 'seedGrain' },
      { kind: 'task', key: 'harvestGrain' },
    ],
  },
  {
    key: 'irrigation',
    label: 'Irrigation',
    category: 'Food',
    description: 'Carry water inland and push farming onto drier ground.',
    requirements: [
      { kind: 'resource_stock_at_least', resourceType: 'grain', amount: 6 },
      { kind: 'population_at_least', amount: 3 },
    ],
    sortOrder: 40,
    unlocks: [
      { kind: 'hero', key: 'h3' },
    ],
  },
  {
    key: 'stores',
    label: 'Stores',
    category: 'Food',
    description: 'Preserve the harvest before it starts bottlenecking growth.',
    requirements: [
      { kind: 'resource_stock_at_least', resourceType: 'grain', amount: 10 },
      { kind: 'population_at_least', amount: 3 },
    ],
    sortOrder: 50,
    unlocks: [
      { kind: 'building', key: 'granary' },
      { kind: 'building', key: 'apiary' },
    ],
  },
  {
    key: 'baking',
    label: 'Baking',
    category: 'Food',
    description: 'Turn stored grain into dependable food for a larger workforce.',
    requirements: [
      { kind: 'building_operational_at_least', buildingKey: 'granary', amount: 1 },
      { kind: 'resource_stock_at_least', resourceType: 'grain', amount: 6 },
      { kind: 'population_at_least', amount: 3 },
    ],
    sortOrder: 60,
    unlocks: [
      { kind: 'building', key: 'bakery' },
    ],
  },
  {
    key: 'brewing',
    label: 'Brewing',
    category: 'Food',
    description: 'Once food is stable, the colony can spare crops and labor for morale.',
    requirements: [
      { kind: 'population_at_least', amount: 6 },
      {
        kind: 'any_of',
        requirements: [
          { kind: 'building_count_at_least', buildingKey: 'bakery', amount: 1 },
          { kind: 'building_count_at_least', buildingKey: 'granary', amount: 1 },
        ],
      },
    ],
    sortOrder: 65,
    unlocks: [
      { kind: 'building', key: 'brewery' },
      { kind: 'building', key: 'winery' },
      { kind: 'building', key: 'pub' },
      { kind: 'building', key: 'shop' },
      { kind: 'task', key: 'seedHops' },
      { kind: 'task', key: 'harvestHops' },
      { kind: 'task', key: 'seedGrapes' },
      { kind: 'task', key: 'harvestGrapes' },
    ],
  },
  {
    key: 'security',
    label: 'Perimeter Security',
    category: 'Settlement',
    description: 'Once food is stable, the colony can afford real lookout posts.',
    requirements: [
      { kind: 'food_source_stock_at_least', amount: 8 },
      { kind: 'population_at_least', amount: 4 },
    ],
    sortOrder: 70,
    unlocks: [
      { kind: 'building', key: 'watchtower' },
      { kind: 'building', key: 'beacon' },
      { kind: 'building', key: 'wall' },
    ],
  },
  {
    key: 'mountain_frontier',
    label: 'Mountain Frontier',
    category: 'Frontier',
    description: 'With a lookout in place, the colony can push into the ridges and start mining stone and ore.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'watchtower', amount: 1 },
      { kind: 'population_at_least', amount: 5 },
    ],
    sortOrder: 80,
    unlocks: [
      { kind: 'terrain', key: 'mountain' },
      { kind: 'task', key: 'buildTunnel' },
      { kind: 'building', key: 'mine' },
      { kind: 'building', key: 'quarry' },
    ],
  },
  {
    key: 'logistics',
    label: 'Logistics',
    category: 'Logistics',
    description: 'A bigger colony needs storage and hauling away from the first camp.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'house', amount: 2 },
      { kind: 'population_at_least', amount: 4 },
    ],
    sortOrder: 90,
    unlocks: [
      { kind: 'hero', key: 'h4' },
      { kind: 'building', key: 'supplyDepot' },
      { kind: 'building', key: 'foodStorehouse' },
      { kind: 'building', key: 'materialsYard' },
      { kind: 'building', key: 'cropSilo' },
      { kind: 'building', key: 'craftedGoodsStorehouse' },
      { kind: 'building', key: 'harbor' },
      { kind: 'building', key: 'library' },
    ],
  },
  {
    key: 'timber_industry',
    label: 'Timber Industry',
    category: 'Industry',
    description: 'Industrialize timber so wood keeps pace with the rest of the colony.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'supplyDepot', amount: 1 },
      { kind: 'resource_stock_at_least', resourceType: 'wood', amount: 12 },
    ],
    sortOrder: 100,
    unlocks: [
      { kind: 'building', key: 'lumberCamp' },
    ],
  },
  {
    key: 'masonry',
    label: 'Masonry',
    category: 'Upgrades',
    description: 'Stonework makes durable frontier paving possible while housing and storage plans move into the library.',
    requirements: [
      { kind: 'resource_stock_at_least', resourceType: 'stone', amount: 8 },
      { kind: 'population_at_least', amount: 4 },
    ],
    sortOrder: 110,
    unlocks: [
      { kind: 'upgrade', key: 'stone_road_upgrade' },
      { kind: 'upgrade', key: 'stone_wall_upgrade' },
    ],
  },
  {
    key: 'harsh_frontier',
    label: 'Harsh Frontier',
    category: 'Frontier',
    description: 'Stable food and logistics let the colony survive harsher outer terrain.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'supplyDepot', amount: 1 },
      { kind: 'building_count_at_least', buildingKey: 'bakery', amount: 1 },
      { kind: 'population_at_least', amount: 5 },
    ],
    sortOrder: 120,
    unlocks: [
      { kind: 'terrain', key: 'snow' },
      { kind: 'terrain', key: 'dessert' },
    ],
  },
  {
    key: 'desert_industry',
    label: 'Desert Industry',
    category: 'Industry',
    description: 'The desert becomes a source of glass once the colony can spare fuel and haulers.',
    requirements: [
      { kind: 'terrain_discovered', terrainKey: 'dessert' },
      { kind: 'population_at_least', amount: 6 },
      { kind: 'building_count_at_least', buildingKey: 'supplyDepot', amount: 1 },
      { kind: 'resource_stock_at_least', resourceType: 'wood', amount: 10 },
    ],
    sortOrder: 122,
    unlocks: [
      { kind: 'building', key: 'oven' },
      { kind: 'task', key: 'gatherSand' },
      { kind: 'upgrade', key: 'glass_house_upgrade' },
    ],
  },
  {
    key: 'hero_methods',
    label: 'Hero Methods',
    category: 'Upgrades',
    description: 'The crew turns hard-won experience into shared hero actions for urgent colony work.',
    requirements: [
      { kind: 'any_hero_ability_charge_earned' },
    ],
    sortOrder: 123,
    unlocks: [],
  },
  {
    key: 'toolmaking',
    label: 'Toolmaking',
    category: 'Industry',
    description: 'Ore becomes real industry once a workshop can turn it into tools.',
    requirements: [
      { kind: 'building_operational_at_least', buildingKey: 'mine', amount: 1 },
      { kind: 'resource_stock_at_least', resourceType: 'ore', amount: 6 },
      { kind: 'population_at_least', amount: 5 },
    ],
    sortOrder: 125,
    unlocks: [
      { kind: 'building', key: 'workshop' },
      { kind: 'building', key: 'tradeCenter' },
      { kind: 'building', key: 'weaponSmith' },
      { kind: 'building', key: 'barracks' },
    ],
  },
  {
    key: 'expansion',
    label: 'Expansion',
    category: 'Settlement',
    description: 'Tools and ore output finally support founding a second settlement anchor.',
    requirements: [
      { kind: 'population_at_least', amount: 7 },
      { kind: 'resource_stock_at_least', resourceType: 'tools', amount: 6 },
      { kind: 'building_operational_at_least', buildingKey: 'mine', amount: 1 },
      { kind: 'building_operational_at_least', buildingKey: 'workshop', amount: 1 },
    ],
    sortOrder: 130,
    unlocks: [
      { kind: 'building', key: 'townCenter' },
    ],
  },
  {
    key: 'deep_frontier',
    label: 'Deep Frontier',
    category: 'Upgrades',
    description: 'A second settlement and real industry open the late frontier.',
    requirements: [
      { kind: 'building_count_at_least', buildingKey: 'townCenter', amount: 1 },
      { kind: 'building_operational_at_least', buildingKey: 'lumberCamp', amount: 1 },
      { kind: 'building_operational_at_least', buildingKey: 'mine', amount: 1 },
    ],
    sortOrder: 140,
    unlocks: [
      { kind: 'terrain', key: 'vulcano' },
      { kind: 'upgrade', key: 'sawmill_upgrade' },
      { kind: 'upgrade', key: 'reinforced_mine_upgrade' },
    ],
  },
  {
    key: 'ancient_frontier',
    label: 'Ancient Frontier',
    category: 'Frontier',
    description: 'Survey crews learn how to read the rare landmarks scattered beyond the colony.',
    requirements: [
      {
        kind: 'any_of',
        requirements: [
          { kind: 'terrain_discovered', terrainKey: 'vulcano' },
          { kind: 'study_completed', studyKey: 'frontier_almanacs' },
        ],
      },
    ],
    sortOrder: 150,
    unlocks: [
      { kind: 'task', key: 'activateRuins' },
    ],
  },
] as const;

const NODE_BY_KEY = new Map(NODE_DEFINITIONS.map((node) => [node.key, node]));
const CONTENT_TO_NODE = new Map<string, ProgressionNodeKey>();

for (const node of NODE_DEFINITIONS) {
  for (const unlock of node.unlocks) {
    CONTENT_TO_NODE.set(`${unlock.kind}:${unlock.key}`, node.key);
  }
}

function unique<T extends string>(values: T[]) {
  return Array.from(new Set(values));
}

function makeUnlockKey(kind: ProgressionUnlockKind, key: string) {
  return `${kind}:${key}`;
}

function makeProgressionUnlockDescriptor(unlock: ProgressionUnlockRef): ProgressionUnlockDescriptor {
  switch (unlock.kind) {
    case 'hero': {
      const hero = getStoryHeroTemplate(unlock.key);
      return {
        kind: 'hero',
        key: unlock.key,
        label: hero?.name ?? unlock.key,
        description: hero?.role ?? 'New hero available.',
      };
    }
    case 'building': {
      const building = BUILDING_META[unlock.key as BuildingKey];
      return {
        kind: 'building',
        key: unlock.key,
        label: building?.label ?? unlock.key,
        description: building?.description ?? 'New building available.',
      };
    }
    case 'task': {
      const task = TASK_META[unlock.key];
      return {
        kind: 'task',
        key: unlock.key,
        label: task?.label ?? unlock.key,
        description: task?.description ?? 'New action available.',
      };
    }
    case 'terrain': {
      const terrain = TERRAIN_META[unlock.key as TerrainKey];
      return {
        kind: 'terrain',
        key: unlock.key,
        label: terrain?.label ?? unlock.key,
        description: terrain?.description ?? 'New frontier terrain available.',
      };
    }
    case 'upgrade': {
      const upgrade = UPGRADE_META[unlock.key as UpgradeKey];
      return {
        kind: 'upgrade',
        key: unlock.key,
        label: upgrade?.label ?? unlock.key,
        description: upgrade?.description ?? 'New upgrade available.',
      };
    }
    default:
      return {
        kind: unlock.kind,
        key: unlock.key,
        label: unlock.key,
        description: '',
      };
  }
}

function getMetricValue(metrics: ProgressionMetrics, requirement: RequirementDefinition): number {
  switch (requirement.kind) {
    case 'population_at_least':
      return metrics.population;
    case 'beds_at_least':
      return metrics.beds;
    case 'frontier_distance_at_least':
      return metrics.frontierDistance;
    case 'resource_stock_at_least':
      return getResourceRequirementStock(metrics.resourceStock, requirement.resourceType);
    case 'food_source_stock_at_least':
      return getResourceRequirementStock(metrics.resourceStock, 'food');
    case 'building_count_at_least':
      return metrics.buildingCounts[requirement.buildingKey] ?? 0;
    case 'building_operational_at_least':
      return metrics.operationalBuildingCounts[requirement.buildingKey] ?? 0;
    case 'terrain_discovered':
      return metrics.discoveredTerrains.includes(requirement.terrainKey) ? 1 : 0;
    case 'landing_terrain_discovered':
      return metrics.landingTerrains.includes(requirement.terrainKey) ? 1 : 0;
    case 'study_completed':
      return metrics.completedStudyKeys.includes(requirement.studyKey) ? 1 : 0;
    case 'any_study_completed':
      return metrics.completedStudyKeys.length > 0 ? 1 : 0;
    case 'any_hero_ability_charge_earned':
      return metrics.heroAbilityChargesEarned > 0 ? 1 : 0;
    case 'any_of':
      return requirement.requirements.some((innerRequirement) => isRequirementSatisfied(metrics, innerRequirement)) ? 1 : 0;
    default:
      return 0;
  }
}

function getRequirementTarget(requirement: RequirementDefinition): number {
  switch (requirement.kind) {
    case 'terrain_discovered':
    case 'landing_terrain_discovered':
    case 'study_completed':
    case 'any_study_completed':
    case 'any_hero_ability_charge_earned':
    case 'any_of':
      return 1;
    default:
      return requirement.amount;
  }
}

function isRequirementSatisfied(metrics: ProgressionMetrics, requirement: RequirementDefinition): boolean {
  return getMetricValue(metrics, requirement) >= getRequirementTarget(requirement);
}

function getRequirementLabel(requirement: RequirementDefinition): string {
  switch (requirement.kind) {
    case 'population_at_least':
      return `Population ${requirement.amount}`;
    case 'beds_at_least':
      return `Beds ${requirement.amount}`;
    case 'frontier_distance_at_least':
      return `Frontier ring ${requirement.amount}`;
    case 'resource_stock_at_least':
      return requirement.resourceType === 'food'
        ? `Food source stock ${requirement.amount}`
        : `${requirement.resourceType} stock ${requirement.amount}`;
    case 'food_source_stock_at_least':
      return `Food source stock ${requirement.amount}`;
    case 'building_count_at_least':
      return `${BUILDING_META[requirement.buildingKey].label} x${requirement.amount}`;
    case 'building_operational_at_least':
      return `Operational ${BUILDING_META[requirement.buildingKey].label} x${requirement.amount}`;
    case 'terrain_discovered':
      return `Discover ${TERRAIN_META[requirement.terrainKey]?.label ?? requirement.terrainKey}`;
    case 'landing_terrain_discovered':
      return `Find nearby ${TERRAIN_META[requirement.terrainKey]?.label ?? requirement.terrainKey}`;
    case 'study_completed':
      return `Complete ${requirement.studyKey.replace(/_/g, ' ')}`;
    case 'any_study_completed':
      return 'Complete any study';
    case 'any_hero_ability_charge_earned':
      return 'Earn a hero ability charge';
    case 'any_of':
      return requirement.requirements.map(getRequirementLabel).join(' or ');
    default:
      return 'Requirement';
  }
}

function buildRequirementProgress(metrics: ProgressionMetrics, requirement: RequirementDefinition): RequirementProgress {
  const current = getMetricValue(metrics, requirement);
  const target = getRequirementTarget(requirement);

  return {
    kind: requirement.kind,
    label: getRequirementLabel(requirement),
    current,
    target,
    satisfied: current >= target,
    currentLabel: requirement.kind === 'terrain_discovered'
      || requirement.kind === 'landing_terrain_discovered'
      ? (current >= 1 ? 'Discovered' : 'Undiscovered')
      : (target === 1 ? (current >= 1 ? 'Done' : 'Missing') : `${current}/${target}`),
  };
}

function nodeRequirementsSatisfied(metrics: ProgressionMetrics, node: ProgressionNodeDefinition) {
  return node.requirements.every((requirement) => isRequirementSatisfied(metrics, requirement));
}

function isRequirementRelevantForRecommendation(metrics: ProgressionMetrics, requirement: RequirementDefinition): boolean {
  switch (requirement.kind) {
    case 'terrain_discovered':
    case 'landing_terrain_discovered':
      return isRequirementSatisfied(metrics, requirement);
    case 'any_of':
      return requirement.requirements.some((innerRequirement) => isRequirementRelevantForRecommendation(metrics, innerRequirement));
    default:
      return true;
  }
}

function nodeCanBeRecommended(metrics: ProgressionMetrics, node: ProgressionNodeDefinition) {
  return node.requirements.every((requirement) => isRequirementRelevantForRecommendation(metrics, requirement));
}

function flattenUnlockedDescriptors(nodeKeys: ProgressionNodeKey[]) {
  const seen = new Set<string>();
  const descriptors: ProgressionUnlockDescriptor[] = [];

  for (const nodeKey of nodeKeys) {
    const node = NODE_BY_KEY.get(nodeKey);
    if (!node) continue;

    for (const unlock of node.unlocks) {
      const descriptor = makeProgressionUnlockDescriptor(unlock);
      const seenKey = makeUnlockKey(descriptor.kind, descriptor.key);
      if (seen.has(seenKey)) {
        continue;
      }

      seen.add(seenKey);
      descriptors.push(descriptor);
    }
  }

  return descriptors;
}

function buildUnlockedContent(descriptors: ProgressionUnlockDescriptor[]): ProgressionUnlockedContent {
  return {
    heroes: unique(
      descriptors
        .filter((descriptor): descriptor is ProgressionUnlockDescriptor & { key: StoryHeroId } => descriptor.kind === 'hero')
        .map((descriptor) => descriptor.key),
    ),
    buildings: unique(
      descriptors
        .filter((descriptor): descriptor is ProgressionUnlockDescriptor & { key: BuildingKey } => descriptor.kind === 'building')
        .map((descriptor) => descriptor.key),
    ),
    tasks: unique(
      descriptors
        .filter((descriptor): descriptor is ProgressionUnlockDescriptor & { key: TaskType } => descriptor.kind === 'task')
        .map((descriptor) => descriptor.key),
    ),
    terrains: unique(
      descriptors
        .filter((descriptor): descriptor is ProgressionUnlockDescriptor & { key: TerrainKey } => descriptor.kind === 'terrain')
        .map((descriptor) => descriptor.key),
    ),
    upgrades: unique(
      descriptors
        .filter((descriptor): descriptor is ProgressionUnlockDescriptor & { key: UpgradeKey } => descriptor.kind === 'upgrade')
        .map((descriptor) => descriptor.key),
    ),
  };
}

export function createEmptyProgressionMetrics(): ProgressionMetrics {
  return {
    population: 0,
    beds: 0,
    frontierDistance: 0,
    resourceStock: {},
    buildingCounts: {},
    operationalBuildingCounts: {},
    discoveredTerrains: [],
    landingTerrains: [],
    unlockedHeroIds: [],
    completedStudyKeys: [],
    heroAbilityChargesEarned: 0,
  };
}

export function listProgressionNodeDefinitions() {
  return NODE_DEFINITIONS.slice();
}

export function getProgressionNodeDefinition(nodeKey: ProgressionNodeKey) {
  return NODE_BY_KEY.get(nodeKey) ?? null;
}

export function evaluateProgression(
  metrics: ProgressionMetrics,
  previouslyUnlockedNodeKeys: ProgressionNodeKey[] = [],
): ProgressionSnapshot {
  const unlocked = new Set<ProgressionNodeKey>(previouslyUnlockedNodeKeys);

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of NODE_DEFINITIONS) {
      if (unlocked.has(node.key)) {
        continue;
      }

      if (node.startsUnlocked || nodeRequirementsSatisfied(metrics, node)) {
        unlocked.add(node.key);
        changed = true;
      }
    }
  }

  const unlockedNodeKeys = NODE_DEFINITIONS
    .filter((node) => unlocked.has(node.key))
    .map((node) => node.key);
  const recentlyUnlockedNodeKeys = unlockedNodeKeys.filter((nodeKey) => !previouslyUnlockedNodeKeys.includes(nodeKey));
  const availableUnlocks = flattenUnlockedDescriptors(unlockedNodeKeys);
  const recentUnlocks = flattenUnlockedDescriptors(recentlyUnlockedNodeKeys);
  const unlockedContent = buildUnlockedContent(availableUnlocks);
  const newlyUnlockedContent = buildUnlockedContent(recentUnlocks);
  const nodes = NODE_DEFINITIONS.map((node) => ({
    key: node.key,
    label: node.label,
    category: node.category,
    description: node.description,
    unlocked: unlocked.has(node.key),
    recentlyUnlocked: recentlyUnlockedNodeKeys.includes(node.key),
    requirements: node.requirements.map((requirement) => buildRequirementProgress(metrics, requirement)),
    unlocks: node.unlocks.map((unlock) => makeProgressionUnlockDescriptor(unlock)),
  }));
  const nextRecommendedNodeKeys = nodes
    .filter((node) => !node.unlocked)
    .filter((node) => {
      const definition = NODE_BY_KEY.get(node.key);
      return !!definition && nodeCanBeRecommended(metrics, definition);
    })
    .sort((a, b) => {
      const defA = NODE_BY_KEY.get(a.key);
      const defB = NODE_BY_KEY.get(b.key);
      return (defA?.sortOrder ?? 0) - (defB?.sortOrder ?? 0);
    })
    .slice(0, 3)
    .map((node) => node.key);

  return {
    unlockedNodeKeys,
    recentlyUnlockedNodeKeys,
    availableUnlocks,
    nextRecommendedNodeKeys,
    unlocked: unlockedContent,
    heroes: {
      available: unlockedContent.heroes,
      newlyUnlocked: newlyUnlockedContent.heroes,
    },
    buildings: {
      available: unlockedContent.buildings,
      newlyUnlocked: newlyUnlockedContent.buildings,
    },
    tasks: {
      available: unlockedContent.tasks,
      newlyUnlocked: newlyUnlockedContent.tasks,
    },
    terrains: {
      available: unlockedContent.terrains,
      newlyUnlocked: newlyUnlockedContent.terrains,
    },
    upgrades: {
      available: unlockedContent.upgrades,
      newlyUnlocked: newlyUnlockedContent.upgrades,
    },
    nodes,
  };
}

export function cloneStoryProgression(progression: ProgressionSnapshot): ProgressionSnapshot {
  return {
    unlockedNodeKeys: progression.unlockedNodeKeys.slice(),
    recentlyUnlockedNodeKeys: progression.recentlyUnlockedNodeKeys.slice(),
    availableUnlocks: progression.availableUnlocks.map((unlock) => ({ ...unlock })),
    nextRecommendedNodeKeys: progression.nextRecommendedNodeKeys.slice(),
    unlocked: {
      heroes: progression.unlocked.heroes.slice(),
      buildings: progression.unlocked.buildings.slice(),
      tasks: progression.unlocked.tasks.slice(),
      terrains: progression.unlocked.terrains.slice(),
      upgrades: progression.unlocked.upgrades.slice(),
    },
    heroes: {
      available: progression.heroes.available.slice(),
      newlyUnlocked: progression.heroes.newlyUnlocked.slice(),
    },
    buildings: {
      available: progression.buildings.available.slice(),
      newlyUnlocked: progression.buildings.newlyUnlocked.slice(),
    },
    tasks: {
      available: progression.tasks.available.slice(),
      newlyUnlocked: progression.tasks.newlyUnlocked.slice(),
    },
    terrains: {
      available: progression.terrains.available.slice(),
      newlyUnlocked: progression.terrains.newlyUnlocked.slice(),
    },
    upgrades: {
      available: progression.upgrades.available.slice(),
      newlyUnlocked: progression.upgrades.newlyUnlocked.slice(),
    },
    nodes: progression.nodes.map((node) => ({
      ...node,
      requirements: node.requirements.map((requirement) => ({ ...requirement })),
      unlocks: node.unlocks.map((unlock) => ({ ...unlock })),
    })),
  };
}

export function createStoryProgression(_missionNumber: number = 1): ProgressionSnapshot {
  return evaluateProgression(createEmptyProgressionMetrics());
}

export function createInitialProgressionSnapshot() {
  return createStoryProgression(1);
}

export function getInitialStoryHeroIds() {
  return createInitialProgressionSnapshot().unlocked.heroes.slice();
}

export function getStoryBuildingTaskKey(buildingKey: BuildingKey | string) {
  return BUILDING_META[buildingKey as BuildingKey]?.taskKey ?? null;
}

export function getStoryUpgradeTaskKey(upgradeKey: UpgradeKey | string) {
  return UPGRADE_META[upgradeKey as UpgradeKey]?.taskKey ?? null;
}

export function getAvailableStoryTaskKeys(progression: ProgressionSnapshot) {
  return unique([
    ...progression.unlocked.tasks,
    ...progression.unlocked.buildings.flatMap((buildingKey) => {
      const taskKey = getStoryBuildingTaskKey(buildingKey);
      return taskKey ? [taskKey] : [];
    }),
    ...progression.unlocked.upgrades.flatMap((upgradeKey) => {
      const taskKey = getStoryUpgradeTaskKey(upgradeKey);
      return taskKey ? [taskKey] : [];
    }),
  ]);
}

export function isStoryTaskUnlocked(progression: ProgressionSnapshot, taskKey: TaskType) {
  return getAvailableStoryTaskKeys(progression).includes(taskKey);
}

export function isStoryTerrainUnlocked(progression: ProgressionSnapshot, terrainKey: TerrainKey) {
  return terrainKey === 'towncenter' || progression.unlocked.terrains.includes(terrainKey);
}

export function isStoryBuildingUnlocked(progression: ProgressionSnapshot, buildingKey: BuildingKey) {
  return progression.unlocked.buildings.includes(buildingKey);
}

export function isStoryUpgradeUnlocked(progression: ProgressionSnapshot, upgradeKey: UpgradeKey) {
  return progression.unlocked.upgrades.includes(upgradeKey);
}

export function countNewStoryUnlocks(progression: ProgressionSnapshot) {
  return progression.recentlyUnlockedNodeKeys.length;
}

export function getStoryHeroDescriptor(heroId: StoryHeroId): ProgressionUnlockDescriptor | null {
  const hero = getStoryHeroTemplate(heroId);
  if (!hero) {
    return null;
  }

  return {
    kind: 'hero',
    key: hero.id,
    label: hero.name,
    description: hero.role,
  };
}

export function getStoryBuildingDescriptor(buildingKey: BuildingKey): ProgressionUnlockDescriptor {
  const building = BUILDING_META[buildingKey];
  return {
    kind: 'building',
    key: buildingKey,
    label: building?.label ?? buildingKey,
    description: building?.description ?? 'New construction option available.',
  };
}

export function getStoryTaskDescriptor(taskKey: TaskType): ProgressionUnlockDescriptor | null {
  const task = TASK_META[taskKey];
  if (!task) {
    return null;
  }

  return {
    kind: 'task',
    key: taskKey,
    label: task.label,
    description: task.description,
  };
}

export function getStoryTerrainDescriptor(terrainKey: TerrainKey): ProgressionUnlockDescriptor {
  const terrain = TERRAIN_META[terrainKey];
  return {
    kind: 'terrain',
    key: terrainKey,
    label: terrain.label,
    description: terrain.description,
  };
}

export function getStoryUpgradeDescriptor(upgradeKey: UpgradeKey): ProgressionUnlockDescriptor {
  const upgrade = UPGRADE_META[upgradeKey];
  return {
    kind: 'upgrade',
    key: upgradeKey,
    label: upgrade?.label ?? upgradeKey,
    description: upgrade?.description ?? 'New upgrade available.',
  };
}

export function getNewlyUnlockedStoryDescriptors(progression: ProgressionSnapshot): ProgressionUnlockDescriptor[] {
  const descriptors: ProgressionUnlockDescriptor[] = [];

  for (const nodeKey of progression.recentlyUnlockedNodeKeys) {
    const node = NODE_BY_KEY.get(nodeKey);
    if (!node) {
      continue;
    }

    for (const unlock of node.unlocks) {
      descriptors.push(makeProgressionUnlockDescriptor(unlock));
    }
  }

  return descriptors;
}

export function getStoryProgressionCategoryDescriptors(progression: ProgressionSnapshot) {
  return {
    heroes: progression.unlocked.heroes
      .map((heroId) => getStoryHeroDescriptor(heroId))
      .filter((descriptor): descriptor is ProgressionUnlockDescriptor => !!descriptor),
    buildings: progression.unlocked.buildings.map((buildingKey) => getStoryBuildingDescriptor(buildingKey)),
    tasks: progression.unlocked.tasks
      .map((taskKey) => getStoryTaskDescriptor(taskKey))
      .filter((descriptor): descriptor is ProgressionUnlockDescriptor => !!descriptor),
    terrains: progression.unlocked.terrains.map((terrainKey) => getStoryTerrainDescriptor(terrainKey)),
    upgrades: progression.unlocked.upgrades.map((upgradeKey) => getStoryUpgradeDescriptor(upgradeKey)),
  };
}

function clampObjectiveProgress(progress: RequirementProgress) {
  return Math.min(progress.target, Math.max(0, Math.floor(progress.current)));
}

function describeRequirementRoute(requirement: RequirementDefinition, progress: RequirementProgress) {
  switch (requirement.kind) {
    case 'population_at_least':
      return 'Grow the settlement by keeping beds and food available.';
    case 'beds_at_least':
      return 'Build or upgrade housing so more settlers have somewhere to live.';
    case 'frontier_distance_at_least':
      return 'Scout outward from active or controlled ground until the frontier reaches the next ring.';
    case 'resource_stock_at_least':
      return `Store ${requirement.amount} ${requirement.resourceType}. If this route is slow, improve the producer or work another recommended milestone while stock builds.`;
    case 'food_source_stock_at_least':
      return 'Store enough edible food from any route: hunting, fish, bread, beer, wine, or other food sources all count.';
    case 'building_count_at_least':
      return `Build ${progress.target} ${progress.label.replace(/ x\d+$/, '')}. If the terrain is awkward, extend reach with roads, towers, or depots first.`;
    case 'building_operational_at_least':
      return `Build and staff ${progress.target} ${progress.label.replace(/^Operational /, '').replace(/ x\d+$/, '')}. Check workers, input stock, and storage if it is idle.`;
    case 'terrain_discovered':
      if (requirement.terrainKey === 'mountain') {
        return 'Scout toward ridges and keep food, roads, and storage improving while the search runs. Trade and ship routes can later cover short ore or stone gaps if the mountains are slow to appear.';
      }
      if (requirement.terrainKey === 'dessert') {
        return 'Push past the safe rings until desert appears. If the route is long, build depots and roads first or keep food, mining, and trade milestones moving until the dry frontier is reachable.';
      }
      if (requirement.terrainKey === 'vulcano') {
        return 'Volcanic ground is a late frontier target. A completed frontier study can also satisfy ancient-route progress when the volcano is still out of reach.';
      }
      return 'Scout outward until this terrain appears. If it is far away, keep another food, logistics, or settlement lane moving while the search continues.';
    case 'landing_terrain_discovered':
      return 'Look near the founding town center for this terrain. Inland starts can use another route when the landing terrain is missing.';
    case 'study_completed':
      return 'Complete the named study through a library or study source.';
    case 'any_study_completed':
      return 'Complete any available study to prove the colony can turn knowledge into progress.';
    case 'any_hero_ability_charge_earned':
      return 'Use heroes until at least one ability charge is earned.';
    case 'any_of':
      return `Choose any route that fits this map: ${requirement.requirements.map(getRequirementLabel).join(' or ')}.`;
    default:
      return 'Complete this requirement to open the next milestone.';
  }
}

function objectiveKindForRequirement(requirement: RequirementDefinition): ObjectiveKind {
  switch (requirement.kind) {
    case 'population_at_least':
    case 'beds_at_least':
      return 'reach_population';
    case 'frontier_distance_at_least':
      return 'reach_distance';
    case 'resource_stock_at_least':
    case 'food_source_stock_at_least':
      return 'deliver_resource';
    case 'terrain_discovered':
    case 'landing_terrain_discovered':
      return 'discover_tiles';
    case 'building_count_at_least':
    case 'building_operational_at_least':
    case 'study_completed':
    case 'any_study_completed':
    case 'any_hero_ability_charge_earned':
    case 'any_of':
    default:
      return 'complete_task';
  }
}

function objectiveTaskForRequirement(requirement: RequirementDefinition): TaskType | undefined {
  switch (requirement.kind) {
    case 'building_count_at_least':
    case 'building_operational_at_least':
      return getStoryBuildingTaskKey(requirement.buildingKey) ?? undefined;
    default:
      return undefined;
  }
}

function objectiveResourceForRequirement(requirement: RequirementDefinition): ResourceType | undefined {
  switch (requirement.kind) {
    case 'resource_stock_at_least':
      return requirement.resourceType;
    case 'food_source_stock_at_least':
      return 'food';
    default:
      return undefined;
  }
}

export function getStoryProgressionObjectives(progression: ProgressionSnapshot): ObjectiveSnapshot[] {
  const nextNodeKey = progression.nextRecommendedNodeKeys[0];
  if (!nextNodeKey) {
    return [];
  }

  const node = progression.nodes.find((candidate) => candidate.key === nextNodeKey);
  const definition = getProgressionNodeDefinition(nextNodeKey);
  if (!node || !definition) {
    return [];
  }

  return node.requirements.map((progress, index): ObjectiveSnapshot => {
    const requirement = definition.requirements[index];
    const kind = requirement ? objectiveKindForRequirement(requirement) : 'complete_task';
    const taskType = requirement ? objectiveTaskForRequirement(requirement) : undefined;
    const resourceType = requirement ? objectiveResourceForRequirement(requirement) : undefined;

    return {
      id: `progression:${node.key}:${index}`,
      title: progress.satisfied ? `${progress.label} ready` : progress.label,
      description: requirement
        ? describeRequirementRoute(requirement, progress)
        : node.description,
      kind,
      required: true,
      target: progress.target,
      progress: clampObjectiveProgress(progress),
      completed: progress.satisfied,
      ...(taskType ? { taskType } : {}),
      ...(resourceType ? { resourceType } : {}),
    };
  });
}

export function getUnlockingNodeForContent(kind: ProgressionUnlockKind, key: string) {
  const nodeKey = CONTENT_TO_NODE.get(makeUnlockKey(kind, key));
  return nodeKey ? NODE_BY_KEY.get(nodeKey) ?? null : null;
}

export function getUnlockingNodeSnapshotForContent(
  progression: ProgressionSnapshot,
  kind: ProgressionUnlockKind,
  key: string,
) {
  const nodeKey = CONTENT_TO_NODE.get(makeUnlockKey(kind, key));
  if (!nodeKey) {
    return null;
  }

  return progression.nodes.find((node) => node.key === nodeKey) ?? null;
}
