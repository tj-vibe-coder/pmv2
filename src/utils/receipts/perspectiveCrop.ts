// Perspective crop + flatten ("dewarp"), dependency-free.
//
// Given four corner points of a receipt (in fractional image coordinates) the user placed
// on the photo, compute a projective transform (homography) that maps those corners to a
// flat output rectangle, then resample the source into that rectangle. The result is a
// cropped, deskewed top-down image — the same operation Office Lens performs after corner
// detection. Pure canvas + a tiny 8x8 linear solver; runs on phones for a one-shot warp.

export interface Pt { x: number; y: number; }

// Corner order used throughout: [topLeft, topRight, bottomRight, bottomLeft].
export type Quad = [Pt, Pt, Pt, Pt];

// Solve an 8x8 linear system A x = b via Gaussian elimination with partial pivoting.
function solve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / (M[i][i] || 1);
  return x;
}

// Homography (3x3, h8 = 1) mapping each `from[i]` to `to[i]`.
function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const X = from[i].x, Y = from[i].y;
    const x = to[i].x, y = to[i].y;
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
  }
  const h = solve8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Warp the quad region of `source` to a flat rectangle and return it as a JPEG.
 * `quad` corners are FRACTIONS (0..1) of the image, in [TL, TR, BR, BL] order.
 */
export async function perspectiveCropToBlob(
  source: Blob,
  quad: Quad,
  opts?: { maxEdge?: number; quality?: number },
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? 1500;
  const quality = opts?.quality ?? 0.72;

  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
  try {
    // Cap the working source resolution to keep the warp fast.
    const cap = 2200;
    const sScale = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
    const sw = Math.max(1, Math.round(bitmap.width * sScale));
    const sh = Math.max(1, Math.round(bitmap.height * sScale));
    const sCanvas = document.createElement('canvas');
    sCanvas.width = sw;
    sCanvas.height = sh;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!sCtx) return source;
    sCtx.drawImage(bitmap, 0, 0, sw, sh);
    const src = sCtx.getImageData(0, 0, sw, sh);
    const sd = src.data;

    // Quad corners in working-source pixels.
    const sp: Pt[] = quad.map((p) => ({ x: p.x * sw, y: p.y * sh }));

    // Output dimensions from the average opposite-edge lengths (preserves aspect).
    const wTop = dist(sp[0], sp[1]);
    const wBot = dist(sp[3], sp[2]);
    const hLeft = dist(sp[0], sp[3]);
    const hRight = dist(sp[1], sp[2]);
    let outW = Math.max(16, Math.round((wTop + wBot) / 2));
    let outH = Math.max(16, Math.round((hLeft + hRight) / 2));
    const oScale = Math.min(1, maxEdge / Math.max(outW, outH));
    outW = Math.max(16, Math.round(outW * oScale));
    outH = Math.max(16, Math.round(outH * oScale));

    const dstCorners: Pt[] = [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ];
    // Map output pixels back to the source (inverse mapping for resampling).
    const h = homography(dstCorners, sp);

    const out = new ImageData(outW, outH);
    const od = out.data;
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const denom = h[6] * x + h[7] * y + h[8];
        const srcx = (h[0] * x + h[1] * y + h[2]) / denom;
        const srcy = (h[3] * x + h[4] * y + h[5]) / denom;
        const oi = (y * outW + x) * 4;
        if (srcx < 0 || srcy < 0 || srcx >= sw - 1 || srcy >= sh - 1) {
          od[oi] = 255; od[oi + 1] = 255; od[oi + 2] = 255; od[oi + 3] = 255;
          continue;
        }
        const x0 = srcx | 0;
        const y0 = srcy | 0;
        const fx = srcx - x0;
        const fy = srcy - y0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + sw * 4;
        const i11 = i01 + 4;
        for (let c = 0; c < 3; c++) {
          const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
          const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
          od[oi + c] = (top * (1 - fy) + bot * fy) | 0;
        }
        od[oi + 3] = 255;
      }
    }

    const oCanvas = document.createElement('canvas');
    oCanvas.width = outW;
    oCanvas.height = outH;
    const oCtx = oCanvas.getContext('2d');
    if (!oCtx) return source;
    oCtx.putImageData(out, 0, 0);
    return await new Promise<Blob>((resolve) => {
      oCanvas.toBlob((b) => resolve(b || source), 'image/jpeg', quality);
    });
  } finally {
    bitmap.close();
  }
}
