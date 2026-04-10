import type { ViewportSnapshot } from '../RenderTypes';
import { HexProjection } from '../math/HexProjection';

export interface ViewportCameraState {
    q: number;
    r: number;
    radius: number;
    innerRadius: number;
}

export interface ViewportCameraEffects {
    offsetX: number;
    offsetY: number;
    zoom: number;
    roll: number;
}

const DEFAULT_CAMERA_EFFECTS: ViewportCameraEffects = {
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    roll: 0,
};

export class MapViewport {
    private _width = 0;
    private _height = 0;
    private _dpr = 1;

    resize(width: number, height: number, dpr: number = 1) {
        this._width = Math.max(0, Math.round(width));
        this._height = Math.max(0, Math.round(height));
        this._dpr = Math.max(1, dpr);
    }

    syncFromContainer(container: { clientWidth: number; clientHeight: number }, dpr: number = 1) {
        this.resize(container.clientWidth, container.clientHeight, dpr);
    }

    applyToCanvas(canvas: HTMLCanvasElement) {
        canvas.width = this._width * this._dpr;
        canvas.height = this._height * this._dpr;
        canvas.style.width = `${this._width}px`;
        canvas.style.height = `${this._height}px`;
    }

    snapshot(camera: ViewportCameraState, effects: Partial<ViewportCameraEffects> = {}): ViewportSnapshot {
        const mergedEffects = {
            ...DEFAULT_CAMERA_EFFECTS,
            ...effects,
        };
        const cameraWorld = HexProjection.axialToWorld(camera.q, camera.r);

        return {
            width: this._width,
            height: this._height,
            dpr: this._dpr,
            cameraX: cameraWorld.x,
            cameraY: cameraWorld.y,
            cameraQ: camera.q,
            cameraR: camera.r,
            radius: camera.radius,
            innerRadius: camera.innerRadius,
            zoom: mergedEffects.zoom,
            roll: mergedEffects.roll,
            offsetX: mergedEffects.offsetX,
            offsetY: mergedEffects.offsetY,
        };
    }

    get width() {
        return this._width;
    }

    get height() {
        return this._height;
    }

    get dpr() {
        return this._dpr;
    }
}
