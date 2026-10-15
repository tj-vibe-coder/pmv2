'use strict';

// Gemini must identify all four actual paper corners. Never fabricate coordinates
// from missing fields or clamp an out-of-range answer into a plausible crop.
function normalizeReceiptCrop(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const quad = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(key => parsed[key]);
  if (!quad.every(p => p && typeof p.x === 'number' && typeof p.y === 'number'
    && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]; const b = quad[(i + 1) % 4]; const c = quad[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.000001) return null;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2 >= 0.01 ? quad.map(p => ({ x: p.x, y: p.y })) : null;
}
module.exports = { normalizeReceiptCrop };
