import { format } from 'date-fns';

export function quotationCode(seq: number, clientCode: string, revision = '00', date = new Date()): string {
  const yymm = format(date, 'yyMM');
  const seqStr = String(seq).padStart(3, '0');
  const cli = (clientCode || 'XXX').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `PCS${yymm}${seqStr}-${cli}-${revision}`;
}

export function nextItemCode(prefix: 'A' | 'B' | 'C', existing: string[]): string {
  const nums = existing
    .map((c) => {
      const m = c.match(/^[ABC]-(\d{4})$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 10;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// Returns the next available global sequence number, given a list of existing project codes.
// Looks for the {SEQ} portion in PCS{YYMM}{SEQ}-{CLI}-{REV} codes and returns max+1.
export function nextProjectSequence(existingCodes: string[]): number {
  const seqs = existingCodes
    .map((c) => {
      const m = c.match(/^PCS\d{4}(\d{3})-/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  return seqs.length ? Math.max(...seqs) + 1 : 1;
}

// Build a legacy project code preserving the historical year/month while using a
// freshly-assigned global sequence number. Used for ACTI-folder projects that
// never received a standard PCS code.
export function assignLegacyCode(yymm: string, seq: number, clientCode: string, revision = '00'): string {
  const cli = (clientCode || 'XXX').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `PCS${yymm}${String(seq).padStart(3, '0')}-${cli}-${revision}`;
}
