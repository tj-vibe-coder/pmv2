import {
  pipesNeeded, junctionBoxesNeeded, computeEntryQuantities, aggregateEntries, blankEntry,
  supportsPerSegment, supportsNeeded, pecAccessories, resolveSlotPrice, SLOT_CATALOG_NO, MATERIAL_SLOTS,
} from './installationMaterials';

describe('pipesNeeded / junctionBoxesNeeded', () => {
  it('rounds up so the run is always fully covered', () => {
    // 100m / 3m = 33.33 -> 34 pipes (33 pipes only covers 99m)
    expect(pipesNeeded(100)).toBe(34);
    // 100m / 9m = 11.11 -> 12 junction boxes
    expect(junctionBoxesNeeded(100)).toBe(12);
  });

  it('handles an exact multiple without over-rounding', () => {
    expect(pipesNeeded(9)).toBe(3);
    expect(junctionBoxesNeeded(9)).toBe(1);
  });

  it('treats zero/negative length as needing nothing', () => {
    expect(pipesNeeded(0)).toBe(0);
    expect(pipesNeeded(-5)).toBe(0);
    expect(junctionBoxesNeeded(0)).toBe(0);
  });
});

describe('computeEntryQuantities', () => {
  it('tags accessories with the entry\'s own pipe size', () => {
    const e = { ...blankEntry(), lengthMeters: 100, pipeSize: '3/4"' as const, caddyClampQty: 5, lqtMeters: 10 };
    const qs = computeEntryQuantities(e);
    expect(qs.pipe_3q).toBe(34);
    expect(qs.junctionBox).toBe(12);
    expect(qs.caddyClamp_3q).toBe(5);
    expect(qs.lqt_3q).toBe(10);
    // No 1/2" or 1" slots should appear for a 3/4" run
    expect(qs.pipe_half).toBeUndefined();
    expect(qs.caddyClamp_1).toBeUndefined();
  });

  it('omits zero-quantity accessory slots entirely', () => {
    // Caddy-clamp mounting → no U-bolts / unistrut / angle bar; no equipment → no LQT.
    const e = { ...blankEntry(), lengthMeters: 30, pipeSize: '1/2"' as const, equipmentConnections: 0 };
    const qs = computeEntryQuantities(e);
    expect(qs.pipe_half).toBe(10);
    expect(qs.uBolt_half).toBeUndefined();
    expect(qs.unistrutChannel).toBeUndefined();
    expect(qs.straightConnector_half).toBeUndefined();
    expect(qs.lqt_half).toBeUndefined();
  });

  it('Unistrut Channel and Angle Bar are not size-specific', () => {
    const e = { ...blankEntry(), lengthMeters: 10, pipeSize: '1"' as const, unistrutChannelQty: 4, angleBarQty: 2 };
    const qs = computeEntryQuantities(e);
    expect(qs.unistrutChannel).toBe(4);
    expect(qs.angleBar_1).toBe(2);
  });
});

describe('aggregateEntries', () => {
  it('sums the same size across multiple runs', () => {
    const a = { ...blankEntry(), lengthMeters: 30, pipeSize: '1/2"' as const, caddyClampQty: 2 };
    const b = { ...blankEntry(), lengthMeters: 60, pipeSize: '1/2"' as const, caddyClampQty: 3 };
    const totals = aggregateEntries([a, b]);
    expect(totals.pipe_half).toBe(10 + 20); // 30/3=10, 60/3=20
    expect(totals.caddyClamp_half).toBe(5);
  });

  it('keeps different sizes as separate slots', () => {
    const a = { ...blankEntry(), lengthMeters: 30, pipeSize: '1/2"' as const };
    const b = { ...blankEntry(), lengthMeters: 30, pipeSize: '3/4"' as const };
    const totals = aggregateEntries([a, b]);
    expect(totals.pipe_half).toBe(10);
    expect(totals.pipe_3q).toBe(10);
  });

  it('an empty entry list aggregates to nothing', () => {
    expect(aggregateEntries([])).toEqual({});
  });
});

