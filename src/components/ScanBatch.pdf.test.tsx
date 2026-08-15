import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ScanBatch from './ScanBatch';
import { parseReceipt } from '../services/receiptParseService';
import { convertHeicToJpeg } from '../utils/receipts/imageUtils';
import { blobToBase64 } from '../utils/receipts/imageCompress';
import { checkDuplicates, computeImageHash, findLocalDuplicates } from '../services/receiptDuplicateService';
import { perspectiveCropToBlob } from '../utils/receipts/perspectiveCrop';

jest.mock('../services/receiptParseService', () => ({
  parseReceipt: jest.fn(),
}));

jest.mock('../services/receiptDuplicateService', () => ({
  checkDuplicates: jest.fn().mockResolvedValue(new Map()),
  computeImageHash: jest.fn().mockResolvedValue('pdf-hash'),
  describeMatch: jest.fn(),
  findLocalDuplicates: jest.fn().mockReturnValue([]),
}));

jest.mock('../utils/receipts/imageUtils', () => ({
  convertHeicToJpeg: jest.fn(async (file: File) => file),
  makeThumb: jest.fn().mockResolvedValue(''),
}));

jest.mock('../utils/receipts/imageCompress', () => ({
  blobToBase64: jest.fn().mockResolvedValue('cGRm'),
  compressForUpload: jest.fn(async (file: File) => file),
}));

jest.mock('../utils/receipts/autoCrop', () => ({
  detectReceiptQuad: jest.fn().mockResolvedValue(null),
}));

jest.mock('../utils/receipts/perspectiveCrop', () => ({
  perspectiveCropToBlob: jest.fn(),
}));

jest.mock('./ReceiptCropper', () => (props: { onConfirm: (quad: []) => void }) => (
  <button onClick={() => props.onConfirm([])}>Confirm receipt cropper</button>
));
jest.mock('./LiveCameraCapture', () => () => <div>Camera</div>);

const parseReceiptMock = parseReceipt as jest.MockedFunction<typeof parseReceipt>;
const convertHeicToJpegMock = convertHeicToJpeg as jest.MockedFunction<typeof convertHeicToJpeg>;
const blobToBase64Mock = blobToBase64 as jest.MockedFunction<typeof blobToBase64>;
const checkDuplicatesMock = checkDuplicates as jest.MockedFunction<typeof checkDuplicates>;
const computeImageHashMock = computeImageHash as jest.MockedFunction<typeof computeImageHash>;
const findLocalDuplicatesMock = findLocalDuplicates as jest.MockedFunction<typeof findLocalDuplicates>;
const perspectiveCropToBlobMock = perspectiveCropToBlob as jest.MockedFunction<typeof perspectiveCropToBlob>;

describe('ScanBatch PDF selection', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (URL.createObjectURL as jest.Mock).mockReturnValue('blob:test');
    (URL.revokeObjectURL as jest.Mock).mockImplementation(() => undefined);
    convertHeicToJpegMock.mockImplementation(async (file) => file);
    blobToBase64Mock.mockResolvedValue('cGRm');
    checkDuplicatesMock.mockResolvedValue(new Map());
    computeImageHashMock.mockResolvedValue('pdf-hash');
    findLocalDuplicatesMock.mockReturnValue([]);
    perspectiveCropToBlobMock.mockResolvedValue(new Blob(['cropped image'], { type: 'image/jpeg' }));
    parseReceiptMock.mockResolvedValue({
      vendor: 'PDF Store',
      date: '2026-08-14',
      total: 125.5,
      subtotal: 125.5,
      tax: null,
      invoiceNumber: 'PDF-1',
      invoiceType: null,
      currency: 'PHP',
      vatable: null,
      paymentMethod: null,
      customerName: null,
      customerTin: null,
      customerAddress: null,
      lineItems: [],
      suggestedCategory: 'Others',
      confidence: 0.9,
      description: 'PDF receipt',
      deductible: null,
      deductibleReason: null,
      customerValidation: { nameOk: true, tinOk: true, addressOk: true, issues: [] },
    });
  });

  test('parses a selected PDF directly without opening the image cropper', async () => {
    const { container } = render(
      <ScanBatch
        mode="overhead"
        selectedProject={null}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        categories={['Others']}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(['single-page receipt'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });

    await waitFor(() => expect(parseReceiptMock).toHaveBeenCalledWith(expect.any(String), 'application/pdf'));
    expect(screen.queryByText('Confirm receipt cropper')).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('PDF Store')).toBeInTheDocument();
  });

  test('crops only images in a mixed PDF-image-PDF batch and parses every file in order', async () => {
    const { container } = render(
      <ScanBatch
        mode="overhead"
        selectedProject={null}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        categories={['Others']}
      />,
    );

    const files = [
      new File(['pdf one'], 'one.pdf', { type: 'application/pdf' }),
      new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
      new File(['pdf two'], 'two.pdf', { type: 'application/pdf' }),
    ];
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });

    fireEvent.click(await screen.findByText('Confirm receipt cropper'));
    await waitFor(() => expect(parseReceiptMock).toHaveBeenCalledTimes(3));
    expect(parseReceiptMock.mock.calls.map(([, mimeType]) => mimeType)).toEqual([
      'application/pdf',
      'image/jpeg',
      'application/pdf',
    ]);
    expect(perspectiveCropToBlobMock).toHaveBeenCalledTimes(1);
  });

  test('keeps skipped-file feedback visible after valid PDFs reach review', async () => {
    const { container } = render(
      <ScanBatch
        mode="overhead"
        selectedProject={null}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        categories={['Others']}
      />,
    );

    const files = [
      new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' }),
      new File(['text'], 'notes.txt', { type: 'text/plain' }),
    ];
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });

    expect(await screen.findByText(/1 file was skipped/i)).toBeInTheDocument();
    expect(parseReceiptMock).toHaveBeenCalledTimes(1);
  });
});
