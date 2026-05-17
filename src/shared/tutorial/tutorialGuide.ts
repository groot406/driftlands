import type { ResourceType } from '../../core/types/Resource.ts';

export type TutorialStepId =
  | 'select-hero'
  | 'scout-frontier'
  | 'gather-wood'
  | 'lay-road'
  | 'raise-house'
  | 'build-dock'
  | 'grow-population'
  | 'start-farming'
  | 'secure-perimeter'
  | 'stabilize-colony'
  | 'build-storage'
  | 'irrigate-fields'
  | 'run-job-sites'
  | 'mine-ridges'
  | 'stage-logistics'
  | 'study-and-upgrade'
  | 'found-second-hearth'
  | 'work-harsh-frontier';

export interface TutorialMetrics {
  selectedHeroCount: number;
  discoveredTiles: number;
  terrainCounts: Partial<Record<string, number>>;
  variantCounts: Partial<Record<string, number>>;
  buildingCounts: Partial<Record<string, number>>;
  resourceStock: Partial<Record<ResourceType, number>>;
  population: {
    current: number;
    beds: number;
    max: number;
    hungerMs: number;
    inactiveTileCount: number;
  };
}

export interface TutorialStepSnapshot {
  id: TutorialStepId;
  index: number;
  title: string;
  objective: string;
  why: string;
  action: string;
  progress: number;
  target: number;
  progressLabel: string;
  completed: boolean;
  status: 'completed' | 'current' | 'upcoming';
}

export interface TutorialSnapshot {
  steps: TutorialStepSnapshot[];
  currentStep: TutorialStepSnapshot | null;
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
}

interface TutorialStepDefinition {
  id: TutorialStepId;
  title: string;
  objective: string;
  why: string;
  action: string;
  target: number;
  progress(metrics: TutorialMetrics): number;
  complete?(metrics: TutorialMetrics): boolean;
  label?(metrics: TutorialMetrics, progress: number): string;
}

function count(values: Partial<Record<string, number>>, key: string) {
  return Math.max(0, Math.floor(values[key] ?? 0));
}

function resource(metrics: TutorialMetrics, type: ResourceType) {
  return Math.max(0, Math.floor(metrics.resourceStock[type] ?? 0));
}

function building(metrics: TutorialMetrics, key: string) {
  return count(metrics.buildingCounts, key);
}

function variant(metrics: TutorialMetrics, key: string) {
  return count(metrics.variantCounts, key);
}

function terrain(metrics: TutorialMetrics, key: string) {
  return count(metrics.terrainCounts, key);
}

function anyBuilding(metrics: TutorialMetrics, keys: string[]) {
  return keys.reduce((total, key) => total + building(metrics, key), 0);
}

function formatCount(progress: number, target: number, noun: string) {
  const capped = Math.min(target, Math.max(0, Math.floor(progress)));
  return `${capped}/${target} ${noun}`;
}

const FARM_VARIANTS = [
  'dirt_tilled',
  'dirt_tilled_draught',
  'dirt_tilled_hydrated',
];

const ROAD_VARIANTS = [
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
];

const STORAGE_BUILDINGS = [
  'granary',
  'supplyDepot',
  'foodStorehouse',
  'materialsYard',
  'cropSilo',
  'craftedGoodsStorehouse',
];

const PRODUCTION_BUILDINGS = [
  'dock',
  'granary',
  'bakery',
  'huntersHut',
  'apiary',
  'lumberCamp',
  'mine',
  'quarry',
  'oven',
  'workshop',
];

