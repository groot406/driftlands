import type { ResourceType } from '../../core/types/Resource.ts';
import {
  classifyLandingArchetype,
  type LandingArchetype,
} from '../story/landingProfile.ts';

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

export type FieldGuideTopicCategory =
  | 'Basics'
  | 'Settlement'
  | 'Food'
  | 'Logistics'
  | 'Frontier'
  | 'Industry'
  | 'Progression';

export interface TutorialMetrics {
  selectedHeroCount: number;
  discoveredTiles: number;
  landingArchetype?: LandingArchetype;
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

export interface FieldGuideTopicDefinition {
  id: string;
  category: FieldGuideTopicCategory;
  title: string;
  summary: string;
  cues: string[];
  relatedStepIds?: TutorialStepId[];
}

interface TutorialStepDefinition {
  id: TutorialStepId;
  title: string | ((metrics: TutorialMetrics) => string);
  objective: string | ((metrics: TutorialMetrics) => string);
  why: string | ((metrics: TutorialMetrics) => string);
  action: string | ((metrics: TutorialMetrics) => string);
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

function landingArchetype(metrics: TutorialMetrics): LandingArchetype {
  return metrics.landingArchetype ?? classifyLandingArchetype(metrics.terrainCounts);
}

function resolveCopy(value: string | ((metrics: TutorialMetrics) => string), metrics: TutorialMetrics) {
  return typeof value === 'function' ? value(metrics) : value;
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

const fieldGuideTopics: FieldGuideTopicDefinition[] = [
  {
    id: 'heroes-and-orders',
    category: 'Basics',
    title: 'Heroes and orders',
    summary: 'Heroes do the direct tile work: scouting, chopping, digging, hunting, building, mining, and emergency fixes.',
    cues: [
      'Select a hero before choosing a tile order.',
      'Put multiple heroes on the same urgent task when speed matters.',
      'Settlers take over repeated work once a job site exists.',
    ],
    relatedStepIds: ['select-hero', 'gather-wood'],
  },
  {
    id: 'exploration',
    category: 'Frontier',
    title: 'Exploration',
    summary: 'The world is procedural, so scouting is how the colony finds forests, shorelines, fields, ridges, and harsh late terrain.',
    cues: [
      'Click dark edge tiles to reveal the next ring.',
      'If the terrain you need is missing, scout around similar ground and keep another progression lane moving.',
      'Watchtowers and later town centers make distant discoveries easier to hold.',
    ],
    relatedStepIds: ['scout-frontier', 'secure-perimeter', 'work-harsh-frontier'],
  },
  {
    id: 'resources-and-storage',
    category: 'Settlement',
    title: 'Resources and storage',
    summary: 'Wood, food, crops, stone, ore, tools, and special goods all flow through colony storage before buildings or settlers can use them.',
    cues: [
      'Construction waits when storage is missing a required resource.',
      'Dedicated storehouses and depots keep bigger settlements from bottlenecking at the town center.',
      'Open resource details to see production, demand, downtime, and repair pressure.',
    ],
    relatedStepIds: ['gather-wood', 'build-storage', 'stage-logistics'],
  },
  {
    id: 'housing-and-population',
    category: 'Settlement',
    title: 'Housing and population',
    summary: 'Population grows when there are beds and food. More settlers unlock support, job sites, and deeper progression.',
    cues: [
      'Build houses before you expect new settlers.',
      'Keep food stocked or population pressure will rise.',
      'Population support determines how much frontier can stay active.',
    ],
    relatedStepIds: ['raise-house', 'grow-population', 'stabilize-colony'],
  },
  {
    id: 'active-support',
    category: 'Settlement',
    title: 'Active support',
    summary: 'Discovered tiles need enough population support to stay usable. Overexpansion can leave outer work sites inactive.',
    cues: [
      'If tiles go inactive, grow population or restore from adjacent active ground.',
      'Do not scout much farther than your support can hold.',
      'Town centers, watchtowers, and logistics help stabilize wider borders.',
    ],
    relatedStepIds: ['stabilize-colony', 'stage-logistics'],
  },
  {
    id: 'roads-and-reach',
    category: 'Logistics',
    title: 'Roads and reach',
    summary: 'Roads make repeated travel less painful, while reach determines where the colony can build and restore safely.',
    cues: [
      'Start roads from the town center or another connected road.',
      'Use roads between houses, storage, and busy job sites.',
      'Use watchtowers when terrain exists but sits just beyond reliable reach.',
    ],
    relatedStepIds: ['lay-road', 'secure-perimeter', 'stage-logistics'],
  },
  {
    id: 'building-placement',
    category: 'Settlement',
    title: 'Building placement',
    summary: 'Buildings block movement and many production sites care about nearby terrain, so placement is part of the puzzle.',
    cues: [
      'Leave paths around the town center.',
      'Place job sites near houses and storage when possible.',
      'Build terrain-specific sites on the terrain they ask for: docks on water, mines on ridges, granaries on grain.',
    ],
    relatedStepIds: ['raise-house', 'build-dock', 'mine-ridges'],
  },
  {
    id: 'early-food-routes',
    category: 'Food',
    title: 'Early food routes',
    summary: 'The first stable food source adapts to the landing: docks for shorelines, hunting for woodland, and planted groves for open fields.',
    cues: [
      'Use docks when reachable water appears.',
      'Use hunting and hunter huts when forest is easier than shoreline.',
      'On open starts, plant trees first so a local food route can exist.',
    ],
    relatedStepIds: ['build-dock', 'grow-population'],
  },
  {
    id: 'farming-and-irrigation',
    category: 'Food',
    title: 'Farming and irrigation',
    summary: 'Farming moves the colony from emergency food into repeatable crop chains: dig, prepare, seed, grow, harvest.',
    cues: [
      'Water-adjacent plots are easiest early.',
      'Wells and irrigation make inland farming reliable.',
      'Grain leads to granaries, bakeries, bread, and later brewing.',
    ],
    relatedStepIds: ['start-farming', 'irrigate-fields', 'build-storage'],
  },
  {
    id: 'job-sites',
    category: 'Food',
    title: 'Job sites and settlers',
    summary: 'Job sites are staffed buildings that turn repeated hero work into automatic colony production.',
    cues: [
      'Assign enough workers to production buildings.',
      'Low happiness, long travel, missing input, or full output storage can create downtime.',
      'Use resource details to spot why a site is not producing.',
    ],
    relatedStepIds: ['run-job-sites', 'stage-logistics'],
  },
  {
    id: 'logistics',
    category: 'Logistics',
    title: 'Depots and hauling',
    summary: 'Depots and storehouses stage materials near the work front so distant construction does not depend on a long walk home.',
    cues: [
      'Build depots before a far work front gets busy.',
      'Pair depots with roads when possible.',
      'Specialized storage keeps crops, food, materials, and crafted goods easier to manage.',
    ],
    relatedStepIds: ['build-storage', 'stage-logistics'],
  },
  {
    id: 'repairs-and-maintenance',
    category: 'Settlement',
    title: 'Repairs and maintenance',
    summary: 'Buildings wear down, pause, or lose efficiency when the colony cannot keep repair stock and workers moving.',
    cues: [
      'Keep wood and stone in storage before the settlement grows wide.',
      'Offline or paused job sites usually need repairs, workers, input resources, or storage room.',
      'Use nearby roads and depots so repair pressure does not strand distant buildings.',
    ],
    relatedStepIds: ['build-storage', 'stage-logistics'],
  },
  {
    id: 'mining-and-tools',
    category: 'Industry',
    title: 'Mining and tools',
    summary: 'Ridges unlock stone, ore, quarries, mines, workshops, tools, and the first serious expansion projects.',
    cues: [
      'If mountains are hard to find, keep scouting while strengthening food, roads, and storage.',
      'Quarries help with stone; mines feed ore and toolmaking.',
      'Tools are the bridge to advanced construction and new town centers.',
    ],
    relatedStepIds: ['mine-ridges', 'study-and-upgrade', 'found-second-hearth'],
  },
  {
    id: 'harbor-orders',
    category: 'Logistics',
    title: 'Harbors and ship orders',
    summary: 'Harbors turn surplus resources into timed cargo orders, trade goods, and Gold for the wider economy.',
    cues: [
      'Build a harbor beside a large water body once logistics and tools can support it.',
      'Load only what the colony can spare before the ship leaves.',
      'Partial orders still pay, while complete orders pay better and bring more trade goods.',
    ],
    relatedStepIds: ['stage-logistics'],
  },
  {
    id: 'market-and-trade',
    category: 'Logistics',
    title: 'Market and trade',
    summary: 'Trade Centers open resource exchange so a strong surplus can cover a weak local terrain route.',
    cues: [
      'Sell surplus goods to earn Gold before buying scarce ore, stone, food, or specialty goods.',
      'Market stock and prices change, so buying everything is expensive and unreliable.',
      'Use trade as a backup lane, not a replacement for a working local economy.',
    ],
    relatedStepIds: ['stage-logistics', 'study-and-upgrade'],
  },
  {
    id: 'studies-and-upgrades',
    category: 'Progression',
    title: 'Studies and upgrades',
    summary: 'Libraries, workshops, studies, and upgrades deepen the buildings you already have instead of only adding new ones.',
    cues: [
      'Use studies to unlock colony knowledge.',
      'Use stone, glass, tools, and industry outputs to improve infrastructure.',
      'Upgrades usually appear on eligible existing buildings.',
    ],
    relatedStepIds: ['study-and-upgrade'],
  },
  {
    id: 'calamities',
    category: 'Frontier',
    title: 'Calamities',
    summary: 'Fires, spoilage, sickness, and harsh events test whether the settlement has reserves instead of only perfect plans.',
    cues: [
      'Warnings are a signal to stock food, repair materials, and active support.',
      'Do not let one specialized food chain become the whole colony diet.',
      'Recovery is faster when roads, storage, and job sites are already close to the trouble spot.',
    ],
    relatedStepIds: ['stabilize-colony', 'work-harsh-frontier'],
  },
  {
    id: 'story-and-roadmap',
    category: 'Progression',
    title: 'Story and roadmap',
    summary: 'Story chapters explain the colony stakes, while the roadmap shows the exact milestone blocking the next unlock.',
    cues: [
      'Read the Chronicle when you want the current chapter goal in plain language.',
      'Use the roadmap for exact requirements and unlock previews.',
      'The guide gives immediate next actions; the roadmap gives the wider plan.',
    ],
  },
  {
    id: 'harsh-frontier',
    category: 'Frontier',
    title: 'Harsh frontier',
    summary: 'Snow, desert, and volcanic ground are late checks on the whole settlement loop: food, reach, roads, logistics, industry, and recovery.',
    cues: [
      'Push harsh terrain after the core economy is stable.',
      'Use depots and roads before sending long projects outward.',
      'If one route is slow, keep working another roadmap lane until the frontier opens.',
    ],
    relatedStepIds: ['work-harsh-frontier'],
  },
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
    title: (metrics) => {
      switch (landingArchetype(metrics)) {
        case 'shoreline':
          return 'Open the shoreline';
        case 'woodland':
          return 'Secure forest food';
        case 'open_field':
        default:
          return 'Grow a food route';
      }
    },
    objective: (metrics) => {
      switch (landingArchetype(metrics)) {
        case 'shoreline':
          return 'Build a dock on water from adjacent active shore.';
        case 'woodland':
          return 'Hunt in nearby forest, then turn a forest tile into a steady food site.';
        case 'open_field':
        default:
          return 'Plant trees on open plains so the settlement can grow its own forest food route.';
      }
    },
    why: (metrics) => {
      switch (landingArchetype(metrics)) {
        case 'shoreline':
          return 'A dock gives settlers a steady food job and makes the waterline feel usable instead of mysterious.';
        case 'woodland':
          return 'Forest starts can feed settlers through hunting and hunter huts without waiting for a shoreline.';
        case 'open_field':
        default:
          return 'Open land can become a resource loop too: planted trees lead to wood, hunting, and later forest job sites.';
      }
    },
    action: (metrics) => {
      switch (landingArchetype(metrics)) {
        case 'shoreline':
          return 'Scout until water appears, then build a dock from a neighboring land tile.';
        case 'woodland':
          return 'Choose Hunt on a forest tile, or build a Hunter Hut once wood and workers are ready.';
        case 'open_field':
        default:
          return 'Choose Plant Trees on a plains tile, then use the new forest for hunting or a Hunter Hut.';
      }
    },
    target: 1,
    progress: (metrics) => {
      switch (landingArchetype(metrics)) {
        case 'shoreline':
          return building(metrics, 'dock');
        case 'woodland':
          return Math.max(building(metrics, 'huntersHut'), resource(metrics, 'meat') >= 5 ? 1 : 0);
        case 'open_field':
        default:
          return Math.max(
            variant(metrics, 'young_forest'),
            building(metrics, 'huntersHut'),
            resource(metrics, 'meat') >= 5 ? 1 : 0,
          );
      }
    },
    complete: (metrics) => {
      switch (landingArchetype(metrics)) {
        case 'shoreline':
          return building(metrics, 'dock') >= 1;
        case 'woodland':
          return building(metrics, 'huntersHut') >= 1 || resource(metrics, 'meat') >= 5;
        case 'open_field':
        default:
          return variant(metrics, 'young_forest') >= 1
            || building(metrics, 'huntersHut') >= 1
            || resource(metrics, 'meat') >= 5;
      }
    },
    label: (metrics, progress) => {
      if (progress >= 1) {
        switch (landingArchetype(metrics)) {
          case 'shoreline':
            return 'Dock built';
          case 'woodland':
            return building(metrics, 'huntersHut') >= 1 ? 'Hunter hut built' : 'Meat stocked';
          case 'open_field':
          default:
            return variant(metrics, 'young_forest') >= 1 ? 'Saplings planted' : 'Forest food started';
        }
      }

      switch (landingArchetype(metrics)) {
        case 'shoreline': {
          const waterTiles = terrain(metrics, 'water');
          return waterTiles > 0 ? `${waterTiles} water tiles found` : 'No shoreline found yet';
        }
        case 'woodland': {
          const forestTiles = terrain(metrics, 'forest');
          return forestTiles > 0 ? `${forestTiles} forest tiles found` : 'No forest found yet';
        }
        case 'open_field':
        default:
          return 'No saplings planted yet';
      }
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

export function getFieldGuideTopicDefinitions() {
  return fieldGuideTopics.map((topic) => ({
    ...topic,
    cues: topic.cues.slice(),
    relatedStepIds: topic.relatedStepIds?.slice(),
  }));
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
      title: resolveCopy(step.title, metrics),
      objective: resolveCopy(step.objective, metrics),
      why: resolveCopy(step.why, metrics),
      action: resolveCopy(step.action, metrics),
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
