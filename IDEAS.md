# IDEAS.md

## Goal

Turn `Driftlands` from a pleasant sandbox into a replayable run-based strategy game without losing its systemic, engine-friendly foundation.

## Recommended Direction

The best next product move is:

- add explicit objectives and run structure on top of the existing task economy

The game already has good verbs:

- explore
- chop wood
- build a mine
- irrigate land
- plant and harvest grain
- gather food
- build a dock

What it lacks is context for why the player is doing those things.

## Best First Milestone: Founding Expedition Mode

Pitch:

- Each world seed generates a "charter" with 3-5 objectives.
- The player wins by completing the charter before a deadline.
- The world gets one or two mutators that change priorities.
- Runs end with a score screen.

Example objectives using current mechanics:

- Explore 40 tiles
- Stockpile 30 wood
- Build 1 mine
- Deliver 20 ore
- Harvest 15 food
- Plant and harvest 10 grain
- Build 1 dock

Good pressure sources:

- soft season timer
- supply decay
- morale deadline
- incoming expedition ship that arrives on a fixed day

Why this is the best first step:

- reuses existing systems
- creates a clear win condition
- supports replayable seeds
- gives the player prioritization problems
- opens space for score chasing and difficulty levels

## Gameplay Ideas

### P0: Goals, stakes, and replay value

- Add a run-level `ObjectiveSystem` with primary and optional goals.
- Add a `RunState` with win, loss, timer, score, and seed metadata.
- Add world mutators such as drought, overgrowth, sparse ore, fertile plains, frozen frontier.
- Add a post-run summary screen with score breakdown.
- Add difficulty presets that mostly tune objectives and pressure, not raw click speed.

### P1: Better decisions inside a run

- Give heroes distinct specialties so roster choice matters.
- Add limited hero stamina or morale so the player rotates labor.
- Add task priority queues so the player can plan runs instead of micromanaging every tile.
- Add warehouse demand goals so stockpiling the wrong things has opportunity cost.
- Add biome-specific opportunities so route planning matters.

### P1: Make exploration matter

- Add points of interest hidden in unexplored tiles.
- Add relic caches or abandoned camps that reward specific expansion paths.
- Add rare terrain chains that only appear under certain world seeds.
- Add one-off discovery events that force meaningful choices.

### P1: Add pacing and tension

- Add seasonal shifts that affect movement, crop growth, or resource availability.
- Add weather events such as drought, flood, frost, ashfall, or high winds.
- Add upkeep costs for a growing settlement.
- Add expedition deadlines that force the player to balance greed and survival.

### P2: Mid- and long-term systems

- Add blueprint unlocks and tech-style progression between runs.
- Add factions, caravans, or visitors that create demand and trade opportunities.
- Add map hazards and route blockers that encourage docks, roads, or specialized tools.
- Add enemy pressure only after the economy/objective loop is strong enough to support it.

## Engine / Subsystem Ideas

These are the reusable systems worth building because they support many future features.

### ObjectiveSystem

Responsibilities:

- register objective definitions
- generate seed-based objectives
- track progress from game events
- emit completion rewards
- support optional and chained goals

### RunState

Responsibilities:

- seed, difficulty, mutators
- timer and season clock
- score calculation
- win/loss conditions
- end-of-run summary data

### EventSystem

Responsibilities:

- subscribe to gameplay events
- roll deterministic world events
- trigger biome or season reactions
- notify objectives and UI

### Content Registry Layer

Responsibilities:

- data-driven objectives
- world mutators
- hero classes/perks
- points of interest
- event definitions

### Save / Snapshot System

Responsibilities:

- persist server state
- allow resume
- support run summary history
- prepare for desync recovery

## Architecture Ideas

### High priority cleanup

- Move authoritative mutable state into `server/src/state`.
- Keep `src/shared` for pure contracts and shared data types only.
- Convert client stores into projections fed by server snapshots and diffs.
- Stop growing server imports that reach into `src/store/*`.

### Task system cleanup

- Split task definitions into data plus reusable lifecycle hooks.
- Move resource-fetch logic out of task-specific code paths into a generic logistics layer.
- Add explicit gameplay events for task started, progressed, completed, and canceled.
- Make task rewards and terrain mutation easier to compose and test.

### World/system cleanup

- Introduce a single authoritative world service on the server.
- Separate procedural generation, terrain mutation, and discovery progression more clearly.
- Add tests around world generation invariants and task preconditions.
- Add deterministic seed coverage tests for key content systems.

## Concrete Backlog Candidates

- [ ] Add `ObjectiveSystem` and a visible objective panel in the HUD.
- [ ] Add `RunState` with a simple expedition deadline and victory screen.
- [ ] Add 8-12 data-driven objective definitions built from existing tasks.
- [ ] Add world mutators selected from seed or difficulty.
- [ ] Add a score formula and end-of-run summary.
- [ ] Add hero roles or perks so team composition matters.
- [ ] Add points of interest discovered through exploration.
- [ ] Add seasonal or weather pressure.
- [ ] Move authoritative world state out of `src/` and into server state modules.
- [ ] Add automated tests for objectives, task completion, and run outcomes.

## Things To Avoid

- Avoid adding lots of isolated tasks without a progression layer.
- Avoid hardcoding one story script that the engine cannot reuse.
- Avoid making the client more authoritative while the server refactor is in progress.
- Avoid feature work that deepens `server -> src/store/*` coupling unless it is a small temporary step.

