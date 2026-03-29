from __future__ import annotations

from dataclasses import dataclass
from hashlib import md5
from pathlib import Path
import random

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TILE_DIR = ROOT / "src" / "assets" / "tiles"


def rng_for(name: str) -> random.Random:
    return random.Random(int(md5(name.encode("utf-8")).hexdigest(), 16))


def mix(a: tuple[int, int, int, int], b: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return (
        int(a[0] + (b[0] - a[0]) * t),
        int(a[1] + (b[1] - a[1]) * t),
        int(a[2] + (b[2] - a[2]) * t),
        int(a[3] + (b[3] - a[3]) * t),
    )


def clamp_point(img: Image.Image, x: int, y: int) -> tuple[int, int]:
    return max(0, min(img.width - 1, x)), max(0, min(img.height - 1, y))


def tint_image(
    img: Image.Image,
    color: tuple[int, int, int, int],
    amount: float,
    rng: random.Random,
    probability: float,
) -> None:
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            current = px[x, y]
            if current[3] < 10 or rng.random() > probability:
                continue
            local = amount * (0.75 + rng.random() * 0.5)
            px[x, y] = mix(current, color, local)


def random_point(mask: Image.Image, rng: random.Random, margin: int = 4) -> tuple[int, int]:
    for _ in range(500):
        x = rng.randint(margin, mask.width - margin - 1)
        y = rng.randint(margin, mask.height - margin - 1)
        if mask.getpixel((x, y)) > 20:
            return x, y
    return mask.width // 2, mask.height // 2


def put_pixel(img: Image.Image, x: int, y: int, color: tuple[int, int, int, int], mask: Image.Image) -> None:
    x, y = clamp_point(img, x, y)
    if mask.getpixel((x, y)) <= 20:
        return
    px = img.load()
    px[x, y] = mix(px[x, y], color, color[3] / 255)


def dot_cluster(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    colors: list[tuple[int, int, int, int]],
    count: int,
    radius: int = 1,
    margin: int = 4,
) -> None:
    for _ in range(count):
        cx, cy = random_point(mask, rng, margin=margin)
        color = rng.choice(colors)
        for _ in range(rng.randint(2, 4)):
            dx = rng.randint(-radius, radius)
            dy = rng.randint(-radius, radius)
            put_pixel(img, cx + dx, cy + dy, color, mask)


def grass_tufts(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    colors: list[tuple[int, int, int, int]],
    count: int,
    max_height: int,
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=5)
        base = rng.choice(colors)
        height = rng.randint(2, max_height)
        draw.line([(x, y), (x + rng.randint(-1, 1), y - height)], fill=base, width=1)
        if rng.random() < 0.45:
            draw.line([(x, y), (x + 1, y - max(1, height - 1))], fill=base, width=1)
        if rng.random() < 0.35:
            draw.line([(x, y), (x - 1, y - max(1, height - 1))], fill=base, width=1)


def flower_specks(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    centers: int,
    petals: list[tuple[int, int, int, int]],
) -> None:
    for _ in range(centers):
        x, y = random_point(mask, rng, margin=7)
        put_pixel(img, x, y, (247, 219, 123, 255), mask)
        for dx, dy in [(0, -1), (1, 0), (0, 1), (-1, 0)]:
            put_pixel(img, x + dx, y + dy, rng.choice(petals), mask)


def reeds(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=6)
        stem = (86, 121, 42, 230)
        head = (171, 146, 82, 255)
        height = rng.randint(6, 10)
        draw.line([(x, y), (x + rng.randint(-1, 1), y - height)], fill=stem, width=1)
        put_pixel(img, x, y - height, head, mask)
        put_pixel(img, x + 1, y - height + 1, head, mask)


def water_ripples(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
    color: tuple[int, int, int, int],
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=8)
        width = rng.randint(4, 8)
        draw.arc((x - width, y - 2, x + width, y + 3), 205, 335, fill=color, width=1)


def cracks(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
    color: tuple[int, int, int, int],
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=8)
        points = [(x, y)]
        for _ in range(rng.randint(3, 5)):
            x += rng.randint(-4, 4)
            y += rng.randint(-2, 3)
            x, y = clamp_point(img, x, y)
            points.append((x, y))
        draw.line(points, fill=color, width=1)
        for bx, by in points[1:-1]:
            if rng.random() < 0.4:
                draw.line([(bx, by), (bx + rng.randint(-2, 2), by + rng.randint(-2, 2))], fill=color, width=1)


def ridge_lines(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
    color: tuple[int, int, int, int],
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=6)
        points = [
            (x - 5, y + rng.randint(-1, 2)),
            (x, y - rng.randint(2, 5)),
            (x + 6, y + rng.randint(-2, 1)),
        ]
        draw.line(points, fill=color, width=1)


def dunes(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=9)
        span = rng.randint(8, 14)
        draw.arc((x - span, y - 3, x + span, y + 5), 195, 340, fill=(244, 210, 146, 160), width=1)
        draw.arc((x - span, y - 1, x + span, y + 7), 195, 340, fill=(173, 123, 71, 120), width=1)


def snow_streaks(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
    color: tuple[int, int, int, int],
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=6)
        draw.line([(x - 3, y), (x + 4, y - rng.randint(0, 2))], fill=color, width=1)


def glaze_bands(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    top: tuple[int, int, int, int],
    bottom: tuple[int, int, int, int],
) -> None:
    px = img.load()
    for y in range(img.height):
        t = y / max(1, img.height - 1)
        color = mix(top, bottom, t)
        for x in range(img.width):
            current = px[x, y]
            if current[3] < 10:
                continue
            local = 0.08 + (rng.random() * 0.04)
            px[x, y] = mix(current, color, local)


def clover_clusters(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
) -> None:
    petals = [(198, 225, 146, 255), (173, 208, 119, 255), (214, 236, 164, 255)]
    for _ in range(count):
        x, y = random_point(mask, rng, margin=7)
        for dx, dy in [(0, -1), (1, 0), (0, 1), (-1, 0)]:
            put_pixel(img, x + dx, y + dy, rng.choice(petals), mask)
        put_pixel(img, x, y, (122, 152, 69, 220), mask)


def mushroom_caps(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
) -> None:
    cap_colors = [(181, 104, 76, 255), (205, 165, 128, 255), (161, 81, 66, 255)]
    stem = (226, 214, 192, 255)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=8)
        put_pixel(img, x, y, stem, mask)
        put_pixel(img, x, y - 1, rng.choice(cap_colors), mask)
        if rng.random() < 0.7:
            put_pixel(img, x - 1, y - 1, rng.choice(cap_colors), mask)
        if rng.random() < 0.55:
            put_pixel(img, x + 1, y - 1, rng.choice(cap_colors), mask)


