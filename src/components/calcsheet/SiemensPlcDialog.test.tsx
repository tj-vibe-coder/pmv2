import { fireEvent, render, screen } from '@testing-library/react';
import SiemensPlcDialog from './SiemensPlcDialog';
import { usePricelistStore } from '../../store/pricelistStore';

beforeEach(() => { usePricelistStore.setState({ items: [], loading: false }); });

it('configures an S7-1500 with Modbus RTU and adds the priced modules under a PLC header', () => {
  const onSubmit = jest.fn();
  render(<SiemensPlcDialog open onClose={() => {}} productContingencyPct={5} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /S7-1500/ }));
  fireEvent.change(screen.getByLabelText(/^DI/), { target: { value: '40' } });   // +20% → 48 → 3 × DI16
  fireEvent.change(screen.getByLabelText(/^AI/), { target: { value: '6' } });    // +20% → 8 → 1 × AI8
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /modbus/i }));
  fireEvent.click(screen.getByRole('option', { name: /Modbus RTU/ }));
  fireEvent.change(screen.getByLabelText(/RS-485 ports/i), { target: { value: '2' } });

  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const [rows, header] = onSubmit.mock.calls[0] as [Array<{ partNo: string; qty: number; unitCost: number; brand: string }>, string];
  expect(header).toBe('PLC — SIEMENS S7-1500');
  const byPart = Object.fromEntries(rows.map((r) => [r.partNo, r]));
  expect(byPart['6ES7513-1AM03-0AB0']).toMatchObject({ qty: 1, unitCost: 124083.35, brand: 'Siemens' });
  expect(byPart['6ES7954-8LL04-0AA0']).toMatchObject({ qty: 1 });             // memory card, required
  expect(byPart['6ES7131-6BH01-0BA0']).toMatchObject({ qty: 3, unitCost: 6218.99 });
  expect(byPart['6ES7134-6GF00-0AA1']).toMatchObject({ qty: 1 });
  expect(byPart['6ES7137-6AA01-0BA0']).toMatchObject({ qty: 2 });             // CM PtP per RS-485 port
  expect(byPart['6ES7155-6AA02-0BN0']).toMatchObject({ qty: 1 });             // one ET 200SP station
  expect(byPart['6ES7193-6BP00-0DA0']).toMatchObject({ qty: 1 });             // light BU
  expect(byPart['6ES7193-6BP00-0BA0']).toMatchObject({ qty: 5 });             // 6 modules − 1
  expect(byPart['6EP1336-2BA10']).toMatchObject({ qty: 1 });
  expect(byPart['6ES7241-1CH30-1XB0']).toBeUndefined();                       // no CB 1241 on S7-1500
});
