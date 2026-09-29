import { DEFAULT_DESIGO_INPUTS, DESIGO_PARTS, bestPacks, configureDesigo, noProtocols, type DesigoInputs, type DesigoProtocols } from './desigoBms';
import { noAnalog, type AnalogKey } from './siemensPlc';

const an = (p: Partial<Record<AnalogKey, number>>) => {
  const out = noAnalog();
  (Object.keys(p) as AnalogKey[]).forEach((k) => { out[k] = { w2: p[k] ?? 0, w4: 0 }; });
  return out;
};
const cfg = (p: Partial<DesigoInputs>) => configureDesigo({ ...DEFAULT_DESIGO_INPUTS, sparePct: 0, terminals: false, ...p });
const qty = (c: ReturnType<typeof configureDesigo>, key: string) => c.lines.find((l) => l.key === key)?.qty ?? 0;

describe('Desigo PXC automation stations', () => {
  it('small plant: a PXC4 uses its on-board I/O and one TX-I/O module', () => {
    // 10 DI + 4 × 0–10 V → 12 universal on board (4 AI + 8 DI), 2 DI left → 1 × TXM1.16D; 4 DO on the relays
    const c = cfg({ di: 10, do: 4, analog: an({ aiU: 4 }) });
    expect(c.controller?.model).toBe('PXC4.E16-2');
    expect(qty(c, 'pxc4')).toBe(1);
    expect(qty(c, 'txDi16')).toBe(1);
    expect(qty(c, 'txDo6')).toBe(0);
    expect(qty(c, 'txs12f10')).toBe(0);
    expect(qty(c, 'xfmr100')).toBe(1);
  });

  it('too much for a PXC4 / PXC5 → PXC7 by point count, with TX-I/O power modules', () => {
    const c = cfg({ di: 100 });
    expect(c.controller?.model).toBe('PXC7.E400S');
    expect(qty(c, 'txDi16')).toBe(7);
    expect(qty(c, 'txs12f10')).toBe(1); // 7 modules − 3 powered by the station
    expect(qty(c, 'txaK12')).toBe(1);   // address keys for the 7 modules
  });

  it('address keys: a 1–24 set when a station has more than 12 TX-I/O modules', () => {
    const c = cfg({ di: 300 });         // PXC7.E400L, 19 × TXM1.16D
    expect(qty(c, 'txaK24')).toBe(1);
    expect(qty(c, 'txaK12')).toBe(0);
    expect(DESIGO_PARTS.txaK24.partNo).toBe('BPZ:TXA1.K24');
  });

  it('beyond one PXC7.E400L → more stations; the station count can be raised by hand', () => {
    const c = cfg({ di: 900 });
    expect(c.controller?.model).toBe('PXC7.E400L');
    expect(c.suggestedControllers).toBe(3);
    expect(qty(c, 'pxc7l')).toBe(3);
    expect(qty(cfg({ di: 900, controllers: 4 }), 'pxc7l')).toBe(4);
  });

  it('signal types map to TX-I/O: 0–10 V / RTD on TXM1.8U, 4–20 mA / thermocouple on TXM1.8X', () => {
    const c = cfg({ controller: 'pxc7s', analog: an({ aiU: 5, aiRtd: 3, aoU: 2, aiI: 6, aoI: 1, aiTc: 2 }) });
    expect(qty(c, 'txU8')).toBe(2);  // 10 universal
    expect(qty(c, 'txX8')).toBe(2);  // 9 super-universal
    expect(c.notes.join(' ')).toMatch(/Thermocouples need a head \/ rail transmitter/);
  });
});

describe('Desigo CC licenses — best fit', () => {
  it('small system → Compact (500 points + 3 clients included), no extra packs', () => {
    const c = cfg({ di: 10, integrationPoints: 40, dccClients: 2 });
    expect(c.dccEdition).toBe('compact');
    expect(qty(c, 'dccCompact')).toBe(1);
    expect(c.lines.filter((l) => l.key.startsWith('dccBa_'))).toEqual([]);
    expect(c.dataPoints).toBe(50);
    expect(DESIGO_PARTS.dccCompact.partNo).toBe('P55802-Y113-A100');
    expect(c.lines.find((l) => l.key === 'dccCompact')?.section).toBe('bmsSoftware');
  });

  it('Compact up to 2,000 BA points: packs for the points beyond the 500 included', () => {
    const c = cfg({ di: 1400 });            // 1,400 → 900 beyond → one 1,000 pack
    expect(c.dccEdition).toBe('compact');
    expect(qty(c, 'dccBa_1000')).toBe(1);
  });

  it('more than 2,000 points, 4+ clients or redundancy → Standard + BA packs + client add-ons', () => {
    const big = cfg({ di: 2600 });
    expect(big.dccEdition).toBe('standard');
    expect(qty(big, 'dccStandard')).toBe(1);
    expect([qty(big, 'dccBa_1000'), qty(big, 'dccBa_500'), qty(big, 'dccBa_100')]).toEqual([2, 1, 1]);
    const clients = cfg({ di: 10, dccClients: 3, dccWebClients: 2 });
    expect(clients.dccEdition).toBe('standard');
    expect(qty(clients, 'dccClient')).toBe(4);   // 5 clients, 1 included
    expect(DESIGO_PARTS.dccClient.partNo).toBe('P55802-Y119-A200');
    const red = cfg({ di: 10, dccRedundant: true });
    expect([red.dccEdition, qty(red, 'dccRedundancy')]).toEqual(['standard', 1]);
  });

  it('SCADA points (Modbus / OPC direct) get SCADA packs on Standard', () => {
    const c = cfg({ di: 10, dccEdition: 'standard', scadaPoints: 600 });
    expect(qty(c, 'dccScada_500')).toBe(1);
    expect(qty(c, 'dccScada_100')).toBe(1);
  });

  it('edition can be forced; Compact that does not fit gets a note', () => {
    expect(cfg({ di: 10, dccEdition: 'standard' }).dccEdition).toBe('standard');
    const c = cfg({ di: 10, dccEdition: 'compact', dccClients: 5 });
    expect(c.dccEdition).toBe('compact');
    expect(c.notes.join(' ')).toMatch(/this needs Standard/);
  });

  it('can be left out; engineering license on request', () => {
    expect(qty(cfg({ di: 10, dcc: false }), 'dccCompact')).toBe(0);
    expect(qty(cfg({ di: 10, dccEngineering: true }), 'dccEngineering')).toBe(1);
  });
});