def foam_streaks(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
) -> None:
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=9)
        span = rng.randint(3, 7)
        draw.line([(x - span, y), (x - 1, y - 1), (x + span, y)], fill=(238, 248, 247, 170), width=1)
        if rng.random() < 0.5:
            draw.line([(x - span + 1, y + 1), (x + span - 1, y + 1)], fill=(178, 223, 228, 120), width=1)


def pine_saplings(
    img: Image.Image,
    mask: Image.Image,
    rng: random.Random,
    count: int,
) -> None:
    trunk = (95, 83, 66, 255)
    greens = [(48, 82, 66, 255), (63, 96, 78, 255), (79, 118, 96, 255)]
    snow = (245, 249, 255, 220)
    for _ in range(count):
        x, y = random_point(mask, rng, margin=9)
        put_pixel(img, x, y, trunk, mask)
        for row, width in enumerate([0, 1, 2]):
            for dx in range(-width, width + 1):
                put_pixel(img, x + dx, y - 1 - row, rng.choice(greens), mask)
        put_pixel(img, x, y - 3, snow, mask)
        if rng.random() < 0.6:
            put_pixel(img, x - 1, y - 2, snow, mask)
        if rng.random() < 0.45:
            put_pixel(img, x + 1, y - 2, snow, mask)


def blend_layers(base: Image.Image, overlay: Image.Image, amount: float) -> Image.Image:
    blended = Image.blend(base, overlay, amount)
    blended.putalpha(base.getchannel("A"))
    return blended


@dataclass
class VariantSpec:
    name: str
    base: str


def load_base(name: str) -> Image.Image:
    return Image.open(TILE_DIR / f"{name}.png").convert("RGBA")


