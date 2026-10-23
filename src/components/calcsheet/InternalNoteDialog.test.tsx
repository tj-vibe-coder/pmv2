import { fireEvent, render, screen } from '@testing-library/react';
import InternalNoteDialog, { InternalNoteButton } from './InternalNoteDialog';
import InternalTextWarning from './InternalTextWarning';
import { findInternalLookingText } from '../../utils/calcsheet/internalText';
import type { ComponentLine } from '../../types/Quotation';

describe('InternalNoteButton', () => {
  it('offers to add a note when the line has none, and to edit when it has one', () => {
    const { rerender } = render(<InternalNoteButton lineLabel="Breaker" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add internal note for Breaker' })).toBeInTheDocument();
    rerender(<InternalNoteButton lineLabel="Breaker" note="budgetary" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Edit internal note for Breaker' })).toBeInTheDocument();
  });

  it('on a locked quotation shows only existing notes, read-only', () => {
    const { container, rerender } = render(<InternalNoteButton lineLabel="Breaker" disabled onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement(); // nothing to add, nothing to read
    rerender(<InternalNoteButton lineLabel="Breaker" note="budgetary" disabled onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'View internal note for Breaker' })).toBeInTheDocument();
  });

  it('calls onClick', () => {
    const onClick = jest.fn();
    render(<InternalNoteButton lineLabel="Breaker" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('InternalNoteDialog', () => {
  const setup = (props: Partial<React.ComponentProps<typeof InternalNoteDialog>> = {}) => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<InternalNoteDialog open lineLabel="Circuit breaker" onSave={onSave} onClose={onClose} {...props} />);
    return { onSave, onClose };
  };

  it('tells the user it is never printed', () => {
    setup();
    expect(screen.getByText(/never printed/i)).toBeInTheDocument();
    expect(screen.getByText('Circuit breaker')).toBeInTheDocument();
  });

  it('saves what was typed', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Internal note'), { target: { value: 'Budgetary — for supplier quote' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('Budgetary — for supplier quote');
  });

  it('opens with the saved note and can clear it', () => {
    const { onSave } = setup({ note: 'Pricelist: IOCT Electrical 2026' });
    expect(screen.getByLabelText('Internal note')).toHaveValue('Pricelist: IOCT Electrical 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Clear note' }));
    expect(onSave).toHaveBeenCalledWith('');
  });

  it('does not offer Clear when there is no note yet', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Clear note' })).not.toBeInTheDocument();
  });

  it('Cancel closes without saving', () => {
    const { onSave, onClose } = setup();
    fireEvent.change(screen.getByLabelText('Internal note'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is read-only on a locked quotation: no Save, no Clear, field disabled', () => {
    setup({ note: 'locked note', readOnly: true });
    expect(screen.getByLabelText('Internal note')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear note' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('InternalTextWarning', () => {
  const comp = (p: Partial<ComponentLine>): ComponentLine => ({
    id: 'c', code: 'B1', description: 'x', qty: 1, uom: 'pc', unitCost: 1, forex: 1, contingencyPct: 0, discountPct: 0, ...p,
  });

  it('renders nothing when there is nothing to warn about', () => {
    const { container } = render(<InternalTextWarning findings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the flagged lines, pointing at the internal note', () => {
    const findings = findInternalLookingText({
      generalReqts: [], services: [],
      components: [comp({ code: 'B3', description: 'Breaker (budgetary) [Not in pricelist]' })],
    });
    render(<InternalTextWarning findings={findings} />);
    expect(screen.getByText(/Possible internal text in 1 printed field/)).toBeInTheDocument();
    expect(screen.getByText(/internal note/i)).toBeInTheDocument();
    expect(screen.getByText('B3')).toBeInTheDocument();
    expect(screen.getByText(/\[Not in pricelist\]/, { selector: 'em' })).toBeInTheDocument();
  });

  it('caps the list and says how many more there are', () => {
    const components = Array.from({ length: 11 }, (_, i) => comp({ id: `c${i}`, code: `B${i}`, description: `Item ${i} [tag]` }));
    render(<InternalTextWarning findings={findInternalLookingText({ generalReqts: [], services: [], components })} />);
    expect(screen.getByText(/Possible internal text in 11 printed fields/)).toBeInTheDocument();
    expect(screen.getByText(/and 3 more/)).toBeInTheDocument();
  });
});