describe('PEC 2017 accessories', () => {
  it('supports: within 0.9 m of each box, max 3 m apart, per box-to-box segment', () => {
    expect(supportsPerSegment(9)).toBe(4);   // 9 m segment → 0.9 m, then ≤3 m spacing to 0.9 m from the far box
    expect(supportsPerSegment(1.5)).toBe(1); // short segment: one support serves both ends
    expect(supportsNeeded(9)).toBe(4);       // 1 box
    expect(supportsNeeded(100)).toBe(12 * supportsPerSegment(100 / 12));
    expect(supportsNeeded(0)).toBe(0);
  });

  it('more than 4 quarter bends adds pull points', () => {
    expect(junctionBoxesNeeded(9, 0)).toBe(1);
    expect(junctionBoxesNeeded(9, 4)).toBe(1);
    expect(junctionBoxesNeeded(9, 9)).toBe(3); // 9 bends → at least 3 segments of ≤4
  });

  it('computes every accessory — nothing is optional', () => {
    const clamp = pecAccessories({ lengthMeters: 30, bends90: 0, equipmentConnections: 2, mounting: 'clamp' });
    expect(clamp.lqtMeters).toBe(1.8);
    expect(clamp.straightConnectorQty).toBe(4);
    expect(clamp.caddyClampQty).toBe(supportsNeeded(30));
    expect(clamp.uBoltQty).toBe(0);
    const strut = pecAccessories({ lengthMeters: 30, bends90: 0, equipmentConnections: 1, mounting: 'unistrut' });
    const sup = supportsNeeded(30);
    expect(strut.uBoltQty).toBe(sup);
    expect(strut.caddyClampQty).toBe(0);
    expect(strut.unistrutChannelQty).toBe(Math.ceil((sup * 0.3) / 3));
    expect(strut.angleBarQty).toBe(Math.ceil((sup * 0.6) / 6));
  });

  it('an override replaces the PEC figure; null goes back to it', () => {
    const e = { ...blankEntry(), lengthMeters: 30, pipeSize: '1/2"' as const };
    expect(computeEntryQuantities(e).caddyClamp_half).toBe(supportsNeeded(30));
    expect(computeEntryQuantities({ ...e, caddyClampQty: 7 }).caddyClamp_half).toBe(7);
    expect(computeEntryQuantities({ ...e, lqtMeters: 0 }).lqt_half).toBeUndefined();
  });
});

describe('resolveSlotPrice', () => {
  const catalog = [
    { catalogNo: 'IMC-0.5', description: 'IMC Pipe 1/2"', brand: 'Panasonic', sellingPrice: 392.5, pricelistDate: '2026-01' },
    { catalogNo: 'IMC-0.5', description: 'IMC Pipe 1/2"', brand: 'Panasonic', sellingPrice: 410, pricelistDate: '2026-07' },
    { catalogNo: 'CADDY-0.5', description: 'Unistrut Caddy Clamp - 1/2"', brand: 'Mcgill', sellingPrice: 16.5 },
  ];
  it('uses the catalog price (newest pricelist) when no preset price is set', () => {
    const p = resolveSlotPrice('pipe_half', {}, catalog);
    expect(p).toMatchObject({ unitCost: 410, brand: 'Panasonic', partNo: 'IMC-0.5', source: 'catalog' });
  });
  it('a preset price wins over the catalog', () => {
    const p = resolveSlotPrice('caddyClamp_half', { caddyClamp_half: { unitCost: 20, brand: 'Local' } }, catalog);
    expect(p).toMatchObject({ unitCost: 20, brand: 'Local', source: 'preset' });
  });
  it('a ₱0 preset falls through to the catalog; nothing found = not priced', () => {
    expect(resolveSlotPrice('caddyClamp_half', { caddyClamp_half: { unitCost: 0 } }, catalog).source).toBe('catalog');
    expect(resolveSlotPrice('uBolt_1', {}, catalog)).toMatchObject({ unitCost: 0, source: 'none' });
  });
  it('every material slot has a catalog number', () => {
    expect(Object.keys(SLOT_CATALOG_NO).sort()).toEqual(MATERIAL_SLOTS.map((s) => s.key).sort());
  });
});

