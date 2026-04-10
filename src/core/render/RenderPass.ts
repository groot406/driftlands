import type { RenderQualityProfile, RenderScene } from './RenderTypes';
import type { RenderPassContext } from './RenderPassContext';

export interface RenderPass {
    readonly name: string;
    isEnabled(scene: RenderScene, quality: RenderQualityProfile): boolean;
    execute(context: RenderPassContext): void;
}
