export type RgbColor = readonly [number, number, number];

export interface TerrainTone {
    wash: RgbColor;
    patch: RgbColor;
    shadow: RgbColor;
    highlight: RgbColor;
}

export type TerrainToneFamily =
    | 'plains'
    | 'forest'
    | 'grain'
    | 'water'
    | 'dirt'
    | 'desert'
    | 'snow'
    | 'mountain'
    | 'volcano'
    | 'towncenter';

export const GROWTH_HYBRID_STYLE = {
    terrainColor: {
        hueRangeDeg: 5.8,
        minSaturate: 0.94,
        saturateRange: 0.26,
        minBrightness: 0.98,
        brightnessRange: 0.15,
        maxBrightness: 1.12,
    },
    tileRim: {
        topLight: 'rgba(255, 248, 214, 0.36)',
        topLightSoft: 'rgba(255, 248, 214, 0.16)',
        lowerShadow: 'rgba(42, 52, 42, 0.22)',
        lowerShadowSoft: 'rgba(42, 52, 42, 0.1)',
        waterEdge: 'rgba(203, 255, 255, 0.52)',
        waterEdgeGlow: 'rgba(126, 235, 245, 0.18)',
    },
    tileReveal: {
        durationMs: 260,
        scale: 1.055,
        minIntervalMs: 90,
        fill: 'rgba(255, 244, 190, 0.32)',
        stroke: 'rgba(255, 248, 218, 0.72)',
        sparkleColors: [
            [255, 247, 204],
            [188, 248, 222],
            [255, 224, 150],
        ] as readonly RgbColor[],
    },
    outlines: {
        path: 'rgba(226, 250, 255, 0.78)',
        pathTarget: 'rgba(255, 244, 206, 0.9)',
        hover: 'rgba(255, 239, 177, 0.82)',
        unreachable: 'rgba(138, 102, 102, 0.72)',
        selected: 'rgba(187, 248, 146, 0.9)',
        cluster: 'rgba(255, 225, 145, 0.86)',
        reach: 'rgba(235, 224, 174, 0.56)',
        reachHover: 'rgba(255, 241, 166, 0.78)',
        task: 'rgba(190, 248, 255, 0.92)',
        scout: 'rgba(174, 191, 209, 0.72)',
        story: 'rgba(180, 240, 255, 0.92)',
    },
    particles: {
        ambientDensity: 0.42,
        waterRippleChance: 0.28,
        forestLeafChance: 0.35,
        grainPollenChance: 0.36,
        snowChance: 0.24,
        sandChance: 0.22,
        townSparkChance: 0.28,
        volcanoSmokeChance: 0.12,
    },
    camera: {
        adaptiveRadiusScale: 1.16,
        innerRadiusRatio: 0.48,
    },
    backdrop: {
        washTop: [154, 150, 50] as RgbColor,
        washBottom: [150, 120, 111] as RgbColor,
        skyGlow: [124, 120, 120] as RgbColor,
        meadowGlow: [120, 178, 106] as RgbColor,
        warmGlow: [155, 113, 40] as RgbColor,
    },
    text: {
        rewardGold: '#fff1a8',
        rewardGreen: '#b9f4a6',
        rewardAqua: '#b9f7ff',
    },
    tileTones: {
        plains: [
            { wash: [93, 178, 122], patch: [147, 220, 140], shadow: [34, 78, 58], highlight: [235, 238, 172] },
            { wash: [78, 188, 136], patch: [132, 226, 154], shadow: [26, 82, 60], highlight: [222, 244, 182] },
            { wash: [116, 184, 112], patch: [176, 218, 128], shadow: [42, 80, 48], highlight: [246, 232, 162] },
            { wash: [125, 174, 108], patch: [194, 210, 128], shadow: [48, 76, 50], highlight: [248, 228, 176] },
        ],
        forest: [
            { wash: [46, 126, 92], patch: [78, 168, 110], shadow: [16, 48, 38], highlight: [174, 212, 144] },
            { wash: [38, 136, 92], patch: [70, 180, 116], shadow: [14, 54, 38], highlight: [176, 224, 150] },
            { wash: [70, 126, 86], patch: [110, 166, 104], shadow: [24, 50, 36], highlight: [196, 208, 144] },
            { wash: [66, 116, 90], patch: [104, 152, 110], shadow: [24, 46, 38], highlight: [202, 204, 154] },
        ],
        grain: [
            { wash: [186, 172, 74], patch: [238, 212, 100], shadow: [96, 78, 28], highlight: [255, 240, 174] },
            { wash: [206, 184, 70], patch: [246, 220, 104], shadow: [104, 84, 28], highlight: [255, 244, 180] },
            { wash: [216, 170, 74], patch: [250, 208, 108], shadow: [112, 74, 26], highlight: [255, 236, 168] },
            { wash: [202, 156, 92], patch: [240, 198, 122], shadow: [102, 66, 30], highlight: [255, 232, 182] },
        ],
        water: [
            { wash: [92, 190, 224], patch: [148, 232, 246], shadow: [20, 76, 104], highlight: [235, 255, 255] },
            { wash: [70, 196, 204], patch: [128, 232, 224], shadow: [18, 82, 88], highlight: [228, 255, 250] },
            { wash: [118, 190, 226], patch: [190, 232, 246], shadow: [28, 78, 112], highlight: [246, 255, 255] },
            { wash: [96, 204, 226], patch: [176, 238, 238], shadow: [24, 84, 108], highlight: [244, 255, 252] },
        ],
        dirt: [
            { wash: [142, 124, 88], patch: [176, 154, 108], shadow: [66, 58, 42], highlight: [226, 214, 176] },
            { wash: [152, 130, 88], patch: [190, 162, 108], shadow: [72, 60, 40], highlight: [236, 218, 178] },
            { wash: [162, 136, 84], patch: [204, 166, 104], shadow: [76, 60, 36], highlight: [242, 220, 172] },
            { wash: [134, 122, 96], patch: [174, 154, 122], shadow: [64, 56, 44], highlight: [224, 216, 188] },
        ],
        desert: [
            { wash: [214, 184, 128], patch: [242, 218, 158], shadow: [94, 70, 38], highlight: [255, 242, 202] },
            { wash: [222, 190, 132], patch: [250, 224, 162], shadow: [98, 74, 40], highlight: [255, 244, 206] },
            { wash: [230, 192, 124], patch: [254, 224, 152], shadow: [102, 72, 34], highlight: [255, 242, 196] },
            { wash: [206, 178, 134], patch: [238, 216, 166], shadow: [88, 68, 44], highlight: [252, 238, 206] },
        ],
        snow: [
            { wash: [210, 226, 214], patch: [236, 246, 234], shadow: [112, 134, 132], highlight: [255, 255, 250] },
            { wash: [206, 224, 222], patch: [232, 248, 248], shadow: [104, 132, 142], highlight: [255, 255, 255] },
            { wash: [218, 226, 208], patch: [242, 246, 230], shadow: [122, 136, 126], highlight: [255, 255, 246] },
            { wash: [208, 218, 204], patch: [234, 242, 226], shadow: [112, 126, 122], highlight: [252, 255, 244] },
        ],
        mountain: [
            { wash: [132, 140, 124], patch: [170, 178, 158], shadow: [56, 64, 60], highlight: [228, 230, 210] },
            { wash: [126, 144, 132], patch: [166, 188, 170], shadow: [52, 68, 64], highlight: [226, 238, 220] },
            { wash: [146, 138, 120], patch: [188, 176, 150], shadow: [64, 60, 52], highlight: [236, 228, 204] },
            { wash: [126, 132, 122], patch: [164, 172, 158], shadow: [52, 58, 56], highlight: [224, 228, 214] },
        ],
        volcano: [
            { wash: [144, 112, 88], patch: [224, 120, 64], shadow: [54, 44, 42], highlight: [255, 228, 178] },
            { wash: [132, 104, 86], patch: [238, 132, 72], shadow: [50, 40, 40], highlight: [255, 236, 186] },
            { wash: [154, 110, 82], patch: [248, 142, 72], shadow: [60, 42, 38], highlight: [255, 232, 174] },
            { wash: [126, 104, 92], patch: [212, 126, 82], shadow: [48, 42, 42], highlight: [246, 222, 188] },
        ],
        towncenter: [
            { wash: [150, 174, 118], patch: [214, 196, 124], shadow: [64, 70, 48], highlight: [255, 238, 178] },
            { wash: [136, 180, 126], patch: [206, 206, 130], shadow: [54, 76, 54], highlight: [252, 242, 188] },
            { wash: [166, 170, 112], patch: [226, 198, 124], shadow: [72, 68, 44], highlight: [255, 236, 172] },
            { wash: [142, 166, 124], patch: [206, 196, 136], shadow: [60, 68, 52], highlight: [248, 234, 188] },
        ],
    } satisfies Record<TerrainToneFamily, readonly TerrainTone[]>,
};
