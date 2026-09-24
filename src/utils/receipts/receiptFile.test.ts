import {
  MAX_RECEIPT_PDF_BYTES,
  getReceiptParseMimeType,
  isCroppableReceiptFile,
  isPdfReceipt,
  makeReceiptUploadFilename,
  validateReceiptFile,
} from './receiptFile';

const makeFile = (name: string, type: string, size = 4) =>
  new File([new Uint8Array(size)], name, { type });

describe('receipt file policies', () => {
  test('detects PDFs by MIME type or extension', () => {
    expect(isPdfReceipt(makeFile('receipt.bin', 'application/pdf'))).toBe(true);
    expect(isPdfReceipt(makeFile('RECEIPT.PDF', ''))).toBe(true);
    expect(isPdfReceipt(makeFile('receipt.jpg', 'image/jpeg'))).toBe(false);
  });

  test('accepts receipt images and PDFs and rejects unsupported files', () => {
    expect(validateReceiptFile(makeFile('receipt.jpg', 'image/jpeg'))).toBeNull();
    expect(validateReceiptFile(makeFile('receipt.heic', 'image/heic'))).toBeNull();
    expect(validateReceiptFile(makeFile('receipt.pdf', 'application/pdf'))).toBeNull();
    expect(validateReceiptFile(makeFile('receipt.txt', 'text/plain'))).toMatch(/images or PDF/i);
    expect(validateReceiptFile(makeFile('receipt.pdf', 'text/plain'))).toMatch(/images or PDF/i);
    expect(validateReceiptFile(makeFile('receipt.svg', 'image/svg+xml'))).toMatch(/images or PDF/i);
  });

  test('rejects PDFs over the configured size limit', () => {
    const oversized = makeFile('receipt.pdf', 'application/pdf', MAX_RECEIPT_PDF_BYTES + 1);
    expect(validateReceiptFile(oversized)).toMatch(/15 MB/i);
    expect(validateReceiptFile(makeFile('receipt.pdf', 'application/pdf', MAX_RECEIPT_PDF_BYTES))).toBeNull();
  });

  test('uses native PDF parsing and only crops images', () => {
    const pdf = makeFile('receipt.pdf', 'application/pdf');
    const image = makeFile('receipt.jpg', 'image/jpeg');

    expect(getReceiptParseMimeType(pdf)).toBe('application/pdf');
    expect(getReceiptParseMimeType(image)).toBe('image/jpeg');
    expect(isCroppableReceiptFile(pdf)).toBe(false);
    expect(isCroppableReceiptFile(image)).toBe(true);
  });

  test('preserves PDF upload extensions and uses JPEG for image scans', () => {
    const pdf = makeFile('receipt.pdf', 'application/pdf');
    const image = makeFile('receipt.png', 'image/png');

    expect(makeReceiptUploadFilename(pdf, 1234)).toBe('SCAN-1234.pdf');
    expect(makeReceiptUploadFilename(pdf, 1234, 2)).toBe('SCAN-1234-2.pdf');
    expect(makeReceiptUploadFilename(image, 1234)).toBe('SCAN-1234.jpg');
  });
});
