export async function compressForUpload(input: Blob, maxEdge = 1600, quality = 0.7): Promise<Blob> {
  // Pass non-images (e.g. PDFs) through as-is.
  if (!input.type.startsWith('image/')) return input;
  try {
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob || input), 'image/jpeg', quality);
    });
  } catch {
    // createImageBitmap can fail (e.g. native HEIC). Fall back to the original.
    return input;
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function fileToParseInput(file: File): Promise<{ imageBase64: string; mimeType: string }> {
  const blob = file.type.startsWith('image/') ? await compressForUpload(file) : file;
  const imageBase64 = await blobToBase64(blob);
  return { imageBase64, mimeType: blob.type || file.type };
}
