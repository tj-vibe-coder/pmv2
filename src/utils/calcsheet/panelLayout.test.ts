import { DEFAULT_PANEL_INPUTS, configurePanel, emptyPanelIo, type PanelInputs } from './controlPanel';
import { ENCLOSURES, autoEnclosure, deviceList, frontView, layoutPanel, plateOf, plateView, terminalSchedule, type LayoutGroup } from './panelLayout';
import { panelDrawingDxf, panelSheets, expandView } from './panelDrawing';

const enc = (k: string) => ENCLOSURES.find((e) => e.key === k)!;
const io = (p: Partial<ReturnType<typeof emptyPanelIo>>) => ({ ...emptyPanelIo(), ...p });
const cfg = (p: Partial<PanelInputs>) => configurePanel({ ...DEFAULT_PANEL_INPUTS, enclosure: 'auto', ...p });
const qty = (c: ReturnType<typeof configurePanel>, key: string) => c.lines.find((l) => l.key === key)?.qty ?? 0;
const terminals = (n: number): LayoutGroup => ({ tag: 'X2', label: 'DI terminals', unitW: 5.2, unitH: 70, count: n, splittable: true, zone: 'terminals' });

describe('enclosures and mounting plates', () => {
  it('Tekpan 2100H includes the 100 mm plinth; plates ≈ W − 100 by body − 150', () => {
    expect(plateOf(enc('tekpan800'))).toEqual({ w: 700, h: 1850 });
    expect(plateOf(enc('tekpan1200'))).toEqual({ w: 1100, h: 1850 });
    expect(plateOf(enc('tibox1000'))).toEqual({ w: 700, h: 850 });
    expect(plateOf(enc('tibox800'))).toEqual({ w: 500, h: 650 });
  });
});

describe('layout', () => {
  it('places runs to scale, left to right, splitting terminal runs over rows', () => {
    // 700 plate − 2 × 60 duct − 2 × 10 gap = 560 mm per row → 107 terminals of 5.2 mm per row
    const l = layoutPanel([terminals(200)], enc('tekpan800'), 1);
    expect(l.fits).toBe(true);
    expect(l.bays[0].rows.map((r) => r.items[0].count)).toEqual([107, 93]);
    expect(l.bays[0].rows[0].items[0].w).toBeCloseTo(107 * 5.2, 5);
  });

  it('a new bay when a plate is full; nothing placed past the last bay', () => {
    const many = [terminals(107 * 30)];
    const one = layoutPanel(many, enc('tekpan800'), 1);
    expect(one.fits).toBe(false);
    expect(one.unplaced[0]).toMatch(/DI terminals \(\d+ of 3210\)/);
    const enough = layoutPanel(many, enc('tekpan800'), 3);
    expect(enough.fits).toBe(true);
    expect(enough.bays.length).toBe(3);
  });

  it('auto picks Tibox for a small panel and joined Tekpan bays for a big one', () => {
    expect(autoEnclosure([terminals(40)]).enclosure.key).toBe('tibox800');
    const big = autoEnclosure([terminals(107 * 30)]);
    expect(big.enclosure.key).toMatch(/^tekpan/);
    expect(big.fits).toBe(true);
    expect(big.bays.length).toBeGreaterThan(1);
  });

  it('a device wider than a row is reported, not placed', () => {
    const l = layoutPanel([{ tag: 'A1', label: 'S7-1500 rail', unitW: 830, unitH: 155, count: 1, splittable: false, zone: 'control' }], enc('tekpan800'), 1);
    expect(l.fits).toBe(false);
    expect(l.unplaced[0]).toMatch(/830 mm wide/);
  });
});