def render_remaster(name: str) -> Image.Image:
    rng = rng_for(name)

    if name == "water-v2":
        img = blend_layers(load_base("water"), load_base("water_shallows"), 0.34)
        img = blend_layers(img, load_base("water_reflections"), 0.16)
        mask = img.getchannel("A")
        glaze_bands(img, mask, rng, (124, 201, 205, 255), (41, 97, 134, 255))
        water_ripples(img, mask, rng, 18, (226, 245, 243, 145))
        dot_cluster(img, mask, rng, [(197, 188, 152, 120), (112, 173, 173, 120)], 12, radius=2)
        return img

    if name == "snow-v2":
        img = blend_layers(load_base("snow"), load_base("snow_drift"), 0.30)
        img = blend_layers(img, load_base("snow_ice"), 0.12)
        mask = img.getchannel("A")
        glaze_bands(img, mask, rng, (248, 251, 255, 255), (215, 230, 246, 255))
        snow_streaks(img, mask, rng, 18, (177, 199, 228, 110))
        dot_cluster(img, mask, rng, [(245, 249, 255, 200), (192, 216, 239, 90)], 10, radius=1)
        return img

    if name == "mountains-v2":
        img = blend_layers(load_base("mountains"), load_base("mountains_ridge"), 0.24)
        img = blend_layers(img, load_base("mountains_scree"), 0.18)
        mask = img.getchannel("A")
        glaze_bands(img, mask, rng, (108, 111, 132, 255), (42, 42, 58, 255))
        ridge_lines(img, mask, rng, 12, (163, 163, 182, 120))
        cracks(img, mask, rng, 4, (35, 34, 50, 110))
        return img

    if name == "grain-v2":
        img = blend_layers(load_base("grain"), load_base("grain_dense"), 0.26)
        img = blend_layers(img, load_base("grain_bloom"), 0.08)
        mask = img.getchannel("A")
        tint_image(img, (229, 194, 96, 255), 0.08, rng, 0.55)
        grass_tufts(img, mask, rng, [(240, 203, 105, 255), (215, 168, 72, 255), (191, 143, 66, 255)], 28, 4)
        return img

    raise ValueError(f"Unknown remaster {name}")


