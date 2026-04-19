# Driftlands Tile Image Generation Brief

For player-facing building art, use
[`docs/art/building-pixel-art-pipeline.md`](./building-pixel-art-pipeline.md)
instead. That pipeline is true pixel art, uses built-in image generation by
default, and includes deterministic post-processing plus contact sheets.

This brief packages the current terrain art direction into a concrete `imagegen` handoff for two goals:

- improve the most visible live tiles without overwriting existing assets
- add a small batch of new decorative variants that fit the current biome system

## Style Lock

Use these constraints for every tile prompt:

- Output format: `64x64` PNG game tile
- View: top-down / slight three-quarter pixel-art hex tile
- Readability: clear at native size, strong silhouette, no muddy micro-detail
- Shape: keep the existing dark clipped-corner hex silhouette, no square background
- Rendering: painterly pixel art, hand-painted clusters, no smooth AI airbrush finish
- Palette: slightly muted natural colors with warm highlights and cool shadows
- Integration: match the current tile set in contrast and camera angle
- Cleanliness: no text, no logos, no watermark, no UI framing

For edit-style improvements, preserve these invariants:

- change only the tile artwork, not the tile framing
- keep the same footprint, perspective, and gameplay readability
- do not add tall props that would require a new overlay unless explicitly requested
- keep edges blend-friendly so the tile still tessellates visually with the biome

## Priority Batch

### Improve Existing Live Tiles

These are the highest-value repaint targets because they are broad base tiles or especially visible state tiles:

1. `src/assets/tiles/water.png` -> `src/assets/tiles/water-v2.png`
2. `src/assets/tiles/snow.png` -> `src/assets/tiles/snow-v2.png`
3. `src/assets/tiles/mountains.png` -> `src/assets/tiles/mountains-v2.png`
4. `src/assets/tiles/vulcano.png` -> `src/assets/tiles/vulcano-v2.png`
5. `src/assets/tiles/towncenter.png` -> `src/assets/tiles/towncenter-v2.png`
6. `src/assets/tiles/grain.png` -> `src/assets/tiles/grain-v2.png`

Optional paired overlay refreshes if the repaints shift depth or lighting:

- `src/assets/tiles/mountains_overhang.png` -> `src/assets/tiles/mountains_overhang-v2.png`
- `src/assets/tiles/vulcano_overhang.png` -> `src/assets/tiles/vulcano_overhang-v2.png`
- `src/assets/tiles/towncenter_overlay.png` -> `src/assets/tiles/towncenter_overlay-v2.png`
- `src/assets/tiles/grain_overhang.png` -> `src/assets/tiles/grain_overhang-v2.png`

### Add New Decorative Variants

These fit the current climate-driven decorative system and expand biome variety without touching gameplay logic:

1. `src/assets/tiles/plains_clover.png`
2. `src/assets/tiles/forest_mushrooms.png`
3. `src/assets/tiles/water_foam.png`
4. `src/assets/tiles/snow_pines.png`
5. `src/assets/tiles/dessert_windcarved.png`
6. `src/assets/tiles/mountains_lichen.png`

Suggested future terrain-def hooks:

- `plains_clover`: `weight: 6`, `minMoisture: 0.52`, `maxRuggedness: 0.38`
- `forest_mushrooms`: `weight: 5`, `minMoisture: 0.62`, `maxTemperature: 0.72`, `maxRuggedness: 0.48`
- `water_foam`: `weight: 4`, `minRuggedness: 0.56`, `minTemperature: 0.42`
- `snow_pines`: `weight: 4`, `maxTemperature: 0.36`, `minRuggedness: 0.28`
- `dessert_windcarved`: `weight: 7`, `minTemperature: 0.58`, `maxMoisture: 0.36`, `maxRuggedness: 0.38`
- `mountains_lichen`: `weight: 5`, `minMoisture: 0.42`, `maxTemperature: 0.68`, `minRuggedness: 0.46`

## Prompt Specs

### Edit 1: Water Base Tile

```text
Use case: precise-object-edit
Asset type: game terrain tile
Primary request: repaint the existing water tile so it reads as calmer shallow blue water with more depth variation and a stronger pixel-art ripple pattern
Input images: Image 1: edit target (/Users/andredegroot/development/driftlands/src/assets/tiles/water.png)
Scene/backdrop: isolated hex water tile, no horizon
Subject: bright turquoise shallows blending into cooler blue depth, subtle ripple bands, a few small highlight streaks
Style/medium: painterly pixel art game tile
Composition/framing: same top-down three-quarter hex tile framing as the source image
Lighting/mood: bright daylight, clean readable shimmer, not glossy
Color palette: turquoise, teal, cool blue, restrained white highlights
Materials/textures: small wavelets, soft depth transitions, crisp pixel clusters
Constraints: change only the water artwork; keep the tile silhouette, perspective, and footprint unchanged; no foam piles; no props; no watermark
Avoid: photorealism, smooth gradients, blurry AI texture, square background
```

### Edit 2: Snow Base Tile

