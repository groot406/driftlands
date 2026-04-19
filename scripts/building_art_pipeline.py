from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATE_DIR = ROOT / "output" / "art_candidates"
DEFAULT_REVIEW_DIR = ROOT / "output" / "art_review"


@dataclass(frozen=True)
class BuildingAsset:
    key: str
    label: str
    kind: str
    size: tuple[int, int]
    prompt: str
    tile_base: str | None = None


SHARED_PROMPT = """Use case: stylized-concept
Asset type: 64x64 game building foreground candidate for Driftlands
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter building, centered, readable at native 64x64 size, designed to sit inside a flat Driftlands hex tile
Lighting/mood: clear daylight, warm highlights, cool compact shadows
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border, no isometric floating island, no thick dirt block"""


BUILDING_ASSETS: dict[str, BuildingAsset] = {
    "plains_workshop": BuildingAsset(
        key="plains_workshop",
        label="Workshop",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
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
Avoid: fantasy machinery, oversized furnace, tiny clutter, realistic perspective building, square platform, raised terrain chunk""",
    ),
    "plains_bakery": BuildingAsset(
        key="plains_bakery",
        label="Bakery",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
Asset type: 64x64 game building tile for Driftlands
Primary request: create a small rustic bakery on a grassy clipped-corner hex tile
Scene/backdrop: low grassy plains hex tile, no horizon
Subject: compact bakery with thatched roof, small chimney, warm oven glow, bread basket, and timber walls
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter hex game tile, centered building, readable at native 64x64 size
Lighting/mood: warm daylight, cozy food-production feel
Color palette: muted grass green, honey straw, warm brown, tiny ember orange
Materials/textures: thatch roof, wooden wall planks, stone oven, small bread shapes
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border
Avoid: modern bakery, oversized bread sign, smoke cloud hiding silhouette, tiny clutter""",
    ),
    "plains_depot": BuildingAsset(
        key="plains_depot",
        label="Supply Depot",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
Asset type: 64x64 game building tile for Driftlands
Primary request: create a small frontier supply depot on a grassy clipped-corner hex tile
Scene/backdrop: low grassy plains hex tile, no horizon
Subject: open wooden storage shelter with crates, barrels, sacks, and a simple roof on posts
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter hex game tile, centered structure, readable at native 64x64 size
Lighting/mood: practical daylight, logistics hub feel
Color palette: muted grass green, weathered wood, canvas tan, dark barrel hoops
Materials/textures: plank roof, stacked crates, cloth sacks, packed ground marks
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border
Avoid: giant warehouse, modern pallets, unreadable crate noise""",
    ),
    "plains_warehouse": BuildingAsset(
        key="plains_warehouse",
        label="Warehouse",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
Asset type: 64x64 game building tile for Driftlands
Primary request: create a sturdy wooden warehouse on a grassy clipped-corner hex tile
Scene/backdrop: low grassy plains hex tile, no horizon
Subject: compact enclosed warehouse with double doors, stronger roof, stacked crates, and stone footings
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter hex game tile, centered building, readable at native 64x64 size
Lighting/mood: stable daylight, upgraded logistics feel
Color palette: muted grass green, deep wood brown, slate shadow, canvas tan highlights
Materials/textures: heavy timber, door planks, stone base, crate stacks
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border
Avoid: massive barn, modern warehouse, busy roof pattern""",
    ),
    "plains_campfire": BuildingAsset(
        key="plains_campfire",
        label="Campfire",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
Asset type: 64x64 game building tile for Driftlands
Primary request: create a small frontier campfire on a grassy clipped-corner hex tile
Scene/backdrop: low grassy plains hex tile, no horizon
Subject: stone fire ring with orange flames, ember center, two log seats, and a compact trampled patch
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter hex game tile, centered campfire, readable at native 64x64 size
Lighting/mood: warm survival outpost feel
Color palette: muted grass green, charred brown, stone gray, amber orange flame
Materials/textures: stone ring, split logs, small flame clusters, scorched ground
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border
Avoid: huge bonfire, tents, tall smoke column, fantasy magic flame""",
    ),
    "plains_house": BuildingAsset(
        key="plains_house",
        label="House",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
Asset type: 64x64 game building tile for Driftlands
Primary request: create a small settler house on a grassy clipped-corner hex tile
Scene/backdrop: low grassy plains hex tile, no horizon
Subject: cozy timber cottage with peaked roof, tiny door, small window, and simple stone threshold
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter hex game tile, centered house, readable at native 64x64 size
Lighting/mood: welcoming daylight, early settlement shelter
Color palette: muted grass green, warm wood brown, straw roof tan, cool shadow blue-gray
Materials/textures: wood beams, thatch or plank roof, stone doorstep, compact shadow
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border
Avoid: mansion, chimney smoke hiding roof, realistic perspective, tiny garden clutter""",
    ),
    "plains_stone_house": BuildingAsset(
        key="plains_stone_house",
        label="Stone House",
        kind="tile",
        size=(64, 64),
        tile_base="src/assets/tiles/plains.png",
        prompt="""Use case: stylized-concept
Asset type: 64x64 game building tile for Driftlands
Primary request: create an upgraded stone settler house on a grassy clipped-corner hex tile
Scene/backdrop: low grassy plains hex tile, no horizon
Subject: compact stone cottage with slate roof, stronger doorway, small lit window, and tidy stone base
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter hex game tile, centered house, readable at native 64x64 size
Lighting/mood: sturdy daylight, upgraded housing feel
Color palette: muted grass green, cool stone gray, slate roof blue-gray, warm window highlight
Materials/textures: chunky stone blocks, slate roof, dark mortar lines, small wood door
Constraints: no text, no logo, no watermark, no UI frame, no photorealism, no blur, no smooth gradients, no antialiasing, no square border
Avoid: castle tower, large mansion, excessive roof tiles, tiny unreadable masonry""",
    ),
    "building_well_overlay": BuildingAsset(
        key="building_well_overlay",
        label="Well Overlay",
        kind="overlay",
        size=(66, 66),
        prompt="""Use case: stylized-concept
Asset type: transparent pixel-art building overlay for Driftlands
Primary request: create a small stone well building sprite with transparent background
Scene/backdrop: transparent background only, no terrain
Subject: round stone well, wooden roof frame, rope, bucket, and tiny water glint
Style/medium: true pixel art, hard-edged sprite clusters, limited palette
Composition/framing: top-down slight three-quarter sprite, centered, readable around 66x66 pixels
Lighting/mood: clear daylight utility building
Color palette: stone gray, weathered wood brown, rope tan, tiny blue water highlight
Materials/textures: chunky stones, wooden beams, bucket, compact shadow
Constraints: transparent background, no ground tile, no text, no logo, no watermark, no photorealism, no blur, no smooth gradients, no antialiasing
Avoid: large fountain, square background, modern pulley, tiny noisy stones""",
    ),
}