const tutorialSteps: TutorialStepDefinition[] = [
  {
    id: 'select-hero',
    title: 'Pick a hero',
    objective: 'Select one available hero so orders have someone to carry them out.',
    why: 'Heroes shape the map directly; settlers take over once buildings and job sites exist.',
    action: 'Choose a hero from the hero bar.',
    target: 1,
    progress: (metrics) => metrics.selectedHeroCount,
    label: (metrics) => metrics.selectedHeroCount > 0 ? 'Hero ready' : 'No hero selected',
  },
  {
    id: 'scout-frontier',
    title: 'Scout the frontier',
    objective: 'Reveal a few more tiles around the town center.',
    why: 'The early world is procedural, so the next resource appears through scouting rather than a fixed map location.',
    action: 'Click dark edge tiles and send a hero to explore outward.',
    target: 10,
    progress: (metrics) => metrics.discoveredTiles,
    label: (_metrics, progress) => formatCount(progress, 10, 'tiles found'),
  },
  {
    id: 'gather-wood',
    title: 'Gather first wood',
    objective: 'Bring in enough wood to start building.',
    why: 'Wood is the first bottleneck for roads, houses, docks, and repairs.',
    action: 'Find forest, choose Chop Wood, then let the hero deliver it home.',
    target: 2,
    progress: (metrics) => Math.max(resource(metrics, 'wood'), variant(metrics, 'chopped_forest') * 2),
    label: (metrics, progress) => {
      const stock = resource(metrics, 'wood');
      return stock > 0 ? `${stock} wood stored` : formatCount(progress, 2, 'wood progress');
    },
  },
  {
    id: 'lay-road',
    title: 'Lay a road',
    objective: 'Build one road from the town center or from an existing road.',
    why: 'Roads teach connected construction and make later hauling less painful.',
    action: 'Select an open plains tile beside town, then choose Build Road.',
    target: 1,
    progress: (metrics) => ROAD_VARIANTS.reduce((total, key) => total + variant(metrics, key), 0),
    label: (_metrics, progress) => formatCount(progress, 1, 'road built'),
  },
  {
    id: 'raise-house',
    title: 'Raise shelter',
    objective: 'Build one house to create beds for new settlers.',
    why: 'Population cannot grow without beds, and population is what powers job sites and support.',
    action: 'Choose a reachable open tile and build a house without blocking paths around town.',
    target: 1,
    progress: (metrics) => Math.max(building(metrics, 'house'), metrics.population.beds >= 2 ? 1 : 0),
    label: (metrics, progress) => metrics.population.beds > 0
      ? `${metrics.population.beds} beds available`
      : formatCount(progress, 1, 'house built'),
  },
  {
    id: 'build-dock',
    title: 'Open the shoreline',
    objective: 'Build a dock on water from adjacent active shore.',
    why: 'A dock gives settlers a steady food job and makes the waterline feel usable instead of mysterious.',
    action: 'Scout until water appears, then build a dock from a neighboring land tile.',
    target: 1,
    progress: (metrics) => building(metrics, 'dock'),
    complete: (metrics) => building(metrics, 'dock') >= 1,
    label: (metrics, progress) => {
      if (progress >= 1) return 'Dock built';
      const waterTiles = terrain(metrics, 'water');
      return waterTiles > 0 ? `${waterTiles} water tiles found` : 'No shoreline found yet';
    },
  },
  {
    id: 'grow-population',
    title: 'Grow the colony',
    objective: 'Reach two settlers with beds and food available.',
    why: 'Settlers work job sites automatically, but only if the settlement can feed and house them.',
    action: 'Keep food stocked and beds open until a new settler joins.',
    target: 2,
    progress: (metrics) => metrics.population.current,
    label: (metrics) => `${metrics.population.current}/${Math.max(2, metrics.population.beds)} settlers housed`,
  },
  {
    id: 'start-farming',
    title: 'Start farming',
    objective: 'Prepare land or plant the first grain field.',
    why: 'Farming is the bridge from emergency food to a reliable grain economy.',
    action: 'Dig grass into dirt, prepare the land, then seed it once the plot is ready.',
    target: 1,
    progress: (metrics) => Math.max(
      FARM_VARIANTS.reduce((total, key) => total + variant(metrics, key), 0),
      terrain(metrics, 'grain'),
      resource(metrics, 'grain') > 0 ? 1 : 0,
    ),
    label: (metrics, progress) => {
      const grainFields = terrain(metrics, 'grain');
      if (grainFields > 0) return `${grainFields} grain field${grainFields === 1 ? '' : 's'}`;
      return formatCount(progress, 1, 'farm plot started');
    },
  },
  {
    id: 'secure-perimeter',
    title: 'Secure the perimeter',
    objective: 'Build one watchtower near the edge of your settlement.',
    why: 'Perimeter security means extending reach with a watchtower so the frontier stays usable.',
    action: 'Place a watchtower on reachable plains, dirt, mountain, snow, or desert near the outer edge.',
    target: 1,
    progress: (metrics) => building(metrics, 'watchtower'),
    label: (_metrics, progress) => formatCount(progress, 1, 'watchtower built'),
  },
  {
    id: 'stabilize-colony',
    title: 'Stabilize the loop',
    objective: 'Reach four settlers while keeping the frontier online.',
    why: 'A stable workforce leaves room for job sites, repairs, and the next production chain.',
    action: 'Balance food, beds, and active support before pushing farther out.',
    target: 4,
    progress: (metrics) => metrics.population.current,
    complete: (metrics) => metrics.population.current >= 4 && metrics.population.inactiveTileCount === 0,
    label: (metrics) => {
      if (metrics.population.inactiveTileCount > 0) {
        return `${metrics.population.inactiveTileCount} inactive tile${metrics.population.inactiveTileCount === 1 ? '' : 's'}`;
      }

      return `${Math.min(4, metrics.population.current)}/4 settlers`;
    },
  },
  {
    id: 'build-storage',
    title: 'Build storage',
    objective: 'Add a granary, depot, or specialized storehouse before stockpiles start crowding the town center.',
    why: 'Storage is the logistics layer: it keeps harvests usable, construction supplied, and job sites from stalling when outputs have nowhere to go.',
    action: 'Build a granary for crops or a supply depot for frontier materials.',
    target: 1,
    progress: (metrics) => anyBuilding(metrics, STORAGE_BUILDINGS),
    label: (_metrics, progress) => formatCount(progress, 1, 'storage site'),
  },
  {
    id: 'irrigate-fields',
    title: 'Move water inland',
    objective: 'Build a well or hydrate a prepared farm plot.',
    why: 'Irrigation turns farming from emergency planting into a repeatable food chain.',
    action: 'Build a well near dry plots, then use Irrigate when a plot needs water.',
    target: 1,
    progress: (metrics) => Math.max(
      building(metrics, 'well'),
      variant(metrics, 'dirt_tilled_hydrated'),
      resource(metrics, 'water') > 0 ? 1 : 0,
    ),
    label: (metrics, progress) => building(metrics, 'well') > 0 ? 'Well built' : formatCount(progress, 1, 'water source'),
  },
  {
    id: 'run-job-sites',
    title: 'Use job sites',
    objective: 'Build production sites that settlers can staff automatically.',
    why: 'Heroes start the colony, but staffed buildings turn repeated work into a settlement economy.',
    action: 'Build a dock, granary, bakery, lumber camp, mine, quarry, oven, or workshop when the terrain supports it.',
    target: 2,
    progress: (metrics) => anyBuilding(metrics, PRODUCTION_BUILDINGS),
    label: (_metrics, progress) => formatCount(progress, 2, 'production sites'),
  },
  {
    id: 'mine-ridges',
    title: 'Mine the ridges',
    objective: 'Discover mountain ground and start stone or ore production.',
    why: 'Stone, ore, and tools introduce the industrial layer that supports upgrades and expansion.',
    action: 'Scout toward mountain tiles, then build a quarry or mine from active access.',
    target: 1,
    progress: (metrics) => Math.max(
      building(metrics, 'mine'),
      building(metrics, 'quarry'),
      resource(metrics, 'ore') > 0 ? 1 : 0,
      resource(metrics, 'stone') >= 4 ? 1 : 0,
    ),
    label: (metrics, progress) => {
      if (building(metrics, 'mine') > 0) return 'Mine built';
      if (building(metrics, 'quarry') > 0) return 'Quarry built';
      return formatCount(progress, 1, 'ridge industry');
    },
  },
  {
    id: 'stage-logistics',
    title: 'Stage logistics',
    objective: 'Use depots and roads to keep the outer frontier connected.',
    why: 'A larger map needs staging points so materials, food, and construction do not all bottleneck at the first town center.',
    action: 'Build a supply depot near the work front and extend roads between busy sites.',
    target: 1,
    progress: (metrics) => Math.max(
      building(metrics, 'supplyDepot'),
      ROAD_VARIANTS.reduce((total, key) => total + variant(metrics, key), 0) >= 4 ? 1 : 0,
    ),
    label: (metrics, progress) => building(metrics, 'supplyDepot') > 0 ? 'Depot staged' : formatCount(progress, 1, 'logistics hub'),
  },
  {
    id: 'study-and-upgrade',
    title: 'Study and upgrade',
    objective: 'Build a library or workshop so the colony can turn knowledge and ore into stronger infrastructure.',
    why: 'Studies and upgrades are late-loop improvements; they deepen existing buildings instead of adding another basic task.',
    action: 'Build a library for studies, or build a workshop once ore is flowing.',
    target: 1,
    progress: (metrics) => Math.max(
      building(metrics, 'library'),
      building(metrics, 'workshop'),
      resource(metrics, 'tools') > 0 ? 1 : 0,
    ),
    label: (metrics, progress) => {
      if (building(metrics, 'library') > 0) return 'Library built';
      if (building(metrics, 'workshop') > 0) return 'Workshop built';
      return formatCount(progress, 1, 'advanced work');
    },
  },
  {
    id: 'found-second-hearth',
    title: 'Found a second hearth',
    objective: 'Build another town center when the first settlement has tools and supply lines.',
    why: 'A second town center is how the colony grows past a single support radius without stranding the frontier.',
    action: 'Choose a deep reachable site, build a town center, then connect it back with roads and depots.',
    target: 2,
    progress: (metrics) => Math.max(1, building(metrics, 'townCenter')),
    label: (metrics) => `${Math.min(2, Math.max(1, building(metrics, 'townCenter')))}/2 town centers`,
  },
  {
    id: 'work-harsh-frontier',
    title: 'Work harsh terrain',
    objective: 'Reach snow, desert, or volcanic ground and apply the full support chain there.',
    why: 'Late terrain tests everything together: scouting, support, roads, storage, food, industry, and recovery.',
    action: 'Push outward only when food, support, and logistics are stable enough to keep the new ring active.',
    target: 1,
    progress: (metrics) => (
      terrain(metrics, 'snow')
      + terrain(metrics, 'dessert')
      + terrain(metrics, 'vulcano')
    ),
    label: (metrics, progress) => {
      if (terrain(metrics, 'vulcano') > 0) return 'Volcanic ridge found';
      if (terrain(metrics, 'snow') > 0 || terrain(metrics, 'dessert') > 0) return 'Harsh frontier found';
      return formatCount(progress, 1, 'harsh terrain');
    },
  },
];

