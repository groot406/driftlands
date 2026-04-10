import type { RenderPassContext } from '../RenderPassContext';
import type { WorldEffect } from './WorldEffect';

export class EffectPipeline {
    private readonly effects: readonly WorldEffect[];

    constructor(effects: readonly WorldEffect[]) {
        this.effects = effects;
    }

    apply(context: RenderPassContext) {
        for (const effect of this.effects) {
            if (effect.isEnabled(context.quality)) {
                effect.apply(context);
            }
        }
    }
}
