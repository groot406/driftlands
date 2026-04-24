# AGENT.md

## Purpose

This file gives Codex a working mental model of the `driftlands` codebase so future changes can improve gameplay without degrading architecture.

The short version:

- `driftlands` is a hex-based colony sandbox prototype.
- The player controls a small party of heroes on a procedurally generated map.
- Heroes explore, gather resources, transform terrain, and build basic infrastructure.
- The current game loop works, but it lacks explicit goals, stakes, and run structure.
- Future work should improve replay value through reusable engine subsystems, not one-off scripted content.

## Current Product Shape

Today the game plays like a relaxing hex sandbox:

- Start at a town center with 4 seeded heroes.
- Reveal undiscovered hexes by exploring outward.
- Queue work on tiles through a contextual task menu.
- Gather wood, ore, food, grain, and water-driven farm inputs.
- Build mines and docks.
- Transform terrain through farming and forestry loops.
- See resources accumulate in a shared warehouse bar.
- Chat with connected players through a lightweight multiplayer layer.

What is missing:

- No win condition.
- No loss condition.
- No explicit objective chain.
- No pressure curve, run scoring, or mid-run pivots.
- Limited reasons to replay different world seeds.

## Architecture Map

### Client

- `src/main.ts`
  Vue bootstrap and global `Escape` handling.
- `src/App.vue`
  Title screen vs in-game scene swap.
- `src/components/*`
  UI and canvas host components.
- `src/core/*`
  Rendering, camera, world helpers, audio, pathfinding, client routing.
- `src/store/*`
  Reactive local state for UI, heroes, tasks, resources, chat, sound.

### Shared

- `src/shared/protocol.ts`
  Socket message contracts.
- `src/shared/tasks/*`
  Task registry and task definitions. This is the main gameplay content layer today.

### Server

- `server/src/index.ts`
  Express + Socket.IO server bootstrap.
- `server/src/tick.ts`
  Tick engine with deterministic RNG support.
- `server/src/systems/*`
  Per-tick systems: movement, tasks, growth.
- `server/src/handlers/*`
  Message handlers for join/world/movement/tasks.

## Important Reality About The Current Split

The repo is in the middle of a server-authoritative transition, but it is not cleanly split yet.

The server currently imports and mutates modules under `src/`, including:

- world state from `src/core/world.ts`
- heroes from `src/store/heroStore.ts`
- tasks from `src/store/taskStore.ts`
- resources from `src/store/resourceStore.ts`
- task logic from `src/shared/tasks/tasks.ts`

So the codebase should be understood as:

- authoritative tick loop on the server
- partially shared domain logic across client and server
- client still holding data structures that the server reuses directly

This is workable for now, but it is the main architectural risk.

## Core Gameplay Systems

### World And Terrain

- Hex axial coordinates.
- Procedural terrain generation in `src/core/world.ts` and `src/core/terrain.ts`.
- Biome-weighted terrain selection in `src/core/biomes.ts`.
- Terrain definitions in `src/core/terrainDefs.ts`.
- Variant aging and growth in `src/core/growth.ts` and `src/core/variants.ts`.

Notable terrain/resource loops:

- `forest` -> `chopped_forest` -> `young_forest` -> forest regrowth
- `plains`/`dirt` -> tilled dirt -> irrigated dirt -> `grain` -> harvested back to `dirt`
- `mountain` -> mine built -> ore production
- `water` -> water lily harvest / dock building

Note:

- The desert terrain key is spelled `dessert` in code. Preserve existing naming unless doing a deliberate refactor.

### Heroes

- Seeded in `src/store/heroStore.ts`.
- Each hero has basic stats: `xp`, `hp`, `atk`, `spd`.
- Movement path/timing lives on the hero model.
- Heroes can carry temporary payloads for warehouse and task-resource delivery.
- Hero selection is UI-driven through `src/store/uiStore.ts`.

### Tasks

Tasks are the current gameplay backbone.

Registry:

- `src/shared/tasks/taskRegistry.ts`
- `src/shared/tasks/taskDefinitions.ts`

Execution:

- `src/store/taskStore.ts`
- `server/src/systems/taskSystem.ts`

Current task families:

