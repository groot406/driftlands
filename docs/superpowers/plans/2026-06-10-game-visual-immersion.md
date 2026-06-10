# Game Visual Immersion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Driftlands more visually attractive and immersive with layered map depth, biome-reactive dynamic lighting/weather mood, improved clouds, and global atmospheric particles that can cross tile boundaries.

**Architecture:** Keep the work renderer-only. Add a small pure atmosphere model shared by backdrop/cloud/particle code, implement background depth in `BackdropRenderer`, improve existing cloud rendering in `CloudShadowEffect`, and extend the existing particle pipeline for global underlay/foreground atmosphere.

**Tech Stack:** Vue 3, TypeScript, Vite, Canvas 2D, Node `tsx --test`, existing Driftlands render pass architecture.

---

## File Structure

- Create: `src/core/render/effects/WorldAtmosphere.ts`
  - Pure helpers for visible-terrain atmosphere weights, weather flavor, and mood intensities.
- Create: `src/core/render/effects/WorldAtmosphere.test.ts`
  - Tests terrain-to-mood behavior, quality scaling, and deterministic timing.
- Modify: `src/core/render/effects/BackdropRenderer.ts`
  - Uses `WorldAtmosphere` to draw the background layer.
- Create: `src/core/render/effects/BackdropRenderer.test.ts`
  - Tests backdrop color helpers and render draw paths.
- Modify: `src/core/render/effects/CloudShadowEffect.ts`
  - Improves existing cloud depth using mood-aware broad/detail layers.
- Modify: `src/core/render/effects/CloudShadowEffect.test.ts`
  - Covers cloud quality/mood helpers where practical.
- Modify: `src/core/HexMapService.ts`
  - Adds global atmosphere spawning through the existing particle list.
- Modify: `src/core/render/particles/ParticleRenderer.ts`
  - Adds rendering support for any new global particle shape.
- Modify: `src/core/render/particles/ParticleRenderer.test.ts`
  - Covers underlay/overlay cross-tile particle rendering.
- Modify: `src/core/render/visualStyle.ts`
  - Tunes existing visual constants for depth and ambience.
- No server, protocol, gameplay, save data, HUD, or asset pipeline files should change.

## Task 1: Shared Atmosphere Model

**Owner:** Subagent worker A.

**Files:**
- Create: `src/core/render/effects/WorldAtmosphere.ts`
- Create: `src/core/render/effects/WorldAtmosphere.test.ts`

- [ ] **Step 1: Write tests for mood derivation**

Create `src/core/render/effects/WorldAtmosphere.test.ts` with tests using `node:test` and `node:assert/strict`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import {
    buildWorldAtmosphere,
    mixAtmosphereColor,
    type AtmosphereTileSample,
} from './WorldAtmosphere';

function tile(q: number, r: number, terrain: string): AtmosphereTileSample {
    return { q, r, discovered: true, terrain };
}

test('mixAtmosphereColor blends and clamps channels', () => {
    assert.deepEqual(mixAtmosphereColor([20, 30, 40], [120, 130, 140], 0.25), [45, 55, 65]);
    assert.deepEqual(mixAtmosphereColor([0, 0, 0], [400, -20, 300], 1), [255, 0, 255]);
});

test('buildWorldAtmosphere detects water mist and cold snow moods', () => {
    const waterMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'water'), tile(1, 0, 'forest'), tile(2, 0, 'plains')],
        nowMs: 2000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });
    const snowMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'snow'), tile(1, 0, 'snow'), tile(2, 0, 'mountain')],
        nowMs: 2000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });

    assert.equal(waterMood.weatherFlavor, 'mist');
    assert.equal(snowMood.weatherFlavor, 'snow');
    assert.ok(waterMood.weights.water > snowMood.weights.water);
    assert.ok(snowMood.weights.cold > waterMood.weights.cold);
});

test('buildWorldAtmosphere detects desert and volcano weather flavors', () => {
    const desertMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'dessert'), tile(1, 0, 'dessert'), tile(2, 0, 'dirt')],
        nowMs: 3200,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });
    const volcanoMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'vulcano'), tile(1, 0, 'mountain'), tile(2, 0, 'dirt')],
        nowMs: 3200,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });

    assert.equal(desertMood.weatherFlavor, 'sand');
    assert.equal(volcanoMood.weatherFlavor, 'ash');
    assert.ok(volcanoMood.weights.ember > desertMood.weights.ember);
});

