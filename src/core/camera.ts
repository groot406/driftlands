import { reactive } from 'vue';
import { getMaxRadiusFor } from './world';

export const CAMERA_RADIUS = 20;
export const CAMERA_INNER_RADIUS = 5;
export const MOVE_SPEED = 35; // axial units per second base
export const HEX_SIZE = 35;
export const HEX_SPACE = 3;

// Interaction constants
const DRAG_THRESHOLD = 4; // px before treating pointer as drag
const VELOCITY_SAMPLE_WINDOW_MS = 120; // window for throw velocity sampling
const FRICTION = 8; // exponential friction factor
const MAX_THROW_SPEED = 100; // axial units per second cap

// Precomputed factors for axial <-> pixel transforms
const SQRT3 = Math.sqrt(3);
const HEX_X_FACTOR = (HEX_SIZE + (HEX_SIZE * 0.155)) * SQRT3; // simplified reused factor
const HEX_Y_FACTOR = HEX_SIZE * 3 / 2;

export interface CameraState {
  q: number;
  r: number;
  targetQ: number;
  targetR: number;
  radius: number;
  innerRadius: number;
  velQ: number;
  velR: number;
}

export const camera: CameraState = reactive({
  q: 0,
  r: 0,
  targetQ: 0,
  targetR: 0,
  radius: CAMERA_RADIUS,
  innerRadius: CAMERA_INNER_RADIUS,
  velQ: 0,
  velR: 0,
});

export function axialToPixel(q: number, r: number) {
  const x = HEX_X_FACTOR * (q + r / 2);
  const y = HEX_Y_FACTOR * r;
  return { x, y };
}

// Hex distance between two axial coordinates
export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

// Internal drag & throw tracking
let dragging = false;
let dragStartX = 0, dragStartY = 0, lastX = 0, lastY = 0;
const samples: { t: number; x: number; y: number }[] = [];

export function clampCameraTargets() {
  const maxRad = getMaxRadiusFor(camera.targetQ, camera.targetR, camera.radius / 2);
  const q = camera.targetQ;
  const r = camera.targetR;
  const s = -q - r;
  const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  if (dist > maxRad) {
    const scale = maxRad / dist;
    camera.targetQ = q * scale;
    camera.targetR = r * scale;
  }
}

function pixelDeltaToAxial(dx: number, dy: number) {
  const dr = dy / HEX_Y_FACTOR;
  const dq = (dx / HEX_X_FACTOR) - dr / 2; // derived from x = factor*(q + r/2)
  return { dq, dr };
}

function computeThrowVelocity() {
  if (samples.length < 2) return;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const { dq, dr } = pixelDeltaToAxial(dx, dy);
  let vq = -dq / dt; // negative to continue map motion
  let vr = -dr / dt;
  const speed = Math.sqrt(vq * vq + vr * vr);
  if (speed < 15) return; // ignore tiny throws
  if (speed > MAX_THROW_SPEED) {
    const s = MAX_THROW_SPEED / speed;
    vq *= s;
    vr *= s;
  }
  camera.velQ = vq;
  camera.velR = vr;
}

// Pointer handlers
export function createPointerHandlers(mouseDownRef: { value: boolean }) {
  function pointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // only left button
    mouseDownRef.value = true;
    dragging = false;
    dragStartX = lastX = e.clientX;
    dragStartY = lastY = e.clientY;
    samples.length = 0;
    samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
  }
  function pointerMove(e: PointerEvent) {
    if (!mouseDownRef.value) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (!dragging) {
      const dist2 = (e.clientX - dragStartX) ** 2 + (e.clientY - dragStartY) ** 2;
      if (dist2 > DRAG_THRESHOLD * DRAG_THRESHOLD) dragging = true;
    }
    if (dragging) {
      const { dq, dr } = pixelDeltaToAxial(dx, dy);
      camera.targetQ -= dq; // subtract so map moves with pointer drag
      camera.targetR -= dr;
      camera.q = camera.targetQ;
      camera.r = camera.targetR;
      clampCameraTargets();
    }
    lastX = e.clientX;
    lastY = e.clientY;
    const now = performance.now();
    samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (samples.length > 0 && now - samples[0]!.t > VELOCITY_SAMPLE_WINDOW_MS) samples.shift();
    e.preventDefault();
  }
  function pointerUp() {
    if (dragging) computeThrowVelocity();
    dragging = false;
    samples.length = 0;
    mouseDownRef.value = false;
  }
  function pointerCancel() {
    dragging = false;
    samples.length = 0;
    camera.velQ = 0;
    camera.velR = 0;
    mouseDownRef.value = false;
  }
  return { pointerDown, pointerMove, pointerUp, pointerCancel };
}

// Keyboard handlers
const heldKeys = new Set<string>();
export function keyDown(e: KeyboardEvent) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
    heldKeys.add(e.key);
    e.preventDefault();
  } else if (e.key === '+' || e.key === '=') {
    camera.radius = Math.min(40, camera.radius + 1);
  } else if (e.key === '-' || e.key === '_') {
    camera.radius = Math.max(camera.innerRadius + 2, camera.radius - 1);
  }
}
export function keyUp(e: KeyboardEvent) {
  if (heldKeys.delete(e.key)) e.preventDefault();
}

// Animation loop
let lastTime = performance.now();
let rafId: number | null = null;
export function animateCamera() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  let dqInput = 0, drInput = 0;
  for (const k of heldKeys) {
    if (k === 'ArrowUp' || k === 'w') {
      drInput += -1; dqInput += 0.5;
    } else if (k === 'ArrowDown' || k === 's') {
      drInput += 1; dqInput += -0.5;
    } else if (k === 'ArrowLeft' || k === 'a') {
      dqInput += -1;
    } else if (k === 'ArrowRight' || k === 'd') {
      dqInput += 1;
    }
  }
  if (dqInput !== 0 || drInput !== 0) {
    const mag = Math.sqrt(dqInput * dqInput + drInput * drInput);
    if (mag > 0) { dqInput /= mag; drInput /= mag; }
    camera.targetQ += dqInput * MOVE_SPEED * dt;
    camera.targetR += drInput * MOVE_SPEED * dt;
    clampCameraTargets();
    camera.velQ = 0; camera.velR = 0; // cancel inertial velocity on active input
  }
  if (camera.velQ !== 0 || camera.velR !== 0) {
    camera.targetQ += camera.velQ * dt;
    camera.targetR += camera.velR * dt;
    clampCameraTargets();
    const decay = Math.exp(-FRICTION * dt);
    camera.velQ *= decay;
    camera.velR *= decay;
    if (Math.abs(camera.velQ) < 0.02) camera.velQ = 0;
    if (Math.abs(camera.velR) < 0.02) camera.velR = 0;
  }
  const dq = camera.targetQ - camera.q;
  const dr = camera.targetR - camera.r;
  const dist = Math.sqrt(dq * dq + dr * dr);
  const baseMin = 0.05;
  const baseMax = 0.1;
  const lerp = baseMin + (1 - Math.exp(-dist * 0.9)) * (baseMax - baseMin);
  if (Math.abs(dq) < 0.05) camera.q = camera.targetQ; else camera.q += dq * lerp;
  if (Math.abs(dr) < 0.05) camera.r = camera.targetR; else camera.r += dr * lerp;
  clampCameraTargets();
  rafId = requestAnimationFrame(animateCamera);
}

export function stopCameraAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

export function centerCamera() {
  camera.q = camera.r = camera.targetQ = camera.targetR = 0;
}

