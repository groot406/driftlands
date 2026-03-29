export interface AxialPoint {
  q: number;
  r: number;
}

export function axialDistance(a: AxialPoint, b: AxialPoint): number {
  return axialDistanceCoords(a.q, a.r, b.q, b.r);
}

export function axialDistanceCoords(aQ: number, aR: number, bQ: number, bR: number): number {
  const dq = Math.abs(aQ - bQ);
  const dr = Math.abs(aR - bR);
  const ds = Math.abs((-aQ - aR) - (-bQ - bR));
  return Math.max(dq, dr, ds);
}

export function axialDistanceFromOrigin(q: number, r: number): number {
  return axialDistanceCoords(0, 0, q, r);
}

export function isAxialNeighbor(a: AxialPoint, b: AxialPoint): boolean {
  return axialDistanceCoords(a.q, a.r, b.q, b.r) === 1;
}
