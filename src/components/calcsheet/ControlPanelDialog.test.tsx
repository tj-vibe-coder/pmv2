import { act, fireEvent, render, screen } from '@testing-library/react';
import ControlPanelDialog from './ControlPanelDialog';
import { usePricelistStore } from '../../store/pricelistStore';
import { usePanelIoStore } from '../../store/panelIoStore';

beforeEach(() => { usePricelistStore.setState({ items: [], loading: false }); });

type Section = { header: string; rows: Array<{ partNo: string; description: string; qty: number; unitCost: number; brand: string; uom: string }> };

it('picks up the last PLC I/O and adds panel, terminals and wires under their own headers', () => {
  act(() => { usePanelIoStore.setState({ io: { source: 'Siemens S7-1500', di: 20, dq: 8, a2: 4, a4: 0, distPoints: 4, deviceRailMm: 200, psuA: 20, psuQty: 1 } }); });
  const onSubmit = jest.fn();
  render(<ControlPanelDialog open onClose={() => {}} productContingencyPct={0} onSubmit={onSubmit} />);
  expect(screen.getByText('I/O from Siemens S7-1500')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Enclosure/ }));
  fireEvent.click(screen.getByRole('option', { name: /Custom size/ }));
  fireEvent.change(screen.getByLabelText(/^Width/), { target: { value: '600' } });
  fireEvent.change(screen.getByLabelText(/^Height/), { target: { value: '800' } });
  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const sections = onSubmit.mock.calls[0][0] as Section[];
  expect(sections.map((g) => g.header)).toEqual(['CONTROL PANEL', 'TERMINAL BLOCKS & RELAYS', 'WIRES']);
  const [panel, terminals, wires] = sections.map((g) => g.rows);
  expect(panel.find((r) => /^Panel enclosure/.test(r.description))?.description).toMatch(/600 x 800 x 300 mm/);
  // Main auto-sized: PSU from the PLC config is 20 A → 24 × 20 / 0.88 / 230 ≈ 2.4 A + fan + light → C10
  expect(panel.find((r) => r.partNo === 'S202-C10')).toMatchObject({ qty: 1, brand: 'ABB', unitCost: 831.16, description: 'Miniature circuit breaker 2P, C-curve, 10 A' });
  expect(terminals.find((r) => r.partNo === '2002-2201')).toMatchObject({ qty: 20, brand: 'WAGO', description: 'Terminal block, 2-level, 2.5 mm²' });
  expect(wires.some((r) => /1\.5 mm², white/.test(r.description))).toBe(true);
  expect(wires.some((r) => /marker tube Ø2\.5/.test(r.description))).toBe(true);
  expect(wires.find((r) => /H05V-K 1x0\.5 mm² wire, red/.test(r.description))).toMatchObject({ unitCost: 9.14, uom: 'm', partNo: '8110041' });
});

it('opens on the smallest standard enclosure that fits and shows the drawings to scale', () => {
  act(() => { usePanelIoStore.setState({ io: { source: 'Siemens S7-1200', di: 16, dq: 8, a2: 4, a4: 0, distPoints: 4, deviceRailMm: 110, devices: [{ tag: 'A', label: 'CPU 1214C', widthMm: 110, heightMm: 100 }] } }); });
  const onSubmit = jest.fn();
  render(<ControlPanelDialog open onClose={() => {}} productContingencyPct={0} onSubmit={onSubmit} />);
  expect(screen.getByText(/Auto: Tibox wall-mount 800H × 600W × 300D/)).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'General arrangement' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Mounting plate — bay 1/ }));
  expect(screen.getByRole('img', { name: /MOUNTING PLATE — BAY 1/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const [panel] = (onSubmit.mock.calls[0][0] as Section[]).map((g) => g.rows);
  expect(panel.find((r) => /^Panel enclosure, wall-mounted/.test(r.description))).toMatchObject({ brand: 'Tibox', description: expect.stringMatching(/800H × 600W × 300D mm/) });
});
