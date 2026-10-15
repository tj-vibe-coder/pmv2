import { detectCropFromServer } from './receiptParseService';
import { compressForUpload, blobToBase64 } from '../utils/receipts/imageCompress';
import { detectReceiptQuad } from '../utils/receipts/autoCrop';
import { FULL_PHOTO_QUAD, isUsableCropQuad } from '../utils/receipts/cropGeometry';
import type { Quad } from '../utils/receipts/perspectiveCrop';

/** Suggest only: callers keep the original photo until the employee confirms. */
export async function suggestReceiptCrop(photo: Blob): Promise<Quad> {
  if (!photo.type.startsWith('image/')) return FULL_PHOTO_QUAD;
  try {
    const preview = await compressForUpload(photo, 1280, 0.8);
    const suggested = await detectCropFromServer(await blobToBase64(preview), preview.type || photo.type);
    if (isUsableCropQuad(suggested)) return suggested;
  } catch { /* Offline, quota, timeout or unavailable model: local detection still works. */ }
  try {
    const local = await detectReceiptQuad(photo);
    if (isUsableCropQuad(local)) return local;
  } catch { /* A failed detection must never force an arbitrary central crop. */ }
  return FULL_PHOTO_QUAD;
}
