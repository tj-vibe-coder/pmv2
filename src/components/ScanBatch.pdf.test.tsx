import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ScanBatch from './ScanBatch';
import { parseReceipt, detectCropFromServer } from '../services/receiptParseService';
import { convertHeicToJpeg } from '../utils/receipts/imageUtils';
import { blobToBase64, compressForUpload } from '../utils/receipts/imageCompress';
import { checkDuplicates, computeImageHash, findLocalDuplicates } from '../services/receiptDuplicateService';
import { perspectiveCropToBlob } from '../utils/receipts/perspectiveCrop';

jest.mock('../services/receiptParseService', () => ({
  parseReceipt: jest.fn(),
  detectCropFromServer: jest.fn().mockResolvedValue([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]),
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

jest.mock('./ReceiptCropper', () => (props: { busy: boolean; initialQuad: []; onConfirm: (quad: []) => void }) => (
  <button disabled={props.busy} onClick={() => props.onConfirm(props.initialQuad)}>Confirm receipt cropper</button>
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
    (compressForUpload as jest.Mock).mockImplementation(async blob => blob);
    (detectCropFromServer as jest.Mock).mockResolvedValue([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]);
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
    render(
      <ScanBatch
        mode="overhead"
        selectedProject={null}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        categories={['Others']}
      />,
    );

    const input = screen.getByLabelText('Receipt files');
    const pdf = new File(['single-page receipt'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });

    await waitFor(() => expect(parseReceiptMock).toHaveBeenCalledWith(expect.any(String), 'application/pdf'));
    expect(screen.queryByText('Confirm receipt cropper')).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('PDF Store')).toBeInTheDocument();
  });

  test('crops only images in a mixed PDF-image-PDF batch and parses every file in order', async () => {
    render(
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
    fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files } });

    await waitFor(() => expect(screen.getByText('Confirm receipt cropper')).toBeEnabled());
    expect(detectCropFromServer).toHaveBeenCalledTimes(1);
    expect(perspectiveCropToBlobMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm receipt cropper'));
    await waitFor(() => expect(parseReceiptMock).toHaveBeenCalledTimes(3));
    expect(parseReceiptMock.mock.calls.map(([, mimeType]) => mimeType)).toEqual([
      'application/pdf',
      'image/jpeg',
      'application/pdf',
    ]);
    expect(perspectiveCropToBlobMock).toHaveBeenCalledTimes(1);
    expect(perspectiveCropToBlobMock).toHaveBeenCalledWith(files[1], [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]);
  });

  test('keeps skipped-file feedback visible after valid PDFs reach review', async () => {
    render(
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
    fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files } });

    expect(await screen.findByText(/1 file was skipped/i)).toBeInTheDocument();
    expect(parseReceiptMock).toHaveBeenCalledTimes(1);
  });

  test('phone batch uses readable liquidation filename consistently in upload and desktop receipt link', async () => {
    const previousFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: 'receipt-item', webUrl: 'https://example.com/receipt' }) });
    global.fetch = fetchMock;
    try {
      render(<ScanBatch mode="overhead" selectedProject={null} deliverToDesktop pairingToken="fixture-job"
        scanContext={{ kind: 'liquidation', formNo: 'LQ26-022-RJR', folderPath: 'fixture/liquidation' }}
        onCancel={jest.fn()} onComplete={jest.fn()} categories={['Others']} />);
      fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files: [new File(['pdf'], 'camera.pdf.pdf', { type: 'application/pdf' })] } });
      await screen.findByDisplayValue('PDF Store');
      fireEvent.click(screen.getByRole('button', { name: 'Save All (1)' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const uploaded = JSON.parse(fetchMock.mock.calls[0][1].body);
      const delivered = JSON.parse(fetchMock.mock.calls[1][1].body).receipt;
      expect(uploaded.filename).toMatch(/^LQ26-022-RJR_2026-08-14_PDF receipt_.+\.pdf$/);
      expect(delivered.filename).toBe(uploaded.filename);
      expect(delivered.oneDriveId).toBe('receipt-item');
      expect(delivered.parsed.particulars).toBe('PDF receipt');
    } finally { global.fetch = previousFetch; }
  });

});
