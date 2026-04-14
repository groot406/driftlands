import type { TerrainKey } from '../../core/terrainDefs.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { StoryHeroId } from './heroRoster.ts';
import { getStoryHeroTemplate } from './heroRoster.ts';

export type StoryBuildingKey =
  | 'campfire'
  | 'well'
  | 'watchtower'
  | 'townCenter'
  | 'supplyDepot'
  | 'dock'
  | 'lumberCamp'
  | 'granary'
  | 'bakery'
  | 'mine'
  | 'house';

type StoryTaskKey = TaskType;
type StoryTerrainKey = TerrainKey;

export interface StoryProgressionGroup<T extends string> {
  available: T[];
  newlyUnlocked: T[];
}

export interface StoryProgressionSnapshot {
  missionNumber: number;
  heroes: StoryProgressionGroup<StoryHeroId>;
  buildings: StoryProgressionGroup<StoryBuildingKey>;
  tasks: StoryProgressionGroup<StoryTaskKey>;
  terrains: StoryProgressionGroup<StoryTerrainKey>;
}

export interface StoryUnlockDescriptor {
  kind: 'hero' | 'building' | 'task' | 'terrain';
  key: string;
  label: string;
  description: string;
}

interface StoryBuildingMeta {
  label: string;
  description: string;
  taskKey: TaskType;
}

interface StoryTaskMeta {
  label: string;
  description: string;
}

interface StoryTerrainMeta {
  label: string;
  description: string;
}

interface StoryMissionUnlockStep {
  missionNumber: number;
  heroes?: StoryHeroId[];
  buildings?: StoryBuildingKey[];
  tasks?: StoryTaskKey[];
  terrains?: StoryTerrainKey[];
}

