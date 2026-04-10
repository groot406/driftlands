import type { RenderPassContext } from '../RenderPassContext';
import type { DebugFlags } from './DebugFlags';

export class DebugRenderer {
    render(context: RenderPassContext, flags: DebugFlags, drawDebug: (ctx: CanvasRenderingContext2D) => void) {
        if (!context.effectSurface) {
            return;
        }

        void flags;
        drawDebug(context.effectSurface.ctx);
    }
}
