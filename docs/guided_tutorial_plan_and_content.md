# Guided Tutorial Plan & Tutorial Content

## 1. Game Concepts Extracted From the Conversation

### Debug Menu
The debug menu is opened with **TAB**. It is currently used for development and testing rather than normal gameplay. It includes options such as restarting with a random seed, toggling visual effects, and starting different world sizes. The **Large world (200)** option is unstable and can crash the server, so it should be hidden or disabled for normal testers. The debug menu is useful during playtests but should not be part of the new-player tutorial except as a developer-only tool.

### Restart Random
The **Restart Random** action restarts the game with a new random seed. It is useful for beginning a fresh test session or quickly trying a different world layout. In a finished product, this should be clearly separated from normal gameplay and protected by a confirmation dialog, because it can reset the current session.

### Heroes
Heroes are player-controlled units. Multiple players can control unclaimed heroes, but a player can claim a hero for exclusive control. If a claimed hero is idle for a while, it is automatically released so other players can use it. Heroes perform active tasks such as exploring, chopping wood, hunting, digging, preparing land, seeding, building, mining, and other world-shaping actions. The current design principle is: **heroes shape the world; settlers do the work**.

### Hero Claiming and Releasing
A hero can be claimed by a player to prevent control conflicts in multiplayer. Claimed heroes become exclusive until released manually or automatically after idling. This supports casual shared control while preventing two players from issuing conflicting orders to the same hero.

### Cooperative Hero Control
In the current multiplayer test, both players can control available heroes. This enables cooperative task execution and collaborative exploration. Longer term, this needs rules around ownership, invitations, tile permissions, and balance, especially when multiple players bring their own heroes into the same world.

### Idle Hero Auto-Release
If a hero remains idle for a certain period, the game automatically releases that hero. This prevents abandoned heroes from becoming locked by inactive players and keeps multiplayer sessions fluid.

### Task System
Players interact with tiles by assigning tasks. Examples include exploring, chopping wood, hunting, building houses, digging grassland, preparing farmland, seeding crops, mining, building docks, and constructing roads. Tasks may require resources from storage, may take time, and may wait if materials are missing. The task system is the central interaction model for heroes.

### Shared Task Execution
Multiple heroes can work on the same task to complete it faster. This creates a cooperative gameplay dynamic and gives players meaningful choices about whether to split heroes across multiple jobs or concentrate them on one important objective.

### Undiscovered Tiles
The world begins mostly hidden. Clicking an undiscovered tile sends a hero to explore toward it. Exploration expands the known world and reveals terrain, resources, and new build opportunities. Early tutorial guidance should teach that exploration is not just movement; it is how players unlock access to new resources.

### Tile Exploration
Exploration gradually reveals the world and determines which tasks become available. Players are encouraged to explore near known biomes, such as looking near existing forest tiles to find more wood. Exploration is also used to find water, mountains, deserts, and other terrain required for later production chains.

### Active Tile Limit
There is a maximum number of active tiles based on population. When the player discovers more tiles than their active tile limit allows, some tiles may become disabled. This creates a soft constraint on expansion. Population growth, town centers, watchtowers, and special buildings can help manage reach and activity.

### Disabled Tiles
When the active tile limit is exceeded, some discovered tiles can become disabled. Disabled tiles cannot be used normally until they are reactivated. This mechanic encourages players to manage expansion rather than revealing too much territory too quickly.

### Campfire
The campfire has two functions. First, it can temporarily activate disabled tiles by burning wood. Second, it can be used to cook rations for food. It is not crucial early in the game, but it becomes useful once the player has discovered more tiles than they can actively maintain. It can also support early food stability if tuned well.

### Town Center
The town center is the settlement’s central structure. It stores resources, acts as the main supply depot, controls local reach, and provides population capacity. Later, additional town centers can be built using tools. A new town center increases reach, acts as another supply point, and increases maximum population significantly.

### Supply Depot / Inventory
Resources gathered by heroes and settlers are stored centrally, initially at the town center. Construction tasks pull materials from the town center or supply depot. If a task does not have enough material, it waits until the required resources become available.

### Resource Storage
Resources such as wood, food, grain, stone, ore, sand, tools, and other materials are stored and consumed by construction, production, maintenance, and population growth. Storage location matters because workers travel between houses, jobsites, and depots.

### Wood
Wood is one of the first critical resources. It is gathered from forest tiles by chopping wood and is required for houses, docks, campfires, roads or other early structures, and repairs. Early gameplay teaches the player to explore near forests to find more wood.

### Chopping Wood
Chopping wood is a hero task performed on forest tiles. It produces wood for the settlement. Multiple heroes can chop together to increase speed. If wood is missing for a building task, players should chop nearby forest tiles before retrying the build.

### Forest Tiles
Forest tiles provide wood and hunting opportunities. They can also hide special properties revealed by surveying, such as dense forest, which may improve lumber production. Forests are key to early survival and later automated wood production through lumber camps.

### Hunting
Hunting is an early food source performed on forest tiles. Sending more heroes to hunt can increase production because each hero can receive food from the task. Hunting is essential in early stages before reliable food systems such as docks, hunter huts, farms, granaries, bakeries, or bread production are established.

### Food
Food is required for settlers to survive and for population growth. If food production is lower than consumption, settlers can starve and population will drop. Early food can come from hunting and docks, while later food comes from farms, granaries, bakeries, bread, fishing, and other production systems.

### Population
Population grows when housing and enough food are available. The game appears to require roughly two to three times the current population in stored food to grow by one settler. Population provides labor for jobsites, repairs, and settlement productivity. Population also affects active tile limits and progression.

### Housing
Houses provide beds and increase population capacity. Building more houses allows the settlement to grow, but population will not increase unless food stock is sufficient. Later, houses can be upgraded when building upgrades are unlocked.

### Beds
Beds represent available population capacity. If the town center shows unused beds, the settlement has room to grow, but growth still requires food. If there are no available beds, players must build or upgrade houses.

### Settlers
Settlers are automated NPC workers. They cannot be directly controlled and mostly exist for simulation, jobsites, production, eating, sleeping, and repairs. Their panel currently provides fun or informational detail rather than direct commands. Settlers follow a **work → eat → sleep → repeat** cycle.

### Settler Needs
Settlers need food and housing. If food runs out, they can die, reducing population. If houses are too far from jobsites or supply depots, travel time reduces efficiency. The settlement must be balanced so settlers can sustain production and maintenance.

### Jobsite
A jobsite is a building or location where settlers work automatically. Examples include docks, lumber camps, hunter huts, barracks, watchtowers, and possibly future production buildings. Jobsites convert nearby terrain, resources, or conditions into ongoing production.

### Dock
A dock is built near water. It counts visible water tiles around it and produces food when a settler works there. Dock productivity depends on surrounding water visibility. Hero fishing at the dock is currently broken, but settlers can use docks automatically if the economy and staffing are balanced.

### Water Tiles
Water tiles support dock production, irrigation adjacency, and possibly future fishing systems. Water proximity matters because farming near water can skip irrigation requirements, and docks produce food based on surrounding visible water tiles.

### Fishing
Fishing is associated with docks and water. In the current build, settler fishing works through dock jobsites, while hero fishing is broken. Future fishing could include a minigame adapted from LooperLands, fish species, consumable fish, sushi, recipes, and stronger food items.

### Farming
Farming is a multi-step food production chain. The player digs grassland into dirt, prepares the land, seeds it, waits for crops to grow, then harvests. If farmland is not next to water, a well or irrigation may be required. Farming becomes a bridge from unstable hunting to reliable food production.

### Grassland
Grassland can be dug into dirt. This is the first step toward creating farmland. Grassland near water is especially valuable because it can become irrigated or fertile enough to skip the irrigation step.