```text
Use case: precise-object-edit
Asset type: game terrain tile
Primary request: repaint the existing snow tile so it has more form, cleaner wind-swept drifts, and stronger cold shadow definition while staying readable at 64x64
Input images: Image 1: edit target (/Users/andredegroot/development/driftlands/src/assets/tiles/snow.png)
Scene/backdrop: isolated snowy hex tile, no horizon
Subject: compacted snow with a few wind-shaped ridges and shallow drift pockets
Style/medium: painterly pixel art game tile
Composition/framing: same top-down three-quarter hex tile framing as the source image
Lighting/mood: crisp winter daylight with cool shadows
Color palette: off-white snow, pale cyan shadows, tiny cool gray accents
Materials/textures: powdery snow, packed drift edges, clean pixel clumps
Constraints: change only the snow artwork; keep silhouette and perspective unchanged; no trees; no rocks; no watermark
Avoid: muddy gray snow, photographic snow crystals, excessive blue cast, smooth airbrushed shading
```

### Edit 3: Mountain Base Tile

```text
Use case: precise-object-edit
Asset type: game terrain tile
Primary request: repaint the existing mountain base tile with clearer rocky planes, better midtone separation, and stronger elevation read from top-down
Input images: Image 1: edit target (/Users/andredegroot/development/driftlands/src/assets/tiles/mountains.png)
Scene/backdrop: isolated rocky mountain hex tile
Subject: layered rock faces, broken stone shelves, a small walkable top surface implied near the center
Style/medium: painterly pixel art game tile
Composition/framing: same framing and footprint as the source image
Lighting/mood: high daylight, rugged but readable
Color palette: slate blue-gray rock with a few warm dust notes
Materials/textures: chipped stone, hard edges, clustered cracks, chunky highlights
Constraints: change only the mountain artwork; keep the footprint and height read compatible with the existing overlay; no snow; no mine entrance; no watermark
Avoid: photoreal cliffs, noisy texture soup, soft edges, exaggerated fantasy crystals
```

### Edit 4: Volcano Base Tile

```text
Use case: precise-object-edit
Asset type: game terrain tile
Primary request: repaint the existing volcano tile so the crater and lava read more clearly at game scale while preserving the current footprint
Input images: Image 1: edit target (/Users/andredegroot/development/driftlands/src/assets/tiles/vulcano.png)
Scene/backdrop: isolated volcanic hex tile
Subject: dark volcanic rock with a brighter central lava fissure and a clearer crater basin
Style/medium: painterly pixel art game tile
Composition/framing: same top-down three-quarter hex tile framing as the source image
Lighting/mood: hot inner glow against dark cooled rock
Color palette: charcoal, deep basalt gray, ember orange, subdued red-orange highlights
Materials/textures: cracked lava crust, ash dust, glowing seam edges
Constraints: change only the volcano artwork; keep silhouette and perspective unchanged; do not add smoke; no extra props; no watermark
Avoid: oversized lava pools, photoreal lava, cartoon fire effects, soft blur
```

### Edit 5: Town Center Base Tile

```text
Use case: precise-object-edit
Asset type: game terrain tile
Primary request: repaint the town center tile so the settlement foundation reads cleaner and more intentional from a distance, with clearer pathing and warmer focal contrast
Input images: Image 1: edit target (/Users/andredegroot/development/driftlands/src/assets/tiles/towncenter.png)
Scene/backdrop: isolated settlement hex tile
Subject: compact central foundation with small roof shapes, packed earth, and a readable settlement core
Style/medium: painterly pixel art game tile
Composition/framing: same framing and tile footprint as the source image
Lighting/mood: warm welcoming daylight
Color palette: warm ochre ground, muted terracotta roofs, weathered wood, small green accents
Materials/textures: packed soil, timber, cloth awnings, stone edging
Constraints: change only the tile artwork; keep the same scale and hero placement compatibility; no flags; no text; no watermark
Avoid: tiny unreadable clutter, isometric building stacks, realistic perspective buildings, square border
```

### Edit 6: Grain Base Tile

```text
Use case: precise-object-edit
Asset type: game terrain tile
Primary request: repaint the grain tile so the crop rows feel fuller, more wind-shaped, and more readable as a harvest-ready field
Input images: Image 1: edit target (/Users/andredegroot/development/driftlands/src/assets/tiles/grain.png)
Scene/backdrop: isolated grain-field hex tile
Subject: dense golden grain tufts with clearer row rhythm and a slightly darker trampled center read
Style/medium: painterly pixel art game tile
Composition/framing: same top-down three-quarter hex tile framing as the source image
Lighting/mood: warm late-summer daylight
Color palette: gold, straw yellow, muted olive shadows, soft brown earth undertones
Materials/textures: dry stalks, clustered heads of grain, subtle wind direction
Constraints: change only the grain artwork; keep the tile footprint and overlay compatibility unchanged; no tools; no sacks; no watermark
Avoid: photoreal wheat, random flowers, muddy brown field, blur
```

### New 1: Plains Clover

