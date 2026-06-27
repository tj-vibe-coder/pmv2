import type { Pt, Quad } from './perspectiveCrop';

// Receipt region detection — used only to SEED the manual 4-corner cropper.
// Two entry points:
//   detectReceiptQuad  — two-pass detection:
//     Pass 1 (brightness): Otsu mask → morph-close → convex hull → diagonal-extreme corners.
//                          Fast, works great for white receipt on dark background.
//     Pass 2 (edges):      Sobel gradient → Hough line transform → pair H+V lines →
//                          rectangle intersection corners. Works even when the paper blends
//                          into the background or is in shadow — it looks for the rectangular
//                          outline rather than the bright blob.
//   detectReceiptBBox  — legacy axis-aligned bounding box (kept for backwards compat).
// Both return fractional coordinates (0..1). Working resolution capped at ~300 px for speed.

export interface BBoxFrac { x0: number; y0: number; x1: number; y1: number; }

function otsuThreshold(hist: number[], total: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

interface BBox { x0: number; y0: number; x1: number; y1: number; size: number; }

function largestComponent(mask: Uint8Array, w: number, h: number): BBox | null {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best: BBox | null = null;
  for (let start = 0; start < w * h; start++) {
    if (mask[start] === 0 || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w;
      const py = (p - px) / w;
      size++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      if (px > 0) { const q = p - 1; if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
      if (px < w - 1) { const q = p + 1; if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
      if (py > 0) { const q = p - w; if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
      if (py < h - 1) { const q = p + w; if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } }
    }
    if (!best || size > best.size) best = { x0, y0, x1, y1, size };
  }
  return best;
}

export async function detectReceiptBBox(input: Blob): Promise<BBoxFrac | null> {
  if (!input.type.startsWith('image/')) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
  } catch {
    return null;
  }
  try {
    const AW = Math.min(260, bitmap.width);
    const ascale = AW / bitmap.width;
    const AH = Math.max(1, Math.round(bitmap.height * ascale));
    const ac = document.createElement('canvas');
    ac.width = AW;
    ac.height = AH;
    const actx = ac.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!actx) return null;
    actx.drawImage(bitmap, 0, 0, AW, AH);
    const { data } = actx.getImageData(0, 0, AW, AH);

    const n = AW * AH;
    const lum = new Uint8Array(n);
    const hist = new Array<number>(256).fill(0);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
      lum[p] = l;
      hist[l]++;
    }

    const t = Math.max(otsuThreshold(hist, n), 120);
    const mask = new Uint8Array(n);
    let brightCount = 0;
    for (let p = 0; p < n; p++) { if (lum[p] >= t) { mask[p] = 1; brightCount++; } }
    if (brightCount < n * 0.03) return null;

    const comp = largestComponent(mask, AW, AH);
    if (!comp || comp.size < n * 0.04) return null;

    // Small inward inset keeps the seed box just inside the paper edges.
    const insX = AW * 0.01;
    const insY = AH * 0.01;
    return {
      x0: Math.min(Math.max((comp.x0 + insX) / AW, 0), 1),
      y0: Math.min(Math.max((comp.y0 + insY) / AH, 0), 1),
      x1: Math.min(Math.max((comp.x1 - insX) / AW, 0), 1),
      y1: Math.min(Math.max((comp.y1 - insY) / AH, 0), 1),
    };
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadLuma(
  input: Blob,
  maxW: number,
): Promise<{ lum: Uint8Array; w: number; h: number } | null> {
  if (!input.type.startsWith('image/')) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
  } catch {
    return null;
  }
  try {
    const w = Math.min(maxW, bitmap.width);
    const scale = w / bitmap.width;
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const n = w * h;
    const lum = new Uint8Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    }
    return { lum, w, h };
  } finally {
    bitmap.close();
  }
}

// 3×3 box blur — averages out fine print so Otsu sees solid paper rather than speckled text.
function boxBlur3(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += src[yy * w + xx];
          cnt++;
        }
      }
      out[y * w + x] = (sum / cnt) | 0;
    }
  }
  return out;
}

// One-pass radius-1 4-neighbour morphology: grow=true → dilate, grow=false → erode.
// Running dilate then erode (closing) seals dark-text holes so the sheet reads as one blob.
function morph(mask: Uint8Array, w: number, h: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let v = mask[p];
      const left  = x > 0     ? mask[p - 1] : (grow ? 0 : 1);
      const right = x < w - 1 ? mask[p + 1] : (grow ? 0 : 1);
      const up    = y > 0     ? mask[p - w]  : (grow ? 0 : 1);
      const down  = y < h - 1 ? mask[p + w]  : (grow ? 0 : 1);
      if (grow) {
        if (left === 1 || right === 1 || up === 1 || down === 1) v = 1;
      } else {
        if (left === 0 || right === 0 || up === 0 || down === 0) v = 0;
      }
      out[p] = v;
    }
  }
  return out;
}