def resolve_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / path


def expand_sources(values: list[str]) -> list[Path]:
    paths: list[Path] = []
    for value in values:
        if Path(value).is_absolute():
            paths.append(Path(value))
            continue

        matches = sorted(resolve_path(match) for match in Path().glob(value))
        if matches:
            paths.extend(matches)
        else:
            paths.append(resolve_path(value))
    return paths


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


def luminance(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def clean_edge_outline(tile: Image.Image) -> Image.Image:
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

            total = sum(weight for *_, weight in samples)
            pixels[x, y] = (
                int(sum(sr * weight for sr, _, _, weight in samples) / total),
                int(sum(sg * weight for _, sg, _, weight in samples) / total),
                int(sum(sb * weight for _, _, sb, weight in samples) / total),
                a,
            )

    return tile


def quantize_colors(image: Image.Image, max_colors: int) -> Image.Image:
    if max_colors <= 0:
        return image

    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    quantized = rgb.quantize(colors=max_colors, method=Image.Quantize.MEDIANCUT, dither=0)
    result = quantized.convert("RGBA")
    result.putalpha(alpha)
    return result


def center_crop_square(image: Image.Image) -> Image.Image:
    size = min(image.width, image.height)
    left = (image.width - size) // 2
    top = (image.height - size) // 2
    return image.crop((left, top, left + size, top + size))


def transparent_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def remove_inferred_background(image: Image.Image, threshold: int) -> Image.Image:
    if threshold <= 0:
        return image

    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    corners = [pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1]]
    bg = tuple(round(sum(c[i] for c in corners) / len(corners)) for i in range(3))

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            distance = math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2)
            if distance <= threshold:
                pixels[x, y] = (r, g, b, 0)

    return rgba


