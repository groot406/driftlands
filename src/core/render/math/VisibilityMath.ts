import { DEFAULT_RENDER_CONFIG, type RenderConfig } from '../RenderConfig';
import type { AxialCoord, ViewportSnapshot } from '../RenderTypes';
import { HexProjection } from './HexProjection';
import { getViewportBounds, isScreenPointInBounds } from './ViewportMath';

export function isAxialCoordVisible(
    coord: AxialCoord,
    viewport: ViewportSnapshot,
    margin: number = Math.max(DEFAULT_RENDER_CONFIG.tileDrawSize * 1.5, 72),
    config: RenderConfig = DEFAULT_RENDER_CONFIG,
) {
    const screen = HexProjection.axialToScreen(coord.q, coord.r, viewport, config);
    return isScreenPointInBounds(screen.x, screen.y, getViewportBounds(viewport, margin));
}

export function filterAxialItemsToViewport<T extends AxialCoord>(
    items: readonly T[],
    viewport: ViewportSnapshot,
    margin: number = Math.max(DEFAULT_RENDER_CONFIG.tileDrawSize * 1.5, 72),
    config: RenderConfig = DEFAULT_RENDER_CONFIG,
) {
    return items.filter((item) => isAxialCoordVisible(item, viewport, margin, config));
}
