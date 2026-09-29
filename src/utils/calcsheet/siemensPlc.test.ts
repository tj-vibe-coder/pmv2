import {
  DEFAULT_PLC_INPUTS, SIEMENS_PARTS, cheapestModules, configurePlc, estimate24V, noAnalog, siemensPrice,
  type AnalogCount, type AnalogKey, type PlcInputs,
} from './siemensPlc';

/** Analog points by type: { aiI: 10 } = 10 × 2-wire, { aiI: { w4: 2 } } = 2 × 4-wire. */
const an = (p: Partial<Record<AnalogKey, number | Partial<AnalogCount>>>) => {
  const out = noAnalog();
  (Object.keys(p) as AnalogKey[]).forEach((k) => {
    const v = p[k]!;
    out[k] = typeof v === 'number' ? { w2: v, w4: 0 } : { w2: v.w2 ?? 0, w4: v.w4 ?? 0 };
  });
  return out;
};
const cfg = (p: Partial<PlcInputs>) => configurePlc({ ...DEFAULT_PLC_INPUTS, sparePct: 0, ...p });
const qty = (c: ReturnType<typeof configurePlc>, key: string) => c.lines.find((l) => l.key === key)?.qty ?? 0;

describe('Siemens PLC configurator', () => {
  it('S7-1200: small I/O fits the CPU\'s on-board I/O — no ET 200SP', () => {
    const c = cfg({ family: 'S7-1200', di: 12, do: 8 });
    expect(qty(c, 'cpu1214')).toBe(1);
    expect(qty(c, 'imBundle')).toBe(0);
    expect(c.ioModules).toBe(0);
    expect(c.channels.di).toEqual({ needed: 12, provided: 14 });
    expect(qty(c, 'psu100s20')).toBe(0); // PSU is chosen by hand from the load estimate
    expect(qty(cfg({ family: 'S7-1200', di: 12, sitop: 'psu100s20' }), 'psu100s20')).toBe(1);
  });

  it('S7-1200: I/O beyond on-board goes to ET 200SP with BaseUnits', () => {
    // 40 DI → 14 on board + 26 → 2 × DI16; 20 DO → 10 + 10 → 1 × DQ16; 10 AI (4–20 mA) → 2 × AI8; 3 AO 0–10 V → 1 × AQ4
    const c = cfg({ family: 'S7-1200', di: 40, do: 20, analog: an({ aiI: 10, aoU: 3 }) });
    expect([qty(c, 'di16'), qty(c, 'dq16'), qty(c, 'ai8'), qty(c, 'aq4')]).toEqual([2, 1, 2, 1]);
    expect(qty(c, 'imBundle')).toBe(1);
    expect(qty(c, 'buLight')).toBe(1);
    expect(qty(c, 'buDark')).toBe(5); // 6 modules − 1 light
    expect(c.channels.ai.provided).toBe(16); // on-board AI are 0–10 V only, so they don't take 4–20 mA
  });

  it('S7-1200 on-board AI take 0–10 V inputs only', () => {
    expect(qty(cfg({ family: 'S7-1200', analog: an({ aiU: 2 }) }), 'ai8u')).toBe(0);
    expect(qty(cfg({ family: 'S7-1200', analog: an({ aiU: 3 }) }), 'ai8u')).toBe(1);
    expect(qty(cfg({ family: 'S7-1200', analog: an({ aiI: 2 }) }), 'ai8')).toBe(1);
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

describe('other CPU models, HMI, SCADA and SITOP choices', () => {
  it('a smaller S7-1200 CPU has less on-board I/O, so ET 200SP starts sooner', () => {
    // 1212C: 8 DI / 6 DQ on board → 12 DI needs a DI16; on a 1214C it would not.
    const c = cfg({ family: 'S7-1200', cpu: 'cpu1212', di: 12, do: 6 });
    expect(qty(c, 'cpu1212')).toBe(1);
    expect(qty(c, 'cpu1214')).toBe(0);
    expect([qty(c, 'di16'), qty(c, 'dq16'), qty(c, 'imBundle')]).toEqual([1, 0, 1]);
  });

  it('1215C on-board AQ (0–20 mA) covers 2 current AO before an AQ4 module is needed', () => {
    expect(qty(cfg({ family: 'S7-1200', cpu: 'cpu1215', analog: an({ aoI: 2 }) }), 'aq4')).toBe(0);
    expect(qty(cfg({ family: 'S7-1200', cpu: 'cpu1215', analog: an({ aoI: 3 }) }), 'aq4')).toBe(1);
  });

  it('S7-1500 compact CPU counts its on-board I/O (AI are 4–20 mA capable)', () => {
    const c = cfg({ family: 'S7-1500', cpu: 'cpu1511c', di: 16, do: 16, analog: an({ aiI: 4 }) });
    expect(c.ioModules).toBe(0);
    expect(qty(c, 'memCard')).toBe(1);
  });

  it('a CPU key from the other family falls back to that family\'s default', () => {
    expect(qty(cfg({ family: 'S7-1500', cpu: 'cpu1212' }), 'cpu1513')).toBe(1);
  });

  it('AC-powered CPU is left out of the 24 V load', () => {
    const inp = { ...DEFAULT_PLC_INPUTS, cpu: 'cpu1214ac', di: 10 };
    expect(estimate24V(inp, configurePlc(inp)).lines.some((l) => /CPU/.test(l.label))).toBe(false);
  });

  it('memory card size, HMI panel and SCADA license go on the BOM (unpriced → for inquiry)', () => {
    const c = cfg({ family: 'S7-1500', memCard: 'memCard24', hmi: 'mtp1000', hmiQty: 2, scada: 'wincc81', winccLicense: 'RT', scadaPackage: '8192' });
    expect(qty(c, 'memCard24')).toBe(1);
    expect(qty(c, 'mtp1000')).toBe(2);
    expect(qty(c, 'wincc81_RT_8192_standard')).toBe(1);
    expect(siemensPrice(SIEMENS_PARTS.mtp1000, [])).toEqual({ price: 0, source: 'none' });
    expect(SIEMENS_PARTS.wincc81_RT_8192_standard.description).toMatch(/WinCC V8\.1 RT.*8192 PowerTags/);
    expect(qty(cfg({ scada: 'unifiedPc', scadaPackage: '1k' }), 'unifiedPc_1k_standard')).toBe(1);
  });

  // Part numbers as listed in the Siemens TIA Selection Tool (Sep 2026).
  it('WinCC V8.1 license part numbers follow the RC/RT size code and the edition', () => {
    expect(SIEMENS_PARTS.wincc81_RC_2048_standard.partNo).toBe('6AV6381-2BP08-1AX0');
    expect(SIEMENS_PARTS.wincc81_RC_102400_asia.partNo).toBe('6AV6381-2BT08-1AV0');
    expect(SIEMENS_PARTS.wincc81_RT_128_dl.partNo).toBe('6AV6381-2BC08-1AH0');
    expect(SIEMENS_PARTS.wincc81_RT_65536_standard.partNo).toBe('6AV6381-2BF08-1AX0');
    expect(qty(cfg({ scada: 'wincc81', winccLicense: 'RC', scadaPackage: '512', licenseEdition: 'asia' }), 'wincc81_RC_512_asia')).toBe(1);
  });

  it('WinCC Unified V21 PC Runtime packages (download edition falls back to standard)', () => {
    expect(SIEMENS_PARTS.unifiedPc_150_standard.partNo).toBe('6AV2155-3DB02-5AA0');
    expect(SIEMENS_PARTS.unifiedPc_10k_asia.partNo).toBe('6AV2155-2FB02-5BA0');
    expect(qty(cfg({ scada: 'unifiedPc', scadaPackage: '2.5k', licenseEdition: 'dl' }), 'unifiedPc_2.5k_standard')).toBe(1);
  });

  it('S7-1500 CPUs use the current "…03" generation; memory cards "…04"', () => {
    expect(SIEMENS_PARTS.cpu1511.partNo).toBe('6ES7511-1AL03-0AB0');
    expect(SIEMENS_PARTS.cpu1516f.partNo).toBe('6ES7516-3FP03-0AB0');
    expect(SIEMENS_PARTS.memCard4.partNo).toBe('6ES7954-8LC04-0AA0');
  });

  it('an HMI adds its draw to the 24 V estimate', () => {
    const inp = { ...DEFAULT_PLC_INPUTS, sparePct: 0, di: 1, hmi: 'ktp700', hmiQty: 2 };
    const e = estimate24V(inp, configurePlc(inp));
    expect(e.lines.find((l) => /KTP700/.test(l.label))?.totalA).toBeCloseTo(0.5, 2);
  });

  it('any SITOP rating can be picked; unquoted ones are unpriced', () => {
    expect(qty(cfg({ sitop: 'psu100s5' }), 'psu100s5')).toBe(1);
    expect(SIEMENS_PARTS.psu100s5).toMatchObject({ partNo: '6EP1333-2BA20', price: 0 });
    expect(SIEMENS_PARTS.psu100s20).toMatchObject({ price: 27429.76, quoted: true });
  });

  it('parts without a part number never match a catalog row', () => {
    expect(siemensPrice({ key: 'x', partNo: '', description: '', price: 0 }, [{ catalogNo: '', sellingPrice: 999 }])).toEqual({ price: 0, source: 'none' });
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
    const inp = { ...DEFAULT_PLC_INPUTS, sparePct: 0, family: 'S7-1200' as const, di: 40, do: 20, analog: an({ aiI: 8, aoU: 4 }), doLoadA: 0.1, psuMarginPct: 25 };
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

describe('analog signal types', () => {
  it('each signal type goes on its own module; 3-/4-wire RTD on the 4-channel HF', () => {
    const c = cfg({ family: 'S7-1500', analog: an({ aiI: { w2: 5, w4: 4 }, aiU: 3, aiRtd: { w2: 8, w4: 5 }, aoI: 2, aoU: 3 }) });
    expect(qty(c, 'ai8')).toBe(2);   // 9 × 4–20 mA (2- and 4-wire)
    expect(qty(c, 'ai8u')).toBe(1);
    expect(qty(c, 'rtd8')).toBe(1);  // 8 × RTD 2-wire
    expect(qty(c, 'rtd4')).toBe(2);  // 5 × RTD 3-/4-wire
    expect(qty(c, 'aq4')).toBe(2);   // 5 AO, U and I share AQ 4xU/I
    expect(c.channels.ai).toEqual({ needed: 25, provided: 40 });
  });

  it('thermocouples sit on type A1 BaseUnits (cold-junction sensor)', () => {
    const c = cfg({ family: 'S7-1500', di: 16, analog: an({ aiTc: { w2: 3, w4: 9 } }) });
    expect(qty(c, 'rtd8')).toBe(1);        // TC is 2-wire only — the 4-wire field is ignored
    expect([qty(c, 'buLight'), qty(c, 'buDark'), qty(c, 'buLightA1'), qty(c, 'buDarkA1')]).toEqual([1, 0, 0, 1]);
    const tcOnly = cfg({ family: 'S7-1500', analog: an({ aiTc: 3 }) });
    expect([qty(tcOnly, 'buLight'), qty(tcOnly, 'buLightA1')]).toEqual([0, 1]);
  });
});

describe('redundancy and network switches', () => {
  it('S7-1500R: 2 CPUs, 2 memory cards, IM 155-6 PN/2 HF + BusAdapter, 2 managed switches', () => {
    const c = cfg({ family: 'S7-1200', redundancy: 'R', cpu: 'cpu1214', di: 16 });
    expect(qty(c, 'cpu1513r')).toBe(2);
    expect(qty(c, 'cpu1214')).toBe(0);
    expect(qty(c, 'memCard')).toBe(2);
    expect([qty(c, 'imHf'), qty(c, 'busAdapter'), qty(c, 'imBundle')]).toEqual([1, 1, 0]);
    expect(qty(c, 'xc208')).toBe(2);
    expect(c.notes.join(' ')).toMatch(/at least 2 managed switches/);
  });

  it('S7-1500H: one bundle (2 CPUs + sync), 2 memory cards; HF stations hold 64 modules', () => {
    const c = cfg({ redundancy: 'H', di: 40 * 16, switchQty: 3, switchType: 'unmanaged' });
    expect(qty(c, 'cpu1517h')).toBe(1);
    expect(qty(c, 'memCard')).toBe(2);
    expect(c.stations).toBe(1);
    expect(qty(c, 'xc208')).toBe(3); // unmanaged overridden to managed
  });

  it('switch model follows the ports needed per switch', () => {
    expect(qty(cfg({ switchQty: 1, hmi: 'ktp700' }), 'wagoSw5')).toBe(1);   // CPU + HMI + uplink = 3 ports
    expect(qty(cfg({ switchQty: 1, scada: 'wincc81', scadaQty: 6 }), 'wagoSw8')).toBe(1); // 7 devices + 1
    const big = cfg({ switchQty: 1, switchType: 'managed', scada: 'wincc81', scadaQty: 20 });
    expect(qty(big, 'xc216')).toBe(1);
    expect(big.notes.join(' ')).toMatch(/add more switches/);
    expect(SIEMENS_PARTS.wagoSw5).toMatchObject({ partNo: '852-111', price: 8328.24, brand: 'WAGO' });
  });
});

describe('WAGO terminals and wiring', () => {
  const c = cfg({ family: 'S7-1500', di: 20, do: 10, analog: an({ aiI: { w2: 4, w4: 2 } }) });

  it('DI → 2-level terminal, DO → slim relay, analog → fused + standard terminals', () => {
    expect(qty(c, 'tb2Level')).toBe(20);
    expect(qty(c, 'relay')).toBe(10);
    expect(qty(c, 'relayJumper')).toBe(9);
    expect(qty(c, 'tbFuse')).toBe(8);     // 4 × 1 + 2 × 2
    expect(qty(c, 'fuse5x20')).toBe(8);
    // 8 analog + 2 × 4 distribution (CPU, IM, light BU, PSU feed)
    expect(qty(c, 'tbStd')).toBe(16);
    expect(qty(c, 'tb2LevelEnd')).toBe(1);
    expect(qty(c, 'tbStdEnd')).toBe(1);
    expect(qty(c, 'jumper10')).toBe(4);   // 2 DI level + 2 distribution
    expect(qty(c, 'endStop')).toBe(8);    // 4 groups × 2
    expect(qty(c, 'markers')).toBe(56);
  });

  it('0.5 mm² red (+24 V) and blue (0 V) wire sized from the I/O and the panel', () => {
    expect(c.wiring).toMatchObject({ redWires: 44, blueWires: 13, runM: 1.3, redM: 63, blueM: 19 });
    expect([qty(c, 'wireRed'), qty(c, 'wireBlue')]).toEqual([1, 1]);
    expect(qty(c, 'ferrule05')).toBe(200);
    // a bigger panel means longer wires
    expect(cfg({ di: 100, panelW: 2000, panelH: 2200 }).wiring!.runM).toBe(2.4);
  });

  it('can be switched off, and prices come from the WAGO inventory', () => {
    const off = cfg({ family: 'S7-1500', di: 20, terminals: false });
    expect(off.wiring).toBeNull();
    expect(qty(off, 'tb2Level')).toBe(0);
    expect(siemensPrice(SIEMENS_PARTS.tb2Level, [])).toEqual({ price: 99.41, source: 'quote' });
    expect(siemensPrice(SIEMENS_PARTS.relay, [])).toEqual({ price: 554.69, source: 'quote' });
    expect(SIEMENS_PARTS.wagoEco10).toMatchObject({ partNo: '787-732', price: 5337.3, brand: 'WAGO' });
    expect(siemensPrice(SIEMENS_PARTS.wireRed, [])).toEqual({ price: 1500, source: 'quote' }); // per 100 m roll
    expect(siemensPrice(SIEMENS_PARTS.wireBlue, [])).toEqual({ price: 1500, source: 'quote' });
    expect(SIEMENS_PARTS.ferrule05.description).toBe('0.5mm2 ferrule');
  });

  it('lines are grouped for Section B: PLC, terminal blocks & relays, wires', () => {
    const sec = (key: string) => c.lines.find((l) => l.key === key)?.section;
    expect([sec('cpu1513'), sec('di16'), sec('memCard')]).toEqual(['plc', 'plc', 'plc']);
    expect([sec('tb2Level'), sec('relay'), sec('tbFuse'), sec('endStop'), sec('dinRail')]).toEqual(['terminals', 'terminals', 'terminals', 'terminals', 'terminals']);
    expect([sec('wireRed'), sec('wireBlue'), sec('ferrule05')]).toEqual(['wiring', 'wiring', 'wiring']);
  });
});

describe('S7-1500 mounting rail', () => {
  it('every S7-1500 CPU gets the shortest rail it fits on; none for S7-1200', () => {
    expect(qty(cfg({ family: 'S7-1500' }), 'rail1500_160')).toBe(1);
    expect(qty(cfg({ family: 'S7-1500', cpu: 'cpu1512c' }), 'rail1500_160')).toBe(1);
    expect(qty(cfg({ family: 'S7-1200' }), 'rail1500_160')).toBe(0);
    expect(SIEMENS_PARTS.rail1500_160.partNo).toBe('6ES7590-1AB60-0AA0');
  });

  it('redundant systems get one rail per CPU; the wide 1517H needs the 245 mm rail', () => {
    expect(qty(cfg({ redundancy: 'R' }), 'rail1500_160')).toBe(2);
    expect(qty(cfg({ redundancy: 'H' }), 'rail1500_245')).toBe(2);
  });
});

describe('SCADA options: clients, data logging, redundancy', () => {
  it('WinCC V8.1 client/server: WinCC/Server on each server, one RT Client per client', () => {
    const c = cfg({ scada: 'wincc81', scadaQty: 1, scadaClients: 3 });
    expect(qty(c, 'wincc81_RC_2048_standard')).toBe(1);
    expect(qty(c, 'wincc81Server')).toBe(1);
    expect(qty(c, 'wincc81Client')).toBe(3);
    expect(SIEMENS_PARTS.wincc81Client.partNo).toBe('6AV6381-2CA08-1AX0');
    expect(qty(cfg({ scada: 'wincc81' }), 'wincc81Server')).toBe(0); // single station — no server option
  });

  it('WinCC V8.1 redundancy doubles the servers and adds one Redundancy license per pair; archive per server', () => {
    const c = cfg({ scada: 'wincc81', scadaQty: 1, scadaClients: 2, scadaRedundant: true, scadaLogging: '5000' });
    expect(qty(c, 'wincc81_RC_2048_standard')).toBe(2);
    expect(qty(c, 'wincc81Server')).toBe(2);
    expect(qty(c, 'wincc81Redundancy')).toBe(1);
    expect(qty(c, 'wincc81Archive_5000')).toBe(2);
    expect(SIEMENS_PARTS.wincc81Redundancy.partNo).toBe('6AV6371-1CF08-1AX0');
    expect(SIEMENS_PARTS.wincc81Archive_5000.partNo).toBe('6AV6371-1DQ10-0BX0');
    // download edition → the download order numbers
    const d = cfg({ scada: 'wincc81', licenseEdition: 'dl', scadaRedundant: true, scadaLogging: '1500' });
    expect(qty(d, 'wincc81Redundancy_dl')).toBe(1);
    expect(SIEMENS_PARTS.wincc81Archive_1500_dl.partNo).toBe('6AV6371-1HQ10-0AX0');
  });

  it('WinCC Unified: operate-client packs on each server, logging tags, Database Storage, redundancy', () => {
    const c = cfg({ scada: 'unifiedPc', scadaPackage: '1k', scadaClients: 5, scadaRedundant: true, scadaLogging: '1000', scadaDbStorage: true });
    expect(qty(c, 'unifiedPc_1k_standard')).toBe(2);
    expect(qty(c, 'unifiedClient_3')).toBe(2);  // 5 = 3 + 1 + 1, on both servers
    expect(qty(c, 'unifiedClient_1')).toBe(4);
    expect(qty(c, 'unifiedLogging_1000')).toBe(2);
    expect(qty(c, 'unifiedDbStorage')).toBe(2);
    expect(qty(c, 'unifiedRedundancy')).toBe(1);
    expect(SIEMENS_PARTS.unifiedClient_3.partNo).toBe('6AV2157-3JW00-0AB0');
  });

  it('servers and clients count as network devices for the switch', () => {
    expect(cfg({ scada: 'wincc81', scadaClients: 4, scadaRedundant: true, switchQty: 1 }).network.devices).toBe(1 + 2 + 4);
  });
});

describe('choosing the number of ET 200SP stations (IM)', () => {
  it('auto uses the minimum; asking for more spreads the modules and adds IMs + light BaseUnits', () => {
    const auto = cfg({ family: 'S7-1500', di: 6 * 16 });
    expect([auto.stations, auto.suggestedStations, qty(auto, 'imBundle')]).toEqual([1, 1, 1]);
    const three = cfg({ family: 'S7-1500', di: 6 * 16, imStations: 3 });
    expect(qty(three, 'imBundle')).toBe(3);
    expect([qty(three, 'buLight'), qty(three, 'buDark')]).toEqual([3, 3]); // 2 modules per station
    expect(three.notes.join(' ')).toMatch(/3 ET 200SP stations as requested/);
  });

  it('never below the minimum, never more stations than modules', () => {
    const tooFew = cfg({ family: 'S7-1500', di: 40 * 16, imStations: 1 });
    expect(tooFew.stations).toBe(2);
    expect(tooFew.notes.join(' ')).toMatch(/at least 2/);
    expect(cfg({ family: 'S7-1500', di: 32, imStations: 5 }).stations).toBe(2);
  });

  it('a thermocouple-only station opens on an A1 light BaseUnit', () => {
    // 2 DI modules + 2 TC modules over 2 stations → station 2 holds only TC modules
    const c = cfg({ family: 'S7-1500', di: 32, analog: an({ aiTc: 16 }), imStations: 2 });
    expect([qty(c, 'buLight'), qty(c, 'buDark'), qty(c, 'buLightA1'), qty(c, 'buDarkA1')]).toEqual([1, 1, 1, 1]);
  });
});

describe('brand-neutral quotation descriptions', () => {
  it('every part has a generic description without the maker or model', () => {
    Object.values(SIEMENS_PARTS).forEach((p) => {
      expect(p.generic).toBeTruthy();
      expect(p.generic).not.toMatch(/SIMATIC|Siemens|SITOP|WinCC|SCALANCE|WAGO|TOPJOB|CAGE CLAMP|ET 200|EPSITRON/i);
    });
  });
  it('keeps the key rating so the item can still be sourced', () => {
    expect(SIEMENS_PARTS.tb2Level.generic).toBe('Terminal block, 2-level, 2.5 mm²');
    expect(SIEMENS_PARTS.relay.generic).toBe('Slim relay module, 24 V DC coil, 1 changeover contact, 6 A');
    expect(SIEMENS_PARTS.di16.generic).toBe('Digital input module, 16 x 24 V DC');
    expect(SIEMENS_PARTS.psu100s20.generic).toBe('Power supply 24 V DC, 20 A, 1-phase input');
    expect(SIEMENS_PARTS.cpu1513.generic).toBe('PLC CPU, PROFINET, 600 KB program, 2.5 MB data');
    expect(SIEMENS_PARTS.wagoSw8.generic).toBe('Industrial Ethernet switch, unmanaged, 8 x RJ45 10/100 Mbit/s');
  });
});

describe('optimizing: local expansion, cheapest module sizes, auto CPU, auto memory card', () => {
  const opt = (p: Partial<PlcInputs>) => cfg({ cpu: 'auto', expansion: 'auto', moduleSizes: 'auto', memCard: 'auto', terminals: false, ...p });

  it('S7-1200: I/O beyond on board goes on signal modules on the CPU — no ET 200SP', () => {
    // 1214C: 14 DI + 10 DQ on board; 30 DI → 16 left → SM 1221 DI16; 12 DQ → 2 left → SM 1222 DQ8
    const c = cfg({ family: 'S7-1200', di: 30, do: 12, expansion: 'auto', moduleSizes: 'auto' });
    expect(c.expansion).toBe('local');
    expect([qty(c, 'sm1221di16'), qty(c, 'sm1222dq8'), qty(c, 'imBundle'), qty(c, 'buLight')]).toEqual([1, 1, 0, 0]);
    expect(c.local).toMatchObject({ modules: 2, slots: 8 });
    expect(c.channels.di).toEqual({ needed: 30, provided: 30 });
  });

  it('signal board for a single leftover AI; RTD / TC / AQ signal modules', () => {
    const c = cfg({ family: 'S7-1200', expansion: 'auto', moduleSizes: 'auto', analog: an({ aiI: 1, aiRtd: 3, aiTc: 5, aoU: 3 }) });
    expect([qty(c, 'sb1231ai1'), qty(c, 'sm1231rtd4'), qty(c, 'sm1231tc8'), qty(c, 'sm1232aq4')]).toEqual([1, 1, 1, 1]);
  });

  it('more than 8 signal modules (or a 1211C with none) → ET 200SP', () => {
    expect(cfg({ family: 'S7-1200', di: 14 + 9 * 16, expansion: 'auto' }).expansion).toBe('et200sp');
    expect(cfg({ family: 'S7-1200', cpu: 'cpu1211', di: 10, expansion: 'auto' }).expansion).toBe('et200sp');
    const forced = cfg({ family: 'S7-1200', di: 14 + 9 * 16, expansion: 'local' });
    expect(forced.notes.join(' ')).toMatch(/Doesn't fit on the CPU/);
  });

  it('extra Modbus RTU ports on the S7-1200 use CM 1241 (left of the CPU)', () => {
    const c = cfg({ family: 'S7-1200', di: 20, expansion: 'auto', modbus: 'rtu', modbusPorts: 3 });
    expect([qty(c, 'cb1241'), qty(c, 'cm1241'), qty(c, 'cmPtp')]).toEqual([1, 2, 0]);
  });

  it('cheapest module mix on ET 200SP: 18 DI → DI16 + DI8, not 2 × DI16', () => {
    const c = cfg({ family: 'S7-1500', di: 18, moduleSizes: 'auto' });
    expect([qty(c, 'di16'), qty(c, 'di8')]).toEqual([1, 1]);
    expect(qty(cfg({ family: 'S7-1500', di: 18 }), 'di16')).toBe(2); // standard sizes only
    expect(qty(cfg({ family: 'S7-1500', analog: an({ aoU: 2 }), moduleSizes: 'auto' }), 'aq2')).toBe(1);
  });

  it('cheapestModules uses real prices when given', () => {
    const price = (k: string) => ({ a16: 100, a8: 70 } as Record<string, number>)[k] ?? 0;
    expect(cheapestModules(18, [{ key: 'a16', ch: 16 }, { key: 'a8', ch: 8 }], price)).toEqual({ a16: 1, a8: 1 });
    expect(cheapestModules(18, [{ key: 'a16', ch: 16 }, { key: 'a8', ch: 8 }], (k) => (k === 'a8' ? 30 : 100))).toEqual({ a8: 3 });
  });

  it('auto CPU: smallest S7-1200 class that fits, cheapest complete configuration', () => {
    expect(opt({ family: 'S7-1200', di: 10, do: 6 }).cpuKey).toBe('cpu1212');   // fits the 1212C on board
    expect(opt({ family: 'S7-1200', di: 30, do: 12 }).cpuKey).toBe('cpu1214');  // needs signal modules → 1214C
    const big = opt({ family: 'S7-1200', di: 200, do: 100 });
    expect(big.cpuKey).toBe('cpu1215');                                          // 330 channels → class 4
    expect(opt({ family: 'S7-1500', di: 2000 }).cpuKey).toBe('cpu1515');         // 2,200 channels → class 3
    expect(opt({ family: 'S7-1500', di: 40, failSafe: true }).cpuKey).toBe('cpu1511f');
    expect(opt({ family: 'S7-1500', di: 40 }).notes[0]).toMatch(/^Auto CPU:/);
  });

  it('auto memory card: 24 MB on S7-1500, 4 MB on S7-1200', () => {
    expect(qty(opt({ family: 'S7-1500', di: 16 }), 'memCard24')).toBe(1);
    expect(qty(opt({ family: 'S7-1200', di: 10, memoryCard: true }), 'memCard4')).toBe(1);
  });
});

describe('Siemens PLC — PROFINET cabling and 24 V UPS', () => {
  it('counts one cable per link: daisy-chain without switches, star + switch links with them', () => {
    const chain = cfg({ pnCabling: true, hmi: 'ktp700' });                     // CPU → HMI
    expect(chain.profinet).toEqual({ links: 1, patch: 1, field: 0, cableM: 0 });
    expect(qty(chain, 'pnPatch2m')).toBe(1);
    expect(qty(chain, 'pnCable')).toBe(0);

    // CPU + 6 SCADA stations on 2 switches: 7 device links + 1 switch-to-switch
    const star = cfg({ pnCabling: true, switchQty: 2, scada: 'wincc81', scadaQty: 6, pnFieldLinks: 6, pnFieldM: 40 });
    expect(star.profinet).toEqual({ links: 8, patch: 2, field: 6, cableM: Math.ceil(6 * 40 * 1.1) });
    expect(qty(star, 'pnPatch2m')).toBe(2);
    expect(qty(star, 'pnCable')).toBe(264);
    expect(qty(star, 'pnPlug')).toBe(12);
    expect(SIEMENS_PARTS.pnCable.uom).toBe('m');
  });

  it('adds no cabling for a lone CPU or when switched off', () => {
    expect(cfg({ pnCabling: true }).profinet).toBeNull();
    expect(cfg({ hmi: 'ktp700' }).profinet).toBeNull();
    expect(qty(cfg({ hmi: 'ktp700' }), 'pnPatch2m')).toBe(0);
  });

  it('sizes the UPS1600 by the buffered load and the UPS1100 battery by the backup time', () => {
    const small = cfg({ ups: true, upsMinutes: 10, di: 16 });
    expect(small.ups!.loadA).toBeGreaterThan(0);
    expect(small.ups!.ah).toBeCloseTo((small.ups!.loadA * 10) / 60 / 0.7, 1);
    expect(qty(small, 'ups10')).toBe(1);
    const bats = ['bat1_2', 'bat3_2', 'bat7', 'bat12'].filter((k) => qty(small, k) > 0);
    expect(bats).toHaveLength(1);

    // The whole 24 V load with many outputs needs a bigger unit; a long backup parallels 12 Ah modules.
    const all = cfg({ ups: true, upsLoad: 'all', upsMinutes: 120, family: 'S7-1500', do: 256 });
    expect(all.ups!.loadA).toBeGreaterThan(estimate24V({ ...DEFAULT_PLC_INPUTS, sparePct: 0, family: 'S7-1500', do: 256 }, all).totalA - 0.01);
    expect(qty(all, 'ups10')).toBe(0);
    expect(qty(all, 'bat12')).toBe(Math.ceil(all.ups!.ah / 12));
    expect(qty(all, 'bat1_2')).toBe(0);
  });

  it('adds no UPS unless asked', () => {
    const c = cfg({ di: 16 });
    expect(c.ups).toBeNull();
    expect(c.lines.some((l) => /^(ups|bat)/.test(l.key))).toBe(false);
  });
});
