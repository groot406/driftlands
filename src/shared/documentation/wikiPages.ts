import type { WikiBlock, WikiCategoryId, WikiPageDefinition } from './wikiTypes.ts';

function page(
  id: string,
  category: WikiCategoryId,
  title: string,
  summary: string,
  keywords: string[],
  blocks: WikiBlock[],
  relatedPageIds: string[] = [],
): WikiPageDefinition {
  return { id, category, title, summary, keywords, blocks, relatedPageIds };
}

export const AUTHORED_WIKI_PAGES: WikiPageDefinition[] = [
  page(
    'getting-started',
    'basics',
    'Getting Started',
    'The first goals are choosing heroes, revealing nearby tiles, collecting wood, and turning the center into a workable camp.',
    ['start', 'beginner', 'first steps', 'camp', 'tutorial'],
    [
      { type: 'paragraph', text: 'Driftlands starts as a small active center surrounded by unknown terrain. Pick heroes, scout outward, gather basic resources, and keep construction close enough that workers can support it.' },
      { type: 'flow', steps: ['Select heroes', 'Explore nearby tiles', 'Gather wood and food', 'Build roads and shelter', 'Open a stable food route', 'Secure the perimeter'] },
      {
        type: 'statGrid',
        stats: [
          { label: 'First bottleneck', value: 'Wood', note: 'Roads, houses, and many early works need it.' },
          { label: 'First risk', value: 'Food', note: 'Population growth only helps when meals can keep up.' },
          { label: 'Best habit', value: 'Build near support', note: 'Active connected tiles are easier to use.' },
        ],
      },
    ],
    ['heroes-and-orders', 'starter-strategies', 'settlement-support'],
  ),
  page(
    'heroes-and-orders',
    'basics',
    'Heroes And Orders',
    'Heroes execute orders, earn progress, and shape the pace of scouting, gathering, building, and repairs.',
    ['heroes', 'orders', 'tasks', 'queue', 'work'],
    [
      { type: 'paragraph', text: 'Most map actions are hero orders. An order checks the target tile, required resources, and hero state before progress starts.' },
      {
        type: 'table',
        columns: ['Order type', 'Use'],
        rows: [
          ['Explore', 'Reveal nearby frontier and find new terrain.'],
          ['Gather', 'Collect wood, stone, food, sand, lilies, and other field resources.'],
          ['Build', 'Turn resources into roads, housing, storage, works, and defenses.'],
          ['Repair', 'Restore damaged buildings before they stop contributing.'],
        ],
      },
      { type: 'callout', title: 'Keep heroes moving', text: 'Idle heroes are usually the largest early inefficiency. Queue nearby work before sending everyone across the map.', tone: 'info' },
    ],
    ['task:explore', 'exploration', 'maintenance-and-repairs'],
  ),
  page(
    'exploration',
    'frontier',
    'Exploration',
    'Exploration reveals the map, discovers terrain routes, and unlocks many later systems through progression requirements.',
    ['explore', 'scouting', 'frontier', 'terrain', 'reveal'],
    [
      { type: 'paragraph', text: 'Exploration is both map control and information. New tiles expose forests, water, crop fields, mountains, snow, desert, and volcanic terrain that change the colony plan.' },
      {
        type: 'barChart',
        title: 'Exploration priorities',
        bars: [
          { label: 'Nearby resources', value: 5, max: 5, note: 'Find wood, food, and stone first.' },
          { label: 'Water access', value: 4, max: 5, note: 'Opens docks, lilies, bridges, and farming support.' },
          { label: 'Distant landmarks', value: 3, max: 5, note: 'Useful after roads and storage exist.' },
        ],
      },
      { type: 'callout', title: 'Scout with a purpose', text: 'Revealing everything evenly is slower than opening a route toward a needed resource or building site.', tone: 'info' },
    ],
    ['terrain:water', 'terrain:mountain', 'harsh-frontier'],
  ),
  page(
    'movement-and-roads',
    'logistics',
    'Movement And Roads',
    'Roads reduce travel time, connect production routes, and make distant work more practical.',
    ['roads', 'movement', 'travel', 'pathing', 'stone road'],
    [
      { type: 'paragraph', text: 'Movement cost is terrain-sensitive. Roads and later stone roads make repeated trips much faster, which matters for builders, gatherers, guards, and repair work.' },
      {
        type: 'table',
        columns: ['Route choice', 'When to use it'],
        rows: [
          ['Short dirt path', 'One-time nearby jobs.'],
          ['Road', 'Repeated travel to food, storage, or frontier work.'],
          ['Stone road', 'Main arteries between settlements, depots, harbors, and industry.'],
          ['Bridge or tunnel', 'When water or mountains block a valuable route.'],
        ],
      },
      { type: 'flow', steps: ['Mark repeated traffic', 'Lay road to the work site', 'Add storage near the route', 'Upgrade the busiest lane later'] },
    ],
    ['storage-and-logistics', 'building:road'],
  ),
  page(
    'settlement-support',
    'settlement',
    'Settlement Support',
    'Active settlement support determines which tiles can reliably host work, buildings, logistics, and growth.',
    ['settlement', 'support', 'active tiles', 'control', 'town center'],
    [
      { type: 'paragraph', text: 'A tile is most useful when it belongs to a supported settlement area. Expanding without support creates long routes and work that is harder to maintain.' },
      {
        type: 'statGrid',
        stats: [
          { label: 'Anchor', value: 'Town Center', note: 'Defines a settlement core.' },
          { label: 'Expansion tools', value: 'Roads, depots, towers', note: 'Keep the frontier usable.' },
          { label: 'Failure mode', value: 'Inactive edge', note: 'Jobs and maintenance become harder to sustain.' },
        ],
      },
      { type: 'callout', title: 'Build compact first', text: 'A compact early settlement is easier to feed, repair, and defend than scattered single-purpose outposts.', tone: 'success' },
    ],
    ['housing-and-population', 'storage-and-logistics'],
  ),
  page(
    'housing-and-population',
    'settlement',
    'Housing And Population',
    'Population grows when the colony has beds and food; housing upgrades raise capacity and comfort later.',
    ['housing', 'population', 'beds', 'settlers', 'house'],
    [
      { type: 'paragraph', text: 'More settlers create more staffing potential, but they also increase food pressure. Build houses ahead of growth and keep meals in reserve.' },
      {
        type: 'table',
        columns: ['Housing stage', 'Role'],
        rows: [
          ['House', 'Early beds and the first growth gate.'],
          ['Stone House', 'Higher capacity after masonry knowledge.'],
          ['Glass House', 'Late housing with more capacity and comfort.'],
        ],
      },
      { type: 'callout', title: 'Growth rule', text: 'Do not chase population before a food route is stable. Extra settlers are only useful when they can be fed.', tone: 'warning' },
    ],
    ['early-food', 'comfort-and-morale', 'building:house'],
  ),
  page(
    'early-food',
    'food',
    'Early Food',
    'Early food can come from fishing, hunting, gathering, or the first farm chain depending on the landing.',
    ['food', 'fish', 'meat', 'hunting', 'dock', 'bread'],
    [
      { type: 'paragraph', text: 'The best first food path depends on terrain. Shoreline starts can fish, woodland starts can hunt, and open starts may need planted trees before a steady route appears.' },
      {
        type: 'table',
        columns: ['Landing', 'Good first route'],
        rows: [
          ['Shoreline', 'Build a dock, fish, and harvest water lilies when useful.'],
          ['Woodland', 'Hunt early, then add a hunter hut.'],
          ['Open field', 'Plant trees, gather food opportunistically, then start farming.'],
        ],
      },
      { type: 'barChart', title: 'Food stability', bars: [{ label: 'Foraging', value: 2, max: 5 }, { label: 'Fishing or hunting', value: 3, max: 5 }, { label: 'Bread chain', value: 5, max: 5 }] },
    ],
    ['farming-and-irrigation', 'housing-and-population'],
  ),
  page(
    'farming-and-irrigation',
    'food',
    'Farming And Irrigation',
    'Farming turns terrain, water, seeds, and workers into reliable crop chains.',
    ['farming', 'irrigation', 'grain', 'crops', 'water', 'well'],
    [
      { type: 'paragraph', text: 'Farming starts with prepared land and seed tasks, then grows into granaries, bakeries, drink production, and crop storage. Wells and irrigation make inland fields more dependable.' },
      { type: 'flow', steps: ['Find or prepare workable land', 'Secure water or a well', 'Till the plot', 'Seed grain or specialty crops', 'Harvest into storage', 'Process into food or morale goods'] },
      {
        type: 'table',
        columns: ['Crop', 'Later use'],
        rows: [
          ['Grain', 'Bread, beer, and food reserves.'],
          ['Hops', 'Beer and morale chains.'],
          ['Grapes', 'Wine and morale chains.'],
          ['Water lilies', 'Water routes and crop inventory.'],
        ],
      },
    ],
    ['early-food', 'storage-and-logistics', 'building:well'],
  ),
  page(
    'storage-and-logistics',
    'logistics',
    'Storage And Logistics',
    'Storage buildings reduce hauling pressure and keep resources available near the work that needs them.',
    ['storage', 'logistics', 'warehouse', 'depot', 'storehouse', 'hauling'],
    [
      { type: 'paragraph', text: 'Storage is how the settlement turns scattered gathering into usable production. Build storage near repeated work and specialize it as the economy grows.' },
      {
        type: 'table',
        columns: ['Storage type', 'Best use'],
        rows: [
          ['Supply Depot', 'Forward building materials and frontier staging.'],
          ['Food Storehouse', 'Fish, meat, bread, drinks, and food buffers.'],
          ['Materials Yard', 'Wood, stone, ore, sand, and glass.'],
          ['Crop Silo', 'Grain, hops, grapes, water, and lilies.'],
          ['Crafted Goods Storehouse', 'Tools and weapons.'],
        ],
      },
      { type: 'callout', title: 'Place storage on routes', text: 'Storage helps most when it sits between production, construction, and population centers.', tone: 'info' },
    ],
    ['movement-and-roads', 'job-sites'],
  ),
  page(
    'job-sites',
    'industry',
    'Job Sites',
    'Job sites convert worker time and input resources into steady output.',
    ['jobs', 'workers', 'production', 'job slots', 'industry'],
    [
      { type: 'paragraph', text: 'A building with job slots only pays off when staffed and supplied. The most valuable site is often the one that removes the current bottleneck, not the newest unlock.' },
      {
        type: 'statGrid',
        stats: [
          { label: 'Inputs', value: 'Consumes', note: 'Some jobs need crop, ore, water, or goods.' },
          { label: 'Outputs', value: 'Produces', note: 'Production cycles add resources over time.' },
          { label: 'Staffing', value: 'Job slots', note: 'More slots can increase throughput.' },
        ],
      },
      { type: 'flow', steps: ['Build the site', 'Stock its inputs', 'Assign workers', 'Watch output', 'Add storage or roads if hauling lags'] },
    ],
    ['storage-and-logistics', 'studies-and-upgrades'],
  ),
  page(
    'maintenance-and-repairs',
    'settlement',
    'Maintenance And Repairs',
    'Buildings decay over time and need repair resources before damage shuts down important systems.',
    ['maintenance', 'repairs', 'decay', 'damage', 'repair building'],
    [
      { type: 'paragraph', text: 'Maintenance turns spare wood, stone, and hero time into uptime. Ignoring repairs can disable the exact building that stabilizes food, storage, or defense.' },
      {
        type: 'table',
        columns: ['Signal', 'Response'],
        rows: [
          ['Worn building', 'Repair during quiet periods.'],
          ['Damaged production', 'Repair before assigning more workers elsewhere.'],
          ['Damaged storage or defense', 'Prioritize because the impact spreads.'],
        ],
      },
      { type: 'callout', title: 'Repair before expanding', text: 'A worn core settlement makes every new outpost more fragile.', tone: 'warning' },
    ],
    ['task:repairBuilding', 'settlement-support'],
  ),
  page(
    'mining-and-tools',
    'industry',
    'Mining And Tools',
    'Mountains, mines, quarries, workshops, and smithing turn frontier access into advanced construction power.',
    ['mining', 'ore', 'stone', 'tools', 'weapons', 'workshop'],
    [
      { type: 'paragraph', text: 'Industry begins when the colony can reach mountains and keep routes supplied. Ore becomes tools and weapons; stone supports stronger roads, walls, and buildings.' },
      { type: 'flow', steps: ['Secure a mountain route', 'Build mine or quarry', 'Store ore and stone', 'Build workshop', 'Craft tools', 'Use tools for upgrades and trade infrastructure'] },
      {
        type: 'table',
        columns: ['Resource', 'Main role'],
        rows: [
          ['Stone', 'Roads, walls, upgrades, and durable construction.'],
          ['Ore', 'Inputs for tools and weapons.'],
          ['Tools', 'Advanced buildings, upgrades, and trade access.'],
          ['Weapons', 'Military readiness and border control.'],
        ],
      },
    ],
    ['harsh-frontier', 'market-and-trade'],
  ),
  page(
    'studies-and-upgrades',
    'progression',
    'Studies And Upgrades',
    'Studies unlock colony knowledge, output buffs, and advanced rebuilding options.',
    ['studies', 'upgrades', 'library', 'progression', 'research'],
    [
      { type: 'paragraph', text: 'The library turns settler work into long-term unlocks. Studies can improve job output, unlock housing and storage upgrades, or add frontier controls.' },
      {
        type: 'table',
        columns: ['Study result', 'Why it matters'],
        rows: [
          ['Output buffs', 'Make staffed sites more efficient.'],
          ['Housing upgrades', 'Raise beds and comfort without spreading out.'],
          ['Storage upgrades', 'Increase logistics capacity on existing routes.'],
          ['Border controls', 'Prepare for multiplayer and military pressure.'],
        ],
      },
      { type: 'callout', title: 'Study timing', text: 'Start studies when food and repairs are stable enough to spare workers for long cycles.', tone: 'info' },
    ],
    ['job-sites', 'progression:hero_methods'],
  ),
  page(
    'market-and-trade',
    'logistics',
    'Market And Trade',
    'Markets and trade centers convert surplus and advanced goods into flexibility.',
    ['market', 'trade', 'trade center', 'goods', 'surplus'],
    [
      { type: 'paragraph', text: 'Trade is strongest after the colony can create surplus. A trade center and market access help redirect stock pressure into missing goods or comfort routes.' },
      {
        type: 'table',
        columns: ['Trade need', 'Preparation'],
        rows: [
          ['Surplus goods', 'Keep production and storage ahead of demand.'],
          ['Tools', 'Establish mining and workshop output.'],
          ['Route access', 'Connect trade buildings with roads and storage.'],
        ],
      },
      { type: 'callout', title: 'Do not trade your base away', text: 'Keep food, repair materials, and construction inputs buffered before spending surplus.', tone: 'warning' },
    ],
    ['harbors-and-ship-orders', 'mining-and-tools'],
  ),
  page(
    'harbors-and-ship-orders',
    'logistics',
    'Harbors And Ship Orders',
    'Harbors connect large water access to arriving ship orders, cargo, and season scoring opportunities.',
    ['harbor', 'ship orders', 'ships', 'cargo', 'water trade'],
    [
      { type: 'paragraph', text: 'A harbor is a logistics commitment. It needs shoreline access, roads, stock, and enough production to satisfy ship orders without starving the settlement.' },
      { type: 'flow', steps: ['Secure large water access', 'Build harbor support', 'Stock requested goods', 'Complete ship orders', 'Use rewards to accelerate the next bottleneck'] },
      {
        type: 'statGrid',
        stats: [
          { label: 'Best before harbor', value: 'Storage' },
          { label: 'Common blocker', value: 'Missing goods' },
          { label: 'Season value', value: 'Ship orders', note: 'Orders can feed score and end-goal progress.' },
        ],
      },
    ],
    ['market-and-trade', 'seasons-and-scoring', 'building:harbor'],
  ),
  page(
    'comfort-and-morale',
    'settlement',
    'Comfort And Morale',
    'Comfort goods, drinks, housing upgrades, pubs, and shops help settlers stay productive as the colony grows.',
    ['comfort', 'morale', 'happiness', 'pub', 'shop', 'beer', 'wine'],
    [
      { type: 'paragraph', text: 'Food keeps settlers alive, but comfort keeps a larger settlement stable. Morale chains usually become worthwhile after basic food and repairs are dependable.' },
      {
        type: 'table',
        columns: ['Comfort route', 'Use'],
        rows: [
          ['Beer and wine', 'Social drinks produced from crop chains.'],
          ['Pub', 'Staffed social building for morale support.'],
          ['Shop', 'Turns trade goods into happiness.'],
          ['Better houses', 'Adds comfort while increasing beds.'],
        ],
      },
      { type: 'barChart', title: 'When to invest', bars: [{ label: 'Before food', value: 1, max: 5 }, { label: 'After farms', value: 3, max: 5 }, { label: 'Large settlement', value: 5, max: 5 }] },
    ],
    ['housing-and-population', 'farming-and-irrigation'],
  ),
  page(
    'calamities',
    'frontier',
    'Calamities',
    'Calamities pressure weak food, health, repair, and logistics systems during active seasons.',
    ['calamities', 'events', 'outbreak', 'warning', 'resilience'],
    [
      { type: 'paragraph', text: 'Calamities are timed pressure events. The warning window is meant for triage: finish critical repairs, secure food, and prepare the systems named by the alert.' },
      {
        type: 'table',
        columns: ['Preparation', 'Why it helps'],
        rows: [
          ['Food buffer', 'Prevents population shocks during disruption.'],
          ['Repair stock', 'Lets heroes restore damaged infrastructure quickly.'],
          ['Field medicine', 'Can prevent fever outbreaks from becoming fatal.'],
          ['Compact routes', 'Shortens response time.'],
        ],
      },
      { type: 'callout', title: 'Warnings are action time', text: 'Do not spend a calamity warning on distant expansion unless the core is already stable.', tone: 'warning' },
    ],
    ['maintenance-and-repairs', 'seasons-and-scoring'],
  ),
  page(
    'seasons-and-scoring',
    'progression',
    'Seasons And Scoring',
    'Seasons divide play into stages with scoring emphasis, border policy changes, ship timing, and possible end goals.',
    ['seasons', 'scoring', 'leaderboard', 'end goals', 'stage'],
    [
      { type: 'paragraph', text: 'Season stages change what the colony should value. Preparation rewards charter stability, later stages place more pressure on frontier control, logistics, military, and resilience.' },
      {
        type: 'table',
        columns: ['Score area', 'Examples'],
        rows: [
          ['Charter', 'Chapters, objectives, and settlement growth.'],
          ['Frontier', 'Discovered and controlled land.'],
          ['Logistics', 'Active routes, storage, production, and ship orders.'],
          ['Military', 'Watchtowers, captures, and defenses.'],
          ['Resilience', 'Calamities survived and maintained infrastructure.'],
        ],
      },
      { type: 'flow', steps: ['Preparation stage', 'Midgame stage', 'Endgame stage', 'Completion or archive'] },
    ],
    ['harbors-and-ship-orders', 'multiplayer-and-borders'],
  ),
  page(
    'multiplayer-and-borders',
    'frontier',
    'Multiplayer And Borders',
    'Borders, control, watchtowers, and settlement policy define how neighboring colonies interact.',
    ['multiplayer', 'borders', 'control', 'watchtower', 'military'],
    [
      { type: 'paragraph', text: 'Borders are strategic infrastructure. The colony needs watchtowers, clear routes, and enough production to hold important tiles when other settlements expand nearby.' },
      {
        type: 'statGrid',
        stats: [
          { label: 'Early policy', value: 'Closed', note: 'Preparation keeps starts protected.' },
          { label: 'Later policy', value: 'Open', note: 'Midgame and endgame pressure overlap.' },
          { label: 'Key building', value: 'Watchtower' },
          { label: 'Support chain', value: 'Weapons and guards' },
        ],
      },
      { type: 'callout', title: 'Borders need logistics', text: 'A remote tower is weaker when roads, repairs, and weapon supply cannot reach it.', tone: 'info' },
    ],
    ['seasons-and-scoring', 'mining-and-tools'],
  ),
  page(
    'harsh-frontier',
    'frontier',
    'Harsh Frontier',
    'Snow, desert, mountains, and volcanic terrain reward preparation more than speed.',
    ['harsh terrain', 'snow', 'desert', 'mountain', 'vulcano', 'frontier'],
    [
      { type: 'paragraph', text: 'Harsh frontier terrain expands the map but raises travel, supply, and placement pressure. Treat it as a campaign after the core settlement can feed and repair itself.' },
      {
        type: 'table',
        columns: ['Terrain pressure', 'Preparation'],
        rows: [
          ['Mountains', 'Roads, tunnels, mining crews, and storage.'],
          ['Snow', 'Long routes and defensive planning.'],
          ['Desert', 'Water, glass industry, and supply buffers.'],
          ['Volcanic edge', 'Late frontier reach and strong logistics.'],
        ],
      },
      { type: 'callout', title: 'Advance in layers', text: 'Roads, depots, towers, and repair stock should follow each push into harsh terrain.', tone: 'warning' },
    ],
    ['exploration', 'mining-and-tools'],
  ),
  page(
    'starter-strategies',
    'basics',
    'Starter Strategies',
    'A reliable starter plan balances scouting, wood, roads, shelter, food, and security before chasing distant unlocks.',
    ['strategy', 'starter', 'opening', 'beginner', 'build order'],
    [
      { type: 'paragraph', text: 'A strong opening is simple: reveal enough to choose a food route, build only the roads you will reuse, and avoid spending all heroes on one distant job.' },
      {
        type: 'table',
        columns: ['Opening mistake', 'Better habit'],
        rows: [
          ['Exploring too far', 'Scout toward a needed resource or route.'],
          ['Building scattered sites', 'Cluster around support and storage.'],
          ['Growing without food', 'Keep meals ahead of population.'],
          ['Ignoring repairs', 'Fix core buildings before new outposts.'],
        ],
      },
      { type: 'flow', steps: ['Scout', 'Wood', 'Road', 'House', 'Food route', 'Watchtower', 'Storage', 'Industry'] },
    ],
    ['getting-started', 'early-food', 'movement-and-roads'],
  ),
];
