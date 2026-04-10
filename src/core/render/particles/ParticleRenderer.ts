import { graphicsStore, shouldUseParticleGlowPass } from '../../../store/graphicsStore';
import { consumePendingTerrainBursts } from '../../gameFeel';
import { axialToPixel, camera } from '../../camera';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext } from '../RenderPassContext';

type ParticleLayer = 'underlay' | 'overlay';

interface CameraCompositeStateLike {
    offsetX: number;
    offsetY: number;
    roll: number;
    zoom: number;
}

interface ParticleLike {
    x: number;
    y: number;
    size: number;
    bornMs: number;
    lifeMs: number;
    alpha: number;
    glow: number;
    color: readonly [number, number, number];
    twinkle: number;
    shape: 'circle' | 'diamond' | 'cloud' | 'ring' | 'bird';
    renderMode?: 'glow' | 'smoke';
    growth?: number;
    layer?: ParticleLayer;
    vx?: number;
    vy?: number;
    wobbleX?: number;
    wobbleY?: number;
    wobbleSpeed?: number;
    flapSpeed?: number;
}

interface RenderFrameLike {
    cameraFx: CameraCompositeStateLike;
    effectNowMs: number;
    visibleTiles: Tile[];
}

interface DrawableParticle {
    particle: ParticleLike;
    alpha: number;
    progress: number;
}

interface MotionSample {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface ParticleRendererDependencies {
    canvas: HTMLCanvasElement | null;
    dpr: number;
    getCanvasCenter(): { cx: number; cy: number };
    applyWorldTransform(
        ctx: CanvasRenderingContext2D,
        translateX: number,
        translateY: number,
        cameraFx: CameraCompositeStateLike,
    ): void;
    projectWorldToScreenPixels(
        worldX: number,
        worldY: number,
        cameraFx: CameraCompositeStateLike,
    ): { x: number; y: number };
    getParticleEdgeFade(screenX: number, screenY: number, applyCameraFade: boolean): number;
    toRgba(color: readonly [number, number, number], alpha: number): string;
    resetParticles(now: number): void;
    updateParticles(deltaMs: number, now: number): void;
    spawnGameplayBursts(now: number): void;
    spawnAmbientParticles(now: number, tiles: Tile[]): void;
    spawnTaskParticles(now: number, tiles: Tile[]): void;
    spawnHeroTrailParticles(now: number): void;
    getParticles(): ParticleLike[];
    getLastParticleUpdateMs(): number;
    setLastParticleUpdateMs(now: number): void;
}

export class ParticleRenderer {
    renderWorldLayer(
        context: RenderPassContext,
        frame: RenderFrameLike,
        deps: ParticleRendererDependencies,
    ) {
        const underlaySurface = context.particleUnderlaySurface;
        const overlaySurface = context.particleOverlaySurface;
        if ((!underlaySurface && !overlaySurface) || !deps.canvas) {
            return;
        }

        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        if (!this.updateParticles(frame.effectNowMs, frame.visibleTiles, deps)) {
            if (underlaySurface) {
                underlaySurface.ctx.clearRect(0, 0, underlaySurface.canvas.width, underlaySurface.canvas.height);
            }
            if (overlaySurface) {
                overlaySurface.ctx.clearRect(0, 0, overlaySurface.canvas.width, overlaySurface.canvas.height);
            }
            return;
        }

        if (underlaySurface) {
            this.drawParticleLayer(
                underlaySurface.ctx,
                underlaySurface.canvas,
                frame.effectNowMs,
                false,
                frame.cameraFx,
                translateX,
                translateY,
                'underlay',
                deps,
            );
        }
        if (overlaySurface) {
            this.drawParticleLayer(
                overlaySurface.ctx,
                overlaySurface.canvas,
                frame.effectNowMs,
                false,
                frame.cameraFx,
                translateX,
                translateY,
                'overlay',
                deps,
            );
        }
    }

