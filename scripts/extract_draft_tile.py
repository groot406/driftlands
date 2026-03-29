from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]


def resolve_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / path


def hex_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    width = height = size
    draw.polygon(
        [
            (0.5 * width, 0),
            (width, 0.25 * height),
            (width, 0.75 * height),
            (0.5 * width, height),
            (0, 0.75 * height),
            (0, 0.25 * height),
        ],
        fill=255,
    )
    return mask


def luminance(r: int, g: int, b: int) -> float:
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b)


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


def extract_tile(source: Path, output: Path, crop: int, size: int) -> None:
    image = Image.open(source).convert("RGBA")
    left = (image.width - crop) // 2
    top = (image.height - crop) // 2
    tile = image.crop((left, top, left + crop, top + crop))
    tile = tile.resize((size, size), Image.Resampling.LANCZOS)
    tile.putalpha(hex_mask(size))
    tile = clean_edge_outline(tile)

    output.parent.mkdir(parents=True, exist_ok=True)
    tile.save(output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract a centered draft tile into a clean in-game PNG.",
    )
    parser.add_argument("--source", required=True, help="Draft tile image path.")
    parser.add_argument("--output", required=True, help="PNG output path.")
    parser.add_argument("--crop", type=int, required=True, help="Centered crop size in source pixels.")
    parser.add_argument("--size", type=int, default=64, help="Final output size in pixels.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    extract_tile(
        source=resolve_path(args.source),
        output=resolve_path(args.output),
        crop=args.crop,
        size=args.size,
    )


if __name__ == "__main__":
    main()
