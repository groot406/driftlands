# Game Visual Immersion Design

Date: 2026-06-10
Status: Approved design direction, pending spec review

## Summary

Make Driftlands feel more visually attractive and immersive by turning the current hex map from a flat canvas presentation into a cozy living diorama. The first pass should stay inside the existing client renderer and improve the playfield with biome-reactive background color, soft atmospheric light, clearer tile depth, and richer ambient motion.

The approved direction is "Cozy Living Diorama": warm, readable, animated, and alive without becoming noisy or dramatic.

## Goals

- Make the first visible map frame feel richer by adding a rendered backdrop behind the hex world.
- Make the backdrop respond to the terrain currently visible to the camera: lush, water, cold, warm, stone, and ember moods.
- Strengthen immersion with subtle breathing light, glints, drifting particles, birds, and terrain-specific ambience.
- Preserve map readability for tasks, reach overlays, heroes, settlers, buildings, and tile selection.
- Preserve the existing render quality gates so lower-end browsers still get a clean and stable map.
- Avoid gameplay, server, protocol, save-data, and world-generation changes.

## Non-Goals

- No new gameplay mechanics.
- No changes to tile ownership, settlement support, pathfinding, task availability, or simulation state.
- No new external asset pipeline requirement.
- No redesign of menus, modals, or HUD layout.
- No replacement of the existing canvas renderer.

## Current Context

The client already has a modular canvas renderer:

- `HexMapService` owns canvas setup, assets, frame construction, pass orchestration, particles, and legacy draw helpers.
- `HexMapRenderer` runs named render passes.
- `RenderSceneBuilder` translates visible gameplay state into render DTOs.
- `BackdropPass` already calls `BackdropRenderer.render(frame)`.
- `BackdropRenderer` already has terrain mood sampling helpers, but its `render()` method is empty.
- `PeacefulAtmosphereEffect`, `CloudShadowEffect`, `ParticleRenderer`, tile relief, bloom, vignette, and render quality profiles already exist.

This makes the first immersive upgrade a renderer-only change rather than a broad app rewrite.

## Architecture

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

### Peaceful Atmosphere

Tune `PeacefulAtmosphereEffect` only where it supports the cozy living diorama direction.

Responsibilities:

- Keep the existing breathing wash subtle.
- Let high quality show more visible sun shafts and living glints.
- Keep medium quality softer.
- Avoid adding atmosphere in modes where expensive effects are disabled.

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
3. `BackdropRenderer` samples `frame.visibleTiles`, `frame.effectNowMs`, `frame.viewport`, `frame.cameraFx`, and `frame.quality`.
4. Terrain, overlays, entities, particles, effects, debug, and final composite continue through the existing pass order.
5. Render debug state continues to report active quality and feature settings.

No server data or persistent state changes are required.

## Error Handling And Degradation

- If there are no visible discovered tiles, draw a neutral soft backdrop.
- If canvas dimensions are zero or invalid, return without drawing.
- If quality is low, render a cheaper backdrop with fewer glows and no expensive decorative layers.
- If browser-light rendering disables expensive atmosphere, the backdrop remains lightweight and static enough to avoid compositor stress.
- If particles are disabled, the backdrop and tile rendering still provide a visible improvement.

## Testing

Automated checks:

- Add targeted unit tests for backdrop palette or color-helper behavior if helpers are extracted from `BackdropRenderer`.
- Run the existing render and quality tests affected by the changes.
- Run `npm run build` or the closest available project validation command.

Manual visual checks:

- Start the local game.
- Confirm the map has a visible biome-reactive backdrop behind terrain.
- Pan across water, plains, forest, mountain, snow, desert, and volcano regions if available.
- Confirm overlays, tile selection, path preview, heroes, settlers, buildings, and text indicators remain readable.
- Confirm low/light rendering mode does not show heavy atmosphere or particle overload.

## Acceptance Criteria

- `BackdropRenderer.render()` visibly paints a non-empty backdrop behind the map.
- Backdrop colors change based on the discovered terrain visible to the camera.
- Atmosphere and particles feel richer in normal/high quality without overwhelming the map.
- Low quality and browser-light modes remain visually stable and cheaper.
- No gameplay state, server protocol, or save data changes are introduced.
- The project builds or otherwise passes the selected validation command.
- A local rendered check confirms the map is more attractive and immersive than before.

## Implementation Notes

- Prefer small helpers inside `BackdropRenderer` for color mixing, weighted palette conversion, and glow drawing.
- Reuse `GROWTH_HYBRID_STYLE.backdrop` and `EffectUtils` helpers rather than inventing unrelated color constants.
- Keep generated colors deterministic from visible terrain and time; avoid random flicker in the backdrop.
- Keep the changes scoped to renderer and visual settings unless implementation reveals a necessary small supporting extraction.
