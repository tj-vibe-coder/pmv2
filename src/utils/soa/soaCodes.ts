import { format } from 'date-fns';

/**
 * Generate a standard Statement of Account reference number:
 * Format: `SOA{YYMM}{SEQ:3}-{CLIENT:3}-{REVISION:2}`
 * Example: `SOA2607001-ACT-00`
 */
export function soaCode(
  seq: number,
  clientCode: string,
  revision = '00',
  date: Date | string = new Date(),
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const yymm = format(isNaN(dateObj.getTime()) ? new Date() : dateObj, 'yyMM');
  const seqStr = String(seq).padStart(3, '0');
  const cli = (clientCode || 'ACT').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const rev = String(revision || '00').padStart(2, '0');
  return `SOA${yymm}${seqStr}-${cli}-${rev}`;
}

export interface ParsedSoaCode {
  prefix: string;
  yymm: string;
  seq: number;
  clientCode: string;
  revision: string;
  baseCode: string; // e.g. "SOA2607001-ACT"
}

/**
 * Parse an SOA code into its constituent parts.
 */
export function parseSoaCode(code: string): ParsedSoaCode | null {
  if (!code || typeof code !== 'string') return null;
  const match = code.trim().match(/^(SOA)(\d{4})(\d{3})-([A-Z0-9]{2,4})-(\d{2})$/i);
  if (!match) return null;

  return {
    prefix: match[1].toUpperCase(),
    yymm: match[2],
    seq: parseInt(match[3], 10),
    clientCode: match[4].toUpperCase(),
    revision: match[5],
    baseCode: `SOA${match[2]}${match[3]}-${match[4].toUpperCase()}`,
  };
}

/**
 * Scan a list of existing SOA codes and determine the next sequential number.
 * Can be scoped to a specific YYMM or global.
 */
export function nextSoaSequence(existingCodes: string[], targetYymm?: string): number {
  const seqs = existingCodes
    .map((c) => {
      const parsed = parseSoaCode(c);
      if (!parsed) return 0;
      if (targetYymm && parsed.yymm !== targetYymm) return 0;
      return parsed.seq;
    })
    .filter((n) => n > 0);

  return seqs.length > 0 ? Math.max(...seqs) + 1 : 1;
}

/**
 * Increment a 2-digit revision string: "00" -> "01", "01" -> "02"
 */
export function nextRevision(rev: string): string {
  const num = parseInt(rev, 10);
  if (isNaN(num)) return '01';
  return String(num + 1).padStart(2, '0');
}