// Flood-fill labelling; returns a binary mask of the LARGEST connected component
// and its bounding box.
function largestComponentMask(
  mask: Uint8Array,
  w: number,
  h: number,
): { comp: Uint8Array; size: number; bbox: BBox } | null {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let bestId = -1, bestSize = 0, id = 0;
  let bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || labels[start] !== -1) continue;
    let sp = 0, size = 0;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[sp++] = start;
    labels[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w;
      const py = (p - px) / w;
      size++;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (px > 0)     { const q = p - 1; if (mask[q] && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
      if (px < w - 1) { const q = p + 1; if (mask[q] && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
      if (py > 0)     { const q = p - w; if (mask[q] && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
      if (py < h - 1) { const q = p + w; if (mask[q] && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
    }
    if (size > bestSize) { bestSize = size; bestId = id; bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; }
    id++;
  }
  if (bestId < 0) return null;
  const comp = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (labels[p] === bestId) comp[p] = 1;
  return { comp, size: bestSize, bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1, size: bestSize } };
}

// 4-neighbour boundary pixels of the component (incl. image-edge pixels in the component).
function boundaryPoints(comp: Uint8Array, w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!comp[y * w + x]) continue;
      const onEdge =
        x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
        !comp[y * w + x - 1] || !comp[y * w + x + 1] ||
        !comp[(y - 1) * w + x] || !comp[(y + 1) * w + x];
      if (onEdge) pts.push({ x, y });
    }
  }
  return pts;
}

// Andrew's monotone-chain convex hull. Output order: counter-clockwise.
function convexHull(points: Pt[]): Pt[] {
  if (points.length < 4) return points.slice();
  const pts = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Pick the 4 document corners from any point set via diagonal extremes:
//   TL = min(x+y),  BR = max(x+y)
//   TR = max(x−y),  BL = min(x−y)
// Tilt-robust: works for documents rotated up to ~45°.
function pickCorners(pts: Pt[]): Quad {
  let tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
  let tlV = Infinity, brV = -Infinity, trV = -Infinity, blV = Infinity;
  for (const p of pts) {
    const sum = p.x + p.y;
    const dif = p.x - p.y;
    if (sum < tlV) { tlV = sum; tl = p; }
    if (sum > brV) { brV = sum; br = p; }
    if (dif > trV) { trV = dif; tr = p; }
    if (dif < blV) { blV = dif; bl = p; }
  }
  return [tl, tr, br, bl];
}

function polygonArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

// Pull each corner slightly toward the centroid so the seed lands just inside the paper.
function insetToCentroid(q: Quad, frac: number): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  return q.map((p) => ({ x: p.x + (cx - p.x) * frac, y: p.y + (cy - p.y) * frac })) as Quad;
}

const bboxToQuad = (b: BBox): Quad => [
  { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 },
  { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 },
];

// ---------------------------------------------------------------------------
// Pass 2: Sobel + Hough rectangle detection
// Used when the receipt blends into the background (white-on-white, shadows, dark paper).
// Looks for the rectangular OUTLINE (edges) instead of the bright BLOB.
// ---------------------------------------------------------------------------

// Sobel gradient magnitude — use original luma (not blurred) so edges stay sharp.
function sobelMag(lum: Uint8Array, w: number, h: number): Uint8Array {
  const mag = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx =
        -lum[p - w - 1] + lum[p - w + 1] +
        -2 * lum[p - 1] + 2 * lum[p + 1] +
        -lum[p + w - 1] + lum[p + w + 1];
      const gy =
        -lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1] +
         lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1];
      mag[p] = Math.min(255, Math.sqrt(gx * gx + gy * gy) | 0);
    }
  }
  return mag;
}

interface HoughLine { rho: number; theta: number; votes: number; }

