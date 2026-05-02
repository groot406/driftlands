import {reactive} from 'vue';

import {isPaused} from '../store/uiStore';
import {isKeyboardBlocked} from './windowManager';
import { axialDistance } from '../shared/game/hex';
import {isHitStopActive} from './gameFeel';
import { DEFAULT_RENDER_CONFIG } from './render/RenderConfig';
import { HexProjection } from './render/math/HexProjection';

export const CAMERA_RADIUS = 16;
export const CAMERA_INNER_RADIUS = 5;
export const HEX_SIZE = DEFAULT_RENDER_CONFIG.hexSize;
export const HEX_SPACE = DEFAULT_RENDER_CONFIG.hexSpace;
export const MOVE_SPEED = 50;                   // axial units per second base

// Interaction constants
const DRAG_THRESHOLD = 4;                       // px before treating pointer as drag
const VELOCITY_SAMPLE_WINDOW_MS = 120;        // window for throw velocity sampling
const FRICTION = 8;                             // exponential friction factor
const MAX_THROW_SPEED = 100;                  // axial units per second cap

export const HEX_X_FACTOR = DEFAULT_RENDER_CONFIG.hexXFactor;
export const HEX_Y_FACTOR = DEFAULT_RENDER_CONFIG.hexYFactor;

export interface CameraState {
    q: number;
    r: number;
    targetQ: number;
    targetR: number;
    radius: number;
    innerRadius: number;
    velQ: number;
    velR: number;
    speed: number;
    screenVelocityX: number;
    screenVelocityY: number;
    shakeOffsetX: number;
    shakeOffsetY: number;
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
    speed: 0,
    screenVelocityX: 0,
    screenVelocityY: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
});

interface ActiveCameraShake {
    startMs: number;
    durationMs: number;
    intensity: number;
    frequency: number;
    seed: number;
    origin?: { q: number; r: number };
    falloffRadius: number;
    biasX: number;
    biasY: number;
}

export interface CameraShakeOptions {
    q?: number;
    r?: number;
    intensity?: number;
    durationMs?: number;
    frequency?: number;
    falloffRadius?: number;
    directional?: boolean;
    pushScale?: number;
}

const activeCameraShakes: ActiveCameraShake[] = [];

export function axialToPixel(q: number, r: number) {
    return HexProjection.axialToWorld(q, r, DEFAULT_RENDER_CONFIG);
}

export function pixelToAxial(x: number, y: number) {
    return HexProjection.worldToAxial(x, y, DEFAULT_RENDER_CONFIG);
}

// Hex distance between two axial coordinates
export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
    return axialDistance(a, b);
}

export function triggerCameraShake(options: CameraShakeOptions = {}) {
    const intensity = Math.max(0, options.intensity ?? 5);
    const durationMs = Math.max(80, options.durationMs ?? 180);
    if (intensity <= 0 || durationMs <= 0) return;

    let biasX = 0;
    let biasY = 0;
    if (options.directional !== false && options.q !== undefined && options.r !== undefined) {
        const eventPixel = axialToPixel(options.q, options.r);
        const cameraPixel = axialToPixel(camera.q, camera.r);
        const deltaX = cameraPixel.x - eventPixel.x;
        const deltaY = cameraPixel.y - eventPixel.y;
        const magnitude = Math.hypot(deltaX, deltaY);
        if (magnitude > 0.001) {
            const pushScale = options.pushScale ?? 0.45;
            biasX = (deltaX / magnitude) * pushScale;
            biasY = (deltaY / magnitude) * pushScale;
        }
    }

    if (activeCameraShakes.length >= 12) {
        activeCameraShakes.shift();
    }

    activeCameraShakes.push({
        startMs: performance.now(),
        durationMs,
        intensity,
        frequency: Math.max(4, options.frequency ?? 15),
        seed: Math.random() * Math.PI * 2,
        origin: options.q !== undefined && options.r !== undefined ? { q: options.q, r: options.r } : undefined,
        falloffRadius: Math.max(1, options.falloffRadius ?? Math.max(6, camera.innerRadius + 2)),
        biasX,
        biasY,
    });
}

function updateCameraShake(now: number, dt: number) {
    if (!activeCameraShakes.length) {
        const decay = Math.exp(-18 * dt);
        camera.shakeOffsetX *= decay;
        camera.shakeOffsetY *= decay;
        if (Math.abs(camera.shakeOffsetX) < 0.01) camera.shakeOffsetX = 0;
        if (Math.abs(camera.shakeOffsetY) < 0.01) camera.shakeOffsetY = 0;
        return;
    }

    let totalX = 0;
    let totalY = 0;

    for (let i = activeCameraShakes.length - 1; i >= 0; i--) {
        const shake = activeCameraShakes[i]!;
        const age = now - shake.startMs;
        if (age >= shake.durationMs) {
            activeCameraShakes.splice(i, 1);
            continue;
        }

        const progress = age / shake.durationMs;
        const envelope = (1 - progress) * (1 - progress);
        let attenuation = 1;

        if (shake.origin) {
            const distance = hexDistance(camera, shake.origin);
            attenuation = Math.max(0, 1 - (distance / shake.falloffRadius));
            attenuation *= attenuation;
        }

        if (attenuation <= 0.001) continue;

        const wobble = (age / 1000) * shake.frequency * Math.PI * 2;
        const amplitude = shake.intensity * envelope * attenuation;
        totalX += ((Math.sin(wobble + shake.seed) * 0.7) + (Math.sin((wobble * 1.73) + (shake.seed * 0.61)) * 0.3) + (shake.biasX * 0.85)) * amplitude;
        totalY += ((Math.cos((wobble * 1.11) + (shake.seed * 1.2)) * 0.62) + (Math.sin((wobble * 1.91) + (shake.seed * 0.27)) * 0.38) + (shake.biasY * 0.85)) * amplitude;
    }

    camera.shakeOffsetX = totalX;
    camera.shakeOffsetY = totalY;
}

