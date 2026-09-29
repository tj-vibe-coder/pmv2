import { fireEvent, render, screen } from '@testing-library/react';
import SiemensPlcDialog from './SiemensPlcDialog';
import { usePricelistStore } from '../../store/pricelistStore';
import { usePanelIoStore } from '../../store/panelIoStore';

beforeEach(() => { usePricelistStore.setState({ items: [], loading: false }); });

type Section = { header: string; rows: Array<{ partNo: string; description: string; qty: number; unitCost: number; brand: string; uom: string }> };
const submitted = (fn: jest.Mock) => fn.mock.calls[0][0] as Section[];

it('configures an S7-1500 with Modbus RTU and adds the priced modules under a PLC header', () => {
  const onSubmit = jest.fn();
  render(<SiemensPlcDialog open onClose={() => {}} productContingencyPct={5} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /S7-1500/ }));
  fireEvent.change(screen.getByLabelText(/^DI/), { target: { value: '40' } });   // +10% → 44 → 3 × DI16
  fireEvent.change(screen.getByLabelText('AI 4–20 mA 2-wire'), { target: { value: '6' } });    // +10% → 7 → 1 × AI8
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /modbus/i }));
  fireEvent.click(screen.getByRole('option', { name: /Modbus RTU/ }));
  fireEvent.change(screen.getByLabelText(/RS-485 ports/i), { target: { value: '2' } });
  // PSU is picked by hand from the load estimate.
  expect(screen.getByText(/No power supply selected/)).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /power supply/i }));
  fireEvent.click(screen.getByRole('option', { name: /PSU100S 20 A/ }));
  expect(screen.getByText(/20 A covers/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const sections = submitted(onSubmit);
  // Terminals + wiring are added by the Control Panel dialog, which gets this I/O.
  expect(sections.map((g) => g.header)).toEqual(['PLC — SIEMENS S7-1500']);
  expect(usePanelIoStore.getState().io).toMatchObject({ source: 'Siemens S7-1500', di: 44, a2: 7 });
  // Heat for the Control Panel's fans: CPU + IM + modules at 24 V (field loads excluded)
  expect(usePanelIoStore.getState().io?.electronicsW).toBeGreaterThan(20);
  expect(usePanelIoStore.getState().io?.load24A).toBeGreaterThan(0);
  const rows = sections[0].rows;
  const byPart = Object.fromEntries(rows.map((r) => [r.partNo, r]));
  expect(byPart['6ES7513-1AM03-0AB0']).toMatchObject({ qty: 1, unitCost: 124083.35, brand: 'Siemens' });
  expect(byPart['6ES7954-8LL04-0AA0']).toMatchObject({ qty: 1 });             // memory card, required
  expect(byPart['6ES7131-6BH01-0BA0']).toMatchObject({ qty: 3, unitCost: 6218.99 });
  expect(byPart['6ES7134-6GF00-0AA1']).toMatchObject({ qty: 1 });
  expect(byPart['6ES7137-6AA01-0BA0']).toMatchObject({ qty: 2 });             // CM PtP per RS-485 port
  expect(byPart['6ES7155-6AA02-0BN0']).toMatchObject({ qty: 1 });             // one ET 200SP station
  expect(byPart['6ES7193-6BP00-0DA0']).toMatchObject({ qty: 1, unitCost: 1600 }); // light BU
  expect(byPart['6ES7193-6BP00-0BA0']).toMatchObject({ qty: 5 });             // 6 modules − 1
  expect(byPart['6EP1336-2BA10']).toMatchObject({ qty: 1 });
  expect(byPart['6ES7241-1CH30-1XB0']).toBeUndefined();                       // no CB 1241 on S7-1500
});

it('adds another CPU model, an HMI by size and a WinCC license — unpriced ones for inquiry', () => {
  const onSubmit = jest.fn();
  render(<SiemensPlcDialog open onClose={() => {}} productContingencyPct={0} onSubmit={onSubmit} />);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /^CPU/ }));
  fireEvent.click(screen.getByRole('option', { name: /1212C DC\/DC\/DC/ }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /HMI panel/i }));
  fireEvent.click(screen.getByRole('option', { name: /Unified Comfort/ }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /HMI size/i }));
  fireEvent.click(screen.getByRole('option', { name: /12" — MTP1200/ }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /SCADA license/i }));
  fireEvent.click(screen.getByRole('option', { name: /WinCC V8\.1/ }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Edition/i }));
  fireEvent.click(screen.getByRole('option', { name: /Asia edition/ }));
  expect(screen.getAllByText('For inquiry').length).toBe(3);                  // CPU, HMI, WinCC

  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const [{ rows }] = submitted(onSubmit);
  expect(rows.find((r) => r.partNo === '6ES7212-1AE40-0XB0')).toMatchObject({ qty: 1, unitCost: 0 });
  expect(rows.find((r) => r.partNo === '6AV2128-3MB06-0AX1')).toMatchObject({ qty: 1, unitCost: 0 });
  // Brand-neutral description on the quotation; the exact item is in the part number.
  expect(rows.find((r) => r.partNo === '6AV6381-2BP08-1AV0')).toMatchObject({ qty: 1, uom: 'lic', description: 'SCADA runtime & configuration license, 2048 tags' });
  expect(rows.find((r) => r.partNo === '6ES7212-1AE40-0XB0')?.description).toBe('PLC CPU, compact, PROFINET, on-board 8 DI / 6 DO / 2 AI, 24 V DC powered');
  rows.forEach((r) => expect(r.description).not.toMatch(/SIMATIC|Siemens|SITOP|WinCC|SCALANCE|WAGO|ET 200/i));
});

it('redundancy switches to an S7-1500R pair with HF interface modules and managed switches', () => {
  const onSubmit = jest.fn();
  render(<SiemensPlcDialog open onClose={() => {}} productContingencyPct={0} onSubmit={onSubmit} />);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /redundancy/i }));
  fireEvent.click(screen.getByRole('option', { name: /S7-1500R/ }));
  fireEvent.change(screen.getByLabelText(/^DI/), { target: { value: '16' } });
  fireEvent.click(screen.getByRole('button', { name: /to components/i }));
  const sections = submitted(onSubmit);
  // PLC hardware, the WAGO terminal strip and the wires each go under their own header
  expect(sections.map((g) => g.header)).toEqual(['PLC — SIEMENS S7-1500R']);
  const [plc] = sections.map((g) => Object.fromEntries(g.rows.map((r) => [r.partNo || r.description, r])));
  expect(plc['6ES7513-1RM03-0AB0']).toMatchObject({ qty: 2 });
  expect(plc['6ES7155-6AU30-0CN0']).toMatchObject({ qty: 1 });
  expect(plc['6GK5208-0BA00-2AC2']).toMatchObject({ qty: 2 });
  expect(usePanelIoStore.getState().io).toMatchObject({ source: 'Siemens S7-1500R', di: 18 });
});
