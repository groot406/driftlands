# Game Visual Immersion Design

Date: 2026-06-10
Status: Expanded design direction after updated objective

## Summary

Make Driftlands feel more visually attractive and immersive by turning the current hex map from a flat canvas presentation into a layered cozy living diorama. The first pass should stay inside the existing client renderer and improve the playfield with biome-reactive background color, foreground/background atmosphere, dynamic light/weather moods, deeper cloud behavior, clearer tile depth, and richer ambient motion that can cross tile boundaries.

The approved direction is "Cozy Living Diorama With Depth": warm, readable, animated, and alive, with enough layered atmosphere to make the world feel spacious rather than decorative.

## Goals

- Make the first visible map frame feel richer by adding a rendered backdrop behind the hex world.
- Make the backdrop respond to the terrain currently visible to the camera: lush, water, cold, warm, stone, and ember moods.
- Add clear foreground/background layer concepts so the map has more visual depth.
- Strengthen immersion with subtle dynamic lighting, glints, cloud movement, weather-like ambience, drifting particles, birds, and terrain-specific motion.
- Improve existing cloud systems rather than adding an unrelated weather engine.
- Add global map atmosphere that can drift across multiple tiles, not only tile-local particles.
- Preserve map readability for tasks, reach overlays, heroes, settlers, buildings, and tile selection.
- Preserve the existing render quality gates so lower-end browsers still get a clean and stable map.
- Avoid gameplay, server, protocol, save-data, and world-generation changes.

## Non-Goals

- No new gameplay mechanics.
- No changes to tile ownership, settlement support, pathfinding, task availability, or simulation state.
- No new external asset pipeline requirement.
- No redesign of menus, modals, or HUD layout.
- No replacement of the existing canvas renderer.
- No server-authored weather simulation in this pass.

## Current Context

The client already has a modular canvas renderer:

- `HexMapService` owns canvas setup, assets, frame construction, pass orchestration, particles, and legacy draw helpers.
- `HexMapRenderer` runs named render passes.
- `RenderSceneBuilder` translates visible gameplay state into render DTOs.
- `BackdropPass` already calls `BackdropRenderer.render(frame)`.
- `BackdropRenderer` already has terrain mood sampling helpers, but its `render()` method is empty.
- `PeacefulAtmosphereEffect`, `CloudShadowEffect`, `ParticleRenderer`, tile relief, bloom, vignette, and render quality profiles already exist.
- The renderer already has separate terrain, overlay, entity, particle underlay, particle overlay, effect, and final composite surfaces.
- Existing ambient particle code already includes tile-local particles and bird flocks, so cross-tile ambience can build from established paths.

This makes the first immersive upgrade a renderer-only change rather than a broad app rewrite.

## Architecture

### Layer Model

Treat the rendered map as four readable visual bands:

- **Background:** biome-reactive backdrop, far light, sky/ground wash, soft vignette.
- **World surface:** terrain, tile relief, roads, buildings, and gameplay overlays.
- **Living midground:** entities, local tile particles, water ripples, leaves, smoke, and task/resource motion.
- **Foreground atmosphere:** sparse screen/world-spanning wind, mist, snow, pollen, ash, sand, and cloud-light traces that pass over several tiles without hiding gameplay.

The implementation should express this with existing surfaces where possible:

- `BackdropRenderer` for background.
- `CloudShadowEffect` for background/midground light and moving shadow depth.
- `ParticleRenderer` underlay/overlay layers for local and global atmospheric particles.
- `CompositeRenderer` ordering for whether atmosphere appears below or above entities.

Do not put UI or gameplay overlays behind visual atmosphere that would make them hard to read.
Avoid placing the new global atmosphere in `effectSurface`; it has special cloud-only compositing behavior and can accidentally move clouds or lighting above entities. The particle surfaces already provide the right depth slots for cross-tile ambience.

### Atmosphere Mood

Introduce a small client-side atmosphere mood concept derived from visible discovered terrain, current render time, camera position, and quality profile. It should not be saved or sent over the network.

The mood should provide:

- terrain weights: lush, water, cold, warm, stone, ember,
- light color accents for backdrop and glints,
- a weather flavor such as clear, breezy, mist, snow, sand, ash, or warm haze,
- intensity values for clouds and global particles.

This can live as pure helpers near the render effects so it is easy to test without a browser.

### Backdrop Renderer

Implement `BackdropRenderer.render(frame)` as the main new visual layer. It should draw directly into `frame.finalCtx` after `prepareFinalFrame(frame)` clears the final canvas and before terrain is composited.

Responsibilities:

- Fill the full canvas with a soft base gradient.
- Sample visible discovered terrain through the existing palette weight cache.
- Blend the base gradient from the current terrain mood:
  - lush for plains, forest, grain, and town edges,
  - water for lakes and coastlines,
  - cold for snow and colder water,
  - warm for grain, desert, dirt, and town centers,
  - stone for mountain and rough terrain,
  - ember for volcano tiles.
- Draw low-alpha radial glows around the map center and visible-world bounds.
- Draw a soft edge vignette that responds to the current camera vignette bias.
- Keep low quality restrained and high quality richer.

The backdrop should remain abstract and atmospheric. It should not look like a separate painted scene behind the map; it should feel like light and air wrapping the current island.

### Layered Clouds

Improve `CloudShadowEffect` rather than replacing it.

Responsibilities:

- Keep the existing morphing noise texture cache.
- Add more depth through two cloud scales: broad soft cloud shadows and a subtler detail layer.
- Let cloud opacity and drift feel connected to the visible mood: wetter/colder views can feel mistier, desert views can feel clearer or dusty, volcano views can get warmer ash haze.
- Keep clouds below entities when possible and never obscure selected tiles, paths, or task highlights.
- Preserve low-quality behavior by reducing cloud layers and avoiding filter-heavy work.