// Internal drag & throw tracking
export let dragging = false;
export let dragged = false;
let dragStartX = 0, dragStartY = 0, lastX = 0, lastY = 0;
const samples: { t: number; x: number; y: number }[] = [];

export function resetCameraPointerState(mouseDownRef?: { value: boolean }, options: { stopThrow?: boolean } = {}) {
    dragging = false;
    dragged = false;
    samples.length = 0;
    if (mouseDownRef) {
        mouseDownRef.value = false;
    }
    if (options.stopThrow) {
        camera.velQ = 0;
        camera.velR = 0;
    }
}

async function clampCameraTargets() {
    return;
    const maxRad = 200;
    if (maxRad < 0) {
        camera.targetQ = 0;
        camera.targetR = 0;
        return;
    }
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
    const dq = (dx / HEX_X_FACTOR) - dr / 2;
    return {dq, dr};
}

function computeThrowVelocity() {
    if (samples.length < 2) return;

    const first = samples[0]!;
    const last = samples[samples.length - 1]!;

    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return;

    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const {dq, dr} = pixelDeltaToAxial(dx, dy);
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

export function createPointerHandlers(mouseDownRef: { value: boolean }) {
    function pointerDown(e: PointerEvent) {
        if (isPaused()) { // ignore presses when paused
            e.preventDefault();
            mouseDownRef.value = false;
            return;
        }

        if (e.pointerType === 'mouse' && e.button !== 0) return; // only left button

        mouseDownRef.value = true;
        dragged = false;
        dragging = false;
        dragStartX = lastX = e.clientX;
        dragStartY = lastY = e.clientY;
        samples.length = 0;
        samples.push({t: performance.now(), x: e.clientX, y: e.clientY});
    }

    function pointerMove(e: PointerEvent) {
        if (isPaused()) return;
        if (e.pointerType === 'mouse' && e.buttons === 0) {
            resetCameraPointerState(mouseDownRef);
            return;
        }
        if (!mouseDownRef.value) return;


        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;

        if (!dragging) {
            const dist2 = (e.clientX - dragStartX) ** 2 + (e.clientY - dragStartY) ** 2;
            if (dist2 > DRAG_THRESHOLD * DRAG_THRESHOLD) dragging = true;
            if (dragging) dragged = true;
        }

        if (dragging) {
            const {dq, dr} = pixelDeltaToAxial(dx, dy);
            camera.targetQ -= dq; // subtract so map moves with pointer drag
            camera.targetR -= dr;
            clampCameraTargets();
        }

        lastX = e.clientX;
        lastY = e.clientY;
        const now = performance.now();
        samples.push({t: now, x: e.clientX, y: e.clientY});
        while (samples.length > 0 && now - samples[0]!.t > VELOCITY_SAMPLE_WINDOW_MS) samples.shift();
        e.preventDefault();
    }

    function pointerUp() {
        if (isPaused()) {
            resetCameraPointerState(mouseDownRef, {stopThrow: true});
            return;
        }
        if (dragging) computeThrowVelocity();

        dragging = false;
        samples.length = 0;
        mouseDownRef.value = false;
    }

    function pointerCancel() {
        resetCameraPointerState(mouseDownRef, {stopThrow: true});
    }

    return {pointerDown, pointerMove, pointerUp, pointerCancel};
}

// Keyboard handlers
const heldKeys = new Set<string>();

export function isKeyboardNavigating(): boolean {
    return heldKeys.size > 0;
}

export function isCameraMoving(): boolean {
    if (dragging || heldKeys.size > 0) return true;
    if (Math.hypot(camera.targetQ - camera.q, camera.targetR - camera.r) > 0.05) return true;
    return Math.hypot(camera.screenVelocityX, camera.screenVelocityY) > 24;
}

export function keyDown(e: KeyboardEvent) {
    if (isPaused()) return; // suppress movement key capture while paused
    if (isKeyboardBlocked.value) return; // don't capture keys when any modal is blocking input
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) {
        heldKeys.add(key);
        e.preventDefault();
    }
}

