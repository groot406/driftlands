import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';

export interface WorldEffect {
    readonly name: string;
    isEnabled(quality: RenderQualityProfile): boolean;
    apply(context: RenderPassContext): void;
}
