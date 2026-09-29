import { fireEvent, render, screen, within } from '@testing-library/react';
import InstallationWorkDialog from './InstallationWorkDialog';
import { usePricelistStore } from '../../store/pricelistStore';
import { useQuotationStore } from '../../store/quotationStore';
import { supportsNeeded } from '../../utils/calcsheet/installationMaterials';
import type { PricelistItem } from '../../types/Pricelist';

const item = (catalogNo: string, description: string, sellingPrice: number, brand: string): PricelistItem => ({
  id: `mat_${catalogNo}`, supplier: '', brand, pricelistName: 'IOCT Electrical Materials 2026', pricelistDate: '2026-01',
  category: 'Accessories', categoryLabel: 'Accessories', catalogNo, abbRefNo: '', description, sellingPrice,
});

beforeEach(() => {
  usePricelistStore.setState({
    items: [
      item('IMC-0.5', 'IMC Pipe 1/2"', 392.5, 'Panasonic'),
      item('JBOX-4X4', 'Junction Box 4x4 Metal', 66.54, 'Quapcor'),
      item('CADDY-0.5', 'Unistrut Caddy Clamp - 1/2"', 16.5, 'Mcgill'),
      item('LQT-0.5', 'LQT 1/2"', 71.43, 'Panasonic'),
      item('LQTCON-0.5', 'LQT Straight Connector - 1/2"', 31.25, 'Mcgill'),
    ],
    loading: false,
  });
  useQuotationStore.setState({ installMaterialPrices: {} });
});

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

it('computes the conduit accessories from PEC and prices every material from the catalog', () => {
  const onSubmit = jest.fn();
  render(<InstallationWorkDialog open onClose={() => {}} productContingencyPct={5} onSubmit={onSubmit} />);

  fireEvent.change(field(/installation work name/i), { target: { value: 'Panel room to MCC-1' } });
  fireEvent.change(field(/total length/i), { target: { value: '30' } });

  // Not optional any more: accessories show their PEC figures straight away.
  const supports = supportsNeeded(30);
  expect(field(/caddy clamp \(pc\)/i).value).toBe(String(supports));
  expect(field(/lqt \(m\)/i).value).toBe('0.9');
  expect(field(/straight connector \(pc\)/i).value).toBe('2');
  expect(field(/u bolt \(pc\)/i).value).toBe('0');

  // An override sticks until cleared.
  fireEvent.change(field(/caddy clamp \(pc\)/i), { target: { value: '15' } });
  expect(field(/caddy clamp \(pc\)/i).value).toBe('15');
  fireEvent.change(field(/caddy clamp \(pc\)/i), { target: { value: '' } });
  expect(field(/caddy clamp \(pc\)/i).value).toBe(String(supports));

  fireEvent.click(screen.getByRole('button', { name: /add run/i }));

  const totals = screen.getAllByRole('table')[1];
  expect(within(totals).getByText('IMC Pipe 1/2"').closest('tr')).toHaveTextContent('Catalog · IMC-0.5 · Panasonic');
  expect(within(totals).getByText('Caddy Clamp 1/2"').closest('tr')).toHaveTextContent('Catalog · CADDY-0.5 · Mcgill');

  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const rows = onSubmit.mock.calls[0][0] as Array<{ description: string; qty: number; unitCost: number; brand: string; partNo: string }>;
  const byDesc = Object.fromEntries(rows.map((r) => [r.description, r]));
  expect(byDesc['IMC Pipe 1/2"']).toMatchObject({ qty: 10, unitCost: 392.5, brand: 'Panasonic', partNo: 'IMC-0.5' });
  expect(byDesc['Caddy Clamp 1/2"']).toMatchObject({ qty: supports, unitCost: 16.5, partNo: 'CADDY-0.5' });
  expect(byDesc['LQT 1/2"']).toMatchObject({ qty: 0.9, unitCost: 71.43 });
  expect(byDesc['Straight Connector 1/2"']).toMatchObject({ qty: 2, unitCost: 31.25 });
  expect(byDesc['Junction Box 4x4']).toMatchObject({ qty: 4, unitCost: 66.54 });
  expect(byDesc['IMC Coupling 1/2"']).toBeUndefined();                      // IMC lengths come with couplings
  expect(byDesc['Lock Nut with Bushing 1/2"']).toMatchObject({ qty: 8 });   // 2 box entries per segment
});

it('EMT runs use EMT pipe and EMT connectors', () => {
  const onSubmit = jest.fn();
  render(<InstallationWorkDialog open onClose={() => {}} productContingencyPct={0} onSubmit={onSubmit} />);
  fireEvent.change(field(/installation work name/i), { target: { value: 'Office lighting' } });
  fireEvent.change(field(/total length/i), { target: { value: '30' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /conduit type/i }));
  fireEvent.click(screen.getByRole('option', { name: /EMT — Electrical Metallic Tubing/i }));
  expect(field(/emt connector \(pc\)/i).value).toBe('8');
  fireEvent.click(screen.getByRole('button', { name: /add run/i }));
  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const descs = (onSubmit.mock.calls[0][0] as Array<{ description: string }>).map((r) => r.description);
  expect(descs).toEqual(expect.arrayContaining(['EMT Pipe 1/2"', 'EMT Coupling 1/2"', 'EMT Connector 1/2"']));
  expect(descs).not.toContain('IMC Pipe 1/2"');
});

it('switching to unistrut mounting swaps caddy clamps for U-bolts, channel and angle bar', () => {
  render(<InstallationWorkDialog open onClose={() => {}} productContingencyPct={0} onSubmit={() => {}} />);
  fireEvent.change(field(/total length/i), { target: { value: '30' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /mounting/i }));
  fireEvent.click(screen.getByRole('option', { name: /unistrut \+ u-bolt/i }));
  expect(field(/caddy clamp \(pc\)/i).value).toBe('0');
  expect(field(/u bolt \(pc\)/i).value).toBe(String(supportsNeeded(30)));
  expect(Number(field(/unistrut channel slotted \(pc\)/i).value)).toBeGreaterThan(0);
  expect(Number(field(/angle bar 1" \(pc\)/i).value)).toBeGreaterThan(0);
});