export function keyUp(e: KeyboardEvent) {
    if (isPaused()) return; // suppress release processing while paused
    if (isKeyboardBlocked.value) return; // don't process key releases when any modal is blocking input
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (heldKeys.delete(key)) e.preventDefault();
}

// Animation loop
let lastTime = performance.now();
let rafId: number | null = null;
let lastQ = camera.q;
let lastR = camera.r;

export async function animateCamera() {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    if (isPaused()) {
        heldKeys.clear();
        camera.velQ = camera.velQ * 0.9; // gentle decay
        camera.velR = camera.velR * 0.9;
        camera.speed = camera.speed * 0.9;
        camera.screenVelocityX = camera.screenVelocityX * 0.88;
        camera.screenVelocityY = camera.screenVelocityY * 0.88;
        updateCameraShake(now, dt);
        rafId = requestAnimationFrame(animateCamera);
        return;
    }
    if (isHitStopActive()) {
        camera.velQ = camera.velQ * 0.9;
        camera.velR = camera.velR * 0.9;
        camera.speed = camera.speed * 0.78;
        camera.screenVelocityX = camera.screenVelocityX * 0.72;
        camera.screenVelocityY = camera.screenVelocityY * 0.72;
        updateCameraShake(now, dt);
        lastQ = camera.q;
        lastR = camera.r;
        rafId = requestAnimationFrame(animateCamera);
        return;
    }
    let dqInput = 0, drInput = 0;
    for (const k of heldKeys) {
        if (k === 'ArrowUp' || k === 'w') {
            drInput += -1;
            dqInput += 0.5;
        } else if (k === 'ArrowDown' || k === 's') {
            drInput += 1;
            dqInput += -0.5;
        } else if (k === 'ArrowLeft' || k === 'a') {
            dqInput += -1;
        } else if (k === 'ArrowRight' || k === 'd') {
            dqInput += 1;
        }
    }

    if (dqInput !== 0 || drInput !== 0) {
        const mag = Math.sqrt(dqInput * dqInput + drInput * drInput);
        if (mag > 0) {
            dqInput /= mag;
            drInput /= mag;
        }

        camera.targetQ += dqInput * MOVE_SPEED * dt;
        camera.targetR += drInput * MOVE_SPEED * dt;
       clampCameraTargets();
        camera.velQ = 0;
        camera.velR = 0; // cancel inertial velocity on active input
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

    // Compute instantaneous movement speed (axial units / second) then smooth it
    const moveDQ = camera.q - lastQ;
    const moveDR = camera.r - lastR;
    const instSpeed = dt > 0 ? Math.sqrt(moveDQ * moveDQ + moveDR * moveDR) / dt : 0;
    const prevPixel = axialToPixel(lastQ, lastR);
    const currentPixel = axialToPixel(camera.q, camera.r);
    const instScreenVelocityX = dt > 0 ? -(currentPixel.x - prevPixel.x) / dt : 0;
    const instScreenVelocityY = dt > 0 ? -(currentPixel.y - prevPixel.y) / dt : 0;

    // Exponential smoothing for nicer blur transitions
    camera.speed = camera.speed * 0.85 + instSpeed * 0.15;
    camera.screenVelocityX = camera.screenVelocityX * 0.8 + instScreenVelocityX * 0.2;
    camera.screenVelocityY = camera.screenVelocityY * 0.8 + instScreenVelocityY * 0.2;
    updateCameraShake(now, dt);
    lastQ = camera.q;
    lastR = camera.r;

    rafId = requestAnimationFrame(animateCamera);
}

export function stopCameraAnimation() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
}

export function centerCamera() {
    camera.targetQ = camera.targetR = 0;
}

export function moveCamera(q: number, r: number) {
    camera.targetQ = q;
    camera.targetR = r;
    clampCameraTargets();
}

export function jumpCamera(q: number, r: number) {
    camera.q = q;
    camera.r = r;
    camera.targetQ = q;
    camera.targetR = r;
    camera.velQ = 0;
    camera.velR = 0;
    camera.speed = 0;
    camera.screenVelocityX = 0;
    camera.screenVelocityY = 0;
    lastQ = q;
    lastR = r;
    clampCameraTargets();
}

export function nudgeCameraTowards(q: number, r: number, strength: number = 0.12, maxDistance: number = 1.4) {
    const deltaQ = q - camera.targetQ;
    const deltaR = r - camera.targetR;
    const distance = Math.hypot(deltaQ, deltaR);
    if (distance <= 0.001) return;

    const push = Math.min(maxDistance, Math.max(0.08, distance * strength));
    camera.targetQ += (deltaQ / distance) * push;
    camera.targetR += (deltaR / distance) * push;
    clampCameraTargets();
}

export function updateCameraRadius(radius: number, innerRadius?: number) {
    const r = Math.max(1, Math.round(radius));
    camera.radius = r;
    if (innerRadius !== undefined) {
        camera.innerRadius = Math.max(1, Math.min(r - 1, Math.round(innerRadius)));;
    } else if (camera.innerRadius >= r) {
        camera.innerRadius = Math.max(1, Math.round(r * 0.35));
    }
}