### Dirt
Dirt is created by digging grassland. Dirt then needs to be prepared before seeding. If dirt is near water, it may become suitable for planting more quickly. If it is not near water, it may require irrigation.

### Prepared Land
Prepared land is dirt that has been made ready for seeding. It is the intermediate step between raw dirt and planted crops. The tutorial should explicitly teach the sequence: **dig → prepare land → seed → wait → harvest**.

### Seeding
Seeding plants crops on prepared land. After seeding, players wait for the crop to grow. The current conversation suggests visible timers on plots would help players understand that growth is in progress.

### Crop Growth
Crops take time to grow after seeding. Once ready, they can be harvested. Visual feedback such as timers, progress rings, growth stages, or subtle crop animations would make this clearer.

### Grain
Grain is a crop used in the later food chain. Grain can unlock the granary, support bakery production, and later may be used in a brewery. Grain becomes central to automated food and entertainment loops.

### Granary
The granary is built on a grain field and produces more grain when surrounded by grain fields. It is an important mid-game production building. One well-placed granary surrounded by fields may produce enough grain to finish the current content. The unlock threshold discussed was 10 grain, with a possible reduction to 9 so it matches three harvest tasks.

### Bakery
The bakery turns grain into bread. Bread is intended to become a strong, more automated food source. This shifts the player from emergency hunting to stable food production.

### Bread
Bread is a higher-quality food source produced from grain through the bakery. It is part of the progression chain: **grain → granary → bakery → bread**.

### Irrigation
Irrigation is needed when farmland is not adjacent to water. Early farming near water can skip irrigation. Later, wells or irrigation systems unlock more flexible farming layouts away from natural water.

### Well
A well provides water to surrounding tiles. It is not very useful early if the player farms near water, but it can expand viable farmland later. Future systems such as brewing could make wells more important by requiring water as an input.

### Watchtower
A watchtower increases reach near the edge of controlled territory and allows the player to expand farther. In future battle modes, watchtowers may also become defensive jobsites and attack targets. Watchtowers are important for exploration, territory, expansion, and possibly perimeter security.

### Reach
Reach determines which tiles the player can interact with or expand into. Watchtowers and town centers increase reach. If a player cannot access a desert or distant resource, they likely need to build watchtowers or another town center.

### Perimeter Security
Perimeter security appears as a guided objective but is not yet clearly explained. It likely involves building watchtowers, securing the settlement border, and preparing for future defensive mechanics. This tutorial should define it explicitly as “build a watchtower near the edge of your settlement to extend and secure your reach.”

### Roads
Roads increase travel speed and reduce inefficiency caused by long walking routes. Roads must start at the town center or connect to an existing road. Roads are important because jobsites should be close to houses and storage, and settlers lose time walking.

### Travel Time
Travel time affects production efficiency. Jobsites should be close to houses and storage so settlers spend more time working and less time walking. Roads help reduce this cost.

### Building Placement
Building placement matters. Players should avoid blocking access to the town center because heroes and settlers cannot walk over houses. Production buildings perform best when placed near relevant resources and within efficient walking distance of houses and storage.

### Collision and Path Blocking
Buildings block movement. If houses or other structures surround the town center too tightly, heroes and settlers may be unable to reach important locations. The tutorial should warn players to leave walking paths.

### Lumber Camp
A lumber camp is a durable, automated wood source built in or near forests. It benefits from nearby forest tiles and eventually allows wood production without constant hero chopping. It does not consume tiles in the same way as direct chopping, making it a sustainable production option.

### Hunter Hut
A hunter hut is an automated food production building on forest terrain. It reduces dependence on manually assigning hunting tasks and helps stabilize early-to-mid-game food production.

### Timber Camp
The timber camp, described similarly to the lumber camp, provides a durable source of wood. It is associated with planted trees or forest sustainability and may support long-term wood production.

### Saplings
Saplings can be planted and eventually grow into trees. In the current build, planting saplings on grass is bugged and does not work properly. Long term, saplings support forestry, sustainability, and timber camp/lumber camp systems.

### Surveying
Surveying searches for hidden tile specifications. A normal forest tile might turn out to be a dense forest, producing more wood for lumber camps. Surveying is not yet a strong mechanic but has potential as a way to add discovery, optimization, and tile specialization.

### Hidden Tile Specs
Tiles can have hidden qualities that are revealed through surveying. Examples include dense forest or other resource modifiers. These specs can affect production output or building value.

### Skills
Skills are an unfinished mechanic. They may later be applied while executing tasks, possibly to skip wait time once or provide stat buffs. The current design is unclear and needs rework. Skills could support hero progression without making combat or economy balance unfair.

### Experience Points
Heroes can earn XP from tasks. Higher-level heroes may work faster, build better economies, or offer productivity multipliers. However, the design should avoid making high-level heroes unbeatable in direct battle.

### Guide / Story / Hint Popups
The game uses hint or story popups to guide players through early objectives. These are not traditional quests but onboarding prompts. The conversation suggests they should be more structured, easier to navigate, and maybe forced at first to prevent players from getting lost.

### Quest Box
The quest box or guide box provides hints and objectives. It may pop up at game start, but players can miss it or skip around. UX improvements include defaulting it open on first play, stronger onscreen instructions, previous/next navigation, and clearer required objectives.

### Advice Button
The advice button exists but its purpose was unclear to the tester. It should either provide contextual guidance based on current needs or be renamed to something clearer, such as “What should I do next?”

### Tutorial Navigation
The tester wanted a forward button after using back navigation in guide messages. Tutorial content should support both linear progression and review. The player should be able to go back and forward through completed hints without losing track of the current objective.

### Forced Tutorial Steps
The tester suggested forcing players to complete each guide step before moving to the next, at least during the beginning. This would reduce confusion and prevent players from exploring advanced systems before understanding basic survival, food, houses, farming, and reach.

### Music and Sound Design
The music and sound design were received positively. The game could eventually offer multiple soundtracks with different vibes, perhaps selected by the user, tied to biomes, or dynamically changed by game state.

### Visual Effects
The game includes visual effects such as clouds, birds’ shadows, and other atmospheric effects. These make the world feel dynamic. Some FX can be disabled in the debug menu. The tester also liked vibration feedback.

### Mobile Support
The game works on mobile but needs UI optimization, especially because buttons are currently too large. The tutorial should account for touch controls, larger tap targets, and reduced text length on small screens.

### Vibration Feedback
Vibrations add tactile feedback and were positively received. They can help confirm completed tasks, resource collection, building completion, or warnings like starvation and missing resources.

### UI Clarity
The tester emphasized big buttons, obvious actions, and short easy-to-read text because players have short attention spans. The tutorial should use concise objective text, clear call-to-action buttons, and visible highlights.

### World Generation
The game generates biomes procedurally. Forests, water, mountains, deserts, plains, and other terrain appear through exploration. Since generation varies, the tutorial must adapt to nearby resources instead of relying on fixed tile locations.

### Biomes
Biomes determine terrain and available resources. Forests provide wood and hunting, water supports docks and farming, mountains provide ore and stone, deserts provide sand, and plains support houses and farms.

### Plains
Plains are suitable for building houses and possibly other settlement structures. They can be part of early base planning.

### Mountains
Mountains provide ore and durable stone through mines. The number of mountains in a mountain range affects how much ore mines can produce before running out.

### Mines
Mines are built on mountain ranges and produce ore and durable stone. Ore unlocks toolmaking. Mines eventually run out of ore based on the amount of mountains in the range.

### Ore
Ore is gathered from mines and is required to unlock toolmaking. Toolmaking then enables advanced buildings such as the library and new town centers.

