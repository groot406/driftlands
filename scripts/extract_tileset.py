from __future__ import annotations

import argparse
import json
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/Users/andredegroot/Downloads/ChatGPT Image Apr 22, 2026 at 04_15_42 PM.png")
DEFAULT_OUTPUT_DIR = ROOT / "output" / "tilesets" / "apr22"
DEFAULT_MANIFEST = DEFAULT_OUTPUT_DIR / "manifest.json"
DEFAULT_LIVE_ASSET_DIR = ROOT / "src" / "assets" / "tiles"

STATUS_VALUES = {"promote", "stage", "skip"}
KIND_VALUES = {
    "terrainBase",
    "terrainWithOverhang",
    "buildingOverlay",
    "fullTileBuilding",
    "reviewOnly",
}

TERRAIN_OVERHANG_CUT_Y: dict[str, int] = {
    "forest_overlay": 34,
    "mountains_overhang": 26,
    "vulcano_overhang": 22,
    "grain_overhang": 36,
    "towncenter_overlay": 30,
}


@dataclass(frozen=True)
class TileMapping:
    label: str
    status: str
    kind: str
    baseAssetKey: str | None = None
    overlayAssetKey: str | None = None
    renderAnchor: str | None = None
    overlayOffset: dict[str, int] | None = None


