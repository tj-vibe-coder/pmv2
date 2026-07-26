import { fireEvent, render, screen } from '@testing-library/react';
import ComponentTimingDialog from './ComponentTimingDialog';

it('shows the quotation date fallback and saves an override', () => {
  const onSave = jest.fn();
  render(
    <ComponentTimingDialog
      open
      quotationExpectedPurchaseDate="2026-04-01"
      value=""
      minimumDate="2026-01-01"
      onClose={jest.fn()}
      onSave={onSave}
    />,
  );

  expect(screen.getByText(/uses quotation date: 2026-04-01/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/product expected purchase date/i), {
    target: { value: '2026-06-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onSave).toHaveBeenCalledWith('2026-06-01');
});

it('rejects a date before the quotation date', () => {
  render(
    <ComponentTimingDialog
      open
      quotationExpectedPurchaseDate=""
      value=""
      minimumDate="2026-01-01"
      onClose={jest.fn()}
      onSave={jest.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText(/product expected purchase date/i), {
    target: { value: '2025-12-31' },
  });

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText(/cannot be before/i)).toBeInTheDocument();
});
