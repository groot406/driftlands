export type GlowColor = readonly [number, number, number];

export function toRgba(color: GlowColor, alpha: number) {
    const [r, g, b] = color;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function drawGlow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: GlowColor,
    opacity: number,
) {
    if (opacity <= 0) return;

    const gradient = ctx.createRadialGradient(x, y, radius * 0.12, x, y, radius);
    gradient.addColorStop(0, toRgba(color, opacity));
    gradient.addColorStop(0.42, toRgba(color, opacity * 0.45));
    gradient.addColorStop(1, toRgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

export function smoothStep(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - (2 * clamped));
}

export function getQuadraticPoint(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number) {
    const inv = 1 - t;
    return {
        x: (inv * inv * x0) + (2 * inv * t * cx) + (t * t * x1),
        y: (inv * inv * y0) + (2 * inv * t * cy) + (t * t * y1),
    };
}

export function hexToColor(hex: string): GlowColor {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
        ? normalized.split('').map((part) => part + part).join('')
        : normalized.padEnd(6, '0').slice(0, 6);
    const parsed = Number.parseInt(value, 16);
    return [
        (parsed >> 16) & 255,
        (parsed >> 8) & 255,
        parsed & 255,
    ];
}