### Stone
Stone is a durable construction and repair material gathered from mountains or mines. It can support upgrades, walls, maintenance, and stronger structures.

### Toolshop / Workshop
The toolshop or workshop allows the settlement to make tools after enough ore is collected. Tools are required for advanced construction, including the library and new town centers.

### Tools
Tools are crafted from ore and used to unlock or build advanced structures. Tools are a key progression resource that moves the player from early survival into expansion and upgrades.

### Library
The library requires tools and unlocks building upgrades. It represents a technology or research milestone.

### Building Upgrades
Building upgrades are unlocked through the library and tools. Upgrades can improve houses, production buildings, and later settlement efficiency.

### Desert
Deserts provide sand. They are discovered through exploration and may require expanded reach via watchtowers or town centers.

### Sand
Sand is gathered from desert tiles and can be combined with an oven to produce glass.

### Oven
The oven processes sand into glass. It may also later connect to cooking, bakery, or advanced food systems.

### Glass
Glass is created from sand and an oven. It allows further housing upgrades and possibly other advanced structures.

### Lily Pads
Lily pads can be harvested and then placed to create walkways over water. The action requires lily pads as a resource first. This supports water traversal and terrain manipulation.

### Maintenance
Buildings require maintenance. If there are not enough idle settlers or resources, buildings can go offline. Maintenance uses materials such as wood and stone from supply depots. This creates an ongoing need for population surplus and resource reserves.

### Repairs
Repairs are performed automatically by idle settlers. Players need more population than active jobs so some settlers can repair buildings. Buildings without maintenance may stop functioning.

### Idle Settlers
Idle settlers are not wasted; they are needed for repairs and maintenance. The player should maintain a population surplus rather than assigning everyone to jobsites.

### Building Offline State
Buildings can go offline if maintenance is missing. This creates production interruptions and teaches players to balance labor, resources, and repairs.

### Economy Balance
The settlement economy depends on food production, population, jobsites, storage, travel time, maintenance, and resource chains. If population grows too quickly without food, settlers starve. If there are too many jobs and no idle settlers, buildings decay.

### Easy / Hard Mode
An easy/hard mode could adjust production and consumption. Easy mode would help new players learn without starving quickly. Hard mode would preserve the challenge for experienced players.

### Persistent World
Progress is saved, and the world keeps running when the player leaves. If the settlement is self-sustaining, it can continue growing. If not, settlers may starve while the player is away. This creates a “living world” or “living pet” feeling.

### Self-Sustaining Settlement
A successful settlement should eventually reach a stable state where food, repairs, and production continue without constant hero intervention. Players can then return to find progress instead of collapse.

### Reviving Population
If settlers die while the player is away or due to food imbalance, heroes may need to revive the population by hunting, restoring food supply, repairing buildings, and rebuilding houses or jobsites.

### Endless Community-Built Living World
The long-term vision is an endless, large, shared, living world built by the community. Players expand, settle, cooperate, compete, and shape a persistent world together.

### Multiple Worlds
The server should eventually support multiple worlds. Players could have their own world, join a shared world, or log into a world with friends.

### Shared World
A shared world allows multiple players to build, explore, cooperate, and possibly compete. It raises design questions around land ownership, permissions, cooperation, and PvP.

### Sub World / Personal Land
A player may have a personal land or sub-world. This can act as their safe home base, settlement, or imported headquarters. It may be separate from or connected to the larger shared world.

### Import My World Feature
The idea is that a player’s starting hexagon or personal land could be imported into a larger shared map. The player builds safely inside a defined area, then brings that settlement into the broader world when ready.

### Starting Hexagon
The starting hexagon is the initial bounded area of the player’s world. It could represent a home territory, headquarters, or mobile world that later connects to larger multiplayer maps.

### Open Borders
In open-border mode, players can interact with others, expand, attack, and be attacked. It supports risk, conquest, and competitive gameplay.

### Closed Borders
In closed-border mode, players are safe from attacks but cannot expand aggressively. This lets new or casual players build safely until they are ready to participate in open-border gameplay.

### Battle Mode
Battle mode allows teams or players to defend and conquer tiles. It introduces PvP or team-versus-team territory control.

### Team vs Team
Team-vs-team gameplay would have groups building toward each other, defending borders, and fighting over territory. Balance must account for economy, cooperation, hero count, and defensive structures.

### Tile Conquest
Stronger players or teams may be able to take over tiles from opponents. Conquest should probably target border structures such as watchtowers rather than core town centers, to avoid wiping out new players.

### Safe Haven
The area around a town center may function as a safe haven that cannot be attacked. This protects new players and prevents total destruction.

### New Player Protection
New players need protection from stronger players. Suggested systems include mandatory no-attack timers, town-center safe zones, water barriers, closed borders, or limiting attacks to watchtowers.

### Defend and Conquer
The defend-and-conquer loop combines economic growth with territorial defense. Players build production, expand reach, secure borders, and then contest territory.

### Military Settlers
Military settlers could be trained or assigned to attack and defend. This keeps combat tied to the economy rather than direct hero power. Military strength would depend on population, jobsites, food, tools, weapons, and logistics.

### Barracks
A barracks could be a jobsite for attack settlers. It would train or assign military units and connect the economy to offensive capability.

### Watchtower Defense
Watchtowers could become defensive jobsites where settlers defend borders. This creates a passive tower-defense-style system.

### Passive Tower Defense
Passive tower defense would use watchtowers, walls, military settlers, and supply chains to defend territory automatically. Players shape the defenses with heroes, while settlers perform the fighting.

### Walls
Walls can protect territory and slow attackers. Wood walls could be upgraded to stone walls. Stronger walls take longer to breach and give defenders time to respond.

### Weaponsmith
A weaponsmith could produce weapons, enabling military settlers or stronger defenses. It may be unlocked through better food, tools, ore, or advanced production.

### Weapons
Weapons would support military systems. They could be crafted using ore, tools, wood, and possibly other resources. Weapons should strengthen defense/offense without making hero levels dominate outcomes.

### Hero Role in Combat
The preferred direction is that heroes should not directly dominate battles. Heroes shape the economy and world, while settlers and defensive systems handle combat. This avoids high-level players becoming untouchable.

### Hero Level Balance
High-level heroes should improve building, economy, scouting, or production speed, but not single-handedly determine PvP outcomes. Their value should be meaningful without becoming unfair.

### Friends Working on Tiles
Players may be able to friend others and allow them to work on their tiles. This supports cooperation without fully merging worlds or creating unfair hero-count advantages in PvP.

### Co-op Invitations
Players may invite friends into their land to cooperate. Balance concerns arise if each player brings up to four heroes, potentially creating 8+ hero teams. PvP matchmaking or permission limits may be needed.

### Even Matches
For competitive play, battles could require even hero counts such as 4v4 or 8v8. This helps control the advantage gained from co-op.

### NFT / LooperLands Assets
LooperLands NFTs could become usable assets in this game. This gives existing assets utility across two games. Heroes, sprites, fish, seeds, food, and items may be imported or reused if mechanics support them.

### Asset Ownership
Players could use assets they own, such as heroes or items. This supports “own your asset” gameplay and gives long-term value to existing collections.

### Select Up to Four Heroes
At the start, a player may select up to four heroes to bring into the world. This creates a meaningful loadout decision and ties into NFT or asset ownership.

### Asset XP
Assets can retain XP. A high-level avatar may be more valuable because it has progression history. This supports rental, ownership, and long-term investment loops.

### Asset Rental
Players could rent heroes or assets from other players. Rentals may be aesthetic, functional, or progression-based. The strongest use case is renting a high-level avatar for a day or weekend to progress faster.

