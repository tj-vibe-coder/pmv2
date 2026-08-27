import { soaCode, parseSoaCode, nextSoaSequence, nextRevision } from './soaCodes';

describe('soaCodes utility', () => {
  it('generates a formatted SOA code', () => {
    const fixedDate = new Date('2026-07-02T10:00:00Z');
    const code = soaCode(1, 'ACT', '00', fixedDate);
    expect(code).toBe('SOA2607001-ACT-00');
  });

  it('pads client codes and sequence numbers properly', () => {
    const fixedDate = new Date('2026-08-15T10:00:00Z');
    const code = soaCode(42, 'AD', '01', fixedDate);
    expect(code).toBe('SOA2608042-ADX-01');
  });

  it('parses valid SOA codes', () => {
    const parsed = parseSoaCode('SOA2607001-ACT-00');
    expect(parsed).toEqual({
      prefix: 'SOA',
      yymm: '2607',
      seq: 1,
      clientCode: 'ACT',
      revision: '00',
      baseCode: 'SOA2607001-ACT',
    });
  });

  it('returns null for invalid codes', () => {
    expect(parseSoaCode('INVALID-CODE')).toBeNull();
    expect(parseSoaCode('')).toBeNull();
  });

  it('calculates the next sequence correctly', () => {
    const existing = [
      'SOA2607001-ACT-00',
      'SOA2607002-ACT-00',
      'SOA2607003-ACT-01',
    ];
    expect(nextSoaSequence(existing, '2607')).toBe(4);
    expect(nextSoaSequence(existing, '2608')).toBe(1);
  });

  it('increments revision numbers', () => {
    expect(nextRevision('00')).toBe('01');
    expect(nextRevision('01')).toBe('02');
    expect(nextRevision('09')).toBe('10');
  });
});
