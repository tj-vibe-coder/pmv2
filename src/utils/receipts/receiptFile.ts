export const RECEIPT_FILE_ACCEPT = 'image/*,.pdf,application/pdf';
export const MAX_RECEIPT_PDF_BYTES = 15 * 1024 * 1024;

type ReceiptFileLike = Pick<File, 'name' | 'type' | 'size'>;

const imageExtensionPattern = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;
const supportedImageMimeTypes = new Set([
  'image/avif', 'image/bmp', 'image/gif', 'image/heic', 'image/heif',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
]);
const canTrustExtension = (type: string) => !type || type === 'application/octet-stream';

export function isPdfReceipt(file: Pick<File, 'name' | 'type'>): boolean {
  const type = file.type.toLowerCase();
  return type === 'application/pdf' || (canTrustExtension(type) && /\.pdf$/i.test(file.name));
}

export function isReceiptImage(file: Pick<File, 'name' | 'type'>): boolean {
  const type = file.type.toLowerCase();
  return supportedImageMimeTypes.has(type) || (canTrustExtension(type) && imageExtensionPattern.test(file.name));
}

export function validateReceiptFile(file: ReceiptFileLike): string | null {
  if (isPdfReceipt(file)) {
    if (file.size > MAX_RECEIPT_PDF_BYTES) {
      return 'PDF receipts must be 15 MB or smaller.';
    }
    return null;
  }
  if (isReceiptImage(file)) return null;
  return 'Receipt files must be images or PDF documents.';
}

export function isCroppableReceiptFile(file: Pick<File, 'name' | 'type'>): boolean {
  return isReceiptImage(file) && !isPdfReceipt(file);
}

export function getReceiptParseMimeType(file: Pick<File, 'name' | 'type'>): string {
  if (isPdfReceipt(file)) return 'application/pdf';
  return file.type.toLowerCase().startsWith('image/') ? file.type : 'image/jpeg';
}

export function makeReceiptUploadFilename(
  file: Pick<File, 'name' | 'type'>,
  timestamp = Date.now(),
  index?: number,
): string {
  const suffix = index === undefined ? '' : `-${index}`;
  const extension = isPdfReceipt(file) ? 'pdf' : 'jpg';
  return `SCAN-${timestamp}${suffix}.${extension}`;
}