### Rental Marketplace
A lightweight marketplace could allow owners to rent out assets and earn credits. It should be simpler than a full marketplace but still handle listing, pricing, rental duration, payment, and ownership credit.

### Credits
Credits could be loaded onto a player account and spent on rentals. New players could receive free credits as a hook. Credits simplify payment handling and reduce transaction complexity.

### Rental Pricing
A possible formula is based on asset value multiplied by asset XP to determine an hourly rate. Players pay upfront for rental duration.

### Owner Payouts
When an asset is rented, credits are assigned to the owner. Owners can withdraw credits once they reach a payout threshold. Legal and payment implications need review.

### Community Gift / Renewed Interest
Adding asset utility can renew interest for existing LooperLands holders. It provides a reason to use or rent out assets and gives early supporters extra value.

### Shop
A shop could sell or rent assets, cosmetics, items, heroes, or other gameplay additions. It should be carefully balanced to avoid pay-to-win outcomes.

### Creator Assets
The ability to add characters or assets could bring in creators, but the game should not depend on creator participation because creator activity can fluctuate.

### LooperLands Item Integration
Existing LooperLands items could be used in this game where mechanics fit. Fish, seeds, food sprites, gardening items, and interactive minigames are strong candidates.

### Fishing Minigame
A fishing minigame from LooperLands could be recreated at the dock. It might use a bar, target area, bullseye area, speed, and timing. It could appear as a popup window and provide better fish or food rewards.

### Reusable Slider Minigame
The same bar-slider timing mechanic could be reused for fishing, bowling, golfing, crafting, or other skill-based interactions. Variables include bar speed, target size, bullseye size, and reward quality.

### Fish as Consumables
Fish could become consumable food items. Different fish types could provide different nutrition, buffs, or recipe ingredients.

### Sushi and Recipes
Fish could be used to make sushi or other dishes. Recipes create deeper food systems, better consumables, and stronger links between fishing, farming, and cooking.

### Better Food
Better food could improve population growth, work efficiency, happiness, military readiness, or survival. Bread, sushi, cooked rations, and future recipes all fit this category.

### Cooking
Cooking can convert raw food into better consumables. Campfires, bakeries, ovens, pubs, and other buildings may support cooking or food processing.

### Entertainment
Settlers may eventually need entertainment. This adds another need beyond food and housing, creating more mid-game depth.

### Brewery
A brewery could use grain and water to produce drinks. This gives additional use to grain and wells.

### Pub
A pub could provide entertainment for settlers. It would consume brewery output and help satisfy settler needs.

### Settlement Happiness / Entertainment Need
An entertainment need would require players to build pubs, breweries, or social structures. It would make settlements feel more alive and create additional balancing requirements.

### Production Chains
The game uses production chains such as:
- Forest → wood → house/dock/repairs
- Grassland → dirt → prepared land → crop → grain
- Grain → granary → bakery → bread
- Mountain → ore/stone → tools → library → upgrades
- Desert → sand → oven → glass → housing upgrades
- Water → dock/well → food/irrigation/brewery
These chains give the game its puzzle and strategy depth.

### Objectives
Objectives guide the player through early survival and production. Examples include finding wood, building a house, scouting water, building a dock, increasing population, starting grain farming, building watchtowers, finding mountains, mining ore, building a toolshop, and expanding with a new town center.

### Tutorial as Guided Hints, Not Quests
The game is an RTS, not a quest-based game. The tutorial should frame objectives as guided learning and settlement advice rather than mandatory story quests. However, the first few steps should be enforced enough to prevent confusion.

### Puzzle Aspect
The game has a puzzle-like quality because players must discover resources, place buildings efficiently, manage production chains, and balance population needs. The tutorial should preserve this by teaching the logic without solving every decision for the player.

### Cozy Challenge
The tester described the game as having good vibes, music, building, balancing, and challenge. The challenge becomes frustrating mostly when direction is unclear. The tutorial should keep the difficulty but reduce confusion.

### Living Pet Design
The persistent settlement creates a “living pet” feel. The player cares for the settlement, keeps it balanced, and returns later to see how it is doing. This requires clear warnings about food, maintenance, and sustainability.

### Server Persistence
In production, the server should continue running worlds when players leave. During development, sessions may reset when the server restarts or code changes.

### Production vs Testing
In testing, the world may reset due to local server restarts or code changes. In production, the world should persist reliably. The UI should distinguish unstable test features from persistent gameplay.

---

## 2. Guided Tutorial Design Plan

## Tutorial Goals

The tutorial should teach the player how to:
1. Understand the camera, selection, and basic controls.
2. Use heroes to explore and perform tile tasks.
3. Gather wood.
4. Build the first house.
5. Understand population, beds, and food.
6. Find water and build a dock.
7. Stabilize food with hunting and fishing.
8. Start farming with the sequence: dig → prepare → seed → wait → harvest.
9. Build a granary and progress toward bread.
10. Expand reach with watchtowers.
11. Avoid path blocking and poor placement.
12. Understand roads and travel time.
13. Discover mountains and build mines.
14. Produce tools and unlock upgrades.
15. Understand maintenance and idle settlers.
16. Reach a self-sustaining settlement.
17. Learn optional advanced systems such as surveying, campfires, saplings, lily pads, and multiplayer.

## Tutorial Format

Use a hybrid of:
- A compact objective panel.
- Short popups for new concepts.
- Tile highlights.
- Contextual “What should I do next?” advice.
- Optional “Learn more” expandable explanations.
- A persistent tutorial log with Back and Forward buttons.

## Tutorial UX Principles

### Keep Instructions Short
Each active tutorial step should fit in one or two short sentences. Longer explanations should be hidden behind a “More” button.

### Show the Target
Whenever possible, highlight the relevant tile, button, building, or resource counter.

### Do Not Advance Too Early
The first tutorial should not let the player skip too far ahead. Early steps should be gated until completed.

### Allow Review
Players should be able to review previous tutorial messages with Back and Forward buttons.

### Use Contextual Warnings
If food is low, buildings are offline, or paths are blocked, show warnings immediately.

### Teach by Doing
Every tutorial step should ask the player to perform one meaningful action, then explain why it mattered.

### Avoid Debug UI
The debug menu should not be part of the player tutorial. It belongs in a developer/testing guide.

### Provide “Why” After “Do”
First tell the player what to do. After completion, briefly explain why it matters.

### Use Adaptive Targets
Because worlds are procedurally generated, the tutorial should dynamically choose nearby valid targets:
- nearest forest for wood
- nearest plains for house
- nearest water path for dock
- nearest grassland near water for farming
- nearest mountain for mining

## Tutorial Phases

### Phase 0: First-Time Setup
Purpose: Introduce the basic premise and controls.

Player learns:
- This is a living settlement.
- Heroes perform tasks.
- Settlers work automatically.
- The world keeps running.

### Phase 1: First Wood
Purpose: Teach exploration and resource gathering.

Player learns:
- Click undiscovered tiles to explore.
- Forests give wood.
- Wood is needed for buildings.

### Phase 2: First House
Purpose: Teach construction and population capacity.

Player learns:
- Houses add beds.
- Tasks pull materials from storage.
- Heroes can work together.

### Phase 3: Food Pressure
Purpose: Teach food and survival before the player over-expands.

Player learns:
- Settlers eat.
- Food shortages kill settlers.
- Hunting is the emergency food action.

### Phase 4: Water and Dock
Purpose: Introduce water-based food production.

Player learns:
- Explore toward water.
- Build a dock near water.
- Docks produce food from visible nearby water tiles.

### Phase 5: Population Growth
Purpose: Explain the relationship between food, houses, and population.

