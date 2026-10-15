import type { Quad } from './perspectiveCrop';

export const FULL_PHOTO_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

// Reject incomplete, crossed, reversed or near-zero suggestions before warping.
export function isUsableCropQuad(value: unknown): value is Quad {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every(p => p && typeof p.x === 'number' && typeof p.y === 'number'
    && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = value[i]; const b = value[(i + 1) % 4]; const c = value[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.000001) return false;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2 >= 0.01;
}
