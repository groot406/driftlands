# HexMap Renderer Architecture

## Current compatibility surface
- `HexMapService.init(canvas, container)`
- `HexMapService.destroy()`
- `HexMapService.resize()`
- `HexMapService.draw(opts, frameTimes?)`
- `HexMapService.pickTile(screenX, screenY)`
- `HexMapService.pickHero(screenX, screenY)`

## Existing side effects carried by the wrapper
- Owns canvas and offscreen surface setup.
- Loads and caches tile and hero assets.
- Publishes render debug state.
- Reads camera state, world tiles, hero store, task store, graphics settings, and render feature overrides.
- Handles picking against current projection and hero masks.

## Migration notes
- `camera.ts` remains the app-facing owner of interactive camera movement.
- `MapViewport` owns canvas size, DPR, and viewport snapshots for rendering.
- `HexProjection`, `VisibilityMath`, and `MapPicker` are the new shared math/picking layer.
- `RenderSceneBuilder` becomes the only place that interprets gameplay state into render DTOs.
- `HexMapRenderer` introduces pass orchestration without forcing a big-bang rewrite of draw internals.