    private updateParticles(
        now: number,
        tiles: Tile[],
        deps: ParticleRendererDependencies,
    ) {
        if (!deps.canvas) return false;

        if (!graphicsStore.particles) {
            consumePendingTerrainBursts();
            deps.resetParticles(now);
            return false;
        }

        const deltaMs = Math.max(0, Math.min(48, now - deps.getLastParticleUpdateMs()));
        deps.setLastParticleUpdateMs(now);
        deps.updateParticles(deltaMs, now);
        deps.spawnGameplayBursts(now);
        deps.spawnAmbientParticles(now, tiles);
        deps.spawnTaskParticles(now, tiles);
        deps.spawnHeroTrailParticles(now);

        return deps.getParticles().length > 0;
    }

    private drawParticleLayer(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        now: number,
        applyCameraFade: boolean,
        cameraFx: CameraCompositeStateLike,
        translateX: number,
        translateY: number,
        layer: ParticleLayer,
        deps: ParticleRendererDependencies,
    ) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(deps.dpr, deps.dpr);
        deps.applyWorldTransform(ctx, translateX, translateY, cameraFx);

        const drawables = this.collectDrawableParticles(now, applyCameraFade, cameraFx, layer, deps);
        this.drawParticles(ctx, drawables, now, deps);
        ctx.restore();
    }

    private collectDrawableParticles(
        now: number,
        applyCameraFade: boolean,
        cameraFx: CameraCompositeStateLike,
        layer: ParticleLayer,
        deps: ParticleRendererDependencies,
        predicate?: (particle: ParticleLike) => boolean,
    ) {
        if (!deps.canvas) return [] as DrawableParticle[];

        const particles = deps.getParticles();
        if (!particles.length) return [] as DrawableParticle[];

        const canvasWidth = deps.canvas.width / deps.dpr;
        const canvasHeight = deps.canvas.height / deps.dpr;
        const drawableParticles: DrawableParticle[] = [];

        for (const particle of particles) {
            if ((particle.layer ?? 'underlay') !== layer) continue;
            if (predicate && !predicate(particle)) continue;

            const age = now - particle.bornMs;
            if (age >= particle.lifeMs) continue;

            const motion = particle.shape === 'bird'
                ? this.sampleBirdMotion(particle, now)
                : null;
            const drawX = particle.x + (motion?.x ?? 0);
            const drawY = particle.y + (motion?.y ?? 0);

            const { x: screenX, y: screenY } = deps.projectWorldToScreenPixels(drawX, drawY, cameraFx);
            const overscan = particle.shape === 'cloud'
                ? Math.max(80, particle.size * 2.8)
                : particle.shape === 'bird'
                    ? Math.max(48, particle.size * 2.2)
                    : 40;
            if (
                screenX < -overscan
                || screenX > canvasWidth + overscan
                || screenY < -overscan
                || screenY > canvasHeight + overscan
            ) {
                continue;
            }

            const edgeFade = deps.getParticleEdgeFade(screenX, screenY, applyCameraFade);
            if (edgeFade <= 0.01) continue;

            const progress = age / particle.lifeMs;
            const fade = particle.renderMode === 'smoke'
                ? (1 - (progress * 0.58))
                : particle.shape === 'bird'
                    ? (0.98 - (progress * 0.2))
                    : (1 - (progress * 0.82));
            const flicker = particle.renderMode === 'smoke'
                ? 0.97 + (Math.sin((now + particle.twinkle) / 280) * 0.05)
                : particle.shape === 'bird'
                    ? 0.97 + (Math.sin((now + particle.twinkle) / 260) * 0.04)
                    : 0.9 + (Math.sin((now + particle.twinkle) / 120) * 0.22);
            const alpha = particle.alpha * fade * flicker * edgeFade;
            if (alpha <= 0.02) continue;

            drawableParticles.push({ particle, alpha, progress });
        }

        return drawableParticles;
    }

