import { fireEvent, render, screen } from '@testing-library/react';
import ReceiptCropper from './ReceiptCropper';
import { FULL_PHOTO_QUAD } from '../utils/receipts/cropGeometry';
import type { Quad } from '../utils/receipts/perspectiveCrop';
const suggested: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
test('suggestion waits for confirmation; employee can retain the entire photo', () => {
  const confirm = jest.fn(); render(<ReceiptCropper imageUrl="blob:photo" initialQuad={suggested} onConfirm={confirm} onRetake={jest.fn()} />);
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Full photo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use photo' }));
  expect(confirm).toHaveBeenCalledWith(FULL_PHOTO_QUAD);
});
test('new image suggestion resets previous full-photo selection; busy blocks confirmation', () => {
  const confirm = jest.fn(); const view = render(<ReceiptCropper imageUrl="blob:photo" initialQuad={suggested} onConfirm={confirm} onRetake={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Full photo' }));
  const next = suggested.map(p => ({ ...p })) as Quad;
  view.rerender(<ReceiptCropper imageUrl="blob:next" initialQuad={next} busy onConfirm={confirm} onRetake={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Full photo' })).toBeDisabled();
  view.rerender(<ReceiptCropper imageUrl="blob:next" initialQuad={next} onConfirm={confirm} onRetake={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use photo' })); expect(confirm).toHaveBeenCalledWith(suggested);
});
