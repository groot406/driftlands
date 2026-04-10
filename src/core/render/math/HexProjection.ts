import { DEFAULT_RENDER_CONFIG, type RenderConfig } from '../RenderConfig';
import type { AxialCoord, ViewportSnapshot } from '../RenderTypes';

export class HexProjection {
    static axialToWorld(q: number, r: number, config: RenderConfig = DEFAULT_RENDER_CONFIG) {
        return {
            x: config.hexXFactor * (q + (r / 2)),
            y: config.hexYFactor * r,
        };
    }

    static worldToAxial(x: number, y: number, config: RenderConfig = DEFAULT_RENDER_CONFIG): AxialCoord {
        const r = y / config.hexYFactor;
        const q = (x / config.hexXFactor) - (r / 2);
        const s = -q - r;

        let roundedQ = Math.round(q);
        let roundedR = Math.round(r);
        const roundedS = Math.round(s);

        const deltaQ = Math.abs(roundedQ - q);
        const deltaR = Math.abs(roundedR - r);
        const deltaS = Math.abs(roundedS - s);

        if (deltaQ > deltaR && deltaQ > deltaS) {
            roundedQ = -roundedR - roundedS;
        } else if (deltaR > deltaS) {
            roundedR = -roundedQ - roundedS;
        }

        return {
            q: roundedQ,
            r: roundedR,
        };
    }

    static projectRelativeToScreen(relX: number, relY: number, viewport: ViewportSnapshot) {
        const centerX = viewport.width / 2;
        const centerY = viewport.height / 2;
        const scaledX = relX * viewport.zoom;
        const scaledY = relY * viewport.zoom;
        const cos = Math.cos(viewport.roll);
        const sin = Math.sin(viewport.roll);
        const rotatedX = (scaledX * cos) - (scaledY * sin);
        const rotatedY = (scaledX * sin) + (scaledY * cos);

        return {
            x: centerX + viewport.offsetX + rotatedX,
            y: centerY + viewport.offsetY + rotatedY,
        };
    }

    static worldToScreen(worldX: number, worldY: number, viewport: ViewportSnapshot) {
        return this.projectRelativeToScreen(worldX - viewport.cameraX, worldY - viewport.cameraY, viewport);
    }

    static axialToScreen(q: number, r: number, viewport: ViewportSnapshot, config: RenderConfig = DEFAULT_RENDER_CONFIG) {
        const world = this.axialToWorld(q, r, config);
        return this.worldToScreen(world.x, world.y, viewport);
    }

    static screenToWorld(screenX: number, screenY: number, viewport: ViewportSnapshot) {
        const centerX = viewport.width / 2;
        const centerY = viewport.height / 2;
        const dx = screenX - (centerX + viewport.offsetX);
        const dy = screenY - (centerY + viewport.offsetY);
        const cos = Math.cos(viewport.roll);
        const sin = Math.sin(viewport.roll);
        const relX = ((dx * cos) + (dy * sin)) / viewport.zoom;
        const relY = ((dy * cos) - (dx * sin)) / viewport.zoom;

        return {
            worldX: viewport.cameraX + relX,
            worldY: viewport.cameraY + relY,
        };
    }

    static screenToAxial(screenX: number, screenY: number, viewport: ViewportSnapshot, config: RenderConfig = DEFAULT_RENDER_CONFIG) {
        const world = this.screenToWorld(screenX, screenY, viewport);
        return this.worldToAxial(world.worldX, world.worldY, config);
    }
}