- Exploration: `explore`
- Forestry: `chopWood`, `plantTrees`, `removeTrunks`
- Terrain cleanup: `clearRocks`, `breakDirtRock`
- Farming: `tillLand`, `irregateDirtTask`, `seedGrain`, `harvestGrain`
- Industry: `buildMine`, `mineOre`, `buildDock`
- Water foraging: `harvestWaterLilies`

Important behavior:

- Tasks are tile-based and can be joined by multiple heroes.
- Some tasks request prerequisite resources and trigger fetch/deliver loops.
- Some tasks support cluster chaining across adjacent same-terrain tiles.
- Task definitions mix content rules, terrain mutation, rewards, and some audio hooks.

### Rendering And Input

- Main renderer is canvas-based in `src/core/HexMapService.ts`.
- Camera and pointer interaction live in `src/core/camera.ts`.
- Pathfinding lives in `src/core/PathService.ts`.
- Tile task menu is opened from `src/components/HexMap.vue`.

### Audio

- `src/core/soundService.ts` handles positional audio and music state.
- `src/core/musicManager.ts` handles title music and in-game playlist behavior.
- Sound settings are persisted client-side.

### Multiplayer

- Socket.IO client in `src/core/socket.ts`
- Client router in `src/core/messageRouter.ts`
- Server router in `server/src/messages/messageRouter.ts`
- Online player list and chat UI exist today.

## Current UX Notes

Controls and affordances that matter:

- Click hero portrait or hero sprite to select.
- Number keys `1-9` select heroes.
- Bracket keys `[` and `]` cycle heroes in `Game.vue`.
- `Tab` toggles helper/debug controls in `GameGui.vue`.
- Click tile to move or open tasks.
- Drag to pan camera.
- `Escape` opens or closes the in-game menu.
- Online player button opens chat/player modal.

Known rough edges:

- Control responsibilities have been improving, but shortcuts still need regular UX review as playtest controls move in and out of the helper menu.
- Debug/helper interactions are mixed with gameplay input.
- The task layer carries most of the design weight, so the game feels systemic but aimless.

## Architectural Guidance For Future Work

When making changes, prefer these rules:

1. Build reusable subsystems before adding bespoke content.
   Good examples: objective system, run state, event system, save snapshots, content registries, reward pipelines.

2. Keep task definitions declarative where possible.
   Move orchestration, fetch logic, and shared lifecycle behavior into reusable systems instead of duplicating task-specific code.

3. Continue the server-authoritative cleanup.
   The end state should be:
   - server owns mutable game state
   - shared folder owns pure contracts and shared data definitions
   - client stores become projections, not the source of truth

4. Separate engine code from game content.
   Engine examples:
   - objective tracking
   - events
   - progression
   - map modifiers
   - save/load
   Content examples:
   - biome-specific tasks
   - objectives
   - events
   - hero perks

5. Prefer data-driven registries.
   If a new mechanic could become a family of mechanics later, give it a registry or definition layer early.

6. Avoid strengthening bad boundaries.
   Do not add more `server -> src/store/*` coupling unless it is the smallest temporary step and there is no clean alternative.

## Recommended Product Direction

To make the game more fun, the best next step is not "more random tasks". It is a run structure.

Recommended north star:

- A session-based frontier colony game with explicit objectives, escalating pressure, and seed-driven replayability.

The first high-value subsystem to add is:

- `ObjectiveSystem`

That system should support:

- primary win objectives
- optional side objectives
- progress tracking
- rewards/unlocks
- run summary and score
- biome/world-seed modifiers

Use existing verbs first:

- explore
- harvest wood
- build a mine
- irrigate and plant crops
- gather food
- build a dock

This lets the game gain goals without throwing away current content.

## Good Near-Term Milestone

Implement a first "Founding Expedition" run mode:

- Generate 3-5 objectives per seed.
- Win by completing a required set before a pressure timer or season limit.
- Score the run by time, explored radius, heroes kept busy, and resources banked.
- Add one world mutator per run for replay value.

This gives:

- clear goals
- better pacing
- replayable seeds
- a reason to optimize and experiment

## Files To Read First Next Time

If a future task touches gameplay or architecture, read these first:

- `src/core/world.ts`
- `src/core/terrainDefs.ts`
- `src/store/taskStore.ts`
- `src/shared/tasks/taskDefinitions.ts`
- `src/shared/protocol.ts`
- `server/src/index.ts`
- `server/src/tick.ts`
- `server/src/handlers/movementHandler.ts`
- `TODO.md`
