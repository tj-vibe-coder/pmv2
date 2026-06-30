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