describe('Control Panel with standard enclosures', () => {
  it('auto: a small PLC panel fits the 800 × 600 Tibox wall-mount', () => {
    const c = cfg({ io: io({ di: 16, dq: 8, a2: 4, distPoints: 4, devices: [{ tag: 'A', label: 'CPU 1214C', widthMm: 110, heightMm: 100 }] }) });
    expect(c.layout.enclosure.key).toBe('tibox800');
    expect(c.floor).toBe(false);
    expect(qty(c, 'enclosureWall')).toBe(1);
    expect(c.lines.find((l) => l.key === 'enclosureWall')).toMatchObject({ brand: 'Tibox', detail: expect.stringMatching(/^800H × 600W × 300D mm, 1 door/) });
    expect(c.notes.join(' ')).toMatch(/Auto enclosure: Tibox wall-mount 800H × 600W × 300D/);
  });

  it('Tekpan 800 W with more I/O than one bay holds → joined bays, a baying kit, a fan per bay', () => {
    const c = cfg({ enclosure: 'tekpan800', io: io({ di: 1500, dq: 300, distPoints: 10 }) });
    const bays = c.layout.bays.length;
    expect(bays).toBeGreaterThan(1);
    expect(c.layout.fits).toBe(true);
    expect(qty(c, 'enclosureFloor')).toBe(bays);
    expect(qty(c, 'bayKit')).toBe(bays - 1);
    expect(qty(c, 'plinth')).toBe(0); // the 2100 mm Tekpan already includes it
    expect(qty(c, 'panelLight')).toBe(bays);
    expect(c.lines.filter((l) => /^fan\d+$/.test(l.key)).reduce((s, l) => s + l.qty, 0)).toBeGreaterThanOrEqual(bays);
  });

  it('bays asked for beyond the need are drawn empty (spare)', () => {
    const c = cfg({ enclosure: 'tekpan1200', bays: 2, io: io({ di: 16 }) });
    expect(c.layout.bays.length).toBe(2);
    expect(c.layout.bays[1].rows).toEqual([]);
    expect(c.doors).toBe(4); // 1200 W → 2 doors per bay
  });
});

describe('drawings', () => {
  const c = cfg({ enclosure: 'tekpan800', bays: 2, io: io({ di: 32, dq: 16, a2: 4, distPoints: 4 }) });
  it('front view shows both bays with the overall width dimension', () => {
    const f = frontView(c.layout);
    expect(f.w).toBe(1600);
    expect(f.shapes.some((s) => s.t === 'dim' && s.text === '1600')).toBe(true);
    expect(f.shapes.some((s) => s.t === 'dim' && s.text === '2100')).toBe(true);
  });
  it('plate view tags every run; dimensions expand to lines + text at scale', () => {
    const p = plateView(c.layout, 0);
    const texts = p.shapes.filter((s) => s.t === 'text').map((s) => (s.t === 'text' ? s.text : ''));
    expect(texts).toEqual(expect.arrayContaining(['-X2 (32)', '-K (16)', '-Q0']));
    const prims = expandView(p, 10);
    expect(prims.some((x) => x.t === 'text' && x.text === '700')).toBe(true); // plate width dimension
  });
  it('sheets on A3, device list, terminal schedule and a 1:1 DXF', () => {
    const plates = c.layout.bays.map((_, i) => plateView(c.layout, i));
    const sheets = panelSheets(frontView(c.layout), plateView(c.layout, 0), plates);
    expect(sheets.length).toBe(2);
    sheets.forEach((s) => s.views.forEach((v) => expect([2, 5, 10, 15, 20, 25, 30, 40, 50]).toContain(v.k)));
    expect(deviceList(c.layout).find((d) => d.tag === 'X2')?.qty).toBe(32);
    const sched = terminalSchedule({ di: 2, dq: 1, a2: 1, a4: 1, distPoints: 1 });
    expect(sched.filter((r) => r.strip === 'X3').length).toBe(2 + 4);
    const dxf = panelDrawingDxf(plates);
    expect(dxf).toMatch(/^0\nSECTION\n2\nHEADER/);
    expect(dxf).toMatch(/\nLAYER\n2\nDUCT\n/);
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });
});
