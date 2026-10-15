import { suggestReceiptCrop } from './receiptCropService';
import { detectCropFromServer } from './receiptParseService';
import { detectReceiptQuad } from '../utils/receipts/autoCrop';
import { compressForUpload, blobToBase64 } from '../utils/receipts/imageCompress';
import { FULL_PHOTO_QUAD, isUsableCropQuad } from '../utils/receipts/cropGeometry';
import type { Quad } from '../utils/receipts/perspectiveCrop';
jest.mock('./receiptParseService', () => ({ detectCropFromServer: jest.fn() }));
jest.mock('../utils/receipts/autoCrop', () => ({ detectReceiptQuad: jest.fn() }));
jest.mock('../utils/receipts/imageCompress', () => ({ compressForUpload: jest.fn(async blob => blob), blobToBase64: jest.fn().mockResolvedValue('preview') }));
const ai = detectCropFromServer as jest.Mock; const local = detectReceiptQuad as jest.Mock;
const quad: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.85, y: 0.95 }, { x: 0.15, y: 0.9 }];
const photo = new Blob(['original'], { type: 'image/jpeg' });
beforeEach(() => { jest.clearAllMocks(); (compressForUpload as jest.Mock).mockImplementation(async blob => blob); (blobToBase64 as jest.Mock).mockResolvedValue('preview'); ai.mockResolvedValue(quad); local.mockResolvedValue(null); });
test('Gemini suggests corners using a smaller preview while retaining the original photo', async () => {
  expect(await suggestReceiptCrop(photo)).toEqual(quad);
  expect(compressForUpload).toHaveBeenCalledWith(photo, 1280, 0.8);
  expect(ai).toHaveBeenCalledWith('preview', 'image/jpeg');
  expect(local).not.toHaveBeenCalled(); expect(photo.size).toBe(8);
});
test.each([null, [], [{ x: 0, y: 0 }], [quad[0], quad[3], quad[2], quad[1]]])('invalid AI result falls back to local detection: %j', async value => {
  ai.mockResolvedValue(value); local.mockResolvedValue(quad);
  expect(await suggestReceiptCrop(photo)).toEqual(quad); expect(local).toHaveBeenCalledWith(photo);
});
test('unavailable API and failed local detection retain full photo', async () => {
  ai.mockRejectedValue(new Error('quota or offline')); local.mockRejectedValue(new Error('no bitmap'));
  expect(await suggestReceiptCrop(photo)).toEqual(FULL_PHOTO_QUAD);
});
test('PDFs bypass image analysis entirely', async () => {
  expect(await suggestReceiptCrop(new Blob(['pdf'], { type: 'application/pdf' }))).toEqual(FULL_PHOTO_QUAD);
  expect(blobToBase64).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled();
});
test('geometry rejects nonfinite, out-of-range, near-zero and nonconvex crops', () => {
  expect(isUsableCropQuad(FULL_PHOTO_QUAD)).toBe(true);
  for (const bad of [[{ x: NaN, y: 0 }, ...quad.slice(1)], [{ x: -0.1, y: 0 }, ...quad.slice(1)],
    [{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.01, y: 0.01 }, { x: 0, y: 0.01 }],
    [quad[0], quad[1], { x: 0.5, y: 0.3 }, quad[3]]]) expect(isUsableCropQuad(bad)).toBe(false);
});
