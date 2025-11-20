import { reactive } from 'vue';
import { getMaxRadiusFor } from './world';

export interface CameraState {
  q: number;
  r: number;
  targetQ: number;
  targetR: number;
  radius: number;
  innerRadius: number;
}

export function createCameraState(radius: number, innerRadius: number): CameraState {
  return reactive({ q: 0, r: 0, targetQ: 0, targetR: 0, radius, innerRadius });
}

export function axialDistance(aQ: number, aR: number, bQ: number, bR: number): number {
  const dq = Math.abs(aQ - bQ);
  const dr = Math.abs(aR - bR);
  const ds = Math.abs((-aQ - aR) - (-bQ - bR));
  return Math.max(dq, dr, ds);
}

export function clampCameraTargets(cam: CameraState) {
  const maxRad = getMaxRadiusFor(cam.targetQ, cam.targetR, cam.radius / 2);
  const q = cam.targetQ;
  const r = cam.targetR;
  const s = -q - r;
  const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  if (dist > maxRad) {
    const scale = maxRad / dist;
    cam.targetQ = q * scale;
    cam.targetR = r * scale;
  }
}

// Axial to pixel conversion helpers (constants separated for re-use)
export const HEX_SIZE = 32;
export const HEX_SPACE = 4;
const SQRT3 = Math.sqrt(3);
const HEX_X_FACTOR = (HEX_SIZE + (HEX_SIZE * 0.155)) * SQRT3;
const HEX_Y_FACTOR = HEX_SIZE * 3/2;

export function axialToPixel(q: number, r: number) {
  const x = HEX_X_FACTOR * (q + r / 2);
  const y = HEX_Y_FACTOR * r;
  return { x, y };
}

export function distanceFade(cam: CameraState, tile: { q: number; r: number; terrain: string | null }) {
  const dist = axialDistance(cam.q, cam.r, tile.q, tile.r);
  const span = Math.max(0.0001, (cam.radius - cam.innerRadius));
  let fade = 1 - Math.max(0, (dist - cam.innerRadius) / span);
  fade = Math.min(1, Math.max(0, fade));
  return (tile.terrain === 'towncenter') ? (fade * fade * 0.9) : (fade * fade);
}