Player learns:
- Population grows when there are beds and food.
- More settlers work jobsites.
- More population also increases settlement needs.

### Phase 6: Farming Basics
Purpose: Teach the farming chain.

Player learns:
- Dig grassland into dirt.
- Prepare dirt.
- Seed prepared land.
- Wait for growth.
- Harvest crops.

### Phase 7: Granary and Bread
Purpose: Introduce production chains.

Player learns:
- Grain unlocks granary.
- Granaries work best surrounded by grain fields.
- Bakery and bread create stronger food production.

### Phase 8: Expansion and Roads
Purpose: Teach reach, watchtowers, town centers, and travel efficiency.

Player learns:
- Watchtowers expand reach.
- Roads speed travel.
- Roads must connect to town center or other roads.
- Do not block movement.

### Phase 9: Mining and Tools
Purpose: Introduce mid-game progression.

Player learns:
- Mountains provide ore and stone.
- Mines can run out of ore.
- Tools unlock advanced buildings.

### Phase 10: Maintenance and Stability
Purpose: Teach why settlements fail even when production exists.

Player learns:
- Buildings need repairs.
- Idle settlers handle maintenance.
- Keep spare wood/stone and spare workers.

### Phase 11: Advanced Optional Systems
Purpose: Introduce mechanics that are useful but not core to the first survival loop.

Player learns:
- Surveying reveals hidden tile traits.
- Campfires temporarily activate disabled tiles and cook rations.
- Saplings can create future forests.
- Lily pads can make water walkways.
- Skills and XP improve hero utility.

### Phase 12: Multiplayer and Long-Term Vision
Purpose: Explain the larger game direction once the player understands the core loop.

Player learns:
- Shared worlds.
- Open and closed borders.
- Friends helping on tiles.
- Team vs team.
- Territory defense.
- Asset ownership and hero selection.

---

## 3. Tutorial State Machine

## State 0: Welcome
**Trigger:** First login or new world start.  
**Goal:** Introduce the game.  
**Completion:** Player closes welcome and selects/claims a hero.

## State 1: Claim a Hero
**Trigger:** Welcome complete.  
**Goal:** Claim or select a hero.  
**Completion:** Hero is controlled by the player.

## State 2: Explore Nearby Tile
**Trigger:** Hero claimed.  
**Goal:** Click highlighted undiscovered tile.  
**Completion:** New tile discovered.

## State 3: Find Forest
**Trigger:** First tile discovered.  
**Goal:** Explore toward nearest forest.  
**Completion:** Forest tile visible and reachable.

## State 4: Chop Wood
**Trigger:** Forest visible.  
**Goal:** Start chop wood task.  
**Completion:** Wood added to storage.

## State 5: Build House
**Trigger:** Enough wood available.  
**Goal:** Build a house on plains or valid build tile.  
**Completion:** House completed.

## State 6: Hunt for Food
**Trigger:** House built or food below safe threshold.  
**Goal:** Hunt on forest.  
**Completion:** Food added to storage.

## State 7: Explore Toward Water
**Trigger:** Food stabilized enough for next step.  
**Goal:** Reveal route to water.  
**Completion:** Water visible and reachable.

## State 8: Build Dock
**Trigger:** Water visible, enough wood.  
**Goal:** Build dock adjacent to water.  
**Completion:** Dock completed.

## State 9: Grow Population
**Trigger:** Dock complete and house exists.  
**Goal:** Maintain food stock and beds until population increases.  
**Completion:** Population reaches target, such as 4.

## State 10: Start Farming
**Trigger:** Population target reached.  
**Goal:** Create first crop tile near water.  
**Completion:** Crop seeded.

## State 11: Harvest Grain
**Trigger:** Crop planted.  
**Goal:** Wait for crop ready and harvest.  
**Completion:** Grain added to storage.

## State 12: Build Granary
**Trigger:** Enough grain harvested.  
**Goal:** Build granary on grain field with nearby grain fields.  
**Completion:** Granary completed.

## State 13: Expand Reach
**Trigger:** Granary complete or need resource outside reach.  
**Goal:** Build watchtower near edge.  
**Completion:** Reach expanded.

## State 14: Build Roads
**Trigger:** Multiple buildings/jobsites exist.  
**Goal:** Build road from town center toward key buildings.  
**Completion:** Road connects two important areas.

## State 15: Find Mountains
**Trigger:** Reach expanded.  
**Goal:** Explore until mountain range is found.  
**Completion:** Mountain visible and reachable.

## State 16: Mine Ore
**Trigger:** Mountain found.  
**Goal:** Build mine or start mining task.  
**Completion:** Ore and stone added to storage.

## State 17: Build Toolshop
**Trigger:** Enough ore collected.  
**Goal:** Build workshop/toolshop.  
**Completion:** Tools can be produced.

## State 18: Maintenance Lesson
**Trigger:** First building needs repair, or after toolshop.  
**Goal:** Keep idle settlers and resources available.  
**Completion:** A building is repaired or player has reserve labor.

## State 19: Self-Sustaining Check
**Trigger:** Core loops exist.  
**Goal:** Confirm positive food, wood, repair, and population balance.  
**Completion:** Settlement is stable for a set period.

## State 20: Tutorial Complete
**Trigger:** Self-sustaining check complete.  
**Goal:** Release player into sandbox.  
**Completion:** Tutorial panel switches to contextual advice mode.

---

## 4. Tutorial Content

## Tutorial Message Style

Each message has:
- **Title**
- **Short Text**
- **Objective**
- **Button Label**
- **Completion Text**
- **Optional More Info**

---

# Phase 0 — Welcome

## 0.1 Welcome to Your Settlement

**Title:** Welcome to Your Settlement  
**Short Text:** This is a living world. Your heroes shape the land, and your settlers keep it running.  
**Objective:** Claim a hero to begin.  
**Button Label:** Show me a hero  
**Completion Text:** Hero selected. Let’s start exploring.  
**More Info:** Your settlement can keep running while you are away. If it is balanced, it can grow. If food or repairs fail, settlers may die or buildings may go offline.

## 0.2 Heroes and Settlers

**Title:** Heroes Shape, Settlers Work  
**Short Text:** You control heroes directly. Settlers work automatically at homes, jobsites, and repairs.  
**Objective:** Select or claim one hero.  
**Button Label:** Claim Hero  
**Completion Text:** This hero is yours for now.  
**More Info:** In multiplayer, unclaimed heroes can be controlled by anyone. Claimed heroes are exclusive until released or idle too long.

---

# Phase 1 — Exploration and Wood

## 1.1 Explore the Unknown

**Title:** Explore the Unknown  
**Short Text:** Most of the world is hidden. Click an undiscovered tile to send your hero exploring.  
**Objective:** Explore one highlighted unknown tile.  
**Button Label:** Explore Tile  
**Completion Text:** New land discovered.  
**More Info:** Exploration reveals terrain, resources, and new tasks. Forests, water, mountains, and deserts all unlock different production chains.

## 1.2 Find a Forest

**Title:** Find Wood  
**Short Text:** You need wood first. Explore near the visible forest or follow the marker to find more trees.  
**Objective:** Reveal a forest tile.  
**Button Label:** Find Forest  
**Completion Text:** Forest found.  
**More Info:** Forest tiles provide wood and food through chopping and hunting. They can later support lumber camps and hunter huts.

## 1.3 Chop Wood

**Title:** Chop Wood  
**Short Text:** Select a forest tile and start **Chop Wood**. Wood is needed for your first buildings.  
**Objective:** Collect your first wood.  
**Button Label:** Chop Wood  
**Completion Text:** Wood added to storage.  
**More Info:** Construction tasks pull resources from the town center. If a build task waits, it probably needs more materials.

