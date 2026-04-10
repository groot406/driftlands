import type { RenderPass } from './RenderPass';
import type { RenderPassContext } from './RenderPassContext';

function getNow() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class HexMapRenderer {
    private readonly passes: readonly RenderPass[];

    constructor(passes: readonly RenderPass[]) {
        this.passes = passes;
    }

    render(context: RenderPassContext) {
        for (const pass of this.passes) {
            if (!pass.isEnabled(context.scene, context.quality)) {
                context.passTimingsMs[pass.name] = 0;
                continue;
            }

            const startedAt = getNow();
            pass.execute(context);
            context.passTimingsMs[pass.name] = Number((getNow() - startedAt).toFixed(3));
        }
    }
}