### Dormant Atmosphere Hooks

`PeacefulAtmosphereEffect` and `FogShimmerEffect` are useful future hooks, but they should not be wired in this pass unless their composite order is explicit and verified. This first pass should get dynamic light and weather feel from the backdrop, cloud depth, and particle underlay/overlay layers.

### Global Atmospheric Particles

Add cross-tile map atmosphere by extending the existing particle path rather than creating a separate system.

Responsibilities:

- Keep tile-local particles for ripples, leaves, pollen, town sparks, snow, sand, and volcano smoke.
- Add global particles that spawn from visible-world or viewport bounds and drift across several tiles.
- Use underlay particles for mist/light haze behind actors and overlay particles for rare foreground flakes, ash, wind streaks, or pollen.
- Make weather flavor terrain-driven: snow fields bias toward drifting snow, desert toward sand sheets, water/forest toward mist/pollen, volcano toward ash/embers.
- Keep particles sparse, budgeted, and disabled when the existing particle/quality gates disable them.

### Ambient Particles

Use the existing particle path in `HexMapService` and `ParticleRenderer`.

Responsibilities:

- Slightly enrich existing terrain-specific particle behavior rather than adding a separate particle system.
- Keep water ripples, forest leaves, grain pollen, town sparkles, snow, desert sand, volcano smoke, and birds readable and sparse.
- Avoid particle spam during camera movement or in low quality.
- Respect `graphicsStore.particles`, particle budget, and render feature overrides.

### Tile Depth And Readability

Do not change gameplay overlays. Improve immersion only if it does not hide important information.

Responsibilities:

- Preserve existing tile relief and bottom-edge rendering.
- Avoid making fog, reach outlines, task highlights, support overlays, and selected tiles harder to read.
- Keep hero, settler, and building sprites visually above the atmospheric treatment.

## Data Flow

1. `HexMapService.draw()` creates the render frame and pass context.
2. `BackdropPass` prepares the final canvas and calls `BackdropRenderer.render(frame)`.
3. Atmosphere helpers sample `frame.visibleTiles`, `frame.effectNowMs`, `frame.viewport`, `frame.cameraFx`, and `frame.quality`.
4. `BackdropRenderer`, `CloudShadowEffect`, and global particle spawning use that derived mood.
5. Terrain, overlays, entities, particles, effects, debug, and final composite continue through the existing pass order.
6. Render debug state continues to report active quality and feature settings.

No server data or persistent state changes are required.

## Error Handling And Degradation

- If there are no visible discovered tiles, draw a neutral soft backdrop.
- If canvas dimensions are zero or invalid, return without drawing.
- If quality is low, render a cheaper backdrop with fewer glows and no expensive decorative layers.
- If browser-light rendering disables expensive atmosphere, the backdrop remains lightweight and static enough to avoid compositor stress.
- If particles are disabled, the backdrop and tile rendering still provide a visible improvement.
- If global atmosphere cannot spawn because there are no discovered bounds, keep local particle behavior unchanged.
- If cloud layers are disabled, global particles and backdrop should still make the map feel deeper.
- If dormant effects such as `PeacefulAtmosphereEffect` or `FogShimmerEffect` are considered, they must not be wired unless their composite order is explicit and verified.

## Testing

Automated checks:

- Add targeted unit tests for atmosphere mood, backdrop palette, and color-helper behavior.
- Add or update focused tests for global particle layer decisions and cloud quality gates where practical.
- Run the existing render, particle, cloud, and quality tests affected by the changes.
- Run `npm run build` or the closest available project validation command.

Manual visual checks:

- Start the local game.
- Confirm the map has a visible biome-reactive backdrop behind terrain.
- Confirm there is a perceptible background/world/foreground depth difference.
- Pan across water, plains, forest, mountain, snow, desert, and volcano regions if available.
- Confirm cloud movement feels deeper and does not flatten into a single repeating shadow layer.
- Confirm global atmosphere crosses tile boundaries instead of appearing only as isolated tile particles.
- Confirm overlays, tile selection, path preview, heroes, settlers, buildings, and text indicators remain readable.
- Confirm low/light rendering mode does not show heavy atmosphere or particle overload.

## Acceptance Criteria

- `BackdropRenderer.render()` visibly paints a non-empty backdrop behind the map.
- Backdrop colors change based on the discovered terrain visible to the camera.
- Background, world, and foreground atmosphere layers create more depth than the current flat map.
- Dynamic lighting/weather mood changes are visible but subtle.
- Existing clouds look improved through depth, drift, or mood-responsive intensity.
- Global atmospheric particles can drift across multiple tiles in normal/high quality.
- Atmosphere and particles feel richer without overwhelming the map.
- Low quality and browser-light modes remain visually stable and cheaper.
- No gameplay state, server protocol, or save data changes are introduced.
- The project builds or otherwise passes the selected validation command.
- A local rendered check confirms the map is more attractive and immersive than before.

## Implementation Notes

- Prefer small helpers inside `BackdropRenderer` for color mixing, weighted palette conversion, and glow drawing.
- Reuse `GROWTH_HYBRID_STYLE.backdrop` and `EffectUtils` helpers rather than inventing unrelated color constants.
- Keep generated colors deterministic from visible terrain and time; avoid random flicker in the backdrop.
- Prefer shared pure atmosphere helpers if backdrop, clouds, and particles need the same mood.
- Keep `effectSurface` changes conservative; use particle underlay/overlay for global atmosphere in this pass.
- Keep the changes scoped to renderer and visual settings unless implementation reveals a necessary small supporting extraction.