def render_variant(spec: VariantSpec) -> Image.Image:
    img = load_base(spec.base)
    mask = img.getchannel("A")
    rng = rng_for(spec.name)

    if spec.name == "plains_wildflowers":
        tint_image(img, (121, 167, 73, 255), 0.14, rng, 0.6)
        grass_tufts(img, mask, rng, [(96, 149, 51, 255), (126, 177, 82, 255)], 70, 4)
        flower_specks(img, mask, rng, 16, [(243, 229, 238, 255), (232, 135, 159, 255), (145, 103, 176, 255)])
    elif spec.name == "plains_drygrass":
        glaze_bands(img, mask, rng, (188, 168, 83, 255), (117, 110, 58, 255))
        grass_tufts(img, mask, rng, [(188, 168, 83, 255), (146, 135, 72, 255)], 62, 3)
        dot_cluster(img, mask, rng, [(121, 99, 54, 255), (98, 122, 52, 255)], 20)
    elif spec.name == "plains_meadow":
        tint_image(img, (95, 153, 58, 255), 0.18, rng, 0.72)
        grass_tufts(img, mask, rng, [(86, 147, 49, 255), (114, 173, 67, 255), (73, 120, 42, 255)], 88, 4)
        dot_cluster(img, mask, rng, [(154, 191, 98, 180), (205, 220, 148, 160)], 18, radius=2)
    elif spec.name == "plains_clover":
        tint_image(img, (104, 163, 72, 255), 0.16, rng, 0.68)
        grass_tufts(img, mask, rng, [(88, 148, 55, 255), (118, 179, 79, 255), (74, 125, 49, 255)], 54, 4)
        clover_clusters(img, mask, rng, 15)
    elif spec.name == "plains_stones":
        tint_image(img, (111, 125, 74, 255), 0.1, rng, 0.55)
        dot_cluster(img, mask, rng, [(120, 116, 111, 255), (155, 150, 142, 255), (93, 83, 71, 255)], 36, radius=1)
        dot_cluster(img, mask, rng, [(111, 88, 60, 190)], 10, radius=2)
    elif spec.name == "forest_ferns":
        tint_image(img, (37, 98, 41, 255), 0.16, rng, 0.62)
        grass_tufts(img, mask, rng, [(57, 138, 72, 255), (91, 166, 86, 255)], 46, 5)
        dot_cluster(img, mask, rng, [(41, 70, 32, 160), (98, 117, 53, 155)], 20, radius=2)
    elif spec.name == "forest_moss":
        glaze_bands(img, mask, rng, (29, 62, 34, 255), (16, 36, 23, 255))
        dot_cluster(img, mask, rng, [(70, 116, 58, 220), (106, 138, 74, 180), (93, 74, 59, 180)], 42, radius=2)
        dot_cluster(img, mask, rng, [(193, 106, 82, 220), (232, 196, 151, 220)], 10, radius=0)
    elif spec.name == "forest_mushrooms":
        glaze_bands(img, mask, rng, (32, 69, 39, 255), (14, 33, 21, 255))
        dot_cluster(img, mask, rng, [(71, 117, 61, 220), (101, 135, 78, 180), (88, 72, 55, 160)], 28, radius=2)
        mushroom_caps(img, mask, rng, 14)
    elif spec.name == "forest_pines":
        tint_image(img, (42, 78, 58, 255), 0.22, rng, 0.76)
        grass_tufts(img, mask, rng, [(46, 92, 70, 255), (66, 120, 84, 255)], 54, 5)
        ridge_lines(img, mask, rng, 9, (118, 146, 111, 130))
        dot_cluster(img, mask, rng, [(89, 93, 99, 255), (54, 65, 71, 255)], 16, radius=1)
    elif spec.name == "water_reeds":
        glaze_bands(img, mask, rng, (89, 180, 182, 255), (38, 88, 116, 255))
        reeds(img, mask, rng, 18)
        water_ripples(img, mask, rng, 12, (188, 231, 232, 175))
    elif spec.name == "water_shallows":
        tint_image(img, (116, 196, 188, 255), 0.18, rng, 0.72)
        water_ripples(img, mask, rng, 24, (225, 243, 237, 160))
        dot_cluster(img, mask, rng, [(200, 185, 146, 170), (120, 176, 172, 140)], 24, radius=2)
    elif spec.name == "water_reflections":
        glaze_bands(img, mask, rng, (122, 198, 215, 255), (48, 95, 132, 255))
        water_ripples(img, mask, rng, 22, (236, 249, 255, 200))
        ridge_lines(img, mask, rng, 8, (193, 235, 247, 135))
    elif spec.name == "water_foam":
        glaze_bands(img, mask, rng, (126, 202, 214, 255), (46, 100, 137, 255))
        water_ripples(img, mask, rng, 18, (223, 243, 246, 155))
        foam_streaks(img, mask, rng, 11)
    elif spec.name == "dirt_cracked":
        glaze_bands(img, mask, rng, (161, 107, 72, 255), (98, 55, 41, 255))
        cracks(img, mask, rng, 11, (86, 46, 34, 210))
        dot_cluster(img, mask, rng, [(177, 122, 84, 140), (119, 77, 55, 180)], 18, radius=1)
    elif spec.name == "dirt_pebbles":
        tint_image(img, (134, 87, 61, 255), 0.08, rng, 0.55)
        dot_cluster(img, mask, rng, [(154, 141, 127, 255), (112, 104, 98, 255), (167, 119, 85, 220)], 42, radius=1)
    elif spec.name == "dirt_mossy":
        tint_image(img, (91, 102, 61, 255), 0.14, rng, 0.6)
        dot_cluster(img, mask, rng, [(82, 113, 58, 220), (102, 132, 74, 180), (72, 61, 48, 150)], 28, radius=2)
    elif spec.name == "mountains_ridge":
        glaze_bands(img, mask, rng, (96, 97, 116, 255), (40, 40, 57, 255))
        ridge_lines(img, mask, rng, 18, (166, 165, 183, 170))
        cracks(img, mask, rng, 5, (36, 35, 52, 170))
    elif spec.name == "mountains_scree":
        tint_image(img, (89, 88, 105, 255), 0.12, rng, 0.65)
        dot_cluster(img, mask, rng, [(139, 137, 149, 220), (73, 70, 85, 255), (47, 47, 61, 230)], 54, radius=1)
    elif spec.name == "mountains_ashen":
        glaze_bands(img, mask, rng, (118, 118, 129, 255), (53, 50, 59, 255))
        dot_cluster(img, mask, rng, [(150, 145, 138, 200), (197, 170, 122, 120)], 24, radius=2)
        ridge_lines(img, mask, rng, 9, (188, 178, 167, 100))
    elif spec.name == "mountains_lichen":
        glaze_bands(img, mask, rng, (106, 109, 129, 255), (42, 44, 60, 255))
        dot_cluster(img, mask, rng, [(112, 134, 97, 175), (146, 158, 118, 120), (83, 89, 81, 120)], 26, radius=2)
        ridge_lines(img, mask, rng, 8, (165, 168, 180, 110))
    elif spec.name == "grain_dense":
        tint_image(img, (225, 193, 98, 255), 0.14, rng, 0.72)
        grass_tufts(img, mask, rng, [(246, 208, 109, 255), (233, 184, 84, 255), (191, 142, 61, 255)], 78, 5)
    elif spec.name == "grain_bloom":
        tint_image(img, (233, 191, 96, 255), 0.12, rng, 0.64)
        grass_tufts(img, mask, rng, [(242, 204, 101, 255), (219, 171, 74, 255)], 58, 4)
        flower_specks(img, mask, rng, 11, [(138, 124, 210, 255), (219, 117, 129, 255), (236, 232, 245, 255)])
    elif spec.name == "snow_drift":
        glaze_bands(img, mask, rng, (250, 252, 255, 255), (216, 231, 247, 255))
        snow_streaks(img, mask, rng, 32, (176, 202, 235, 180))
        water_ripples(img, mask, rng, 8, (255, 255, 255, 120))
    elif spec.name == "snow_ice":
        tint_image(img, (205, 225, 245, 255), 0.18, rng, 0.7)
        cracks(img, mask, rng, 9, (136, 176, 219, 190))
        dot_cluster(img, mask, rng, [(243, 250, 255, 220), (173, 207, 232, 140)], 18, radius=1)
    elif spec.name == "snow_pines":
        glaze_bands(img, mask, rng, (248, 250, 255, 255), (216, 231, 247, 255))
        snow_streaks(img, mask, rng, 14, (171, 194, 226, 110))
        pine_saplings(img, mask, rng, 8)
    elif spec.name == "dessert_dunes":
        glaze_bands(img, mask, rng, (242, 202, 133, 255), (180, 129, 75, 255))
        dunes(img, mask, rng, 12)
        dot_cluster(img, mask, rng, [(194, 137, 78, 130), (240, 213, 159, 120)], 18, radius=2)
    elif spec.name == "dessert_shrubs":
        tint_image(img, (192, 151, 90, 255), 0.12, rng, 0.6)
        grass_tufts(img, mask, rng, [(113, 106, 43, 255), (141, 123, 51, 255)], 24, 4)
        dot_cluster(img, mask, rng, [(94, 81, 44, 180), (130, 98, 54, 130)], 18, radius=2)
    elif spec.name == "dessert_stones":
        glaze_bands(img, mask, rng, (232, 187, 113, 255), (158, 113, 69, 255))
        dot_cluster(img, mask, rng, [(170, 125, 87, 255), (123, 89, 58, 255), (209, 172, 117, 180)], 40, radius=1)
        cracks(img, mask, rng, 6, (125, 82, 52, 120))
    elif spec.name == "dessert_windcarved":
        glaze_bands(img, mask, rng, (240, 200, 132, 255), (171, 121, 72, 255))
        dunes(img, mask, rng, 16)
        snow_streaks(img, mask, rng, 10, (247, 219, 164, 90))
        dot_cluster(img, mask, rng, [(190, 134, 82, 120), (235, 205, 156, 95)], 14, radius=2)
    else:
        raise ValueError(f"Unknown variant {spec.name}")

    return img


