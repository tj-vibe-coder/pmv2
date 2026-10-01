import { DEFAULT_PANEL_INPUTS, PANEL_PARTS, configurePanel, emptyPanelIo, type PanelInputs } from './controlPanel';

const cfg = (p: Partial<PanelInputs>) => configurePanel({ ...DEFAULT_PANEL_INPUTS, ...p });
const qty = (c: ReturnType<typeof configurePanel>, key: string) => c.lines.find((l) => l.key === key)?.qty ?? 0;
const io = (p: Partial<ReturnType<typeof emptyPanelIo>>) => ({ ...emptyPanelIo(), ...p });

describe('enclosure, wireduct and DIN rail from the panel size', () => {
  it('800 x 1200 x 300: wall-mounted, 1 door, 5 rail rows on a 700 x 1050 plate', () => {
    const c = cfg({});
    expect([c.floor, c.doors, c.rows]).toEqual([false, 1, 5]);
    expect(c.plate).toEqual({ w: 700, h: 1050 });
    expect(c.lines.find((l) => l.key === 'enclosureWall')?.detail).toMatch(/^800 x 1200 x 300 mm/);
    expect(qty(c, 'ductH')).toBe(3);      // 6 runs × 700 mm, 2 per 2 m stick
    expect(qty(c, 'ductV')).toBe(2);      // 2 × 1050 mm, 1 per stick
    expect(qty(c, 'panelRail')).toBe(3);  // 5 rows × 700 mm, 2 per stick
  });

  it('floor-standing from 1400 mm high (with plinth); 2 doors above 800 mm wide', () => {
    const c = cfg({ widthMm: 1200, heightMm: 2000, depthMm: 400 });
    expect([c.floor, c.doors]).toEqual([true, 2]);
    expect(qty(c, 'enclosureFloor')).toBe(1);
    expect(qty(c, 'plinth')).toBe(1);
    expect([qty(c, 'panelLight'), qty(c, 'doorSwitch')]).toEqual([2, 2]);
  });
});

describe('cooling', () => {
  it('fan airflow from heat loss minus what the walls dissipate', () => {
    // A = 1.8·1.2·1.1 + 1.4·0.8·0.3 = 2.712 m² → 5.5 × 2.712 × 10 ≈ 149 W through the walls
    expect(cfg({ heatAuto: false, heatLossW: 150 }).airflow).toBe(0);
    const hot = cfg({ heatAuto: false, heatLossW: 600 });
    expect(hot.airflow).toBe(140);        // 3.1 × (600 − 149) / 10
    expect(qty(hot, 'fan200')).toBe(1);
    expect(qty(hot, 'fan200Exhaust')).toBe(1);
    expect(qty(hot, 'thermostat')).toBe(1);
    expect(qty(cfg({ heatAuto: false, heatLossW: 150 }), 'fan120')).toBe(1); // one fan anyway (hot ambient)
  });
});

describe('230 V: 2-pole ABB MCBs and 1.5 mm² wiring', () => {
  it('main + one 2P breaker per circuit, priced from the ABB pricelist', () => {
    const c = cfg({ psuQty: 2, extraCircuits: 1, socket: true, mainA: 20 }); // main picked by hand
    expect(qty(c, 'mcb2p_20')).toBe(1);   // main
    expect(qty(c, 'mcb2p_6')).toBe(3);    // 2 PSU + fans/light
    expect(qty(c, 'mcb2p_16')).toBe(1);   // socket
    expect(qty(c, 'mcb2p_10')).toBe(1);   // other load
    expect(PANEL_PARTS.mcb2p_16).toMatchObject({ partNo: 'S202-C16', price: 831.16, brand: 'ABB' });
    expect(qty(c, 'mcbBusbar')).toBe(1);
    expect(qty(c, 'tbIn4')).toBe(2);
  });

  it('white L1 / black L2 1.5 mm², ferrules and marker tube', () => {
    const c = cfg({});
    expect(qty(c, 'wireL1')).toBe(1);
    expect(qty(c, 'wireL2')).toBe(1);
    expect(qty(c, 'ferrule15')).toBeGreaterThan(0);
    expect(qty(c, 'tube15')).toBe(1);
    expect(c.lines.find((l) => l.key === 'wireL1')?.section).toBe('wiring');
  });
});