describe('bestPacks', () => {
  it('lowest cost with bigger packs cheaper per point', () => {
    expect(bestPacks(900, [100, 500, 1000])).toEqual([{ n: 1000, qty: 1 }]);
    expect(bestPacks(1200, [100, 500, 1000])).toEqual([{ n: 1000, qty: 1 }, { n: 100, qty: 2 }]);
    expect(bestPacks(2600, [100, 500, 1000, 5000])).toEqual([{ n: 1000, qty: 2 }, { n: 500, qty: 1 }, { n: 100, qty: 1 }]);
    expect(bestPacks(0, [100])).toEqual([]);
  });
});

describe('terminals, switches and descriptions', () => {
  it('uses the shared WAGO terminal strip', () => {
    const c = configureDesigo({ ...DEFAULT_DESIGO_INPUTS, sparePct: 0, di: 20, do: 6 });
    expect(qty(c, 'tb2Level')).toBe(20);
    expect(qty(c, 'relay')).toBe(6);
    expect(c.wiring?.redWires).toBeGreaterThan(0);
  });

  it('switch model follows the ports needed', () => {
    expect(qty(cfg({ di: 10, switchQty: 1 }), 'wagoSw5')).toBe(1);
  });

  it('every part has a brand-neutral quotation description', () => {
    Object.values(DESIGO_PARTS).forEach((p) => {
      expect(p.generic).toBeTruthy();
      expect(p.generic).not.toMatch(/Desigo|Siemens|PXC|TXM|TXS|WAGO|SITOP|SCALANCE/i);
    });
  });
});

describe('protocols', () => {
  const pr = (p: Partial<DesigoProtocols>) => ({ ...noProtocols(), ...p });

  it('each serial trunk takes an RS-485 port — the station is picked to have enough', () => {
    expect(cfg({ di: 10, protocols: pr({ modbusRtu: 1 }) }).controller?.model).toBe('PXC4.E16-2');
    // 2 trunks → a PXC4 / PXC5 / PXC7.E400S (1 port each) is not enough → PXC7.E400M
    expect(cfg({ di: 10, protocols: pr({ mstp: 1, modbusRtu: 1 }) }).controller?.model).toBe('PXC7.E400M');
    expect(cfg({ di: 10, protocols: pr({ mstp: 4 }) }).controller?.model).toBe('PXC7.E400L');
    const c = cfg({ di: 10, protocols: pr({ mstp: 1, modbusRtu: 1 }) });
    expect(qty(c, 'rs485Termination')).toBe(4);
  });

  it('M-Bus: not on the PXC4, one level converter per trunk', () => {
    const c = cfg({ di: 10, protocols: pr({ mbus: 1 }) });
    expect(c.controller?.model).toBe('PXC5.E24');
    expect(qty(c, 'mbusConverter')).toBe(1);
  });

  it('P1 goes in as a gateway; KNX is on board the PXC4 only', () => {
    expect(qty(cfg({ di: 10, protocols: pr({ p1: 2 }) }), 'p1Gateway')).toBe(2);
    expect(qty(cfg({ di: 10, protocols: pr({ knx: true }) }), 'knxInterface')).toBe(0);           // PXC4
    expect(qty(cfg({ di: 10, controller: 'pxc7s', protocols: pr({ knx: true }) }), 'knxInterface')).toBe(1);
  });

  it('Modbus TCP / BACnet/IP need no hardware', () => {
    const c = cfg({ di: 10, protocols: pr({ modbusTcp: true }) });
    expect(c.notes.join(' ')).toMatch(/Modbus TCP use the station's Ethernet port/);
    expect(c.lines.some((l) => ['mbusConverter', 'p1Gateway', 'knxInterface', 'rs485Termination'].includes(l.key))).toBe(false);
  });
});

describe('RTD: Pt1000 on universal points, Pt100 on TXM1.8P', () => {
  it('2-wire RTD (Pt1000 / Ni1000) uses universal points; 3-/4-wire Pt100 gets TXM1.8P modules', () => {
    const rtd = (w2: number, w4: number) => ({ ...noAnalog(), aiRtd: { w2, w4 } });
    const pt1000 = cfg({ analog: rtd(6, 0) });
    expect(pt1000.controller?.model).toBe('PXC4.E16-2'); // fits the 12 universal on board
    expect(qty(pt1000, 'txP8')).toBe(0);
    const pt100 = cfg({ analog: rtd(0, 10) });
    expect(qty(pt100, 'txP8')).toBe(2);
    expect(DESIGO_PARTS.txP8.partNo).toBe('BPZ:TXM1.8P');
  });
});