DEFAULT_TILE_MAP: dict[tuple[int, int], TileMapping] = {
    (0, 0): TileMapping("Plains", "promote", "terrainBase", "plains"),
    (0, 1): TileMapping("Plains Grass Detail", "stage", "reviewOnly"),
    (0, 2): TileMapping("Plains Wildflowers", "stage", "reviewOnly"),
    (0, 3): TileMapping("Plains Clover", "stage", "reviewOnly"),
    (0, 4): TileMapping("Plains Meadow", "stage", "reviewOnly"),
    (0, 5): TileMapping("Road Bend", "stage", "reviewOnly"),
    (0, 6): TileMapping("Road Corner", "stage", "reviewOnly"),
    (0, 7): TileMapping("Road Split", "stage", "reviewOnly"),
    (0, 8): TileMapping("Dirt Pebbles", "promote", "terrainBase", "dirt_pebbles"),
    (0, 9): TileMapping("Mountain Lichen", "promote", "terrainBase", "mountains_lichen"),
    (0, 10): TileMapping("Mountain Scree", "promote", "terrainBase", "mountains_scree"),
    (0, 11): TileMapping("Mountain Ridge", "promote", "terrainBase", "mountains_ridge"),
    (1, 0): TileMapping("Forest", "promote", "terrainWithOverhang", "forest", "forest_overlay", "terrain-top", {"x": 0, "y": 0}),
    (1, 1): TileMapping("Young Forest", "promote", "terrainBase", "young_forest"),
    (1, 2): TileMapping("Forest Mushrooms", "promote", "terrainBase", "forest_mushrooms"),
    (1, 3): TileMapping("Dense Forest", "stage", "reviewOnly"),
    (1, 4): TileMapping("Forest Camp", "stage", "reviewOnly"),
    (1, 5): TileMapping("Pine Forest", "stage", "reviewOnly"),
    (1, 6): TileMapping("Road End", "stage", "reviewOnly"),
    (1, 7): TileMapping("Rocky Road", "stage", "reviewOnly"),
    (1, 8): TileMapping("Rocky Forest", "stage", "reviewOnly"),
    (1, 9): TileMapping("Rocky Plains", "stage", "reviewOnly"),
    (1, 10): TileMapping("Rocky Hills", "stage", "reviewOnly"),
    (1, 11): TileMapping("Rocky Field", "stage", "reviewOnly"),
    (2, 0): TileMapping("Mountains", "promote", "terrainWithOverhang", "mountains-v2", "mountains_overhang", "terrain-top", {"x": 0, "y": 0}),
    (2, 1): TileMapping("Mountains Ashen", "promote", "terrainBase", "mountains_ashen"),
    (2, 2): TileMapping("Mountain Peak", "stage", "reviewOnly"),
    (2, 3): TileMapping("Mountain Dark", "stage", "reviewOnly"),
    (2, 4): TileMapping("Snowy Mountain", "stage", "reviewOnly"),
    (2, 5): TileMapping("Snowy Ridge", "stage", "reviewOnly"),
    (2, 6): TileMapping("Snow Mountains", "stage", "reviewOnly"),
    (2, 7): TileMapping("Snow Mountain Rocks", "stage", "reviewOnly"),
    (2, 8): TileMapping("Snow Pines", "promote", "terrainBase", "snow_pines"),
    (2, 9): TileMapping("Snow Rock", "promote", "terrainBase", "snow_rock"),
    (2, 10): TileMapping("Snow", "promote", "terrainBase", "snow"),
    (2, 11): TileMapping("Ice Water", "stage", "reviewOnly"),
    (3, 0): TileMapping("Water", "promote", "terrainBase", "water-v2"),
    (3, 1): TileMapping("Water Lily", "promote", "terrainBase", "water_lily"),
    (3, 2): TileMapping("Water Reeds", "promote", "terrainBase", "water_reeds"),
    (3, 3): TileMapping("Water Shallows", "promote", "terrainBase", "water_shallows"),
    (3, 4): TileMapping("Water Islets", "promote", "terrainBase", "water_islets"),
    (3, 5): TileMapping("Dirt Mossy", "promote", "terrainBase", "dirt_mossy"),
    (3, 6): TileMapping("Dirt Rocks", "promote", "terrainBase", "dirt_rocks"),
    (3, 7): TileMapping("Plains Rock", "promote", "terrainBase", "plains_rock"),
    (3, 8): TileMapping("Rocky Plains Detail", "stage", "reviewOnly"),
    (3, 9): TileMapping("Dessert Shrubs", "promote", "terrainBase", "dessert_shrubs"),
    (3, 10): TileMapping("Dessert", "promote", "terrainBase", "dessert"),
    (3, 11): TileMapping("Dessert Stones", "promote", "terrainBase", "dessert_stones"),
    (4, 0): TileMapping("Dirt Cracked", "promote", "terrainBase", "dirt_cracked"),
    (4, 1): TileMapping("Cactus", "promote", "terrainBase", "cactus"),
    (4, 2): TileMapping("Dessert Rock", "promote", "terrainBase", "dessert_rock"),
    (4, 3): TileMapping("Dirt Big Rock", "promote", "terrainBase", "dirt_big_rock"),
    (4, 4): TileMapping("Dessert Rock Two", "promote", "terrainBase", "dessert_rock2"),
    (4, 5): TileMapping("Black Rock", "stage", "reviewOnly"),
    (4, 6): TileMapping("Black Rock Detail", "stage", "reviewOnly"),
    (4, 7): TileMapping("Lava Cracks", "stage", "reviewOnly"),
    (4, 8): TileMapping("Volcanic Cracks", "stage", "reviewOnly"),
    (4, 9): TileMapping("Vulcano", "promote", "terrainWithOverhang", "vulcano", "vulcano_overhang", "terrain-top", {"x": 0, "y": 0}),
    (4, 10): TileMapping("Lava Field", "stage", "reviewOnly"),
    (4, 11): TileMapping("Vulcano Tall", "stage", "reviewOnly"),
    (5, 0): TileMapping("Grain", "promote", "terrainWithOverhang", "grain-v2", "grain_overhang", "terrain-top", {"x": 0, "y": 0}),
    (5, 1): TileMapping("Grain Dense", "promote", "terrainBase", "grain_dense"),
    (5, 2): TileMapping("Dirt Tilled", "promote", "terrainBase", "dirt_tilled"),
    (5, 3): TileMapping("Orchard Red", "stage", "reviewOnly"),
    (5, 4): TileMapping("Orchard Orange", "stage", "reviewOnly"),
    (5, 5): TileMapping("Berry Orchard", "stage", "reviewOnly"),
    (5, 6): TileMapping("White Flower Field", "stage", "reviewOnly"),
    (5, 7): TileMapping("Rose Field", "stage", "reviewOnly"),
    (5, 8): TileMapping("Windmill", "stage", "reviewOnly"),
    (5, 9): TileMapping("House Red Roof", "stage", "reviewOnly"),
    (5, 10): TileMapping("House Red Roof Two", "stage", "reviewOnly"),
    (5, 11): TileMapping("House Blue Roof", "promote", "fullTileBuilding", "house"),
    (6, 0): TileMapping("House Red Roof Alternate", "stage", "reviewOnly"),
    (6, 1): TileMapping("House Blue Roof Alternate", "stage", "reviewOnly"),
    (6, 2): TileMapping("House Yellow Roof", "stage", "reviewOnly"),
    (6, 3): TileMapping("Market Stall", "stage", "reviewOnly"),
    (6, 4): TileMapping("Depot", "stage", "reviewOnly"),
    (6, 5): TileMapping("Forge", "stage", "reviewOnly"),
    (6, 6): TileMapping("Workshop Blue Roof", "stage", "reviewOnly"),
    (6, 7): TileMapping("Workshop", "stage", "reviewOnly"),
    (6, 8): TileMapping("Quarry Building", "stage", "reviewOnly"),
    (6, 9): TileMapping("Covered Workshop", "stage", "reviewOnly"),
    (6, 10): TileMapping("Stone Building", "stage", "reviewOnly"),
    (6, 11): TileMapping("Lumber Building", "stage", "reviewOnly"),
    (7, 0): TileMapping("Church", "stage", "reviewOnly"),
    (7, 1): TileMapping("Blue House", "stage", "reviewOnly"),
    (7, 2): TileMapping("Red Church", "stage", "reviewOnly"),
    (7, 3): TileMapping("Blue Church", "stage", "reviewOnly"),
    (7, 4): TileMapping("Stone Tower", "stage", "reviewOnly"),
    (7, 5): TileMapping("Castle Red", "stage", "reviewOnly"),
    (7, 6): TileMapping("Castle Keep Red", "stage", "reviewOnly"),
    (7, 7): TileMapping("Castle Keep Blue", "stage", "reviewOnly"),
    (7, 8): TileMapping("Town Center Candidate", "stage", "reviewOnly"),
    (7, 9): TileMapping("Fortified House", "stage", "reviewOnly"),
    (7, 10): TileMapping("Wooden Fort", "stage", "reviewOnly"),
    (7, 11): TileMapping("Town House", "stage", "reviewOnly"),
    (8, 0): TileMapping("Red Market Tent", "stage", "reviewOnly"),
    (8, 1): TileMapping("Purple Market Tent", "stage", "reviewOnly"),
    (8, 2): TileMapping("Blue Market Tent", "stage", "reviewOnly"),
    (8, 3): TileMapping("Green Market Tent", "stage", "reviewOnly"),
    (8, 4): TileMapping("Canopy Tent", "stage", "reviewOnly"),
    (8, 5): TileMapping("Wooden Watchtower", "stage", "reviewOnly"),
    (8, 6): TileMapping("Wooden Tower", "stage", "reviewOnly"),
    (8, 7): TileMapping("Red Wooden Tower", "stage", "reviewOnly"),
    (8, 8): TileMapping("Wood Fort", "stage", "reviewOnly"),
    (8, 9): TileMapping("Blue Roof Fort", "stage", "reviewOnly"),
    (8, 10): TileMapping("Golden Tower", "stage", "reviewOnly"),
    (8, 11): TileMapping("Wood Hut", "stage", "reviewOnly"),
    (9, 0): TileMapping("Wood Shed", "stage", "reviewOnly"),
    (9, 1): TileMapping("Wood Shrine", "stage", "reviewOnly"),
    (9, 2): TileMapping("Wood Camp", "stage", "reviewOnly"),
    (9, 3): TileMapping("Wood Hut Two", "stage", "reviewOnly"),
    (9, 4): TileMapping("Mine Camp", "stage", "reviewOnly"),
    (9, 5): TileMapping("Worksite", "stage", "reviewOnly"),
    (9, 6): TileMapping("Stone Worksite", "stage", "reviewOnly"),
    (9, 7): TileMapping("Ruined Castle", "stage", "reviewOnly"),
    (9, 8): TileMapping("Stone Ruins", "stage", "reviewOnly"),
    (9, 9): TileMapping("Stone Gate", "stage", "reviewOnly"),
    (9, 10): TileMapping("Round Stone Ruin", "stage", "reviewOnly"),
    (9, 11): TileMapping("Stone Tower Ruin", "stage", "reviewOnly"),
    (10, 0): TileMapping("Ancient Pillars", "stage", "reviewOnly"),
    (10, 1): TileMapping("Stone Monolith", "stage", "reviewOnly"),
    (10, 2): TileMapping("Rubble", "stage", "reviewOnly"),
    (10, 3): TileMapping("Stone Table", "stage", "reviewOnly"),
    (10, 4): TileMapping("Stone Circle", "stage", "reviewOnly"),
    (10, 5): TileMapping("Stone Pillars", "stage", "reviewOnly"),
    (10, 6): TileMapping("Stone Circle Ruins", "stage", "reviewOnly"),
    (10, 7): TileMapping("Obelisk", "stage", "reviewOnly"),
    (10, 8): TileMapping("Blue Roof Shrine", "stage", "reviewOnly"),
    (10, 9): TileMapping("Ruin Columns", "stage", "reviewOnly"),
    (10, 10): TileMapping("Crystal Shrine", "stage", "reviewOnly"),
    (10, 11): TileMapping("Wood Gate", "stage", "reviewOnly"),
    (11, 0): TileMapping("Golden Building", "stage", "reviewOnly"),
    (11, 1): TileMapping("Tall Obelisk", "stage", "reviewOnly"),
    (11, 2): TileMapping("Blue Crystal", "stage", "reviewOnly"),
    (11, 3): TileMapping("Ice Crystal", "stage", "reviewOnly"),
    (11, 4): TileMapping("Stone Monument", "stage", "reviewOnly"),
    (11, 5): TileMapping("Crystal Cluster", "stage", "reviewOnly"),
    (11, 6): TileMapping("White Stones", "stage", "reviewOnly"),
    (11, 7): TileMapping("Lava Spire", "stage", "reviewOnly"),
    (11, 8): TileMapping("Stonehenge", "stage", "reviewOnly"),
    (11, 9): TileMapping("Dead Tree", "stage", "reviewOnly"),
    (11, 10): TileMapping("Rock Spire", "stage", "reviewOnly"),
    (11, 11): TileMapping("Stone Mountain Cluster", "stage", "reviewOnly"),
}


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / path


