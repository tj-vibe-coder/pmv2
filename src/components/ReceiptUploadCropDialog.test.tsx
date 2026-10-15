import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReceiptUploadCropDialog from './ReceiptUploadCropDialog';
import { suggestReceiptCrop } from '../services/receiptCropService';
import { convertHeicToJpeg } from '../utils/receipts/imageUtils';
import { perspectiveCropToBlob, type Quad } from '../utils/receipts/perspectiveCrop';
jest.mock('../services/receiptCropService', () => ({ suggestReceiptCrop: jest.fn() }));
jest.mock('../utils/receipts/imageUtils', () => ({ convertHeicToJpeg: jest.fn() }));
jest.mock('../utils/receipts/perspectiveCrop', () => ({ perspectiveCropToBlob: jest.fn() }));
jest.mock('./ReceiptCropper', () => (props: { busy: boolean; initialQuad: Quad; onConfirm: (quad: Quad) => void }) => <>
  <button disabled={props.busy} onClick={() => props.onConfirm(props.initialQuad)}>Accept suggested crop</button>
  <button disabled={props.busy} onClick={() => props.onConfirm([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])}>Attach full photo</button>
</>);
const file = new File(['original'], 'receipt.png', { type: 'image/png' });
const quad: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
beforeEach(() => {
  (convertHeicToJpeg as jest.Mock).mockImplementation(async file => file);
  (suggestReceiptCrop as jest.Mock).mockResolvedValue(quad);
  (perspectiveCropToBlob as jest.Mock).mockResolvedValue(new Blob(['cropped'], { type: 'image/jpeg' }));
  URL.createObjectURL = jest.fn(() => 'blob:photo'); URL.revokeObjectURL = jest.fn();
});
test('row photo stays unuploaded until accepted, then attaches cropped JPEG', async () => {
  const attach = jest.fn().mockResolvedValue(undefined);
  render(<ReceiptUploadCropDialog file={file} onAttach={attach} onSkip={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Accept suggested crop')).toBeEnabled());
  expect(attach).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Accept suggested crop'));
  await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
  expect(perspectiveCropToBlob).toHaveBeenCalledWith(file, quad);
  expect(attach.mock.calls[0][0]).toMatchObject({ name: 'receipt.jpg', type: 'image/jpeg', size: 7 });
});
test('full photo preserves the selected original, with no crop or upload on cancel', async () => {
  const attach = jest.fn().mockResolvedValue(undefined); const cancel = jest.fn();
  render(<ReceiptUploadCropDialog file={file} onAttach={attach} onSkip={jest.fn()} onCancel={cancel} />);
  await waitFor(() => expect(screen.getByText('Attach full photo')).toBeEnabled());
  fireEvent.click(screen.getByText('Cancel remaining')); expect(cancel).toHaveBeenCalledTimes(1); expect(attach).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Attach full photo'));
  await waitFor(() => expect(attach).toHaveBeenCalledWith(file)); expect(perspectiveCropToBlob).not.toHaveBeenCalled();
});