const STORY_BUILDINGS: Record<StoryBuildingKey, StoryBuildingMeta> = {
  campfire: {
    label: 'Campfire',
    description: 'Lights a temporary frontier hearth that keeps a nearby pocket of controlled land online.',
    taskKey: 'buildCampfire',
  },
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
  dock: {
    label: 'Dock',
    description: 'Opens the shoreline to fishing and steadier landings from active shore.',
    taskKey: 'buildDock',
  },
  lumberCamp: {
    label: 'Lumber Camp',
    description: 'Turns a forest tile into a permanent timber site.',
    taskKey: 'buildLumberCamp',
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
  mine: {
    label: 'Mine',
    description: 'Establishes a lasting ore extraction point in the ridges.',
    taskKey: 'buildMine',
  },
  house: {
    label: 'House',
    description: 'Shelters settlers and raises the colony population cap.',
    taskKey: 'buildHouse',
  },
};

const STORY_TASKS: Record<string, StoryTaskMeta> = {
  explore: {
    label: 'Explore',
    description: 'Scout the unknown and push the frontier outward.',
  },
  chopWood: {
    label: 'Chop Wood',
    description: 'Clear forest tiles into raw building stock.',
  },
  clearRocks: {
    label: 'Clear Rocks',
    description: 'Open rocky dirt into usable work plots.',
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
  buildBridge: {
    label: 'Build Bridge',
    description: 'Span straight timber bridges over controlled water from active shore or bridgeheads.',
  },
  dig: {
    label: 'Dig',
    description: 'Turn grass into rough dirt, revealing the ground beneath.',
  },
  convertToGrass: {
    label: 'Convert to grass',
    description: 'Clear rough dirt into grass-ready ground for the next lane crews.',
  },
  hunt: {
    label: 'Hunt',
    description: 'Track forest game for a little emergency food when stores run thin.',
  },
  campfireRations: {
    label: 'Cook Rations',
    description: 'Burn spare timber at a campfire to turn it into a meager emergency meal.',
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
  fishAtDock: {
    label: 'Fish At Dock',
    description: 'Turn shoreline works into steady food hauling.',
  },
  mineOre: {
    label: 'Mine Ore',
    description: 'Extract ore from completed mine heads.',
  },
};

const STORY_TERRAINS: Record<StoryTerrainKey, StoryTerrainMeta> = {
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
};

const STORY_UNLOCK_STEPS: readonly StoryMissionUnlockStep[] = [
  {
    missionNumber: 1,
    heroes: ['h1', 'h2'],
    buildings: ['campfire'],
    tasks: [
      'explore',
      'chopWood',
      'clearRocks',
      'breakDirtRock',
      'buildRoad',
      'dig',
      'convertToGrass',
      'hunt',
      'campfireRations',
    ],
    terrains: ['plains', 'forest', 'dirt', 'water'],
  },
  {
    missionNumber: 2,
    buildings: ['dock', 'house'],
    tasks: [
      'fishAtDock',
      'harvestWaterLilies',
      'placeWaterLilies',
      'buildBridge',
      'plantTrees',
      'removeTrunks',
    ],
  },
  {
    missionNumber: 3,
    tasks: [
      'tillLand',
      'seedGrain',
      'harvestGrain',
    ],
    terrains: ['grain'],
  },
  {
    missionNumber: 4,
    heroes: ['h3'],
    buildings: ['well'],
    tasks: [
      'irregateDirtTask',
    ],
  },
  {
    missionNumber: 5,
    buildings: ['watchtower', 'granary', 'bakery'],
  },
  {
    missionNumber: 6,
    buildings: ['mine'],
    terrains: ['mountain'],
  },
  {
    missionNumber: 7,
    heroes: ['h4'],
    buildings: ['supplyDepot', 'lumberCamp'],
  },
  {
    missionNumber: 8,
    terrains: ['snow', 'dessert'],
  },
  {
    missionNumber: 9,
    buildings: ['townCenter'],
  },
  {
    missionNumber: 10,
    terrains: ['vulcano'],
  },
] as const;

function unique<T extends string>(values: T[]) {
  return Array.from(new Set(values));
}

function cloneGroup<T extends string>(group: StoryProgressionGroup<T>): StoryProgressionGroup<T> {
  return {
    available: group.available.slice(),
    newlyUnlocked: group.newlyUnlocked.slice(),
  };
}

export function cloneStoryProgression(progression: StoryProgressionSnapshot): StoryProgressionSnapshot {
  return {
    missionNumber: progression.missionNumber,
    heroes: cloneGroup(progression.heroes),
    buildings: cloneGroup(progression.buildings),
    tasks: cloneGroup(progression.tasks),
    terrains: cloneGroup(progression.terrains),
  };
}

export function createStoryProgression(missionNumber: number): StoryProgressionSnapshot {
  const clampedMission = Math.max(1, missionNumber);
  const heroes: StoryHeroId[] = [];
  const buildings: StoryBuildingKey[] = [];
  const tasks: StoryTaskKey[] = [];
  const terrains: StoryTerrainKey[] = [];
  const newUnlocks = STORY_UNLOCK_STEPS.find((step) => step.missionNumber === clampedMission);

  for (const step of STORY_UNLOCK_STEPS) {
    if (step.missionNumber > clampedMission) {
      break;
    }

    if (step.heroes) {
      heroes.push(...step.heroes);
    }
    if (step.buildings) {
      buildings.push(...step.buildings);
    }
    if (step.tasks) {
      tasks.push(...step.tasks);
    }
    if (step.terrains) {
      terrains.push(...step.terrains);
    }
  }

  return {
    missionNumber: clampedMission,
    heroes: {
      available: unique(heroes),
      newlyUnlocked: clampedMission === 1 ? [] : unique(newUnlocks?.heroes?.slice() ?? []),
    },
    buildings: {
      available: unique(buildings),
      newlyUnlocked: clampedMission === 1 ? [] : unique(newUnlocks?.buildings?.slice() ?? []),
    },
    tasks: {
      available: unique(tasks),
      newlyUnlocked: clampedMission === 1 ? [] : unique(newUnlocks?.tasks?.slice() ?? []),
    },
    terrains: {
      available: unique(terrains),
      newlyUnlocked: clampedMission === 1 ? [] : unique(newUnlocks?.terrains?.slice() ?? []),
    },
  };
}

export function getInitialStoryHeroIds() {
  return createStoryProgression(1).heroes.available;
}

export function getStoryBuildingTaskKey(buildingKey: StoryBuildingKey) {
  return STORY_BUILDINGS[buildingKey].taskKey;
}

export function getAvailableStoryTaskKeys(progression: StoryProgressionSnapshot) {
  return unique([
    ...progression.tasks.available,
    ...progression.buildings.available.map((buildingKey) => getStoryBuildingTaskKey(buildingKey)),
  ]);
}

export function isStoryTaskUnlocked(progression: StoryProgressionSnapshot, taskKey: TaskType) {
  return getAvailableStoryTaskKeys(progression).includes(taskKey);
}

export function isStoryTerrainUnlocked(progression: StoryProgressionSnapshot, terrainKey: TerrainKey) {
  return terrainKey === 'towncenter' || progression.terrains.available.includes(terrainKey);
}

export function isStoryBuildingUnlocked(progression: StoryProgressionSnapshot, buildingKey: StoryBuildingKey) {
  return progression.buildings.available.includes(buildingKey);
}

export function countNewStoryUnlocks(progression: StoryProgressionSnapshot) {
  return (
    progression.heroes.newlyUnlocked.length
    + progression.buildings.newlyUnlocked.length
    + progression.tasks.newlyUnlocked.length
    + progression.terrains.newlyUnlocked.length
  );
}

export function getStoryHeroDescriptor(heroId: StoryHeroId): StoryUnlockDescriptor | null {
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

export function getStoryBuildingDescriptor(buildingKey: StoryBuildingKey): StoryUnlockDescriptor {
  const building = STORY_BUILDINGS[buildingKey];
  return {
    kind: 'building',
    key: buildingKey,
    label: building.label,
    description: building.description,
  };
}

export function getStoryTaskDescriptor(taskKey: StoryTaskKey): StoryUnlockDescriptor | null {
  const task = STORY_TASKS[taskKey];
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

export function getStoryTerrainDescriptor(terrainKey: StoryTerrainKey): StoryUnlockDescriptor {
  const terrain = STORY_TERRAINS[terrainKey];
  return {
    kind: 'terrain',
    key: terrainKey,
    label: terrain.label,
    description: terrain.description,
  };
}

export function getNewlyUnlockedStoryDescriptors(progression: StoryProgressionSnapshot): StoryUnlockDescriptor[] {
  const descriptors: StoryUnlockDescriptor[] = [];

  for (const heroId of progression.heroes.newlyUnlocked) {
    const descriptor = getStoryHeroDescriptor(heroId);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }

  for (const buildingKey of progression.buildings.newlyUnlocked) {
    descriptors.push(getStoryBuildingDescriptor(buildingKey));
  }

  for (const taskKey of progression.tasks.newlyUnlocked) {
    const descriptor = getStoryTaskDescriptor(taskKey);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }

  for (const terrainKey of progression.terrains.newlyUnlocked) {
    descriptors.push(getStoryTerrainDescriptor(terrainKey));
  }

  return descriptors;
}

export function getStoryProgressionCategoryDescriptors(progression: StoryProgressionSnapshot) {
  return {
    heroes: progression.heroes.available
      .map((heroId) => getStoryHeroDescriptor(heroId))
      .filter((descriptor): descriptor is StoryUnlockDescriptor => !!descriptor),
    buildings: progression.buildings.available.map((buildingKey) => getStoryBuildingDescriptor(buildingKey)),
    tasks: progression.tasks.available
      .map((taskKey) => getStoryTaskDescriptor(taskKey))
      .filter((descriptor): descriptor is StoryUnlockDescriptor => !!descriptor),
    terrains: progression.terrains.available.map((terrainKey) => getStoryTerrainDescriptor(terrainKey)),
  };
}