    private drawParticles(
        ctx: CanvasRenderingContext2D,
        drawableParticles: readonly DrawableParticle[],
        now: number,
        deps: ParticleRendererDependencies,
    ) {
        if (!drawableParticles.length) return;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if (shouldUseParticleGlowPass()) {
            ctx.globalCompositeOperation = 'screen';
            for (const { particle, alpha } of drawableParticles) {
                if (
                    particle.renderMode === 'smoke'
                    || particle.shape === 'ring'
                    || particle.shape === 'bird'
                ) {
                    continue;
                }
                const glowRadius = particle.size * particle.glow;
                const glow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowRadius);
                glow.addColorStop(0, deps.toRgba(particle.color, alpha * 1.25));
                glow.addColorStop(0.4, deps.toRgba(particle.color, alpha * 0.68));
                glow.addColorStop(1, deps.toRgba(particle.color, 0));
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        for (const { particle, alpha, progress } of drawableParticles) {
            if (particle.shape === 'cloud') {
                this.drawSmokeParticle(ctx, particle, alpha, progress, deps);
                continue;
            }

            if (particle.shape === 'ring') {
                this.drawRingParticle(ctx, particle, alpha, progress, deps);
                continue;
            }

            if (particle.shape === 'bird') {
                this.drawBirdParticle(ctx, particle, alpha, now, deps);
                continue;
            }

            const coreAlpha = Math.min(1, alpha * (particle.shape === 'diamond' ? 0.98 : 0.78));
            ctx.fillStyle = deps.toRgba(particle.color, coreAlpha);
            if (particle.shape === 'diamond') {
                ctx.save();
                ctx.translate(particle.x, particle.y);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-particle.size * 0.42, -particle.size * 0.42, particle.size * 0.84, particle.size * 0.84);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size * 0.48, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    private drawRingParticle(
        ctx: CanvasRenderingContext2D,
        particle: ParticleLike,
        alpha: number,
        progress: number,
        deps: ParticleRendererDependencies,
    ) {
        const maxRadius = particle.size * (particle.growth ?? 4);
        const radius = particle.size + (maxRadius - particle.size) * progress;
        const ringAlpha = alpha * (1.18 - (progress * 0.52));
        const lineWidth = Math.max(0.55, 1.75 * (1 - progress * 0.62));

        const ringGlow = ctx.createRadialGradient(
            particle.x,
            particle.y,
            Math.max(0, radius * 0.62),
            particle.x,
            particle.y,
            radius + (particle.size * 1.7),
        );
        ringGlow.addColorStop(0, deps.toRgba(particle.color, 0));
        ringGlow.addColorStop(0.62, deps.toRgba(particle.color, ringAlpha * 0.28));
        ringGlow.addColorStop(1, deps.toRgba(particle.color, 0));
        ctx.fillStyle = ringGlow;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius + (particle.size * 1.7), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = deps.toRgba([255, 255, 255], ringAlpha * 0.18);
        ctx.lineWidth = lineWidth + 0.85;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = deps.toRgba(particle.color, ringAlpha);
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    private drawSmokeParticle(
        ctx: CanvasRenderingContext2D,
        particle: ParticleLike,
        alpha: number,
        progress: number,
        deps: ParticleRendererDependencies,
    ) {
        const growth = particle.growth ?? 1.45;
        const radius = particle.size * (0.88 + (progress * growth));
        const drift = Math.sin((particle.twinkle + (progress * 1200)) / 230) * radius * 0.08;
        const puffs = [
            { ox: (-radius * 0.36) + drift, oy: radius * 0.1, rx: radius * 0.72, ry: radius * 0.56, a: 0.72 },
            { ox: drift * -0.3, oy: -radius * 0.16, rx: radius * 0.94, ry: radius * 0.7, a: 0.92 },
            { ox: (radius * 0.34) - (drift * 0.5), oy: radius * 0.04, rx: radius * 0.66, ry: radius * 0.5, a: 0.68 },
        ];

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        for (const puff of puffs) {
            const puffAlpha = alpha * puff.a;
            const puffX = particle.x + puff.ox;
            const puffY = particle.y + puff.oy;
            const gradient = ctx.createRadialGradient(puffX, puffY, 0, puffX, puffY, Math.max(puff.rx, puff.ry));
            gradient.addColorStop(0, deps.toRgba(particle.color, puffAlpha));
            gradient.addColorStop(0.62, deps.toRgba(particle.color, puffAlpha * 0.52));
            gradient.addColorStop(1, deps.toRgba(particle.color, 0));
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(puffX, puffY, puff.rx, puff.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    private drawBirdParticle(
        ctx: CanvasRenderingContext2D,
        particle: ParticleLike,
        alpha: number,
        now: number,
        deps: ParticleRendererDependencies,
    ) {
        const motion = this.sampleBirdMotion(particle, now);
        const flapSpeed = particle.flapSpeed ?? 1;
        const flapPhase = ((now + particle.twinkle) / 110) * flapSpeed;
        const flap = Math.sin(flapPhase);
        const bodyBob = Math.sin(flapPhase * 0.5) * particle.size * 0.08;
        const wingSpan = particle.size * (0.72 + (((flap + 1) * 0.5) * 0.3));
        const wingLift = particle.size * (0.14 + (((flap + 1) * 0.5) * 0.42));
        const tailDrop = particle.size * (0.06 + (((1 - flap) * 0.5) * 0.1));
        const bodyWidth = particle.size * 0.24;
        const bodyHeight = particle.size * 0.11;

        ctx.save();
        ctx.translate(particle.x + motion.x, particle.y + motion.y + bodyBob);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.strokeStyle = deps.toRgba([36, 34, 34], alpha * 0.08);
        ctx.lineWidth = Math.max(1.1, particle.size * 0.24);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-wingSpan * 0.28, -wingLift * 1.08, -wingSpan, tailDrop);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(wingSpan * 0.28, -wingLift * 1.08, wingSpan, tailDrop);
        ctx.stroke();

        ctx.strokeStyle = deps.toRgba(particle.color, alpha);
        ctx.lineWidth = Math.max(0.9, particle.size * 0.18);
        ctx.beginPath();
        ctx.moveTo(-particle.size * 0.08, particle.size * 0.04);
        ctx.quadraticCurveTo(-wingSpan * 0.3, -wingLift, -wingSpan, tailDrop);
        ctx.moveTo(particle.size * 0.08, particle.size * 0.04);
        ctx.quadraticCurveTo(wingSpan * 0.3, -wingLift, wingSpan, tailDrop);
        ctx.stroke();

        ctx.fillStyle = deps.toRgba([10, 10, 10], alpha * 0.92);
        ctx.beginPath();
        ctx.ellipse(0, bodyHeight * 0.14, bodyWidth, bodyHeight, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = deps.toRgba([16, 16, 16], alpha * 0.22);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.6, particle.size * 0.13), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    private sampleBirdMotion(particle: ParticleLike, now: number): MotionSample {
        const phase = ((now - particle.bornMs) / 1000) * (particle.wobbleSpeed ?? 1.2) + (particle.twinkle * 0.0026);
        const curveX = particle.wobbleX ?? 0;
        const curveY = particle.wobbleY ?? 0;
        const orbitPhase = phase * 0.56;
        const x = (Math.cos(orbitPhase) * curveX * 0.74) + (Math.sin(phase * 1.34) * curveX * 0.18);
        const y = (Math.sin(orbitPhase) * curveY * 0.92)
            + (Math.cos(phase * 1.18) * curveY * 0.28)
            + (Math.sin(phase * 0.44) * curveY * 0.2);
        const nextPhase = phase + 0.06;
        const nextOrbitPhase = nextPhase * 0.56;
        const x2 = (Math.cos(nextOrbitPhase) * curveX * 0.74) + (Math.sin(nextPhase * 1.34) * curveX * 0.18);
        const y2 = (Math.sin(nextOrbitPhase) * curveY * 0.92)
            + (Math.cos(nextPhase * 1.18) * curveY * 0.28)
            + (Math.sin(nextPhase * 0.44) * curveY * 0.2);
        return {
            x,
            y,
            vx: (x2 - x) / 0.06,
            vy: (y2 - y) / 0.06,
        };
    }
}