export function getTutorialStepDefinitions() {
  return tutorialSteps.slice();
}

export function evaluateTutorial(metrics: TutorialMetrics): TutorialSnapshot {
  const completed = tutorialSteps.map((step) => {
    const progress = Math.max(0, step.progress(metrics));
    return step.complete ? step.complete(metrics) : progress >= step.target;
  });
  const currentIndex = completed.findIndex((done) => !done);

  const steps = tutorialSteps.map<TutorialStepSnapshot>((step, index) => {
    const progress = Math.max(0, step.progress(metrics));
    const isComplete = completed[index] ?? false;
    const status = isComplete
      ? 'completed'
      : index === currentIndex || currentIndex === -1
        ? 'current'
        : 'upcoming';

    return {
      id: step.id,
      index,
      title: step.title,
      objective: step.objective,
      why: step.why,
      action: step.action,
      progress,
      target: step.target,
      progressLabel: step.label?.(metrics, progress) ?? formatCount(progress, step.target, 'done'),
      completed: isComplete,
      status,
    };
  });

  const completedCount = completed.filter(Boolean).length;

  return {
    steps,
    currentStep: currentIndex >= 0 ? steps[currentIndex] ?? null : null,
    completedCount,
    totalCount: steps.length,
    allCompleted: completedCount === steps.length,
  };
}
