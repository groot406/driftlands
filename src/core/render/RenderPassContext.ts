import type { RenderConfig } from './RenderConfig';
import type { RenderQualityProfile, RenderScene, ViewportSnapshot } from './RenderTypes';

export interface RenderSurface {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
}

export interface RenderPassContext {
    finalCtx: CanvasRenderingContext2D;
    terrainSurface?: RenderSurface;
    overlayUnderlaySurface?: RenderSurface;
    entitySurface?: RenderSurface;
    overlayTopSurface?: RenderSurface;
    particleUnderlaySurface?: RenderSurface;
    particleOverlaySurface?: RenderSurface;
    effectSurface?: RenderSurface;
    worldCtx?: CanvasRenderingContext2D;
    worldCanvas?: HTMLCanvasElement;
    viewport: ViewportSnapshot;
    scene: RenderScene;
    quality: RenderQualityProfile;
    config: RenderConfig;
    debug: {
        enabled: boolean;
    };
    runtime: Record<string, unknown>;
    passTimingsMs: Record<string, number>;
}