// Standard Hough line transform: θ ∈ [0°,180°), ρ ∈ [−diag, +diag], 1° × 1px resolution.
// Returns peaks sorted by vote count.
function houghLines(edges: Uint8Array, w: number, h: number, minVotes: number): HoughLine[] {
  const diag = Math.ceil(Math.sqrt(w * w + h * h));
  const rhoOffset = diag;
  const rhoBins = diag * 2 + 1;
  const thetaBins = 180;

  const cosT = new Float32Array(thetaBins);
  const sinT = new Float32Array(thetaBins);
  for (let t = 0; t < thetaBins; t++) {
    cosT[t] = Math.cos(t * Math.PI / 180);
    sinT[t] = Math.sin(t * Math.PI / 180);
  }

  const acc = new Int32Array(thetaBins * rhoBins);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!edges[y * w + x]) continue;
      for (let t = 0; t < thetaBins; t++) {
        const r = Math.round(x * cosT[t] + y * sinT[t]) + rhoOffset;
        if (r >= 0 && r < rhoBins) acc[t * rhoBins + r]++;
      }
    }
  }

  // Non-maximum suppression in (θ, ρ) space.
  const dT = 3, dR = 6;
  const peaks: HoughLine[] = [];
  for (let t = 0; t < thetaBins; t++) {
    for (let r = dR; r < rhoBins - dR; r++) {
      const v = acc[t * rhoBins + r];
      if (v < minVotes) continue;
      let isMax = true;
      outer: for (let dt = -dT; dt <= dT; dt++) {
        const tt = (t + dt + thetaBins) % thetaBins;
        for (let dr = -dR; dr <= dR; dr++) {
          if (dt === 0 && dr === 0) continue;
          if (acc[tt * rhoBins + r + dr] > v) { isMax = false; break outer; }
        }
      }
      if (isMax) peaks.push({ rho: r - rhoOffset, theta: t, votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  return peaks;
}

// Intersection point of two Hough lines. Returns null if they are near-parallel.
function lineIntersect(a: HoughLine, b: HoughLine): Pt | null {
  const r1 = a.theta * Math.PI / 180;
  const r2 = b.theta * Math.PI / 180;
  const c1 = Math.cos(r1), s1 = Math.sin(r1);
  const c2 = Math.cos(r2), s2 = Math.sin(r2);
  const det = c1 * s2 - c2 * s1;
  if (Math.abs(det) < 1e-8) return null;
  return {
    x: (a.rho * s2 - b.rho * s1) / det,
    y: (b.rho * c1 - a.rho * c2) / det,
  };
}

// Given Hough peaks, find the best-scoring rectangle:
// pair 2 near-horizontal lines × 2 near-vertical lines, compute 4 corner intersections.
function rectangleFromLines(peaks: HoughLine[], w: number, h: number): Quad | null {
  // θ 0–44° and 136–179° = near-horizontal edges (top/bottom of receipt)
  // θ 45–135° = near-vertical edges (left/right sides)
  const horiz = peaks.filter(p => p.theta < 44 || p.theta >= 136).slice(0, 8);
  const vert  = peaks.filter(p => p.theta >= 44 && p.theta < 136).slice(0, 8);
  if (horiz.length < 2 || vert.length < 2) return null;

  const margin = w * 0.15; // allow corners slightly outside the image boundary
  let bestQuad: Quad | null = null;
  let bestScore = -1;

  const hLen = Math.min(horiz.length, 5);
  const vLen = Math.min(vert.length, 5);
  for (let h1 = 0; h1 < hLen; h1++) {
    for (let h2 = h1 + 1; h2 < hLen; h2++) {
      for (let v1 = 0; v1 < vLen; v1++) {
        for (let v2 = v1 + 1; v2 < vLen; v2++) {
          const tl = lineIntersect(horiz[h1], vert[v1]);
          const tr = lineIntersect(horiz[h1], vert[v2]);
          const br = lineIntersect(horiz[h2], vert[v2]);
          const bl = lineIntersect(horiz[h2], vert[v1]);
          if (!tl || !tr || !br || !bl) continue;
          const corners = [tl, tr, br, bl];
          // All 4 corners must land within (or near) the image.
          if (corners.some(p =>
            p.x < -margin || p.x > w + margin ||
            p.y < -margin || p.y > h + margin,
          )) continue;
          const quad = pickCorners(corners);
          const area = polygonArea(quad);
          const minArea = w * h * 0.04;
          if (area < minArea) continue;
          const score = area * (horiz[h1].votes + horiz[h2].votes + vert[v1].votes + vert[v2].votes);
          if (score > bestScore) { bestScore = score; bestQuad = quad; }
        }
      }
    }
  }
  return bestQuad;
}

// ---------------------------------------------------------------------------
// detectReceiptQuad — two-pass corner detection
// ---------------------------------------------------------------------------

export async function detectReceiptQuad(input: Blob): Promise<Quad | null> {
  const loaded = await loadLuma(input, 300);
  if (!loaded) return null;
  const { lum: rawLum, w, h } = loaded;
  const n = w * h;
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

  // --- Pass 1: brightness blob → hull → corners ---
  // Works great for white receipt on a dark or contrasting background.
  const lum = boxBlur3(rawLum, w, h);
  const hist = new Array<number>(256).fill(0);
  for (let p = 0; p < n; p++) hist[lum[p]]++;
  const t = Math.max(otsuThreshold(hist, n), 110);

  let mask = new Uint8Array(n);
  let bright = 0;
  for (let p = 0; p < n; p++) if (lum[p] >= t) { mask[p] = 1; bright++; }

  if (bright >= n * 0.03) {
    mask = morph(mask, w, h, true);
    mask = morph(mask, w, h, false);
    const lc = largestComponentMask(mask, w, h);
    if (lc && lc.size >= n * 0.04) {
      const hull = convexHull(boundaryPoints(lc.comp, w, h));
      const quad = pickCorners(hull);
      const bbArea = (lc.bbox.x1 - lc.bbox.x0 + 1) * (lc.bbox.y1 - lc.bbox.y0 + 1);
      const sides = ([0, 1, 2, 3] as const).map((i) => {
        const a = quad[i], b = quad[(i + 1) % 4];
        return Math.hypot(a.x - b.x, a.y - b.y);
      });
      // If the bright bbox touches all 4 image edges the whole scene is bright (white-on-white).
      // Skip Pass 1 returns and let edge-based passes handle it.
      const touchesAll = lc.bbox.x0 <= 2 && lc.bbox.y0 <= 2 &&
        lc.bbox.x1 >= w - 3 && lc.bbox.y1 >= h - 3;
      if (!touchesAll && polygonArea(quad) > bbArea * 0.5 && Math.min(...sides) > 4) {
        const result = insetToCentroid(quad, 0.015);
        return result.map((p) => ({ x: clamp(p.x / w), y: clamp(p.y / h) })) as Quad;
      }
      // Pass 1 found a component but the quad was degenerate — use bbox as last resort within pass 1.
      if (!touchesAll && lc.size >= n * 0.08) {
        const q = insetToCentroid(bboxToQuad(lc.bbox), 0.015);
        return q.map((p) => ({ x: clamp(p.x / w), y: clamp(p.y / h) })) as Quad;
      }
    }
  }

  // --- Pass 2a: downsampled Hough at ~150px ---
  // At half the working resolution, receipt text (small/dense glyphs) blurs into noise via
  // 2×2 box averaging while the paper-boundary edge (a long, low-frequency step) survives.
  // This is the primary fix for white-on-white: the paper edge wins the Hough vote because
  // text noise has vanished, shifting signal-to-noise decisively in the boundary's favour.
  if (w >= 200 && h >= 200) {
    const dw = w >> 1;
    const dh = h >> 1;
    const dn = dw * dh;
    const ds = new Uint8Array(dn);
    for (let sy = 0; sy < dh; sy++) {
      for (let sx = 0; sx < dw; sx++) {
        const base = sy * 2 * w + sx * 2;
        ds[sy * dw + sx] = (rawLum[base] + rawLum[base + 1] + rawLum[base + w] + rawLum[base + w + 1] + 2) >> 2;
      }
    }
    const dMag = sobelMag(ds, dw, dh);
    const dHist = new Array<number>(256).fill(0);
    for (let p = 0; p < dn; p++) dHist[dMag[p]]++;
    let dEdgeSum = 0, dEdgeT = 255;
    for (let v = 255; v >= 0; v--) {
      dEdgeSum += dHist[v];
      if (dEdgeSum >= dn * 0.08) { dEdgeT = v; break; }
    }
    const dEdges = new Uint8Array(dn);
    for (let p = 0; p < dn; p++) if (dMag[p] >= dEdgeT) dEdges[p] = 1;
    const dMinVotes = Math.max(20, Math.round(Math.sqrt(dn) * 0.15));
    const dPeaks = houghLines(dEdges, dw, dh, dMinVotes);
    const dRectQuad = rectangleFromLines(dPeaks, dw, dh);
    if (dRectQuad) {
      const dResult = insetToCentroid(dRectQuad, 0.015);
      return dResult.map((p) => ({ x: clamp(p.x / dw), y: clamp(p.y / dh) })) as Quad;
    }
  }

  // --- Pass 2b: Sobel edges → Hough lines at full 300px resolution ---
  // Activates when the receipt blends into the background (white-on-white, shadows,
  // dark/thermal paper). Scans for the rectangular OUTLINE rather than the bright blob.
  const mag = sobelMag(rawLum, w, h);
  // Adaptive edge threshold: keeps the ~top 8% strongest gradients.
  const edgeHist = new Array<number>(256).fill(0);
  for (let p = 0; p < n; p++) edgeHist[mag[p]]++;
  let edgeTarget = n * 0.08, edgeSum = 0, edgeT = 255;
  for (let v = 255; v >= 0; v--) {
    edgeSum += edgeHist[v];
    if (edgeSum >= edgeTarget) { edgeT = v; break; }
  }
  const edges = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (mag[p] >= edgeT) edges[p] = 1;

  const minVotes = Math.max(15, Math.round(Math.sqrt(n) * 0.08));
  const peaks = houghLines(edges, w, h, minVotes);
  const rectQuad = rectangleFromLines(peaks, w, h);
  if (rectQuad) {
    const result = insetToCentroid(rectQuad, 0.015);
    return result.map((p) => ({ x: clamp(p.x / w), y: clamp(p.y / h) })) as Quad;
  }

  return null;
}
