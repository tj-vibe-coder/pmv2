/**
 * Load an image and make dark/black background pixels transparent.
 * Uses a threshold: pixels with r,g,b all below threshold get alpha = 0.
 */
export const loadLogoTransparentBackground = (
  url: string,
  darkThreshold: number = 40
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r <= darkThreshold && g <= darkThreshold && b <= darkThreshold) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

/** Default ACT logo size in PDF (mm) */
export const ACT_LOGO_PDF_WIDTH = 18;
export const ACT_LOGO_PDF_HEIGHT = 15;

/** Default IOCT logo size in PDF (mm). Image is 1024×381 — preserve aspect ratio (width 18mm → height ~6.7mm). */
export const IOCT_LOGO_PDF_WIDTH = 18;
export const IOCT_LOGO_PDF_HEIGHT = 6.7;