## 1.4 Working Together

**Title:** Heroes Can Help Each Other  
**Short Text:** You can send more than one hero to the same task to finish it faster.  
**Objective:** Optional: assign a second hero to the same chop task.  
**Button Label:** Add Helper  
**Completion Text:** Shared work is faster.  
**More Info:** Splitting heroes covers more ground. Grouping heroes finishes urgent tasks quickly.

---

# Phase 2 — First House

## 2.1 Build a House

**Title:** Build Your First House  
**Short Text:** Houses add beds. Beds allow your population to grow when food is available.  
**Objective:** Build one house on a valid plains or buildable tile.  
**Button Label:** Build House  
**Completion Text:** Your settlement now has more room for settlers.  
**More Info:** Leave paths open around the town center. Heroes and settlers cannot walk through houses.

## 2.2 Don’t Block the Town Center

**Title:** Leave Walking Space  
**Short Text:** Buildings block movement. Keep at least one clear path to the town center.  
**Objective:** Confirm the town center is reachable.  
**Button Label:** Got it  
**Completion Text:** Good layout prevents traffic problems.  
**More Info:** Bad placement can trap workers and slow the economy. Roads later help settlers move faster.

## 2.3 Beds Are Not Enough

**Title:** Beds Need Food  
**Short Text:** A house gives beds, but settlers only arrive when there is enough food.  
**Objective:** Check food and population counters.  
**Button Label:** Show Counters  
**Completion Text:** Population depends on both beds and food.  
**More Info:** A good rule: store several food per settler before expecting population growth.

---

# Phase 3 — Food Survival

## 3.1 Hunt for Food

**Title:** Food Is Running Low  
**Short Text:** Settlers eat every day. Hunt in forests to create emergency food.  
**Objective:** Hunt on a forest tile.  
**Button Label:** Hunt  
**Completion Text:** Food stored. Your settlers are safer.  
**More Info:** Hunting is useful early, but it is manual. Later, docks, farms, hunter huts, and bakeries create more stable food.

## 3.2 Starvation Warning

**Title:** Keep Food Above Zero  
**Short Text:** If food runs out, settlers can die and your population will drop.  
**Objective:** Reach a safe food stock.  
**Button Label:** Find Food  
**Completion Text:** Food stock is safer now.  
**More Info:** Growing too fast can be dangerous. Every new settler increases food demand.

---

# Phase 4 — Water and Dock

## 4.1 Scout for Water

**Title:** Scout for Water  
**Short Text:** Water unlocks docks and better farming. Explore toward the highlighted water direction.  
**Objective:** Discover water.  
**Button Label:** Explore Toward Water  
**Completion Text:** Water discovered.  
**More Info:** Water also helps farmland. Fields next to water can skip irrigation.

## 4.2 Build a Dock

**Title:** Build a Dock  
**Short Text:** Build a dock near water. Settlers can work there to produce food.  
**Objective:** Build one dock.  
**Button Label:** Build Dock  
**Completion Text:** Dock complete.  
**More Info:** Dock production depends on visible water tiles around it. More nearby water means better food production.

## 4.3 How the Dock Works

**Title:** Docks Need Workers  
**Short Text:** Settlers work docks automatically. You do not need to control them directly.  
**Objective:** Wait for a settler to work at the dock.  
**Button Label:** Watch Dock  
**Completion Text:** Your dock can now help feed the settlement.  
**More Info:** Settlers also eat food, so one dock may not be enough if population grows too quickly.

---

# Phase 5 — Growing Population

## 5.1 Grow to Four Settlers

**Title:** Grow Your Population  
**Short Text:** Keep beds available and food stocked so new settlers can join.  
**Objective:** Reach 4 population.  
**Button Label:** Grow Settlement  
**Completion Text:** Population increased. More workers are available.  
**More Info:** More settlers can work more jobs, but they also need more food and maintenance support.

## 5.2 Too Much Growth Can Hurt

**Title:** Balance Growth  
**Short Text:** More settlers help, but they also eat more. Keep food production ahead of population.  
**Objective:** Maintain positive food for a short period.  
**Button Label:** Stabilize Food  
**Completion Text:** Food is stable for now.  
**More Info:** If population grows faster than food production, settlers may starve even after successful expansion.

---

# Phase 6 — Farming Basics

## 6.1 Start a Farm Near Water

**Title:** Start Farming  
**Short Text:** Farming is safer near water. Choose grassland next to water if possible.  
**Objective:** Select a grassland tile near water.  
**Button Label:** Show Good Tile  
**Completion Text:** This tile is good for your first farm.  
**More Info:** If a tile is not near water, it may need irrigation or a well later.

## 6.2 Dig

**Title:** Dig the Ground  
**Short Text:** Use **Dig** on grassland to turn it into dirt.  
**Objective:** Dig one grassland tile.  
**Button Label:** Dig  
**Completion Text:** Grassland became dirt.  
**More Info:** Dirt is not ready for seeds yet. It must be prepared first.

## 6.3 Prepare Land

**Title:** Prepare the Land  
**Short Text:** Use **Prepare Land** on dirt to make it ready for seeds.  
**Objective:** Prepare one dirt tile.  
**Button Label:** Prepare Land  
**Completion Text:** The land is ready for planting.  
**More Info:** The basic farming chain is: dig → prepare → seed → wait → harvest.

## 6.4 Seed

**Title:** Plant Seeds  
**Short Text:** Use **Seed** on prepared land. Then wait for the crop to grow.  
**Objective:** Seed one prepared tile.  
**Button Label:** Seed Tile  
**Completion Text:** Seeds planted.  
**More Info:** A small timer or growth indicator should appear here so players know the crop is progressing.

## 6.5 Wait and Harvest

**Title:** Harvest the Crop  
**Short Text:** When the crop is ready, harvest it to collect grain.  
**Objective:** Harvest one crop.  
**Button Label:** Harvest  
**Completion Text:** Grain collected.  
**More Info:** Grain is the start of a stronger food chain.

---

# Phase 7 — Grain, Granary, Bakery

## 7.1 Collect Enough Grain

**Title:** Gather Grain  
**Short Text:** Harvest grain until you have enough to unlock the granary.  
**Objective:** Reach the required grain amount.  
**Button Label:** Grow More Grain  
**Completion Text:** Granary unlocked.  
**More Info:** Consider setting the unlock amount to 9 grain if one harvest gives 3. That makes the tutorial require exactly three harvest tasks.

## 7.2 Build a Granary

**Title:** Build a Granary  
**Short Text:** Build the granary on a grain field. It works best when surrounded by grain fields.  
**Objective:** Build one granary.  
**Button Label:** Build Granary  
**Completion Text:** Grain production is stronger now.  
**More Info:** Placement matters. Surrounding production buildings with the right terrain can improve output.

## 7.3 Next: Bakery and Bread

**Title:** Bread Is Better Food  
**Short Text:** The bakery turns grain into bread, a stronger and more reliable food source.  
**Objective:** Unlock or build a bakery when available.  
**Button Label:** Track Bakery  
**Completion Text:** Bread production started.  
**More Info:** Bread helps move the settlement from survival mode into stable growth.

---

# Phase 8 — Expansion, Reach, and Roads

## 8.1 Expand with a Watchtower

**Title:** Expand Your Reach  
**Short Text:** If you cannot reach a tile, build a watchtower near your border.  
**Objective:** Build one watchtower near the edge of your settlement.  
**Button Label:** Build Watchtower  
**Completion Text:** Your reach expanded.  
**More Info:** Watchtowers may later defend borders in battle mode.

## 8.2 Perimeter Security

