import { fireEvent, render, screen } from '@testing-library/react';
import PanelLayoutEditor from './PanelLayoutEditor';
import { ENCLOSURES, layoutPanel, type LayoutGroup, type PanelLayout } from '../../utils/calcsheet/panelLayout';

const relays: LayoutGroup = { tag: 'K', label: 'Interposing relays (DO)', unitW: 6, unitH: 94, count: 20, splittable: true, zone: 'relays', kind: 'relay' };
const layout = () => layoutPanel([relays], ENCLOSURES.find((e) => e.key === 'tekpan800')!, 1);

it('selects a run, splits it, undoes, adds a rail row and hands the edited layout back', () => {
  const onDone = jest.fn();
  render(<PanelLayoutEditor open layout={layout()} autoLayout={layout()} onCancel={() => {}} onDone={onDone} />);
  fireEvent.pointerDown(screen.getByTestId('item-K-0-0-0'));
  expect(screen.getByText('Interposing relays (DO) × 20')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Split after'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: /Split run/ }));
  expect(screen.getByTestId('item-K-0-0-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
  expect(screen.queryByTestId('item-K-0-0-1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Rail row/ }));
  expect(screen.getByText('empty rail row')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  const out = onDone.mock.calls[0][0] as PanelLayout;
  expect(out.rowCount).toBe(2);
  expect(out.bays[0].rows[0].items[0].count).toBe(20);
});

it('Reset to auto hands back null (= use the auto layout)', () => {
  const onDone = jest.fn();
  render(<PanelLayoutEditor open layout={layout()} autoLayout={layout()} onCancel={() => {}} onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: /Rail row/ }));
  fireEvent.click(screen.getByRole('button', { name: /Reset to auto layout/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onDone).toHaveBeenCalledWith(null);
});
