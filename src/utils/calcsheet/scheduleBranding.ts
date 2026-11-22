// Gantt client branding: when IOCT is the subcontractor on a project, its
// schedule (screen header + PDF export) carries the client's / main
// contractor's logo. Stored per schedule projectId on the server.

export interface ScheduleBranding {
  subcontracted: boolean;
  clientName: string;
  /** PNG/JPEG data URL, already resized by resizeLogo(). */
  logoDataUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  updatedAt?: string;
  updatedBy?: string;
}

export const emptyBranding = (): ScheduleBranding => ({
  subcontracted: false, clientName: '', logoDataUrl: null, logoWidth: null, logoHeight: null,
});

/** The logo to draw, or null when the project isn't subcontracted / has no logo. */
export function activeLogo(b: ScheduleBranding | null | undefined): { src: string; w: number; h: number; name: string } | null {
  if (!b || !b.subcontracted || !b.logoDataUrl) return null;
  return { src: b.logoDataUrl, w: b.logoWidth || 4, h: b.logoHeight || 1, name: b.clientName };
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function fetchScheduleBranding(projectId: string): Promise<ScheduleBranding | null> {
  const res = await fetch(`/api/schedule-branding/${encodeURIComponent(projectId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load client branding');
  const body = (await res.json()) as { branding: ScheduleBranding | null };
  return body.branding ? { ...emptyBranding(), ...body.branding } : null;
}

export async function saveScheduleBranding(projectId: string, b: ScheduleBranding): Promise<ScheduleBranding> {
  const res = await fetch(`/api/schedule-branding/${encodeURIComponent(projectId)}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(b),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to save client branding');
  return { ...emptyBranding(), ...(body as { branding: ScheduleBranding }).branding };
}

const MAX_W = 800;
const MAX_H = 320;

/**
 * Read an image file and shrink it to at most 800×320 (aspect kept), trimming
 * transparent/white margins so the logo sits tight in the header. PNG keeps
 * transparency; returns the data URL and its pixel size.
 */
export function resizeLogo(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) {
      reject(new Error('Choose a PNG, JPG, WebP, GIF or SVG image'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      try {
        const sw = img.naturalWidth || 400;
        const sh = img.naturalHeight || 160;
        const src = document.createElement('canvas');
        src.width = sw;
        src.height = sh;
        const sctx = src.getContext('2d');
        if (!sctx) throw new Error('No canvas context');
        sctx.drawImage(img, 0, 0, sw, sh);
        const crop = contentBox(sctx, sw, sh);
        const scale = Math.min(1, MAX_W / crop.w, MAX_H / crop.h);
        const w = Math.max(1, Math.round(crop.w * scale));
        const h = Math.max(1, Math.round(crop.h * scale));
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const octx = out.getContext('2d');
        if (!octx) throw new Error('No canvas context');
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
        resolve({ dataUrl: out.toDataURL('image/png'), width: w, height: h });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not read the image'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the image')); };
    img.src = url;
  });
}

/** Bounding box of pixels that aren't transparent or near-white. */
function contentBox(ctx: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const blank = data[i + 3] < 16 || (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245);
      if (!blank) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(w, maxX + pad + 1) - x, h: Math.min(h, maxY + pad + 1) - y };
}
