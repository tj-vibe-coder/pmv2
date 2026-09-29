import {
  pipesNeeded, junctionBoxesNeeded, computeEntryQuantities, aggregateEntries, blankEntry,
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
    const e = { ...blankEntry(), lengthMeters: 30, pipeSize: '1/2"' as const };
    const qs = computeEntryQuantities(e);
    expect(qs.pipe_half).toBe(10);
    expect(qs.caddyClamp_half).toBeUndefined();
    expect(qs.straightConnector_half).toBeUndefined();
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