REMASTERS = [
    "water-v2",
    "snow-v2",
    "mountains-v2",
    "grain-v2",
]


VARIANTS = [
    VariantSpec("plains_wildflowers", "plains"),
    VariantSpec("plains_drygrass", "plains"),
    VariantSpec("plains_meadow", "plains"),
    VariantSpec("plains_clover", "plains"),
    VariantSpec("plains_stones", "plains"),
    VariantSpec("forest_ferns", "forest"),
    VariantSpec("forest_moss", "forest"),
    VariantSpec("forest_mushrooms", "forest_moss"),
    VariantSpec("forest_pines", "forest"),
    VariantSpec("water_reeds", "water"),
    VariantSpec("water_shallows", "water"),
    VariantSpec("water_reflections", "water"),
    VariantSpec("water_foam", "water-v2"),
    VariantSpec("dirt_cracked", "dirt"),
    VariantSpec("dirt_pebbles", "dirt"),
    VariantSpec("dirt_mossy", "dirt"),
    VariantSpec("mountains_ridge", "mountains"),
    VariantSpec("mountains_scree", "mountains"),
    VariantSpec("mountains_ashen", "mountains"),
    VariantSpec("mountains_lichen", "mountains-v2"),
    VariantSpec("grain_dense", "grain"),
    VariantSpec("grain_bloom", "grain"),
    VariantSpec("snow_drift", "snow"),
    VariantSpec("snow_ice", "snow"),
    VariantSpec("snow_pines", "snow-v2"),
    VariantSpec("dessert_dunes", "dessert"),
    VariantSpec("dessert_shrubs", "dessert"),
    VariantSpec("dessert_stones", "dessert"),
    VariantSpec("dessert_windcarved", "dessert"),
]


def main() -> None:
    for name in REMASTERS:
        out = TILE_DIR / f"{name}.png"
        render_remaster(name).save(out)
        print(f"wrote {out.relative_to(ROOT)}")
    for spec in VARIANTS:
        out = TILE_DIR / f"{spec.name}.png"
        render_variant(spec).save(out)
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
