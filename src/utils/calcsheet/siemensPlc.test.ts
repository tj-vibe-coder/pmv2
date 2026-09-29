import { DEFAULT_PLC_INPUTS, SIEMENS_PARTS, configurePlc, estimate24V, siemensPrice, type PlcInputs } from './siemensPlc';

const cfg = (p: Partial<PlcInputs>) => configurePlc({ ...DEFAULT_PLC_INPUTS, sparePct: 0, ...p });
const qty = (c: ReturnType<typeof configurePlc>, key: string) => c.lines.find((l) => l.key === key)?.qty ?? 0;

describe('Siemens PLC configurator', () => {
  it('S7-1200: small I/O fits the CPU\'s on-board I/O — no ET 200SP', () => {
    const c = cfg({ family: 'S7-1200', di: 12, do: 8 });
    expect(qty(c, 'cpu1214')).toBe(1);
    expect(qty(c, 'imBundle')).toBe(0);
    expect(c.ioModules).toBe(0);
    expect(c.channels.di).toEqual({ needed: 12, provided: 14 });
    expect(qty(c, 'psu100s')).toBe(0); // PSU is chosen by hand from the load estimate
    expect(qty(cfg({ family: 'S7-1200', di: 12, sitop: 'PSU100S' }), 'psu100s')).toBe(1);
  });

  it('S7-1200: I/O beyond on-board goes to ET 200SP with BaseUnits', () => {
    // 40 DI → 14 on board + 26 → 2 × DI16; 20 DO → 10 + 10 → 1 × DQ16; 10 AI (4–20 mA) → 2 × AI8; 3 AO → 1 × AQ4
    const c = cfg({ family: 'S7-1200', di: 40, do: 20, ai: 10, ao: 3 });
    expect([qty(c, 'di16'), qty(c, 'dq16'), qty(c, 'ai8'), qty(c, 'aq4')]).toEqual([2, 1, 2, 1]);
    expect(qty(c, 'imBundle')).toBe(1);
    expect(qty(c, 'buLight')).toBe(1);
    expect(qty(c, 'buDark')).toBe(5); // 6 modules − 1 light
    expect(c.channels.ai.provided).toBe(16); // on-board 0–10 V not counted by default
  });

  it('S7-1200 on-board AI can be counted when the signals are 0–10 V', () => {
    expect(qty(cfg({ family: 'S7-1200', ai: 2, useOnboardAi: true }), 'ai8')).toBe(0);
    expect(qty(cfg({ family: 'S7-1200', ai: 2 }), 'ai8')).toBe(1);
  });

  it('S7-1500: all I/O on ET 200SP, memory card always included', () => {
    const c = cfg({ family: 'S7-1500', di: 16, do: 16 });
    expect(qty(c, 'cpu1513')).toBe(1);
    expect(qty(c, 'memCard')).toBe(1);
    expect([qty(c, 'di16'), qty(c, 'dq16')]).toEqual([1, 1]);
    expect(qty(c, 'imBundle')).toBe(1);
  });

  it('spare % is added per I/O type before sizing', () => {
    // 16 DI + 20% = 20 → 2 × DI16 on S7-1500
    expect(qty(configurePlc({ ...DEFAULT_PLC_INPUTS, family: 'S7-1500', di: 16, sparePct: 20 }), 'di16')).toBe(2);
  });

  it('more than 32 modules → another ET 200SP station', () => {
    const c = cfg({ family: 'S7-1500', di: 33 * 16 });
    expect(qty(c, 'di16')).toBe(33);
    expect(c.stations).toBe(2);
    expect(qty(c, 'imBundle')).toBe(2);
    expect(qty(c, 'buLight')).toBe(2);
    expect(qty(c, 'buDark')).toBe(31);
  });

  it('Modbus RTU: CB 1241 on S7-1200 (1 port), CM PtP for more / on S7-1500', () => {
    expect(qty(cfg({ family: 'S7-1200', modbus: 'rtu', modbusPorts: 1 }), 'cb1241')).toBe(1);
    const two = cfg({ family: 'S7-1200', modbus: 'rtu', modbusPorts: 2 });
    expect([qty(two, 'cb1241'), qty(two, 'cmPtp'), qty(two, 'imBundle')]).toEqual([1, 1, 1]);
    const p1500 = cfg({ family: 'S7-1500', modbus: 'rtu', modbusPorts: 2 });
    expect([qty(p1500, 'cb1241'), qty(p1500, 'cmPtp')]).toEqual([0, 2]);
  });

  it('Modbus TCP needs no hardware', () => {
    const c = cfg({ family: 'S7-1200', modbus: 'tcp' });
    expect(qty(c, 'cb1241') + qty(c, 'cmPtp')).toBe(0);
    expect(c.notes.join(' ')).toMatch(/PROFINET port/);
  });

  it('prices: catalog item with the same part no. wins, else the quote price', () => {
    expect(siemensPrice(SIEMENS_PARTS.di16, [])).toEqual({ price: 6218.99, source: 'quote' });
    expect(siemensPrice(SIEMENS_PARTS.di16, [{ catalogNo: '6ES7131-6BH01-0BA0', sellingPrice: 6000 }])).toEqual({ price: 6000, source: 'catalog' });
    expect(siemensPrice(SIEMENS_PARTS.buLight, [])).toEqual({ price: 1600, source: 'quote' });
  });
});

describe('defaults', () => {
  it('spare starts at 10%', () => {
    expect(DEFAULT_PLC_INPUTS.sparePct).toBe(10);
    // 16 DI + 10% = 18 → 2 × DI16 on S7-1500
    expect(qty(configurePlc({ ...DEFAULT_PLC_INPUTS, family: 'S7-1500', di: 16 }), 'di16')).toBe(2);
  });
});

describe('24 V load estimate', () => {
  it('adds CPU, modules and field loads, then the margin, and suggests a SITOP rating', () => {
    const inp = { ...DEFAULT_PLC_INPUTS, sparePct: 0, family: 'S7-1200' as const, di: 40, do: 20, ai: 8, ao: 4, doLoadA: 0.1, psuMarginPct: 25 };
    const c = configurePlc(inp);
    const e = estimate24V(inp, c);
    // CPU 0.5 + IM 0.2 + 2×DI16 0.1 + 1×DQ16 0.05 + 1×AI8 0.03 + 1×AQ4 0.05
    //   + 40 DI × 0.01 + 20 DO × 0.1 + 8 AI × 0.02 + 4 AO × 0.02 = 3.57 A
    expect(e.totalA).toBeCloseTo(3.57, 2);
    expect(e.withMarginA).toBeCloseTo(4.46, 2);
    expect(e.suggestedA).toBe(5);
  });

  it('heavier DO loads push the suggestion up; beyond 40 A there is no single-SITOP suggestion', () => {
    const base = { ...DEFAULT_PLC_INPUTS, sparePct: 0, family: 'S7-1500' as const, do: 64 };
    expect(estimate24V({ ...base, doLoadA: 0.3 }, configurePlc({ ...base, doLoadA: 0.3 })).suggestedA).toBe(40);
    expect(estimate24V({ ...base, doLoadA: 0.5 }, configurePlc({ ...base, doLoadA: 0.5 })).suggestedA).toBeNull();
  });
});
