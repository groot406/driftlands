# Driftlands Building Pixel-Art Pipeline

This is the default workflow for new player-facing building art. It is designed
for generated candidates plus deterministic cleanup, not one-shot final assets.

## Art Direction

- Style: true pixel art, not painterly pseudo-pixel art.
- Readability: each building must be identifiable at `64x64` and at `2x` zoom.
- Camera: top-down with a slight three-quarter lean, matching the current hex map.
- Palette: muted natural colony colors with warm highlights and cool shadows.
- Edges: hard sprite edges, no soft blur, no airbrushed gradients.
- Detail: chunky readable clusters; avoid tiny noisy props.
- Cleanliness: no text, logos, watermarks, UI frames, square borders, or labels.
- Grounding: generated building candidates are foreground art first, then composited onto the canonical Driftlands hex base.
- Footprint: never ask image generation for a raised isometric island, thick dirt block, diamond platform, or square tile.

## Asset Types

Use full `64x64` tile variants when the building is low, ground-integrated, or
already represented by a terrain variant.

- `plains_workshop`
- `plains_bakery`
- `plains_depot`
- `plains_warehouse`
- `plains_campfire`
- `plains_house`
- `plains_stone_house`

Use transparent overlays when the building is tall, reusable across terrain, or
already rendered through `overlayAssetKey`.

- `building_well_overlay`
- `building_depot_overlay`
- `building_lumber_camp_overlay`
- `building_granary_overlay`
- `building_watchtower_overlay`
- future landmark buildings

## Built-In Image Generation

Use the built-in image generation tool for candidates. The old
`scripts/generate_tile_ai.py` backend is kept as a fallback/reference only and
should not be the default workflow.

Generate 3-4 candidates for one pilot asset first. The recommended pilot is the
workshop because it is tied to the ore-to-tools loop and needs a strong silhouette.

### Shared Prompt Block

```text
Use case: stylized-concept
Asset type: 64x64 game building foreground candidate for Driftlands
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter building, centered, readable at native 64x64 size, designed to sit inside a flat Driftlands hex tile
Lighting/mood: clear daylight, warm highlights, cool compact shadows
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border, no isometric floating island, no thick dirt block
```

### Pilot Prompt: Workshop

```text
Use case: stylized-concept
Asset type: 64x64 game building foreground candidate for Driftlands
Primary request: create a compact frontier workshop designed to sit inside a flat Driftlands hex tile
Scene/backdrop: transparent or plain background; no terrain slab; no horizon
Subject: small open-sided wooden workshop with an anvil, workbench, tool rack, tiny ore pile, and sturdy roof
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter building, centered, readable at native 64x64 size, fits safely inside the middle 70% of a flat six-sided hex footprint
Lighting/mood: clear daylight, warm highlights, cool compact shadows
Color palette: muted grass green, weathered wood brown, dark iron gray, small amber highlights
Materials/textures: timber beams, stone base, metal anvil, a few chunky tools
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border, no isometric floating island, no thick dirt block, no diamond base
Avoid: fantasy machinery, oversized furnace, tiny clutter, realistic perspective building, square platform, raised terrain chunk
```

## Candidate Workflow

1. Generate 3-4 candidates with the built-in image generation tool.
2. Save raw candidates under `output/art_candidates/<asset-key>/raw/`.
3. Run post-processing into `output/art_candidates/<asset-key>/processed/`; for full tile buildings this removes the generated background, fits the foreground, and composites it onto the canonical base hex.
4. Build a contact sheet in `output/art_review/`.
5. Review candidates at `1x`, `2x`, and `4x`.
6. Copy only approved finals into `src/assets/tiles/`.
7. Update `terrainDefs.ts` or building `overlayAssetKey` references only after final files exist.

Never overwrite existing live assets during candidate work. Use versioned names
such as `plains_workshop-v2.png` until a replacement is explicitly approved.

## Commands

Print approved prompts:

```bash
npm run art:prompts
```

Post-process workshop candidates:

```bash
npm run art:process -- postprocess --asset plains_workshop --sources output/art_candidates/plains_workshop/raw/*.png
```

If a generated foreground is still too large or too small, tune the fit:

```bash
npm run art:process -- postprocess --asset plains_workshop --foreground-scale 0.62 --y-offset 6 --sources output/art_candidates/plains_workshop/raw/*.png
```

Validate processed assets:

```bash
npm run art:process -- validate --sources output/art_candidates/plains_workshop/processed/*.png
```

Create a review sheet:

```bash
npm run art:sheet -- --asset plains_workshop --sources src/assets/tiles/plains_workshop.png output/art_candidates/plains_workshop/processed/*.png
```

## Acceptance Criteria

- Full tile assets are `64x64` `RGBA` PNGs.
- Overlay assets are `RGBA` PNGs with transparent background and declared dimensions.
- Full tile assets use the clipped-corner hex alpha mask.
- Full tile building candidates sit on the canonical base tile; generated square/diamond/isometric island shapes are not accepted.
- Candidates are readable at native size.
- Building silhouettes are distinguishable without opening the task/building menu.
- Final assets are integrated only after visual review.
