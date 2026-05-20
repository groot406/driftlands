import type { TileAnimationDef } from './terrainDefs';

export interface TileAnimationSource {
    animation?: TileAnimationDef | null;
}

export interface LegacyTerrainAnimationSource extends TileAnimationSource {
    frames?: number;
    frameTime?: number;
}

export interface TileAnimationFrameRect {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
}

export interface TerrainVisualDef extends LegacyTerrainAnimationSource {
    assetKey?: string;
    overlayAssetKey?: string | false;
    overlayAnimation?: TileAnimationDef | null;
    variations?: TerrainVariationVisualDef[];
}

export interface TerrainVariationVisualDef extends TileAnimationSource {
    key: string;
    assetKey?: string;
    overlayAssetKey?: string | false;
    overlayAnimation?: TileAnimationDef | null;
}

export interface TileVisualInput {
    terrain: string | null;
    variant?: string | null;
}

export interface TileVisualResult {
    assetKey: string;
    animation: TileAnimationDef | null;
}

export interface BuildingOverlayVisualSource {
    overlayAssetKey?: string | null;
    overlayAssetAnimations?: Partial<Record<string, TileAnimationDef>> | null;
    overlayAnimation?: TileAnimationDef | null;
}

export function normalizeTileAnimation(animation: TileAnimationDef | null | undefined): TileAnimationDef | null {
    if (!animation) {
        return null;
    }

    const frames = Math.floor(animation.frames);
    const frameMs = Math.floor(animation.frameMs);
    if (!Number.isFinite(frames) || frames < 2 || !Number.isFinite(frameMs) || frameMs <= 0) {
        return null;
    }

    return { frames, frameMs };
}

export function resolveTerrainAnimation(source: LegacyTerrainAnimationSource | null | undefined): TileAnimationDef | null {
    const animation = normalizeTileAnimation(source?.animation);
    if (animation) {
        return animation;
    }

    return normalizeTileAnimation({
        frames: source?.frames ?? 0,
        frameMs: source?.frameTime ?? 0,
    });
}

export function resolveVisualAnimation(source: TileAnimationSource | null | undefined): TileAnimationDef | null {
    return normalizeTileAnimation(source?.animation);
}

export function resolveOverlayAnimation(
    source: { overlayAnimation?: TileAnimationDef | null } | null | undefined,
): TileAnimationDef | null {
    return normalizeTileAnimation(source?.overlayAnimation);
}

export function resolveAnimationFrameIndex(
    animation: TileAnimationDef | null | undefined,
    nowMs: number,
    startMs = 0,
): number {
    const normalized = normalizeTileAnimation(animation);
    if (!normalized) {
        return 0;
    }

    const elapsed = Math.max(0, nowMs - startMs);
    return Math.floor(elapsed / normalized.frameMs) % normalized.frames;
}

export function getAnimationFrameCacheKey(
    assetKey: string,
    animation: TileAnimationDef | null | undefined,
    nowMs: number,
    startMs = 0,
): string {
    const normalized = normalizeTileAnimation(animation);
    if (!normalized) {
        return assetKey;
    }

    return `${assetKey}__f${resolveAnimationFrameIndex(normalized, nowMs, startMs)}`;
}

export function getAnimationSourceRect(
    sourceWidth: number,
    sourceHeight: number,
    animation: TileAnimationDef | null | undefined,
    nowMs: number,
    startMs = 0,
): TileAnimationFrameRect {
    const normalized = normalizeTileAnimation(animation);
    if (!normalized) {
        return {
            sx: 0,
            sy: 0,
            sw: sourceWidth,
            sh: sourceHeight,
        };
    }

    const frameIndex = resolveAnimationFrameIndex(normalized, nowMs, startMs);
    const frameWidth = sourceWidth / normalized.frames;
    return {
        sx: frameIndex * frameWidth,
        sy: 0,
        sw: frameWidth,
        sh: sourceHeight,
    };
}

export function findTerrainVariation(
    def: TerrainVisualDef | null | undefined,
    variantKey: string | null | undefined,
): TerrainVariationVisualDef | null {
    if (!variantKey) {
        return null;
    }

    return def?.variations?.find((variant) => variant.key === variantKey) ?? null;
}

export function resolveTerrainBaseVisual(
    tile: TileVisualInput,
    def: TerrainVisualDef | null | undefined,
    isAssetAvailable: (assetKey: string) => boolean,
    selectedVariant: TerrainVariationVisualDef | null = findTerrainVariation(def, tile.variant),
): TileVisualResult | null {
    if (!tile.terrain || !def) {
        return null;
    }

    const baseAssetKey = def.assetKey ?? tile.terrain;
    if (selectedVariant) {
        const variantAssetKey = selectedVariant.assetKey ?? selectedVariant.key;
        if (isAssetAvailable(variantAssetKey)) {
            return {
                assetKey: variantAssetKey,
                animation: resolveVisualAnimation(selectedVariant)
                    ?? (variantAssetKey === baseAssetKey ? resolveTerrainAnimation(def) : null),
            };
        }
    }

    if (!isAssetAvailable(baseAssetKey)) {
        return null;
    }

    return {
        assetKey: baseAssetKey,
        animation: resolveTerrainAnimation(def),
    };
}

export function resolveTerrainOverlayVisual(
    def: TerrainVisualDef | null | undefined,
    isAssetAvailable: (assetKey: string) => boolean,
    selectedVariant: TerrainVariationVisualDef | null = null,
): TileVisualResult | null {
    if (!def) {
        return null;
    }

    let overlayAssetKey = typeof def.overlayAssetKey === 'string' ? def.overlayAssetKey : null;
    let animation = resolveOverlayAnimation(def);

    if (selectedVariant) {
        if (selectedVariant.overlayAssetKey === false) {
            overlayAssetKey = null;
            animation = null;
        } else if (typeof selectedVariant.overlayAssetKey === 'string') {
            overlayAssetKey = selectedVariant.overlayAssetKey;
            animation = resolveOverlayAnimation(selectedVariant) ?? animation;
        } else {
            animation = resolveOverlayAnimation(selectedVariant) ?? animation;
        }
    }

    if (!overlayAssetKey || !isAssetAvailable(overlayAssetKey)) {
        return null;
    }

    return {
        assetKey: overlayAssetKey,
        animation,
    };
}

export function resolveBuildingOverlayVisual(
    building: BuildingOverlayVisualSource | null | undefined,
    isAssetAvailable: (assetKey: string) => boolean,
    resolvedAssetKey: string | null | undefined = building?.overlayAssetKey,
): TileVisualResult | null {
    const overlayAssetKey = resolvedAssetKey ?? null;
    if (!overlayAssetKey || !isAssetAvailable(overlayAssetKey)) {
        return null;
    }

    const variantAnimation = normalizeTileAnimation(building?.overlayAssetAnimations?.[overlayAssetKey]);
    return {
        assetKey: overlayAssetKey,
        animation: variantAnimation
            ?? (overlayAssetKey === building?.overlayAssetKey ? resolveOverlayAnimation(building) : null),
    };
}
