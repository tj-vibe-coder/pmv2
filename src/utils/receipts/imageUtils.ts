// iOS photos are frequently HEIC, which the canvas compressor can't decode and
// Gemini won't parse. Convert to JPEG first. Shared by ScanPage and ScanBatch.
export async function convertHeicToJpeg(file: File): Promise<File> {
  const name = file.name.toLowerCase();
  const isHeic = name.endsWith('.heic') || name.endsWith('.heif')
    || file.type === 'image/heic' || file.type === 'image/heif' || file.type === '';
  if (!isHeic) return file;
  try {
    const heic2any = (await import('heic2any')).default as (opts: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    return new File([blob], (file.name || 'receipt').replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Small canvas-downscaled JPEG data URL, used for review-list and delivery previews.
export async function makeThumb(blob: Blob | File): Promise<string> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 240;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')); };
      img.src = url;
    });
  } catch { return ''; }
}
