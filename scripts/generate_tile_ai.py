"""Generate pixel-art hex tiles for Driftlands using AI image models.

Supported backends
------------------
* **openai**   – DALL-E 3 via the OpenAI Images API  (default)
* **replicate** – Any Replicate model (e.g. pixel-art SDXL LoRAs)

Usage examples
--------------
# Generate a single tile by name
python scripts/generate_tile_ai.py --tile plains_bakery

# Generate all tiles tagged as "building"
python scripts/generate_tile_ai.py --category building

# List every tile in the manifest
python scripts/generate_tile_ai.py --list

# Generate ALL missing tiles (skips files that already exist)
python scripts/generate_tile_ai.py --all

# Use Replicate backend instead of OpenAI
python scripts/generate_tile_ai.py --tile plains_bakery --backend replicate

# Override the AI model (Replicate)
python scripts/generate_tile_ai.py --tile plains_bakery --backend replicate \
    --model "fofr/sdxl-pixel-art:latest"

# Skip post-processing (keep raw AI output)
python scripts/generate_tile_ai.py --tile plains_bakery --raw

# Custom output directory
python scripts/generate_tile_ai.py --tile plains_bakery --outdir output/tiles

Environment variables
---------------------
OPENAI_API_KEY   – required for the openai backend
REPLICATE_API_TOKEN – required for the replicate backend
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TILE_DIR = ROOT / "src" / "assets" / "tiles"
DRAFT_DIR = ROOT / "output" / "tiles_draft"
DEFAULT_SIZE = 64

# ---------------------------------------------------------------------------
# Style prompt – tuned to match the existing Driftlands palette
# ---------------------------------------------------------------------------

STYLE_PROMPT = (
    "Top-down pixel art game tile, 64×64 pixels, hex-shaped tile for a colony "
    "simulation game. Earthy natural palette, soft lighting, subtle dithering, "
    "no outlines on the hex border. The tile should look good when tiled next "
    "to other hex tiles. Viewed from slightly above (isometric-lite). "
    "Clean pixel art, no anti-aliasing, limited color palette."
)


# ---------------------------------------------------------------------------
# Tile manifest – every tile the game can use
# ---------------------------------------------------------------------------


@dataclass
class TileDef:
    """A tile that can be AI-generated."""

    name: str
    prompt: str
    category: str = "terrain"
    base_terrain: Optional[str] = None
    is_overlay: bool = False
    tags: list[str] = field(default_factory=list)


MANIFEST: list[TileDef] = [
    # -- Buildings on plains ------------------------------------------------
    TileDef(
        "plains_bakery",
        "A small rustic bakery building on a grassy green plains hex tile. "
        "Thatched roof, tiny chimney with a wisp of smoke, wooden walls, "
        "a small bread cart or barrel next to it. Warm browns and greens.",
        category="building",
        base_terrain="plains",
        tags=["building", "plains"],
    ),
    TileDef(
        "plains_workshop",
        "A small crafting workshop on a grassy green plains hex tile. "
        "Open-sided wooden structure with a workbench, anvil, and tool rack. "
        "Wood and stone materials. Warm browns and greens.",
        category="building",
        base_terrain="plains",
        tags=["building", "plains"],
    ),
    TileDef(
        "plains_campfire",
        "A small campfire ring on a grassy green plains hex tile. "
        "Circle of stones around a crackling fire with orange-yellow flames, "
        "a log seat nearby. Green grass surrounds it.",
        category="building",
        base_terrain="plains",
        tags=["building", "plains"],
    ),
    TileDef(
        "plains_depot",
        "A small supply depot on a grassy green plains hex tile. "
        "Open-air wooden storage structure with crates, barrels, and sacks. "
        "Simple wooden roof on posts. Browns and greens.",
        category="building",
        base_terrain="plains",
        tags=["building", "plains"],
    ),
    TileDef(
        "plains_warehouse",
        "A sturdy wooden warehouse on a grassy green plains hex tile. "
        "Larger enclosed building with double doors, stacked crates outside. "
        "Solid wooden construction with a tiled roof.",
        category="building",
        base_terrain="plains",
        tags=["building", "plains"],
    ),
    # -- Buildings on dirt --------------------------------------------------
    TileDef(
        "dirt_bakery",
        "A small rustic bakery building on a brown dirt hex tile. "
        "Thatched roof, tiny chimney with smoke, wooden and mud-brick walls. "
        "Warm earth tones, brown dirt ground.",
        category="building",
        base_terrain="dirt",
        tags=["building", "dirt"],
    ),
    TileDef(
        "dirt_workshop",
        "A small crafting workshop on a brown dirt hex tile. "
        "Open-sided wooden structure with a workbench and tools. "
        "Earth-toned materials on brown packed dirt.",
        category="building",
        base_terrain="dirt",
        tags=["building", "dirt"],
    ),
    TileDef(
        "dirt_campfire",
        "A small campfire ring on a brown dirt hex tile. "
        "Circle of stones around a fire with embers, a log seat. "
        "Brown packed dirt ground.",
        category="building",
        base_terrain="dirt",
        tags=["building", "dirt"],
    ),
    TileDef(
        "dirt_depot",
        "A small supply depot on a brown dirt hex tile. "
        "Open-air storage with crates and barrels on packed dirt. "
        "Simple wooden posts and roof. Earth tones.",
        category="building",
        base_terrain="dirt",
        tags=["building", "dirt"],
    ),
    TileDef(
        "dirt_warehouse",
        "A sturdy warehouse on a brown dirt hex tile. "
        "Larger enclosed building with double doors, crates outside. "
        "Brown dirt ground, stone and wood construction.",
        category="building",
        base_terrain="dirt",
        tags=["building", "dirt"],
    ),
    # -- Building overlays (drawn on top of base tile) ----------------------
    TileDef(
        "building_bakery_overlay",
        "A small bakery building sprite with transparent background. "
        "Thatched roof, chimney with smoke, wooden walls, bread cart. "
        "Viewed from slightly above. Warm brown tones. Just the building, "
        "no ground or terrain.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_workshop_overlay",
        "A small crafting workshop sprite with transparent background. "
        "Open-sided structure with workbench, anvil, tool rack. "
        "Viewed from above. Wood and metal tones. Just the building, "
        "no ground.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_campfire_overlay",
        "A campfire sprite with transparent background. "
        "Stone ring around a fire with orange-yellow flames, a log seat. "
        "Viewed from above. Just the campfire, no ground.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_house_overlay",
        "A small medieval cottage sprite with transparent background. "
        "Peaked thatched or wooden roof, stone base, tiny window. "
        "Viewed from above. Cozy warm tones. Just the house, no ground.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_stone_house_overlay",
        "A stone house sprite with transparent background. "
        "Solid stone walls, slate roof, small window and door. "
        "Viewed from above. Grey stone tones. Just the house, no ground.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_quarry_overlay",
        "A mountain quarry sprite with transparent background. "
        "Open pit with exposed rock layers, wooden supports, a cart with "
        "stone blocks. Viewed from above. Grey and brown tones.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_mine_overlay",
        "A mine entrance sprite with transparent background. "
        "Dark cave opening with wooden beam supports, a minecart on "
        "small rails, lantern. Viewed from above. Dark grey and brown.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_sawmill_overlay",
        "A sawmill sprite with transparent background. "
        "Open-sided wooden structure with a saw blade mechanism, log pile, "
        "cut planks stacked nearby. Viewed from above. Brown wood tones.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    TileDef(
        "building_dock_overlay",
        "A small wooden dock sprite with transparent background. "
        "Short pier extending out, wooden planks, a mooring post, "
        "rope coil. Viewed from above. Brown wood on blue water.",
        category="overlay",
        is_overlay=True,
        tags=["overlay", "building"],
    ),
    # -- Mountain variants --------------------------------------------------
    TileDef(
        "mountains_with_quarry",
        "A dark grey mountain hex tile with an open quarry pit. "
        "Exposed rock layers, small wooden crane, cart with stone blocks. "
        "Dark grey and slate tones.",
        category="building",
        base_terrain="mountains-v2",
        tags=["building", "mountains"],
    ),
    TileDef(
        "mountains_reinforced_mine",
        "A dark grey mountain hex tile with a reinforced mine entrance. "
        "Heavy wooden beam supports, iron-banded door, lanterns, "
        "minecart tracks leading in. Dark grey stone.",
        category="building",
        base_terrain="mountains-v2",
        tags=["building", "mountains"],
    ),
    TileDef(
        "mountains_watchtower",
        "A dark grey mountain hex tile with a stone watchtower. "
        "Tall narrow tower on a rocky peak, torch at top, "
        "stone construction. Dark grey and slate.",
        category="building",
        base_terrain="mountains-v2",
        tags=["building", "mountains"],
    ),
    # -- Water/dock variants ------------------------------------------------
    TileDef(
        "water_dock_a",
        "A blue water hex tile with a small wooden dock extending north. "
        "Wooden planks, mooring post, gentle water ripples. "
        "Blue water with brown wooden dock.",
        category="building",
        base_terrain="water-v2",
        tags=["building", "water"],
    ),
    TileDef(
        "water_dock_b",
        "A blue water hex tile with a small wooden dock extending northeast. "
        "Wooden planks, mooring post, gentle water ripples.",
        category="building",
        base_terrain="water-v2",
        tags=["building", "water"],
    ),
    TileDef(
        "water_dock_c",
        "A blue water hex tile with a small wooden dock extending southeast. "
        "Wooden planks, mooring post, gentle water ripples.",
        category="building",
        base_terrain="water-v2",
        tags=["building", "water"],
    ),
    TileDef(
        "water_dock_d",
        "A blue water hex tile with a small wooden dock extending south. "
        "Wooden planks, mooring post, gentle water ripples.",
        category="building",
        base_terrain="water-v2",
        tags=["building", "water"],
    ),
    TileDef(
        "water_dock_e",
        "A blue water hex tile with a small wooden dock extending southwest. "
        "Wooden planks, mooring post, gentle water ripples.",
        category="building",
        base_terrain="water-v2",
        tags=["building", "water"],
    ),
    TileDef(
        "water_dock_f",
        "A blue water hex tile with a small wooden dock extending northwest. "
        "Wooden planks, mooring post, gentle water ripples.",
        category="building",
        base_terrain="water-v2",
        tags=["building", "water"],
    ),
    # -- Grain building variants -------------------------------------------
    TileDef(
        "grain_granary",
        "A golden wheat field hex tile with a small granary building. "
        "Round or rectangular grain storage with thatched roof, "
        "surrounded by tall golden wheat. Warm gold and brown.",
        category="building",
        base_terrain="grain-v2",
        tags=["building", "grain"],
    ),
    # -- Forest building variants ------------------------------------------
    TileDef(
        "forest_lumber_camp",
        "A dark green forest hex tile with a lumber camp. "
        "Tree stumps, stacked logs, a simple lean-to shelter, axe on stump. "
        "Dark green forest with brown wood elements.",
        category="building",
        base_terrain="forest",
        tags=["building", "forest"],
    ),
    TileDef(
        "forest_sawmill",
        "A dark green forest hex tile with a sawmill. "
        "Wooden building with a water wheel or saw mechanism, "
        "log pile and cut planks. Forest clearing.",
        category="building",
        base_terrain="forest",
        tags=["building", "forest"],
    ),
    # -- Hero / settler sprites (sprite sheets) ----------------------------
    TileDef(
        "hero_knight",
        "A 32×32 pixel art character sprite sheet for a medieval knight. "
        "4 rows of 4 frames each: idle, walk down, walk up, walk side. "
        "Small armored figure with sword and shield. Silver and blue.",
        category="hero",
        tags=["hero", "spritesheet"],
    ),
    TileDef(
        "hero_farmer",
        "A 32×32 pixel art character sprite sheet for a farmer. "
        "4 rows of 4 frames each: idle, walk down, walk up, walk side. "
        "Simple tunic, straw hat, carrying a hoe. Brown and green.",
        category="hero",
        tags=["hero", "spritesheet"],
    ),
    TileDef(
        "hero_miner",
        "A 32×32 pixel art character sprite sheet for a miner. "
        "4 rows of 4 frames each: idle, walk down, walk up, walk side. "
        "Sturdy clothes, mining helmet with lamp, pickaxe. Grey and brown.",
        category="hero",
        tags=["hero", "spritesheet"],
    ),
    # -- POI / exploration --------------------------------------------------
    TileDef(
        "poi_ruins",
        "An overgrown ancient ruins hex tile. Crumbling stone walls, "
        "ivy and moss covering fallen pillars, mysterious atmosphere. "
        "Grey stone with green overgrowth on grass.",
        category="poi",
        base_terrain="plains",
        tags=["poi", "exploration"],
    ),
    TileDef(
        "poi_abandoned_camp",
        "An abandoned camp hex tile. Torn tent, scattered supplies, "
        "cold fire pit with ashes, broken crate. Muted earthy tones "
        "on grass.",
        category="poi",
        base_terrain="plains",
        tags=["poi", "exploration"],
    ),
    TileDef(
        "poi_shrine",
        "A small mystical shrine hex tile. Weathered stone altar with "
        "a faint glow, offerings of flowers, ancient runes carved in stone. "
        "Grey stone on green grass with a subtle magical aura.",
        category="poi",
        base_terrain="plains",
        tags=["poi", "exploration"],
    ),
]


def get_manifest_dict() -> dict[str, TileDef]:
    return {t.name: t for t in MANIFEST}


# ---------------------------------------------------------------------------
# Hex mask (matches extract_draft_tile.py)
# ---------------------------------------------------------------------------


def hex_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    w = h = size
    draw.polygon(
        [
            (0.5 * w, 0),
            (w, 0.25 * h),
            (w, 0.75 * h),
            (0.5 * w, h),
            (0, 0.75 * h),
            (0, 0.25 * h),
        ],
        fill=255,
    )
    return mask


# ---------------------------------------------------------------------------
# Post-processing: crop, resize, hex-mask, edge cleanup
# ---------------------------------------------------------------------------


def luminance(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def clean_edge_outline(tile: Image.Image) -> Image.Image:
    """Remove dark outlines near the hex border (ported from extract_draft_tile.py)."""
    pixels = tile.load()
    original = tile.copy()
    source_pixels = original.load()
    alpha = original.getchannel("A").load()
    width, height = tile.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = source_pixels[x, y]
            if a == 0 or luminance(r, g, b) > 70:
                continue
            near_edge = False
            for ny in range(max(0, y - 2), min(height, y + 3)):
                for nx in range(max(0, x - 2), min(width, x + 3)):
                    if alpha[nx, ny] == 0:
                        near_edge = True
                        break
                if near_edge:
                    break
            if not near_edge:
                continue
            samples: list[tuple[int, int, int, float]] = []
            for ny in range(max(0, y - 3), min(height, y + 4)):
                for nx in range(max(0, x - 3), min(width, x + 4)):
                    sr, sg, sb, sa = source_pixels[nx, ny]
                    if sa == 0 or luminance(sr, sg, sb) < 90:
                        continue
                    distance = abs(nx - x) + abs(ny - y)
                    if distance == 0:
                        continue
                    samples.append((sr, sg, sb, 1 / distance))
            if not samples:
                continue
            total = sum(w for *_, w in samples)
            pixels[x, y] = (
                int(sum(sr * w for sr, _, _, w in samples) / total),
                int(sum(sg * w for _, sg, _, w in samples) / total),
                int(sum(sb * w for _, _, sb, w in samples) / total),
                a,
            )
    return tile


def postprocess(raw: Image.Image, size: int = DEFAULT_SIZE, *, is_overlay: bool = False) -> Image.Image:
    """Convert a raw AI-generated image into a game-ready hex tile."""
    raw = raw.convert("RGBA")

    # Center crop to square
    s = min(raw.width, raw.height)
    left = (raw.width - s) // 2
    top = (raw.height - s) // 2
    tile = raw.crop((left, top, left + s, top + s))

    # Resize – use NEAREST for a crisp pixel-art look
    tile = tile.resize((size, size), Image.Resampling.NEAREST)

    if not is_overlay:
        # Apply hex mask
        tile.putalpha(hex_mask(size))
        tile = clean_edge_outline(tile)

    return tile


# ---------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------


def generate_openai(prompt: str, *, model: str = "dall-e-3", size: str = "1024x1024") -> Image.Image:
    """Generate an image using OpenAI DALL-E."""
    import openai

    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("Set the OPENAI_API_KEY environment variable.")

    client = openai.OpenAI()
    resp = client.images.generate(
        model=model,
        prompt=prompt,
        n=1,
        size=size,
        response_format="b64_json",
        quality="standard",
    )
    b64 = resp.data[0].b64_json
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def generate_replicate(prompt: str, *, model: str = "fofr/sdxl-pixel-art:latest") -> Image.Image:
    """Generate an image using a Replicate model."""
    if not os.environ.get("REPLICATE_API_TOKEN"):
        raise RuntimeError("Set the REPLICATE_API_TOKEN environment variable.")
    import replicate

    output = replicate.run(
        model,
        input={
            "prompt": prompt,
            "negative_prompt": "blurry, 3d render, photo, realistic, anti-aliased, smooth gradients",
            "width": 1024,
            "height": 1024,
            "num_inference_steps": 30,
        },
    )
    # Replicate returns a list of URLs or FileOutput objects
    url = output[0] if isinstance(output, list) else output
    import requests
    resp = requests.get(str(url), timeout=120)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content))


BACKENDS = {
    "openai": generate_openai,
    "replicate": generate_replicate,
}


# ---------------------------------------------------------------------------
# High-level generation
# ---------------------------------------------------------------------------


def build_full_prompt(tile: TileDef) -> str:
    """Combine the style prompt with the tile-specific prompt."""
    return f"{STYLE_PROMPT}\n\n{tile.prompt}"


def generate_tile(
    tile: TileDef,
    *,
    backend: str = "openai",
    model: Optional[str] = None,
    size: int = DEFAULT_SIZE,
    raw: bool = False,
    outdir: Optional[Path] = None,
    force: bool = False,
) -> Path:
    """Generate a single tile and save it."""
    if outdir is None:
        outdir = TILE_DIR

    out_path = outdir / f"{tile.name}.png"
    if out_path.exists() and not force:
        print(f"  ⏭  {tile.name} already exists – skipping (use --force to overwrite)")
        return out_path

    draft_path = DRAFT_DIR / f"{tile.name}_raw.png"
    DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    outdir.mkdir(parents=True, exist_ok=True)

    prompt = build_full_prompt(tile)
    print(f"  🎨 Generating {tile.name} via {backend}...")
    print(f"     Prompt: {prompt[:120]}...")

    gen_fn = BACKENDS[backend]
    kwargs: dict = {}
    if model:
        kwargs["model"] = model

    raw_img = gen_fn(prompt, **kwargs)

    # Save raw draft
    raw_img.save(draft_path)
    print(f"  💾 Raw draft → {draft_path.relative_to(ROOT)}")

    if raw:
        return draft_path

    # Post-process
    tile_img = postprocess(raw_img, size, is_overlay=tile.is_overlay)
    tile_img.save(out_path)
    print(f"  ✅ Tile → {out_path.relative_to(ROOT)}")
    return out_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Generate pixel-art hex tiles using AI image models.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--tile", help="Generate a single tile by name.")
    group.add_argument("--category", help="Generate all tiles in a category (building, overlay, terrain, hero, poi).")
    group.add_argument("--tag", help="Generate all tiles with a specific tag.")
    group.add_argument("--all", action="store_true", help="Generate ALL tiles in the manifest.")
    group.add_argument("--list", action="store_true", help="List all tiles in the manifest and exit.")
    group.add_argument("--missing", action="store_true", help="Generate only tiles that don't have a PNG yet.")

    p.add_argument("--backend", choices=list(BACKENDS.keys()), default="openai",
                    help="AI backend to use (default: openai).")
    p.add_argument("--model", help="Override the model name for the backend.")
    p.add_argument("--size", type=int, default=DEFAULT_SIZE,
                    help=f"Output tile size in pixels (default: {DEFAULT_SIZE}).")
    p.add_argument("--raw", action="store_true",
                    help="Save raw AI output without post-processing.")
    p.add_argument("--outdir", type=Path,
                    help="Custom output directory (default: src/assets/tiles/).")
    p.add_argument("--force", action="store_true",
                    help="Overwrite existing files.")
    p.add_argument("--delay", type=float, default=1.0,
                    help="Delay in seconds between API calls (rate limiting).")
    return p.parse_args()


def list_tiles() -> None:
    """Pretty-print the manifest."""
    cats: dict[str, list[TileDef]] = {}
    for t in MANIFEST:
        cats.setdefault(t.category, []).append(t)

    for cat, tiles in sorted(cats.items()):
        print(f"\n{'═' * 60}")
        print(f"  {cat.upper()} ({len(tiles)} tiles)")
        print(f"{'═' * 60}")
        for t in tiles:
            exists = (TILE_DIR / f"{t.name}.png").exists()
            status = "✅" if exists else "❌"
            print(f"  {status} {t.name:<35} [{', '.join(t.tags)}]")
            print(f"     {t.prompt[:80]}...")


def main() -> None:
    args = parse_args()

    if args.list:
        list_tiles()
        return

    manifest = get_manifest_dict()

    # Determine which tiles to generate
    tiles: list[TileDef] = []

    if args.tile:
        if args.tile not in manifest:
            print(f"❌ Unknown tile '{args.tile}'. Use --list to see available tiles.")
            sys.exit(1)
        tiles = [manifest[args.tile]]
    elif args.category:
        tiles = [t for t in MANIFEST if t.category == args.category]
        if not tiles:
            print(f"❌ No tiles in category '{args.category}'.")
            sys.exit(1)
    elif args.tag:
        tiles = [t for t in MANIFEST if args.tag in t.tags]
        if not tiles:
            print(f"❌ No tiles with tag '{args.tag}'.")
            sys.exit(1)
    elif args.all:
        tiles = list(MANIFEST)
    elif args.missing:
        outdir = args.outdir or TILE_DIR
        tiles = [t for t in MANIFEST if not (outdir / f"{t.name}.png").exists()]
        if not tiles:
            print("✅ All tiles already exist!")
            return

    print(f"\n🖼  Generating {len(tiles)} tile(s) via {args.backend}\n")

    succeeded = 0
    failed = 0

    for i, tile in enumerate(tiles, 1):
        print(f"[{i}/{len(tiles)}] {tile.name}")
        try:
            generate_tile(
                tile,
                backend=args.backend,
                model=args.model,
                size=args.size,
                raw=args.raw,
                outdir=args.outdir,
                force=args.force,
            )
            succeeded += 1
        except Exception as e:
            print(f"  ❌ Failed: {e}")
            failed += 1

        if i < len(tiles) and args.delay > 0:
            time.sleep(args.delay)

    print(f"\n{'─' * 40}")
    print(f"Done: {succeeded} succeeded, {failed} failed")


if __name__ == "__main__":
    main()