```text
Use case: stylized-concept
Asset type: game terrain tile
Primary request: create a new decorative plains tile variant with low clover patches and lush spring grass
Scene/backdrop: isolated grassy hex tile, no horizon
Subject: healthy green grass with small clover clusters and a few lighter meadow breaks
Style/medium: painterly pixel art game tile
Composition/framing: top-down three-quarter hex tile, clean center readability
Lighting/mood: fresh daytime light, bright but grounded
Color palette: spring green, muted yellow-green, small pale clover highlights
Materials/textures: soft grass clumps, low ground cover, readable pixel clusters
Constraints: match Driftlands terrain style; keep edges blend-friendly; no flowers taller than the grass; no watermark
Avoid: realistic botany detail, glossy lawn look, square background
```

### New 2: Forest Mushrooms

```text
Use case: stylized-concept
Asset type: game terrain tile
Primary request: create a new decorative forest tile variant with a damp forest floor and scattered mushrooms
Scene/backdrop: isolated forest-floor hex tile
Subject: deep green ground cover, dark soil pockets, a few small mushrooms tucked into moss and roots
Style/medium: painterly pixel art game tile
Composition/framing: top-down three-quarter hex tile with open center readability
Lighting/mood: cool shaded woodland light
Color palette: moss green, earthy brown, muted cream and rust mushroom caps
Materials/textures: moss pads, damp soil, leaf litter, soft roots
Constraints: keep the variant low-profile so it does not need an overlay; no large trunks; no fantasy glow; no watermark
Avoid: oversized mushrooms, fairy-tale props, photoreal fungus texture, noisy clutter
```

### New 3: Water Foam

```text
Use case: stylized-concept
Asset type: game terrain tile
Primary request: create a new decorative water tile variant with wind-pushed foam streaks and slightly rougher water movement
Scene/backdrop: isolated water hex tile
Subject: blue water with a few thin foam lines and directional wave texture
Style/medium: painterly pixel art game tile
Composition/framing: top-down three-quarter hex tile, same read as the existing water family
Lighting/mood: breezy daylight, lightly animated feel
Color palette: teal blue, cool blue depth, restrained off-white foam
Materials/textures: ripple bands, foam streaks, subtle surface chop
Constraints: keep it readable as water first; no rocks; no reeds; no dock pieces; no watermark
Avoid: storm surf, large splashes, photoreal sea foam, blur
```

### New 4: Snow Pines

```text
Use case: stylized-concept
Asset type: game terrain tile
Primary request: create a new decorative snow tile variant with a few tiny snow-buried pine saplings
Scene/backdrop: isolated snowy hex tile
Subject: cold snowfield with sparse miniature dark green saplings peeking through drifts
Style/medium: painterly pixel art game tile
Composition/framing: top-down three-quarter hex tile with a clear center and no tall silhouette
Lighting/mood: quiet winter daylight
Color palette: white snow, pale blue shadow, dark pine green, muted gray-brown stems
Materials/textures: packed snow, thin needles, frosted tips
Constraints: keep all vegetation short enough to stay within the base tile; no overlay needed; no rocks; no watermark
Avoid: full trees, Christmas-card styling, blue fog, photoreal needles
```

### New 5: Dessert Windcarved

```text
Use case: stylized-concept
Asset type: game terrain tile
Primary request: create a new decorative desert tile variant with wind-carved sand ribs and subtle erosion lines
Scene/backdrop: isolated desert hex tile
Subject: warm sand with shallow ribbed dune marks, a few compact pebbles, and slightly darker wind-shadow pockets
Style/medium: painterly pixel art game tile
Composition/framing: top-down three-quarter hex tile, low-profile terrain detail only
Lighting/mood: hot dry sunlight
Color palette: pale sand, warm ochre, sunbaked tan, muted brown shadows
Materials/textures: wind ripples, compact dust, a few embedded stones
Constraints: no cactus; no bones; no tall props; no watermark
Avoid: giant dunes, realistic desert photo texture, orange oversaturation, square background
```

### New 6: Mountains Lichen

```text
Use case: stylized-concept
Asset type: game terrain tile
Primary request: create a new decorative mountain tile variant with small lichen patches and weathered stone color variation
Scene/backdrop: isolated rocky mountain hex tile
Subject: broken stone surfaces with restrained moss or lichen streaks in crevices
Style/medium: painterly pixel art game tile
Composition/framing: top-down three-quarter hex tile, same footprint as the mountain family
Lighting/mood: cool daylight over exposed rock
Color palette: slate gray, blue-gray, muted sage-green lichen, dusty warm highlights
Materials/textures: chipped rock, shallow cracks, crusty lichen clusters
Constraints: preserve mountain readability first; no plants taller than ground cover; no snow; no mine entrance; no watermark
Avoid: bright moss carpets, fantasy crystals, photo-real rock, heavy clutter
```

## Generation Notes

- Default to non-destructive filenames for repaints: use `*-v2.png`.
- Keep newly generated decorative variants as additive files until they are reviewed in-game.
- If using built-in edit mode later, load each local source tile into the conversation first so it is visible as an edit target.
- If using the explicit CLI fallback later, keep outputs inside the repo under `src/assets/tiles/` once a final is selected.
- Do not overwrite the existing tile files unless replacement is explicitly requested after review.