describe('IMC vs EMT', () => {
  const base = { ...blankEntry(), lengthMeters: 30, pipeSize: '3/4"' as const };
  // 30 m → 10 sticks, 4 box-to-box segments → 6 joints, 8 box entries

  it('IMC: IMC pipe (comes with couplings), locknut with bushing per box entry', () => {
    const qs = computeEntryQuantities({ ...base, conduitType: 'IMC' });
    expect(qs.pipe_3q).toBe(10);
    expect(qs.imcCoupling_3q).toBeUndefined(); // each IMC length is bought with its coupling
    expect(computeEntryQuantities({ ...base, conduitType: 'IMC', couplingQty: 4 }).imcCoupling_3q).toBe(4);
    expect(qs.locknut_3q).toBe(8);
    expect(qs.emtPipe_3q).toBeUndefined();
    expect(qs.emtConnector_3q).toBeUndefined();
  });

  it('EMT: EMT pipe, EMT couplings, EMT connector per box entry — same PEC supports', () => {
    const qs = computeEntryQuantities({ ...base, conduitType: 'EMT' });
    expect(qs.emtPipe_3q).toBe(10);
    expect(qs.emtCoupling_3q).toBe(6);
    expect(qs.emtConnector_3q).toBe(8);
    expect(qs.pipe_3q).toBeUndefined();
    expect(qs.locknut_3q).toBeUndefined();
    expect(qs.caddyClamp_3q).toBe(computeEntryQuantities({ ...base, conduitType: 'IMC' }).caddyClamp_3q);
  });

  it('a single short stick needs no coupling', () => {
    const qs = computeEntryQuantities({ ...base, lengthMeters: 2.5, conduitType: 'EMT' });
    expect(qs.emtCoupling_3q).toBeUndefined();
    expect(qs.emtConnector_3q).toBe(2);
  });

  it('IMC box entries use locknut with bushing', () => {
    const qs = computeEntryQuantities({ ...base, lengthMeters: 2.5 });
    expect(qs.locknut_3q).toBe(2);
  });

  it('EMT pipe, connector and IMC fittings price from the catalog', () => {
    const cat = [
      { catalogNo: 'EMT-0.75', description: 'EMT Pipe 3/4"', brand: 'Panasonic', sellingPrice: 537.5 },
      { catalogNo: 'EMTCON-0.75', description: 'EMT Connector - 3/4"', brand: 'Panasonic', sellingPrice: 20 },
      { catalogNo: 'LOCKNUT-0.75', description: 'Lock nut with bushing - 3/4"', brand: 'Panasonic', sellingPrice: 15.55 },
    ];
    expect(resolveSlotPrice('emtPipe_3q', {}, cat)).toMatchObject({ unitCost: 537.5, source: 'catalog' });
    expect(resolveSlotPrice('emtConnector_3q', {}, cat).unitCost).toBe(20);
    expect(resolveSlotPrice('locknut_3q', {}, cat).unitCost).toBe(15.55);
    expect(resolveSlotPrice('emtCoupling_3q', {}, cat).source).toBe('none'); // not in the pricelist yet
  });
});

describe('sizes up to 2"', () => {
  it('every size-specific material exists for all six sizes, with a catalog number', () => {
    for (const fam of ['pipe', 'emtPipe', 'emtCoupling', 'locknut', 'emtConnector', 'lqt', 'straightConnector', 'caddyClamp', 'uBolt']) {
      for (const k of ['half', '3q', '1', '1q', '1h', '2']) expect(SLOT_CATALOG_NO[`${fam}_${k}` as keyof typeof SLOT_CATALOG_NO]).toBeTruthy();
    }
    expect(SLOT_CATALOG_NO.pipe_2).toBe('IMC-2');
    expect(SLOT_CATALOG_NO.emtCoupling_1h).toBe('EMTCPL-1.5');
    expect(SLOT_CATALOG_NO.pipe_half).toBe('IMC-0.5'); // existing keys + numbers unchanged
  });

  it('boxes are sized to the conduit: 4x4 up to 1", 6x6x4 for 1-1/4"–1-1/2", 8x8x4 for 2"', () => {
    const q = (size: '1"' | '1-1/4"' | '1-1/2"' | '2"') => computeEntryQuantities({ ...blankEntry(), lengthMeters: 18, pipeSize: size });
    expect(q('1"').junctionBox).toBe(2);
    expect(q('1-1/4"').pullBox6).toBe(2);
    expect(q('1-1/2"').pullBox6).toBe(2);
    expect(q('2"').pullBox8).toBe(2);
    expect(q('2"').junctionBox).toBeUndefined();
  });

  it('a 2" EMT run gets 2" materials', () => {
    const qs = computeEntryQuantities({ ...blankEntry(), lengthMeters: 30, pipeSize: '2"', conduitType: 'EMT' });
    expect(qs.emtPipe_2).toBe(10);
    expect(qs.emtCoupling_2).toBe(6);
    expect(qs.emtConnector_2).toBe(8);
    expect(qs.caddyClamp_2).toBe(supportsNeeded(30));
  });
});
