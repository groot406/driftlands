import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import { toRgba } from './EffectUtils';
import type { WorldEffect } from './WorldEffect';

interface CameraCompositeStateLike {
    vignetteBiasX: number;
    vignetteBiasY: number;
    speedNorm: number;
}

interface VignetteFrameLike {
    cameraFx: CameraCompositeStateLike;
}

interface VignetteEffectDependencies {
    getFrame(context: RenderPassContext): VignetteFrameLike;
}

export class VignetteEffect implements WorldEffect {
    readonly name = 'VignetteEffect';

    private readonly deps: VignetteEffectDependencies;

    constructor(deps: VignetteEffectDependencies) {
        this.deps = deps;
    }

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableEdgeVignette && quality.vignetteEnabled;
    }

    apply(context: RenderPassContext) {
        return;
    }
}