**Title:** Secure the Perimeter  
**Short Text:** Watchtowers extend your reach and mark your border. Build one near the edge to secure expansion.  
**Objective:** Complete one perimeter watchtower.  
**Button Label:** Secure Border  
**Completion Text:** Your settlement has a stronger perimeter.  
**More Info:** In future combat modes, enemies may attack border structures before they can threaten deeper land.

## 8.3 Build Roads

**Title:** Build Roads  
**Short Text:** Roads help settlers travel faster. Start roads from the town center or connect to an existing road.  
**Objective:** Build a road from the town center toward a jobsite.  
**Button Label:** Build Road  
**Completion Text:** Travel is faster on this route.  
**More Info:** Good roads make houses, storage, and jobsites work better together.

## 8.4 Place Jobsites Close

**Title:** Short Walks Matter  
**Short Text:** Settlers lose time walking. Keep jobsites close to houses and storage when possible.  
**Objective:** Review your dock, houses, and storage distance.  
**Button Label:** Check Layout  
**Completion Text:** Efficient layouts produce more.  
**More Info:** Roads can compensate for distance, but placement is still important.

---

# Phase 9 — Mountains, Mines, and Tools

## 9.1 Find Mountains

**Title:** Search for Mountains  
**Short Text:** Mountains provide ore and stone. Explore outward until you find a mountain range.  
**Objective:** Discover mountains.  
**Button Label:** Explore for Mountains  
**Completion Text:** Mountain range found.  
**More Info:** You may need watchtowers or a new town center to reach distant mountains.

## 9.2 Build a Mine

**Title:** Build a Mine  
**Short Text:** Mines produce ore and durable stone. Ore unlocks toolmaking.  
**Objective:** Build or use a mine on mountains.  
**Button Label:** Mine Ore  
**Completion Text:** Ore collected.  
**More Info:** Mines can run out of ore depending on the size of the mountain range.

## 9.3 Build the Toolshop

**Title:** Make Tools  
**Short Text:** Use ore to unlock and build the toolshop. Tools unlock advanced buildings.  
**Objective:** Build the toolshop or workshop.  
**Button Label:** Build Toolshop  
**Completion Text:** Your settlement can now make tools.  
**More Info:** Tools are needed for libraries, new town centers, and advanced upgrades.

## 9.4 Build the Library

**Title:** Unlock Upgrades  
**Short Text:** The library unlocks building upgrades. You need tools to build it.  
**Objective:** Build a library when resources are ready.  
**Button Label:** Build Library  
**Completion Text:** Upgrades are now available.  
**More Info:** Upgrades let your settlement become denser and more efficient.

---

# Phase 10 — Maintenance and Stability

## 10.1 Buildings Need Repairs

**Title:** Maintenance Matters  
**Short Text:** Buildings can go offline if they are not repaired. Keep spare workers and materials.  
**Objective:** Have at least one idle settler and repair materials available.  
**Button Label:** Check Maintenance  
**Completion Text:** Your settlement can repair itself.  
**More Info:** Idle settlers repair buildings automatically using wood and stone from storage.

## 10.2 Do Not Use Every Worker

**Title:** Idle Settlers Are Useful  
**Short Text:** If every settler is busy, nobody repairs buildings. Keep some population free.  
**Objective:** Maintain more population than active jobs.  
**Button Label:** Balance Jobs  
**Completion Text:** Repair capacity restored.  
**More Info:** A healthy settlement has workers, food, storage, and repair capacity.

## 10.3 Self-Sustaining Check

**Title:** Can Your Settlement Survive Alone?  
**Short Text:** Before leaving, make sure food, wood, repairs, and population are stable.  
**Objective:** Keep the settlement stable for a short period.  
**Button Label:** Run Stability Check  
**Completion Text:** Your settlement is self-sustaining for now.  
**More Info:** A living world keeps running. If it is balanced, you can return to growth. If not, you may return to starvation or broken buildings.

---

# Phase 11 — Optional Advanced Lessons

## 11.1 Surveying

**Title:** Survey Hidden Qualities  
**Short Text:** Surveying can reveal hidden tile traits, like a dense forest.  
**Objective:** Survey one tile.  
**Button Label:** Survey Tile  
**Completion Text:** Tile details revealed.  
**More Info:** Hidden traits can make some tiles better for production buildings.

## 11.2 Campfire

**Title:** Campfire Utility  
**Short Text:** Campfires can cook rations and temporarily activate disabled tiles.  
**Objective:** Build a campfire if you have spare wood.  
**Button Label:** Build Campfire  
**Completion Text:** Campfire ready.  
**More Info:** Campfires are optional early, but useful when your discovered land exceeds your active tile limit.

## 11.3 Saplings

**Title:** Plant Future Forests  
**Short Text:** Saplings grow into trees over time and can support future wood production.  
**Objective:** Plant a sapling on a valid tile.  
**Button Label:** Plant Sapling  
**Completion Text:** Sapling planted.  
**More Info:** Do not show this task until planting works reliably on the selected terrain.

## 11.4 Lily Pads

**Title:** Move Across Water  
**Short Text:** Harvest lily pads first, then place them to make a walkway over water.  
**Objective:** Harvest and place one lily pad.  
**Button Label:** Place Lily Pad  
**Completion Text:** Water path extended.  
**More Info:** Lily pads let players reshape movement across water.

## 11.5 Skills

**Title:** Hero Skills  
**Short Text:** Skills can improve how heroes perform tasks. This system is still evolving.  
**Objective:** Open the skills panel.  
**Button Label:** View Skills  
**Completion Text:** Skills reviewed.  
**More Info:** Skills should help heroes feel valuable without making high-level players unbeatable.

---

# Phase 12 — Multiplayer and Long-Term Systems

## 12.1 Shared Worlds

**Title:** Shared Worlds  
**Short Text:** Later, players may build in shared worlds, personal worlds, or friend worlds.  
**Objective:** Read multiplayer overview.  
**Button Label:** Learn Multiplayer  
**Completion Text:** Multiplayer overview complete.  
**More Info:** Shared worlds need rules for ownership, cooperation, borders, and conflict.

## 12.2 Friends Helping

**Title:** Let Friends Help  
**Short Text:** Friends may be allowed to work on your tiles without owning them.  
**Objective:** Optional: invite a friend when available.  
**Button Label:** Invite Friend  
**Completion Text:** Friend access enabled.  
**More Info:** Permissions should be clear: work allowed, build allowed, spend resources allowed, or view only.

## 12.3 Open and Closed Borders

**Title:** Choose Your Risk  
**Short Text:** Closed borders keep you safe but limit expansion. Open borders allow expansion, attack, and conquest.  
**Objective:** Choose border mode when feature is available.  
**Button Label:** Choose Borders  
**Completion Text:** Border mode selected.  
**More Info:** This gives new players time to build safely before entering competitive territory.

## 12.4 Defend and Conquer

**Title:** Defend Your Land  
**Short Text:** In battle mode, borders, watchtowers, walls, and military settlers protect your land.  
**Objective:** Build defenses when battle mode is available.  
**Button Label:** Build Defenses  
**Completion Text:** Border defense started.  
**More Info:** Combat should depend on economy and logistics, not only hero level.

## 12.5 Assets and Heroes

**Title:** Bring Your Heroes  
**Short Text:** Players may select up to four owned heroes or rented heroes before entering a world.  
**Objective:** Select hero loadout when available.  
**Button Label:** Select Heroes  
**Completion Text:** Hero loadout ready.  
**More Info:** Asset XP can make heroes more useful, but should not guarantee victory.

---

## 5. Contextual Advice Button Content

The advice button should answer: **“What should I do next?”**

## If Wood Is Low
**Advice:** You are low on wood. Explore near forests or chop visible forest tiles.

