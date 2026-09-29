import { DEFAULT_DESIGO_INPUTS, DESIGO_PARTS, configureDesigo, type DesigoInputs } from './desigoBms';
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

describe('Desigo CC licenses', () => {
  it('server, data points (I/O + integration) and clients', () => {
    const c = cfg({ di: 10, integrationPoints: 40, dccClients: 2, dccWebClients: 3 });
    expect([qty(c, 'dccServer'), qty(c, 'dccPoints'), qty(c, 'dccClient'), qty(c, 'dccWebClient')]).toEqual([1, 1, 2, 3]);
    expect(c.dataPoints).toBe(50);
    expect(c.lines.find((l) => l.key === 'dccPoints')?.section).toBe('bmsSoftware');
  });

  it('redundancy: two servers + the failover license; history per server', () => {
    const c = cfg({ di: 10, dccRedundant: true, dccHistory: true });
    expect([qty(c, 'dccServer'), qty(c, 'dccRedundancy'), qty(c, 'dccHistory')]).toEqual([2, 1, 2]);
  });

  it('can be left out', () => {
    expect(qty(cfg({ di: 10, dcc: false }), 'dccServer')).toBe(0);
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