test('buildWorldAtmosphere lowers expensive intensities for low quality', () => {
    const tiles = [tile(0, 0, 'forest'), tile(1, 0, 'water'), tile(2, 0, 'grain')];
    const high = buildWorldAtmosphere({
        tiles,
        nowMs: 4000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });
    const low = buildWorldAtmosphere({
        tiles,
        nowMs: 4000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(2),
    });

    assert.ok(high.globalParticleIntensity > low.globalParticleIntensity);
    assert.ok(high.cloudDepthIntensity > low.cloudDepthIntensity);
    assert.ok(high.foregroundIntensity > low.foregroundIntensity);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx tsx --test src/core/render/effects/WorldAtmosphere.test.ts
```

Expected: FAIL because `WorldAtmosphere.ts` does not exist yet.

- [ ] **Step 3: Implement the pure model**

Create `src/core/render/effects/WorldAtmosphere.ts` with:

```ts
import type { RenderQualityProfile } from '../RenderTypes';
import { GROWTH_HYBRID_STYLE } from '../visualStyle';

export type AtmosphereColor = readonly [number, number, number];
export type AtmosphereWeatherFlavor = 'clear' | 'breezy' | 'mist' | 'snow' | 'sand' | 'ash' | 'warmHaze';

export interface AtmosphereTileSample {
    q: number;
    r: number;
    discovered: boolean;
    terrain: string | null;
}

export interface AtmosphereWeights {
    lush: number;
    water: number;
    cold: number;
    warm: number;
    stone: number;
    ember: number;
}

export interface WorldAtmosphere {
    weights: AtmosphereWeights;
    weatherFlavor: AtmosphereWeatherFlavor;
    qualityScale: number;
    timePulse: number;
    globalParticleIntensity: number;
    foregroundIntensity: number;
    cloudDepthIntensity: number;
    backdropTop: AtmosphereColor;
    backdropBottom: AtmosphereColor;
    lightGlow: AtmosphereColor;
    shadowTint: AtmosphereColor;
}

export interface BuildWorldAtmosphereInput {
    tiles: readonly AtmosphereTileSample[];
    nowMs: number;
    cameraQ: number;
    cameraR: number;
    quality: RenderQualityProfile;
}

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function clampChannel(value: number) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

export function mixAtmosphereColor(from: AtmosphereColor, to: AtmosphereColor, amount: number): AtmosphereColor {
    const clamped = clamp01(amount);
    return [
        clampChannel(from[0] + ((to[0] - from[0]) * clamped)),
        clampChannel(from[1] + ((to[1] - from[1]) * clamped)),
        clampChannel(from[2] + ((to[2] - from[2]) * clamped)),
    ];
}

function getQualityScale(quality: RenderQualityProfile) {
    if (quality.name === 'high') return 1;
    if (quality.name === 'medium') return 0.68;
    return 0.28;
}

function normalizeWeights(weights: AtmosphereWeights, samples: number): AtmosphereWeights {
    const divisor = Math.max(1, samples);
    return {
        lush: clamp01(weights.lush / divisor),
        water: clamp01(weights.water / divisor),
        cold: clamp01(weights.cold / divisor),
        warm: clamp01(weights.warm / divisor),
        stone: clamp01(weights.stone / divisor),
        ember: clamp01(weights.ember / divisor),
    };
}

function getWeatherFlavor(weights: AtmosphereWeights): AtmosphereWeatherFlavor {
    if (weights.ember > 0.2) return 'ash';
    if (weights.cold > 0.46) return 'snow';
    if (weights.warm > 0.52 && weights.lush < 0.3) return 'sand';
    if (weights.water > 0.34) return 'mist';
    if (weights.warm > 0.42) return 'warmHaze';
    if (weights.lush > 0.36) return 'breezy';
    return 'clear';
}

export function buildWorldAtmosphere(input: BuildWorldAtmosphereInput): WorldAtmosphere {
    const raw: AtmosphereWeights = { lush: 0, water: 0, cold: 0, warm: 0, stone: 0, ember: 0 };
    let samples = 0;

    for (const tile of input.tiles) {
        if (!tile.discovered || !tile.terrain) continue;
        samples += 1;
        switch (tile.terrain) {
            case 'forest':
                raw.lush += 1.18;
                raw.cold += 0.08;
                break;
            case 'plains':
                raw.lush += 0.96;
                raw.warm += 0.14;
                break;
            case 'grain':
                raw.lush += 0.62;
                raw.warm += 0.54;
                break;
            case 'water':
                raw.water += 1.22;
                raw.cold += 0.18;
                break;
            case 'snow':
                raw.cold += 1.24;
                raw.stone += 0.12;
                break;
            case 'mountain':
                raw.stone += 1.12;
                raw.cold += 0.18;
                break;
            case 'dirt':
                raw.warm += 0.58;
                raw.stone += 0.22;
                break;
            case 'dessert':
                raw.warm += 1.22;
                raw.stone += 0.14;
                break;
            case 'vulcano':
                raw.ember += 1.18;
                raw.warm += 0.46;
                raw.stone += 0.38;
                break;
            case 'towncenter':
                raw.warm += 0.72;
                raw.lush += 0.22;
                break;
        }
    }

    const weights = normalizeWeights(raw, samples);
    const qualityScale = getQualityScale(input.quality);
    const timePulse = 0.5 + (Math.sin((input.nowMs / 7200) + (input.cameraQ * 0.07) + (input.cameraR * 0.05)) * 0.5);
    const weatherFlavor = getWeatherFlavor(weights);
    const style = GROWTH_HYBRID_STYLE.backdrop;
    const coolBase = mixAtmosphereColor(style.skyGlow, [118, 174, 196], weights.water * 0.42 + weights.cold * 0.2);
    const warmBase = mixAtmosphereColor(style.warmGlow, [222, 134, 72], weights.ember * 0.42 + weights.warm * 0.18);
    const lushBase = mixAtmosphereColor(style.meadowGlow, [178, 222, 126], weights.lush * 0.24);

    return {
        weights,
        weatherFlavor,
        qualityScale,
        timePulse,
        globalParticleIntensity: clamp01((0.28 + weights.water * 0.3 + weights.cold * 0.22 + weights.warm * 0.2 + weights.ember * 0.32) * qualityScale),
        foregroundIntensity: clamp01((0.16 + weights.cold * 0.18 + weights.ember * 0.22 + weights.warm * 0.12) * qualityScale),
        cloudDepthIntensity: clamp01((0.22 + weights.water * 0.32 + weights.cold * 0.16 + weights.lush * 0.12) * qualityScale),
        backdropTop: mixAtmosphereColor(coolBase, warmBase, weights.warm * 0.16 + weights.ember * 0.22),
        backdropBottom: mixAtmosphereColor(lushBase, warmBase, weights.warm * 0.28 + weights.ember * 0.22),
        lightGlow: mixAtmosphereColor(mixAtmosphereColor(lushBase, coolBase, weights.water * 0.28), warmBase, weights.warm * 0.24 + weights.ember * 0.28),
        shadowTint: mixAtmosphereColor([20, 30, 34], [42, 30, 28], weights.ember * 0.24 + weights.stone * 0.12),
    };
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx tsx --test src/core/render/effects/WorldAtmosphere.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/core/render/effects/WorldAtmosphere.ts src/core/render/effects/WorldAtmosphere.test.ts
git commit -m "feat: add render atmosphere mood model"
```

## Task 2: Layered Backdrop Renderer

**Owner:** Subagent worker B.

**Files:**
- Modify: `src/core/render/effects/BackdropRenderer.ts`
- Create: `src/core/render/effects/BackdropRenderer.test.ts`

- [ ] **Step 1: Add backdrop tests**

Create `src/core/render/effects/BackdropRenderer.test.ts` with tests that:

- create a mock canvas context with counters for `save`, `restore`, `createLinearGradient`, `createRadialGradient`, `fillRect`, `beginPath`, `arc`, and `fill`,
- call `new BackdropRenderer().render(frame)` with no visible tiles and assert a neutral non-empty background is drawn,
- call it with forest/water/volcano visible tiles in high and low quality and assert high quality uses more radial gradients/arcs,
- call it with `viewport.width = 0` and assert no drawing occurs.

Use the existing mock style from `src/core/render/effects/CompositeRenderer.test.ts`.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx tsx --test src/core/render/effects/BackdropRenderer.test.ts
```

Expected: FAIL because `BackdropRenderer.render()` is empty.

- [ ] **Step 3: Implement backdrop rendering using `WorldAtmosphere`**

In `src/core/render/effects/BackdropRenderer.ts`:

- import `buildWorldAtmosphere`,
- call it from `render()` with `frame.visibleTiles`, `frame.effectNowMs`, `frame.viewport.cameraQ`, `frame.viewport.cameraR`, and `frame.quality`,
- draw a full-canvas gradient using `mood.backdropTop`, `mood.lightGlow`, and `mood.backdropBottom`,
- draw at least two low-alpha radial glows for high quality and one restrained wash for medium/low quality,
- draw a camera-biased vignette using `mood.shadowTint`,
- return without drawing for invalid canvas dimensions.

Keep the existing terrain palette cache methods unless the implementation makes them unused; if unused, delete them in the same commit.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx tsx --test src/core/render/effects/WorldAtmosphere.test.ts src/core/render/effects/BackdropRenderer.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/core/render/effects/BackdropRenderer.ts src/core/render/effects/BackdropRenderer.test.ts
git commit -m "feat: render layered biome backdrop"
```

## Task 3: Mood-Aware Cloud Depth

**Owner:** Subagent worker C.

**Files:**
- Modify: `src/core/render/effects/CloudShadowEffect.ts`
- Modify: `src/core/render/effects/CloudShadowEffect.test.ts`

- [ ] **Step 1: Add or update focused cloud tests**

Extend `src/core/render/effects/CloudShadowEffect.test.ts` so it covers:

- high quality draws more cloud texture layers than low quality,
- cloud rendering still no-ops when no discovered tiles are visible,
- cloud draw work remains gated by `quality.enableClouds && quality.cloudsEnabled`,
- cloud-only composition remains safe when no other top-level effect content is present.

Use existing mock canvas patterns in that file and do not require pixel-perfect assertions.

- [ ] **Step 2: Run the cloud tests and verify current behavior**

Run:

```bash
npx tsx --test src/core/render/effects/CloudShadowEffect.test.ts
```

Expected: FAIL only for the new high-vs-low depth expectation if the current implementation lacks the new depth behavior. If existing tests fail for another reason, stop and report.

- [ ] **Step 3: Improve cloud depth**

In `src/core/render/effects/CloudShadowEffect.ts`:

- keep the existing cloud noise texture cache and morph state,
- use `buildWorldAtmosphere()` on discovered visible tiles to derive `cloudDepthIntensity`,
- make high quality draw the existing broad layer plus a subtler detail layer with a different scale/speed/opacity,
- make medium quality draw a restrained detail layer,
- make low quality draw only the cheapest broad layer or no detail layer,
- keep cloud clipping to discovered tiles,
- do not wire `PeacefulAtmosphereEffect`, `FogShimmerEffect`, or new global atmosphere through `effectSurface` in this task.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx tsx --test src/core/render/effects/CloudShadowEffect.test.ts src/core/render/effects/WorldAtmosphere.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/core/render/effects/CloudShadowEffect.ts src/core/render/effects/CloudShadowEffect.test.ts
git commit -m "feat: deepen mood aware clouds"
```

## Task 4: Global Cross-Tile Atmospheric Particles

**Owner:** Subagent worker D.

**Files:**
- Modify: `src/core/HexMapService.ts`
- Modify: `src/core/render/particles/ParticleRenderer.ts`
- Modify: `src/core/render/particles/ParticleRenderer.test.ts`
- Modify: `src/core/render/visualStyle.ts`

- [ ] **Step 1: Add particle renderer coverage for global shapes**

Extend `src/core/render/particles/ParticleRenderer.test.ts` with a test that passes one underlay mist/smoke-like particle and one overlay wind/snow/ash-like particle, then asserts the underlay and overlay surfaces both draw.

If a new particle shape is added, include it in the test. If existing `cloud`, `circle`, or `diamond` shapes are reused, assert that global particles render through existing paths.

- [ ] **Step 2: Run particle tests before implementation**

Run:

```bash
npx tsx --test src/core/render/particles/ParticleRenderer.test.ts
```

Expected: PASS for existing tests. The new test should fail only if it depends on a new shape or layer behavior.

- [ ] **Step 3: Add global atmosphere spawning**

In `src/core/HexMapService.ts`:

- keep existing tile-local ambient particles,
- add a `spawnGlobalAtmosphereParticles(now, tiles)` helper called from `spawnAmbientParticles()` after `spawnSkyAmbientParticles()`,
- use `buildWorldAtmosphere()` to select weather flavor and intensity,
- compute visible world bounds from discovered visible tiles, similar to `getSkyAmbientBounds()`,
- spawn sparse underlay mist/haze particles for `mist`, `warmHaze`, and `breezy`,
- spawn sparse overlay snow/sand/ash particles for `snow`, `sand`, and `ash`,
- respect `getMaxParticleBudget()`, `graphicsStore.particles`, and existing render feature gates.

Use existing particle shapes unless a new shape is necessary. If adding a new shape, update the `Particle` type and `ParticleRenderer` type/test together.

- [ ] **Step 4: Tune visual constants**

In `src/core/render/visualStyle.ts`, tune existing `GROWTH_HYBRID_STYLE.particles` values modestly:

- increase `ambientDensity` enough to make global ambience visible,
- keep terrain-local chance increases small,
- do not raise budgets directly in this task.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx tsx --test src/core/render/particles/ParticleRenderer.test.ts src/core/render/effects/WorldAtmosphere.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/core/HexMapService.ts src/core/render/particles/ParticleRenderer.ts src/core/render/particles/ParticleRenderer.test.ts src/core/render/visualStyle.ts
git commit -m "feat: add global map atmosphere particles"
```

## Task 5: Integration Validation

**Owner:** Main coordinator after subagent tasks.

**Files:**
- No expected source changes unless validation reveals a defect.

- [ ] **Step 1: Run focused render tests**

Run:

```bash
npx tsx --test src/core/render/effects/WorldAtmosphere.test.ts src/core/render/effects/BackdropRenderer.test.ts src/core/render/effects/CloudShadowEffect.test.ts src/core/render/effects/CompositeRenderer.test.ts src/core/render/particles/ParticleRenderer.test.ts src/core/render/RenderConfig.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS with no TypeScript or Vite errors.

- [ ] **Step 3: Start local game**

Run:

```bash
npm run dev:no-debug
```

Expected: Vite client and server start. Use the printed Vite URL.

- [ ] **Step 4: Browser visual check**

Open the local Vite URL in the Browser plugin and verify:

- a visible biome-reactive backdrop exists behind terrain,
- there is a clear background/world/foreground depth difference,
- cloud movement has more depth than a single flat shadow layer,
- global atmosphere can drift across multiple tiles,
- weather flavor feels different around snow, desert, water/forest, and volcano-heavy views where available,
- overlays, paths, heroes, settlers, buildings, and text indicators remain readable,
- low/browser-light rendering remains stable.

- [ ] **Step 5: Capture evidence**

Capture at least one desktop screenshot through the Browser plugin and record the path in the final summary.

- [ ] **Step 6: Stop the dev server**

Stop the validation server session.

Expected: no long-running validation process remains.

## Self-Review

- Spec coverage:
  - Layered background/world/foreground depth: Tasks 2, 4, and 5.
  - Dynamic lighting/weather mood: Tasks 1, 2, 3, and 4.
  - Improved existing clouds: Task 3.
  - Global cross-tile particles: Task 4.
  - Quality/readability preservation: Tasks 1 through 5.
  - No gameplay/server/protocol changes: file structure restricts changes to renderer/effect/particle files.
- Placeholder scan:
  - No fake implementation steps remain.
  - New worker tasks define concrete files, expected behavior, commands, and commit points.
- Type consistency:
  - `WorldAtmosphere` is introduced before backdrop, cloud, and particle tasks use it.
  - All test commands use the repo's existing `npx tsx --test` pattern.