## If Food Is Low
**Advice:** Food is low. Hunt in forests now, then improve food production with docks, farms, hunter huts, or bakeries.

## If Population Is Not Growing
**Advice:** Population needs both beds and food. Build houses for beds and store more food.

## If Beds Are Full
**Advice:** You have no free beds. Build another house or upgrade housing when available.

## If Food Production Is Negative
**Advice:** Your settlers eat more than you produce. Add food jobsites, hunt, or slow population growth.

## If a Build Task Is Waiting
**Advice:** This task is waiting for materials. Check the required resources and gather more.

## If a Tile Is Out of Reach
**Advice:** This tile is outside your reach. Build a watchtower near the edge or later build another town center.

## If Buildings Are Offline
**Advice:** Some buildings need maintenance. Keep idle settlers available and store wood or stone for repairs.

## If Settlers Are Walking Too Far
**Advice:** Long walks reduce production. Build roads and keep houses, storage, and jobsites close together.

## If Player Has No Clear Objective
**Advice:** Stabilize food, grow population, expand reach, then unlock the next production chain.

## If Player Is Expanding Too Fast
**Advice:** You are discovering more land than you can support. Stabilize food, population, and repairs before expanding further.

## If Player Has Grain but No Granary
**Advice:** Build a granary on a grain field. Surround it with grain fields for better output.

## If Player Has Ore
**Advice:** Use ore to unlock toolmaking. Tools lead to libraries, upgrades, and new town centers.

## If Player Has Sand
**Advice:** Sand can become glass with an oven. Glass is useful for advanced housing upgrades.

---

## 6. Warning and Alert Content

## Low Food Warning
**Title:** Food Is Low  
**Text:** Your settlers may starve soon. Hunt, fish, or harvest food now.

## Starvation Alert
**Title:** A Settler Starved  
**Text:** Food ran out and your population dropped. Restore food production before growing again.

## Missing Materials
**Title:** Waiting for Materials  
**Text:** This task needs more resources before it can continue.

## No Beds
**Title:** No Free Beds  
**Text:** Build or upgrade houses before more settlers can join.

## No Idle Settlers
**Title:** No Repair Workers  
**Text:** All settlers are busy. Keep at least one idle settler for repairs.

## Building Offline
**Title:** Building Offline  
**Text:** This building needs maintenance before it can work again.

## Tile Out of Reach
**Title:** Out of Reach  
**Text:** Build a watchtower or town center closer to this tile.

## Path Blocked
**Title:** Path Blocked  
**Text:** Workers cannot reach this area. Leave clear paths around buildings.

## Population Growing Too Fast
**Title:** Growth Warning  
**Text:** Your population is growing, but food production may not support it.

## Mine Depleted
**Title:** Mine Depleted  
**Text:** This mine has run out of ore. Search for another mountain range.

---

## 7. Suggested First-Run Tutorial Sequence

This should be the default new-player path:

1. Welcome to your settlement.
2. Claim a hero.
3. Explore one unknown tile.
4. Find forest.
5. Chop wood.
6. Build first house.
7. Hunt for food.
8. Explore toward water.
9. Build dock.
10. Grow population to 4.
11. Dig grassland near water.
12. Prepare land.
13. Seed crop.
14. Harvest grain.
15. Build granary.
16. Build watchtower.
17. Build road.
18. Find mountains.
19. Mine ore.
20. Build toolshop.
21. Learn maintenance.
22. Run self-sustaining check.
23. Tutorial complete; advice button takes over.

---

## 8. Implementation Notes

## Tutorial Data Structure

Recommended structure:

```json
{
  "id": "build_first_house",
  "phase": "early_survival",
  "title": "Build Your First House",
  "shortText": "Houses add beds. Beds allow your population to grow when food is available.",
  "objective": "Build one house on a valid plains or buildable tile.",
  "cta": "Build House",
  "completionText": "Your settlement now has more room for settlers.",
  "moreInfo": "Leave paths open around the town center. Heroes and settlers cannot walk through houses.",
  "requirements": [
    { "type": "resource_at_least", "resource": "wood", "amount": 1 },
    { "type": "tile_visible", "terrain": "plains" }
  ],
  "completion": [
    { "type": "building_exists", "building": "house", "amount": 1 }
  ],
  "highlights": [
    { "type": "button", "id": "build_house" },
    { "type": "tile_filter", "terrain": "plains" }
  ],
  "blocksUntilComplete": true,
  "optional": false
}
```

## Tutorial Controller Requirements

The tutorial controller should support:
- Dynamic target selection.
- Tile highlighting.
- Button highlighting.
- Back and Forward navigation.
- Completed-step log.
- Optional expanded explanations.
- Hard gates for first-run basics.
- Soft hints after tutorial completion.
- Contextual advice based on settlement state.
- Mobile-friendly short text.
- Warnings independent of tutorial step.

## Recommended Gates

Hard-gate only the first core loop:
1. Claim hero.
2. Explore.
3. Chop wood.
4. Build house.
5. Hunt food.
6. Find water.
7. Build dock.
8. Start farming.

After that, use softer objectives so the player can explore freely.

## Metrics to Track

Track where players:
- Close the tutorial.
- Get stuck.
- Run out of food.
- Fail to grow population.
- Build houses without food.
- Block paths.
- Build too far from storage.
- Ignore maintenance.
- Click advice.
- Reopen previous tutorial messages.
- Quit before dock/farming/toolshop.

## UX Improvements From Playtest

1. Open the tutorial panel by default on first start.
2. Add forward navigation after using Back.
3. Make the advice button more explicit.
4. Add visible crop timers or progress indicators.
5. Add clearer resource warnings.
6. Add better mobile UI scaling.
7. Highlight recommended tiles.
8. Explain perimeter security before asking for it.
9. Show population requirements clearly.
10. Explain that settlers are automatic.
11. Warn before population grows beyond food supply.
12. Teach roads before travel inefficiency becomes frustrating.
13. Hide broken or unfinished actions from tutorial.
14. Disable unstable debug options for normal testers.
15. Add easy mode for new players.

---

## 9. MVP Tutorial Scope

For the first implementation, build only:

1. Tutorial panel with Back/Forward.
2. Objective tracking for first 12 steps.
3. Tile and button highlights.
4. Contextual advice button.
5. Food, bed, material, reach, and maintenance warnings.
6. Crop progress indicator.
7. Completion state saved per player/world.

Do not include yet:
- Full multiplayer tutorial.
- NFT rental tutorial.
- Battle mode tutorial.
- Skills tutorial.
- Surveying tutorial.
- Saplings tutorial.
- Lily pads tutorial.

These can be added after the core survival tutorial is stable.

---

## 10. Recommended Tutorial Copy Tone

Use a calm, direct, cozy RTS tone:
- “Your settlers need food.”
- “This tile is out of reach.”
- “Build near water to skip irrigation.”
- “Leave space around the town center.”
- “You are safe for now. Stabilize before expanding.”

Avoid vague text:
- “Do the next thing.”
- “Improve your settlement.”
- “Secure the area.”
- “Use resources wisely.”

Prefer explicit text:
- “Build one watchtower near the edge.”
- “Hunt on a forest tile.”
- “Dig grassland next to water.”
- “Store more food before building another house.”

---

## 11. Final Tutorial Completion Message

**Title:** Your Settlement Is Alive  
**Text:** You now know the core loop: explore, gather, build, feed, expand, and stabilize. From here, grow your settlement your way.  
**Objective:** Continue playing.  
**Button Label:** Open Advice  
**Completion Text:** Tutorial complete.  
**More Info:** The advice button will keep helping when food is low, buildings need repairs, or your next production chain is ready.