describe('terminal strip from the PLC / BMS I/O', () => {
  it('adds the WAGO strip and 0.5 mm² wiring (the layout gives the DIN rail)', () => {
    const c = cfg({ io: io({ source: 'Siemens S7-1500', di: 20, dq: 10, a2: 4, a4: 2, distPoints: 4 }) });
    expect(qty(c, 'tb2Level')).toBe(20);
    expect(qty(c, 'relay')).toBe(10);
    expect(qty(c, 'tbFuse')).toBe(8);
    expect(qty(c, 'dinRail')).toBe(0);   // the strip's own rail estimate is replaced by the layout rails
    expect(qty(c, 'wireRed')).toBeGreaterThan(0);
    expect(qty(c, 'wireRed') % 10).toBe(0);   // H05V-K by the metre, in whole 10 m
    expect(qty(c, 'tube05')).toBe(1);
    expect(c.lines.find((l) => l.key === 'tb2Level')?.section).toBe('terminals');
  });

  it('warns when the rail needed is more than the panel holds', () => {
    const c = cfg({ widthMm: 400, heightMm: 500, io: io({ di: 300, dq: 100 }) });
    expect(c.notes.join(' ')).toMatch(/go bigger or add a panel/);
  });

  it('every part has a brand-neutral quotation description', () => {
    Object.values(PANEL_PARTS).forEach((p) => {
      expect(p.generic).toBeTruthy();
      expect(p.generic).not.toMatch(/ABB|WAGO|S202|CAGE CLAMP/);
    });
  });
});

describe('main MCB auto-sized from the 230 V load', () => {
  it('small panel: 1 × 10 A supply + fan + light ≈ 1.6 A → C10 (above the 6 A branches)', () => {
    const c = cfg({});
    expect(c.loadA).toBeCloseTo(1.59, 2);  // 24 × 10 / 0.88 / 230 = 1.19 + 0.3 + 0.1
    expect(c.mainA).toBe(10);
    expect(qty(c, 'mcb2p_10')).toBe(1);
  });

  it('bigger loads push it up; the socket branch (C16) forces a main above 16 A', () => {
    expect(cfg({ socket: true }).mainA).toBe(20);
    const big = cfg({ psuQty: 2, psuA: 40, extraCircuits: 2, extraLoadA: 8 });
    // 2 × 24 × 40 / 0.88 / 230 = 9.49 + 0.3 + 0.1 + 16 = 25.89 A × 1.25 = 32.4 → C40
    expect(big.mainA).toBe(40);
  });

  it('a hand-picked main that is too small gets a warning', () => {
    const c = cfg({ mainA: 6 });
    expect(c.mainA).toBe(6);
    expect(c.notes.join(' ')).toMatch(/not above the largest 6 A branch/);
  });
});

describe('heat load from the components', () => {
  it('adds controller electronics, supply losses, relay coils, breakers and an allowance', () => {
    const c = cfg({ io: io({ di: 20, dq: 10, electronicsW: 60, load24A: 8 }) });
    // 60 + 8 × 24 × (1/0.9 − 1) = 21.3 + 10 × 0.2 = 2 + 3 breakers + 10 allowance
    expect(c.heatAutoW).toBe(96);
    expect(c.heatW).toBe(96);
    expect(c.heatSources.map((h) => h.w)).toEqual([60, 21.3, 2, 3, 10]);
  });

  it('without a PLC / BMS config, assumes the supplies are ~60% loaded', () => {
    // 1 × 10 A × 0.6 = 6 A → 16 W loss + 3 breakers + 10
    expect(cfg({}).heatAutoW).toBe(29);
  });

  it('a big heat load sizes the fans; a typed figure overrides the estimate', () => {
    const c = cfg({ io: io({ electronicsW: 500, load24A: 20 }) });
    expect(c.airflow).toBeGreaterThan(100);
    expect(qty(c, 'fan200')).toBe(1);
    expect(cfg({ heatAuto: false, heatLossW: 40, io: io({ electronicsW: 500 }) }).heatW).toBe(40);
  });
});

describe('0.5 mm² signal wire (supplier quote)', () => {
  it('H05V-K 1x0.5 red 8110041 / blue 8110021 at ₱9.14 per metre', () => {
    const red = PANEL_PARTS.wireRed;
    const blue = PANEL_PARTS.wireBlue;
    expect(red).toMatchObject({ partNo: '8110041', price: 9.14, uom: 'm' });
    expect(blue).toMatchObject({ partNo: '8110021', price: 9.14, uom: 'm' });
  });
});