def is_near_black(pixel: tuple[int, int, int, int], threshold: int) -> bool:
    r, g, b, a = pixel
    return a == 0 or max(r, g, b) <= threshold


def border_background_mask(image: Image.Image, threshold: int) -> list[list[bool]]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    mask = [[False for _ in range(width)] for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height or mask[y][x]:
            continue
        if not is_near_black(pixels[x, y], threshold):
            continue
        mask[y][x] = True
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    return mask


def apply_background_alpha(image: Image.Image, threshold: int) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y, row in enumerate(border_background_mask(rgba, threshold)):
        for x, is_background in enumerate(row):
            if is_background:
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    return rgba


def foreground_counts(image: Image.Image, axis: str) -> list[int]:
    alpha = image.getchannel("A").load()
    width, height = image.size
    if axis == "x":
        return [sum(1 for y in range(height) if alpha[x, y] > 0) for x in range(width)]
    return [sum(1 for x in range(width) if alpha[x, y] > 0) for y in range(height)]


def find_bands(counts: list[int], threshold: int, min_width: int) -> list[tuple[int, int]]:
    bands: list[tuple[int, int]] = []
    start: int | None = None
    for index, count in enumerate(counts):
        if count >= threshold:
            if start is None:
                start = index
            continue
        if start is not None:
            if index - start >= min_width:
                bands.append((start, index - 1))
            start = None
    if start is not None and len(counts) - start >= min_width:
        bands.append((start, len(counts) - 1))
    return bands


def infer_grid(image: Image.Image, threshold: int) -> dict[str, Any]:
    transparent = apply_background_alpha(image, threshold)
    width, height = transparent.size
    x_counts = foreground_counts(transparent, "x")
    y_counts = foreground_counts(transparent, "y")
    x_threshold = max(12, int(max(x_counts) * 0.12))
    y_threshold = max(12, int(max(y_counts) * 0.12))
    x_bands = find_bands(x_counts, x_threshold, max(8, width // 160))
    y_bands = find_bands(y_counts, y_threshold, max(8, height // 160))

    cols = max(1, len(x_bands))
    x_pitch = width / cols
    inferred_rows = round(height / x_pitch)
    rows = max(1, inferred_rows)

    if 8 <= len(y_bands) <= 20 and abs(len(y_bands) - rows) <= 1:
        rows = len(y_bands)

    cells = []
    for row in range(rows):
        for col in range(cols):
            left = round(col * width / cols)
            top = round(row * height / rows)
            right = round((col + 1) * width / cols)
            bottom = round((row + 1) * height / rows)
            cells.append({"row": row, "col": col, "left": left, "top": top, "right": right, "bottom": bottom})

    uniform_score = 1.0
    if len(x_bands) > 1:
        centers = [(left + right) / 2 for left, right in x_bands]
        gaps = [centers[i + 1] - centers[i] for i in range(len(centers) - 1)]
        if gaps:
            uniform_score = max(0.0, 1 - ((max(gaps) - min(gaps)) / max(gaps)))

    return {
        "rows": rows,
        "cols": cols,
        "confidence": round(0.72 + min(0.25, uniform_score * 0.25), 3),
        "method": "border-connected-background-column-projection",
        "visualBands": {
            "columns": [{"left": left, "right": right} for left, right in x_bands],
            "rows": [{"top": top, "bottom": bottom} for top, bottom in y_bands],
        },
        "cellBounds": cells,
    }


def hex_mask(size: int) -> Image.Image:
    # Use a 1-bit mask first to avoid anti-aliased alpha fringes.
    mask = Image.new("1", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    w = h = size
    draw.polygon(
        [
            (w // 2, 0),
            (w - 1, h // 4),
            (w - 1, (3 * h) // 4),
            (w // 2, h - 1),
            (0, (3 * h) // 4),
            (0, h // 4),
        ],
        fill=255,
    )
    return mask.convert("L")


def hard_alpha(image: Image.Image, cutoff: int = 96) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 255 if value >= cutoff else 0)
    rgba.putalpha(alpha)
    return rgba


def normalize_crop_to_tile(crop: Image.Image, tile_size: int) -> Image.Image:
    rgba = crop.convert("RGBA")
    bbox = transparent_bbox(rgba)
    if not bbox:
        return Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))
    trimmed = rgba.crop(bbox)
    return trimmed.resize((tile_size, tile_size), Image.Resampling.BOX)


def mask_base_tile(crop: Image.Image, tile_size: int) -> Image.Image:
    tile = normalize_crop_to_tile(crop, tile_size)
    source_alpha = tile.getchannel("A")
    mask = hex_mask(tile_size)
    tile.putalpha(Image.composite(source_alpha, Image.new("L", (tile_size, tile_size), 0), mask))
    return hard_alpha(tile)


def overhang_tile(crop: Image.Image, tile_size: int, overlay_key: str | None = None) -> Image.Image:
    tile = normalize_crop_to_tile(crop, tile_size)
    cutoff = TERRAIN_OVERHANG_CUT_Y.get(overlay_key or "", int(tile_size * 0.34))
    cutoff = max(0, min(tile_size - 1, cutoff))

    pixels = tile.load()
    for y in range(tile_size):
        for x in range(tile_size):
            r, g, b, a = pixels[x, y]
            if y >= cutoff:
                pixels[x, y] = (r, g, b, 0)
            elif a < 96:
                pixels[x, y] = (r, g, b, 0)

    return hard_alpha(tile)


def transparent_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.convert("RGBA").getchannel("A").getbbox()


def fit_overlay(crop: Image.Image, width: int = 66, max_height: int = 128) -> Image.Image:
    rgba = crop.convert("RGBA")
    bbox = transparent_bbox(rgba)
    if not bbox:
        return Image.new("RGBA", (width, width), (0, 0, 0, 0))

    foreground = rgba.crop(bbox)
    scale = width / max(1, foreground.width)
    height = min(max_height, max(1, round(foreground.height * scale)))
    resized = foreground.resize((width, height), Image.Resampling.BOX)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (0, 0))
    return canvas


def load_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def mapping_for(row: int, col: int) -> TileMapping:
    return DEFAULT_TILE_MAP.get((row, col), TileMapping(f"Tile {row:02d},{col:02d}", "stage", "reviewOnly"))


def create_manifest(source: Path, output: Path, threshold: int) -> dict[str, Any]:
    image = Image.open(source).convert("RGBA")
    grid = infer_grid(image, threshold)
    tiles = []
    for cell in grid["cellBounds"]:
        mapping = mapping_for(cell["row"], cell["col"])
        if mapping.status not in STATUS_VALUES:
            raise ValueError(f"Invalid status {mapping.status}")
        if mapping.kind not in KIND_VALUES:
            raise ValueError(f"Invalid kind {mapping.kind}")

        tiles.append({
            "row": cell["row"],
            "col": cell["col"],
            "crop": {
                "left": cell["left"],
                "top": cell["top"],
                "right": cell["right"],
                "bottom": cell["bottom"],
            },
            **asdict(mapping),
        })

    manifest = {
        "source": {
            "path": str(source),
            "width": image.width,
            "height": image.height,
        },
        "detectedGrid": grid,
        "tiles": tiles,
    }
    write_json(output, manifest)
    return manifest


def output_paths(outdir: Path, row: int, col: int, key: str | None = None) -> dict[str, Path]:
    name = key or f"r{row:02d}_c{col:02d}"
    return {
        "crop": outdir / "crops" / f"r{row:02d}_c{col:02d}_{name}.png",
        "base": outdir / "base" / f"{name}.png",
        "overlay": outdir / "overlays" / f"{name}_overlay.png",
    }


def save_if_non_empty(image: Image.Image, path: Path, min_alpha_pixels: int = 24) -> bool:
    rgba = image.convert("RGBA")
    if not transparent_bbox(rgba):
        return False
    alpha_histogram = rgba.getchannel("A").histogram()
    alpha_pixels = sum(alpha_histogram[1:])
    if alpha_pixels < min_alpha_pixels:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(path)
    return True


def promote_asset(source: Path, key: str, live_asset_dir: Path) -> Path:
    destination = live_asset_dir / f"{key}.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.open(source).convert("RGBA").save(destination)
    return destination


def extract_from_manifest(
    manifest: dict[str, Any],
    *,
    outdir: Path,
    threshold: int,
    tile_size: int,
    promote: bool,
    live_asset_dir: Path,
) -> dict[str, Any]:
    source = Path(manifest["source"]["path"])
    sheet = apply_background_alpha(Image.open(source).convert("RGBA"), threshold)
    results: list[dict[str, Any]] = []

    for tile in manifest["tiles"]:
        row = int(tile["row"])
        col = int(tile["col"])
        crop_rect = tile["crop"]
        crop = sheet.crop((crop_rect["left"], crop_rect["top"], crop_rect["right"], crop_rect["bottom"]))
        key = tile.get("baseAssetKey") or f"r{row:02d}_c{col:02d}"
        paths = output_paths(outdir, row, col, key)
        for path in paths.values():
            path.parent.mkdir(parents=True, exist_ok=True)
        crop.save(paths["crop"])

        result: dict[str, Any] = {
            "row": row,
            "col": col,
            "label": tile["label"],
            "status": tile["status"],
            "kind": tile["kind"],
            "cropPath": str(paths["crop"]),
        }

        kind = tile["kind"]
        if kind in {"terrainBase", "terrainWithOverhang", "fullTileBuilding", "reviewOnly"}:
            base = mask_base_tile(crop, tile_size)
            base.save(paths["base"])
            result["basePath"] = str(paths["base"])

        if kind == "terrainWithOverhang":
            overlay_key = tile.get("overlayAssetKey") or f"{key}_overhang"
            overlay_path = outdir / "overlays" / f"{overlay_key}.png"
            overlay = overhang_tile(crop, tile_size)
            if save_if_non_empty(overlay, overlay_path):
                result["overlayPath"] = str(overlay_path)

        if kind == "buildingOverlay":
            overlay_key = tile.get("overlayAssetKey") or key
            overlay_path = outdir / "overlays" / f"{overlay_key}.png"
            overlay = fit_overlay(crop)
            overlay.save(overlay_path)
            result["overlayPath"] = str(overlay_path)

        if promote and tile["status"] == "promote":
            promoted: list[str] = []
            base_key = tile.get("baseAssetKey")
            overlay_key = tile.get("overlayAssetKey")
            if base_key and result.get("basePath"):
                promoted.append(str(promote_asset(Path(result["basePath"]), base_key, live_asset_dir)))
            if overlay_key and result.get("overlayPath"):
                promoted.append(str(promote_asset(Path(result["overlayPath"]), overlay_key, live_asset_dir)))
            result["promotedPaths"] = promoted

        results.append(result)

    extraction = {
        "outdir": str(outdir),
        "tileSize": tile_size,
        "promote": promote,
        "results": results,
    }
    write_json(outdir / "extraction.json", extraction)
    return extraction


def load_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("Arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def checkerboard(size: tuple[int, int], cell: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (31, 36, 48, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(20, 24, 34, 255))
    return image


def paste_preview(sheet: Image.Image, image: Image.Image, x: int, y: int, scale: int) -> None:
    preview = image.convert("RGBA").resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    background = checkerboard(preview.size)
    background.alpha_composite(preview)
    sheet.alpha_composite(background, (x, y))


def create_contact_sheet(extraction: dict[str, Any], output: Path, scales: list[int]) -> Path:
    results = [result for result in extraction["results"] if result["status"] != "skip"]
    font = load_font(12)
    small_font = load_font(10)
    padding = 18
    gap = 16
    preview_w = (64 * sum(scales)) + (gap * (len(scales) - 1))
    row_h = 210
    width = 380 + preview_w
    height = padding * 2 + 34 + (row_h * len(results))
    sheet = Image.new("RGBA", (width, height), (11, 16, 32, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((padding, padding), "Apr 22 tileset extraction review", fill=(235, 241, 255, 255), font=font)
    y = padding + 34

    for result in results:
        label = f"r{result['row']:02d} c{result['col']:02d} - {result['label']}"
        draw.text((padding, y), label, fill=(235, 241, 255, 255), font=font)
        draw.text((padding, y + 16), f"{result['status']} / {result['kind']}", fill=(148, 163, 184, 255), font=small_font)

        crop = Image.open(result["cropPath"]).convert("RGBA")
        crop_preview = crop.resize((96, 96), Image.Resampling.NEAREST)
        crop_bg = checkerboard(crop_preview.size)
        crop_bg.alpha_composite(crop_preview)
        sheet.alpha_composite(crop_bg, (padding, y + 38))
        draw.text((padding, y + 138), "crop", fill=(148, 163, 184, 255), font=small_font)

        x = 140
        if result.get("basePath"):
            base = Image.open(result["basePath"]).convert("RGBA")
            for scale in scales:
                paste_preview(sheet, base, x, y + 38, scale)
                draw.text((x, y + 42 + base.height * scale), f"base {scale}x", fill=(148, 163, 184, 255), font=small_font)
                x += (base.width * scale) + gap
        if result.get("overlayPath"):
            overlay = Image.open(result["overlayPath"]).convert("RGBA")
            paste_preview(sheet, overlay, x, y + 38, 2)
            draw.text((x, y + 44 + overlay.height * 2), "overlay 2x", fill=(148, 163, 184, 255), font=small_font)

        y += row_h

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    return output


def command_detect(args: argparse.Namespace) -> int:
    source = resolve_path(args.source)
    output = resolve_path(args.output)
    manifest = create_manifest(source, output, args.background_threshold)
    grid = manifest["detectedGrid"]
    print(f"detected {grid['rows']}x{grid['cols']} grid at {grid['confidence']} confidence")
    print(output.relative_to(ROOT) if output.is_relative_to(ROOT) else output)
    return 0


def command_extract(args: argparse.Namespace) -> int:
    manifest_path = resolve_path(args.manifest)
    if not manifest_path.exists():
        create_manifest(resolve_path(args.source), manifest_path, args.background_threshold)
    extraction = extract_from_manifest(
        load_manifest(manifest_path),
        outdir=resolve_path(args.outdir),
        threshold=args.background_threshold,
        tile_size=args.tile_size,
        promote=args.promote,
        live_asset_dir=resolve_path(args.live_asset_dir),
    )
    promoted = sum(len(result.get("promotedPaths", [])) for result in extraction["results"])
    print(f"extracted {len(extraction['results'])} tiles")
    if args.promote:
        print(f"promoted {promoted} live assets")
    print((resolve_path(args.outdir) / "extraction.json").relative_to(ROOT))
    return 0


def command_contact_sheet(args: argparse.Namespace) -> int:
    extraction_path = resolve_path(args.extraction)
    if not extraction_path.exists():
        print(f"missing extraction file: {extraction_path}")
        return 1
    output = create_contact_sheet(load_manifest(extraction_path), resolve_path(args.output), args.scales)
    print(output.relative_to(ROOT) if output.is_relative_to(ROOT) else output)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Detect, extract, and review Driftlands tilesets.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    detect = subparsers.add_parser("detect", help="Detect grid cells and write a manifest.")
    detect.add_argument("--source", default=str(DEFAULT_SOURCE))
    detect.add_argument("--output", default=str(DEFAULT_MANIFEST.relative_to(ROOT)))
    detect.add_argument("--background-threshold", type=int, default=6)
    detect.set_defaults(func=command_detect)

    extract = subparsers.add_parser("extract", help="Extract staged and promoted assets from a manifest.")
    extract.add_argument("--source", default=str(DEFAULT_SOURCE))
    extract.add_argument("--manifest", default=str(DEFAULT_MANIFEST.relative_to(ROOT)))
    extract.add_argument("--outdir", default=str(DEFAULT_OUTPUT_DIR.relative_to(ROOT)))
    extract.add_argument("--live-asset-dir", default=str(DEFAULT_LIVE_ASSET_DIR.relative_to(ROOT)))
    extract.add_argument("--background-threshold", type=int, default=6)
    extract.add_argument("--tile-size", type=int, default=64)
    extract.add_argument("--promote", action="store_true", help="Copy manifest entries marked promote into live assets.")
    extract.set_defaults(func=command_extract)

    sheet = subparsers.add_parser("contact-sheet", help="Create a contact sheet from extraction output.")
    sheet.add_argument("--extraction", default=str((DEFAULT_OUTPUT_DIR / "extraction.json").relative_to(ROOT)))
    sheet.add_argument("--output", default=str((DEFAULT_OUTPUT_DIR / "contact-sheet.png").relative_to(ROOT)))
    sheet.add_argument("--scales", nargs="+", type=int, default=[1, 2, 4])
    sheet.set_defaults(func=command_contact_sheet)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except (FileNotFoundError, UnidentifiedImageError, ValueError) as exc:
        print(exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
