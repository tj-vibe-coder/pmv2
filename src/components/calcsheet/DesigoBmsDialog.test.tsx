import { fireEvent, render, screen } from '@testing-library/react';
import DesigoBmsDialog from './DesigoBmsDialog';
import { usePricelistStore } from '../../store/pricelistStore';
import { usePanelIoStore } from '../../store/panelIoStore';

beforeEach(() => { usePricelistStore.setState({ items: [], loading: false }); });

type Section = { header: string; rows: Array<{ partNo: string; description: string; qty: number; brand: string }> };

it('configures a Desigo BMS and adds it under BMS, BMS software, terminals and wires headers', () => {
  const onSubmit = jest.fn();
  render(<DesigoBmsDialog open onClose={() => {}} productContingencyPct={0} onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText(/^DI/), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const sections = onSubmit.mock.calls[0][0] as Section[];
  expect(sections.map((g) => g.header)).toEqual(['BMS — SIEMENS DESIGO PXC', 'BMS SOFTWARE — DESIGO CC']);
  expect(usePanelIoStore.getState().io).toMatchObject({ source: 'Siemens Desigo', di: 110 });
  const bms = Object.fromEntries(sections[0].rows.map((r) => [r.partNo, r]));
  // 100 DI + 10% spare = 110 points → more than a PXC7.E400S (100) → PXC7.E400M; 110 / 16 → 7 × TXM1.16D
  expect(bms['S55375-C110']).toMatchObject({ qty: 1, brand: 'Siemens', description: 'Building automation controller, BACnet/IP, modular I/O up to 200 points' });
  expect(bms['BPZ:TXM1.16D']).toMatchObject({ qty: 7, description: 'I/O module, 16 digital inputs' });
  sections.flatMap((g) => g.rows).forEach((r) => expect(r.description).not.toMatch(/Desigo|PXC|TXM|WAGO/));
});