def resize_to_fit(image: Image.Image, bounds: tuple[int, int]) -> Image.Image:
    fitted = image.copy()
    fitted.thumbnail(bounds, Image.Resampling.BOX)
    return fitted


def compose_on_tile_base(
    foreground: Image.Image,
    *,
    base_tile: Path,
    size: tuple[int, int],
    foreground_scale: float,
    y_offset: int,
    max_colors: int,
) -> Image.Image:
    base = Image.open(base_tile).convert("RGBA")
    base = center_crop_square(base).resize(size, Image.Resampling.BOX)
    base.putalpha(hex_mask(size[0]))

    bbox = transparent_bbox(foreground)
    if bbox:
        foreground = foreground.crop(bbox)
    else:
        foreground = center_crop_square(foreground)

    max_width = max(1, round(size[0] * foreground_scale))
    max_height = max(1, round(size[1] * foreground_scale))
    foreground = resize_to_fit(foreground, (max_width, max_height))

    composed = base.copy()
    left = (size[0] - foreground.width) // 2
    top = max(0, min(size[1] - foreground.height, (size[1] - foreground.height) // 2 + y_offset))
    composed.alpha_composite(foreground, (left, top))
    composed = quantize_colors(composed, max_colors)
    composed.putalpha(hex_mask(size[0]))
    return clean_edge_outline(composed)


def process_image(
    source: Path,
    *,
    kind: str,
    size: tuple[int, int],
    max_colors: int,
    bg_threshold: int,
    tile_base: Path | None,
    foreground_scale: float,
    y_offset: int,
) -> Image.Image:
    image = Image.open(source).convert("RGBA")

    if kind == "overlay":
        image = remove_inferred_background(image, bg_threshold)
        bbox = transparent_bbox(image)
        if bbox:
            image = image.crop(bbox)
        else:
            image = center_crop_square(image)
        image.thumbnail(size, Image.Resampling.BOX)
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        left = (size[0] - image.width) // 2
        top = (size[1] - image.height) // 2
        canvas.alpha_composite(image, (left, top))
        return quantize_colors(canvas, max_colors)

    if tile_base:
        foreground = remove_inferred_background(image, bg_threshold)
        return compose_on_tile_base(
            foreground,
            base_tile=tile_base,
            size=size,
            foreground_scale=foreground_scale,
            y_offset=y_offset,
            max_colors=max_colors,
        )

    tile_size = size[0]
    image = center_crop_square(image)
    image = image.resize((tile_size, tile_size), Image.Resampling.BOX)
    image = quantize_colors(image, max_colors)
    image.putalpha(hex_mask(tile_size))
    return clean_edge_outline(image)


def safe_output_path(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    index = 2
    while True:
        candidate = parent / f"{stem}-v{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def asset_from_args(asset_key: str | None) -> BuildingAsset:
    if asset_key and asset_key in BUILDING_ASSETS:
        return BUILDING_ASSETS[asset_key]
    if asset_key:
        return BuildingAsset(asset_key, asset_key.replace("_", " ").title(), "tile", (64, 64), SHARED_PROMPT)
    return BuildingAsset("unknown", "Unknown", "tile", (64, 64), SHARED_PROMPT)


def command_prompts(args: argparse.Namespace) -> int:
    keys = [args.asset] if args.asset else BUILDING_ASSETS.keys()
    for key in keys:
        asset = BUILDING_ASSETS.get(key)
        if not asset:
            print(f"Unknown asset: {key}", file=sys.stderr)
            return 2
        print(f"## {asset.key} - {asset.label}\n")
        print(asset.prompt)
        print()
    return 0


def command_postprocess(args: argparse.Namespace) -> int:
    asset = asset_from_args(args.asset)
    kind = args.kind if args.kind != "auto" else asset.kind
    size = tuple(args.size) if args.size else asset.size
    tile_base = resolve_path(args.tile_base) if args.tile_base else (resolve_path(asset.tile_base) if asset.tile_base and not args.no_tile_base else None)
    sources = expand_sources(args.sources)
    outdir = resolve_path(args.outdir) / asset.key / "processed"
    outdir.mkdir(parents=True, exist_ok=True)

    wrote = 0
    for source in sources:
        if not source.exists():
            print(f"missing: {source}", file=sys.stderr)
            continue
        try:
            processed = process_image(
                source,
                kind=kind,
                size=size,
                max_colors=args.max_colors,
                bg_threshold=args.bg_threshold,
                tile_base=tile_base if kind == "tile" else None,
                foreground_scale=args.foreground_scale,
                y_offset=args.y_offset,
            )
        except UnidentifiedImageError:
            print(f"not an image: {source}", file=sys.stderr)
            continue

        output = safe_output_path(outdir / f"{source.stem}-{kind}-{size[0]}x{size[1]}.png")
        processed.save(output)
        wrote += 1
        print(output.relative_to(ROOT) if output.is_relative_to(ROOT) else output)

    return 0 if wrote else 1


def validate_image(path: Path, expected_size: tuple[int, int] | None, require_rgba: bool, require_alpha: bool) -> list[str]:
    errors: list[str] = []
    try:
        image = Image.open(path)
    except UnidentifiedImageError:
        return ["not a readable image"]

    if image.format != "PNG":
        errors.append(f"expected PNG, got {image.format or 'unknown'}")
    if require_rgba and image.mode != "RGBA":
        errors.append(f"expected RGBA, got {image.mode}")
    if expected_size and image.size != expected_size:
        errors.append(f"expected {expected_size[0]}x{expected_size[1]}, got {image.width}x{image.height}")
    if require_alpha:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        if alpha.getextrema() == (255, 255):
            errors.append("expected transparent pixels, image is fully opaque")

    return errors


def command_validate(args: argparse.Namespace) -> int:
    expected_size = tuple(args.size) if args.size else None
    sources = expand_sources(args.sources)
    failed = False
    for source in sources:
        if not source.exists():
            print(f"FAIL {source}: missing")
            failed = True
            continue
        errors = validate_image(source, expected_size, not args.allow_non_rgba, args.require_alpha)
        label = source.relative_to(ROOT) if source.is_relative_to(ROOT) else source
        if errors:
            print(f"FAIL {label}: {'; '.join(errors)}")
            failed = True
        else:
            print(f"OK   {label}")
    return 1 if failed else 0


def load_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("Arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def label_for_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def scaled_cell(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def command_contact_sheet(args: argparse.Namespace) -> int:
    sources = [source for source in expand_sources(args.sources) if source.exists()]
    if not sources:
        print("No readable sources found.", file=sys.stderr)
        return 1

    font = load_font(12)
    label_font = load_font(10)
    rows: list[tuple[Path, Image.Image]] = []
    max_width = 0
    row_height = 0
    scales = args.scales

    for source in sources:
        try:
            image = Image.open(source).convert("RGBA")
        except UnidentifiedImageError:
            continue
        rows.append((source, image))
        preview_width = sum(image.width * scale for scale in scales) + (len(scales) - 1) * args.gap
        max_width = max(max_width, preview_width)
        row_height = max(row_height, max(image.height * scale for scale in scales) + 34)

    if not rows:
        print("No readable images found.", file=sys.stderr)
        return 1

    width = max_width + args.padding * 2
    height = args.padding * 2 + row_height * len(rows) + 30
    sheet = Image.new("RGBA", (width, height), args.background)
    draw = ImageDraw.Draw(sheet)
    draw.text((args.padding, args.padding), f"{args.asset or 'Building'} art review", fill=(235, 241, 255, 255), font=font)

    y = args.padding + 28
    for source, image in rows:
        x = args.padding
        draw.text((x, y), label_for_path(source), fill=(182, 193, 216, 255), font=label_font)
        preview_y = y + 14
        for scale in scales:
            preview = scaled_cell(image, scale)
            checker = Image.new("RGBA", preview.size, (22, 28, 42, 255))
            checker.alpha_composite(preview)
            sheet.alpha_composite(checker, (x, preview_y))
            draw.rectangle((x, preview_y, x + preview.width - 1, preview_y + preview.height - 1), outline=(75, 91, 124, 255))
            draw.text((x, preview_y + preview.height + 2), f"{scale}x", fill=(148, 163, 184, 255), font=label_font)
            x += preview.width + args.gap
        y += row_height

    output = safe_output_path(resolve_path(args.output))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    print(output.relative_to(ROOT) if output.is_relative_to(ROOT) else output)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Driftlands building art post-processing and review tools.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prompts = subparsers.add_parser("prompts", help="Print approved built-in image generation prompts.")
    prompts.add_argument("--asset", choices=sorted(BUILDING_ASSETS.keys()))
    prompts.set_defaults(func=command_prompts)

    postprocess = subparsers.add_parser("postprocess", help="Post-process raw generated candidates.")
    postprocess.add_argument("--asset", default="plains_workshop", help="Asset key used for output folders and defaults.")
    postprocess.add_argument("--kind", choices=["auto", "tile", "overlay"], default="auto")
    postprocess.add_argument("--size", nargs=2, type=int, metavar=("WIDTH", "HEIGHT"))
    postprocess.add_argument("--outdir", default=str(DEFAULT_CANDIDATE_DIR.relative_to(ROOT)))
    postprocess.add_argument("--max-colors", type=int, default=24)
    postprocess.add_argument("--bg-threshold", type=int, default=36, help="Inferred background transparency threshold.")
    postprocess.add_argument("--tile-base", help="Tile PNG to use as the canonical hex base for tile candidates.")
    postprocess.add_argument("--no-tile-base", action="store_true", help="Disable known asset tile-base compositing.")
    postprocess.add_argument("--foreground-scale", type=float, default=0.72, help="Maximum foreground size relative to the final tile.")
    postprocess.add_argument("--y-offset", type=int, default=4, help="Vertical foreground offset after fitting.")
    postprocess.add_argument("--sources", nargs="+", required=True)
    postprocess.set_defaults(func=command_postprocess)

    validate = subparsers.add_parser("validate", help="Validate candidate/final PNG assets.")
    validate.add_argument("--size", nargs=2, type=int, metavar=("WIDTH", "HEIGHT"))
    validate.add_argument("--allow-non-rgba", action="store_true")
    validate.add_argument("--require-alpha", action="store_true")
    validate.add_argument("--sources", nargs="+", required=True)
    validate.set_defaults(func=command_validate)

    sheet = subparsers.add_parser("contact-sheet", help="Create a side-by-side review sheet.")
    sheet.add_argument("--asset", default="buildings")
    sheet.add_argument("--sources", nargs="+", required=True)
    sheet.add_argument("--output", default=str((DEFAULT_REVIEW_DIR / "buildings-contact-sheet.png").relative_to(ROOT)))
    sheet.add_argument("--scales", nargs="+", type=int, default=[1, 2, 4])
    sheet.add_argument("--padding", type=int, default=18)
    sheet.add_argument("--gap", type=int, default=16)
    sheet.add_argument("--background", default="#0b1020")
    sheet.set_defaults(func=command_contact_sheet)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
