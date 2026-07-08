/**
 * Parity guard: server.js's quotationGrandTotal (used by the calcsheet →
 * Project List sync to seed contract_amount) must match the real calc engine
 * (computeTotals) for every quotation shape. The server function is a plain-JS
 * port because functions deploy copies only server.js; this test extracts its
 * source from server.js and runs it against calc.ts on shared fixtures, so any
 * future drift between the two implementations fails CI instead of silently
 * writing wrong contract amounts (the ₱208,600-vs-₱350,000 bug of 2026-07-08).
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeTotals } from './calc';
import type { Quotation } from '../../types/Quotation';

// ── Extract quotationGrandTotal from server.js ────────────────────────────────
// Brace-matching extraction; the function is written brace-safe (no braces in
// string literals) to keep this simple.
function extractServerFn(): (q: unknown) => number {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.js'), 'utf8');
  const start = serverSrc.indexOf('function quotationGrandTotal(');
  if (start === -1) throw new Error('quotationGrandTotal not found in server.js');
  const open = serverSrc.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < serverSrc.length; i++) {
    if (serverSrc[i] === '{') depth++;
    else if (serverSrc[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error('Unbalanced braces extracting quotationGrandTotal');
  const fnSrc = serverSrc.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${fnSrc}; return quotationGrandTotal;`)() as (q: unknown) => number;
}

const serverGrandTotal = extractServerFn();

// ── Fixtures ──────────────────────────────────────────────────────────────────
const baseQuotation = {
  id: 'q1',
  projectId: 'p1',
  kind: 'IOCT',
  revision: '0',
  formulaVersion: 'current',
  generalReqts: [],
  components: [],
  manpower: [],
  services: [],
  laborRates: [],
  productMarkupPct: 0,
  generalReqMarkupPct: 0,
  laborMarkupPct: 0,
  discountPct: 0,
  vatPct: 12,
} as unknown as Quotation;

const q = (over: Record<string, unknown>): Quotation =>
  ({ ...(baseQuotation as unknown as Record<string, unknown>), ...over } as unknown as Quotation);

const manpower = [
  { id: 'm1', role: 'Engineer', headcount: 2, mandays: 10, dailyRate: 2500, allowance: 500 },
  { id: 'm2', role: 'Tech', headcount: 1, mandays: 8, dailyRate: 1500, allowance: 300 },
];

const FIXTURES: Array<[string, Quotation]> = [
  [
    'services from manpower with labor markup (the ₱208,600 bug)',
    q({ servicesFromManpower: true, manpower, laborMarkupPct: 40 }),
  ],
  [
    'services from manpower with engineeringServicesQty lot export',
    q({ servicesFromManpower: true, manpower, laborMarkupPct: 25, engineeringServicesQty: 3 }),
  ],
  [
    'per-line services pricing (amounts override manpower cost)',
    q({
      servicesFromManpower: true,
      servicesPerLinePricing: true,
      manpower,
      services: [
        { id: 's1', description: 'Commissioning', days: 5, amount: 150000 },
        { id: 's2', description: 'Programming', days: 10, amount: 200000 },
      ],
    }),
  ],
  [
    'manual services lines with servicesFromManpower undefined',
    q({ services: [{ id: 's1', description: 'Lump sum', amount: 120000 }] }),
  ],
  [
    'per-line general-req and component markups + discount',
    q({
      generalReqts: [
        { id: 'g1', code: 'A', description: 'Mob', unitPrice: 10000, qty: 2, markupPct: 15 },
        { id: 'g2', code: 'B', description: 'Docs', unitPrice: 5000, qty: 1 },
      ],
      generalReqMarkupPct: 10,
      components: [
        { id: 'c1', description: 'PLC', unitCost: 100000, forex: 1, qty: 1, contingencyPct: 5, discountPct: 3, markupPct: 20 },
        { id: 'c2', description: 'HMI', unitCost: 500, forex: 58.5, qty: 2, contingencyPct: 0, discountPct: 0 },
      ],
      productMarkupPct: 25,
      discountPct: 2,
    }),
  ],
  [
    'general requirements exported as lot',
    q({
      generalReqts: [{ id: 'g1', code: 'A', description: 'Mob', unitPrice: 10000, qty: 2 }],
      generalReqMarkupPct: 10,
      exportGeneralReqtsAsLot: true,
      generalReqtsExportQty: 2,
    }),
  ],
  [
    'legacy without snapshot (additive contingency-discount, per-role labor contingency)',
    q({
      formulaVersion: 'legacy',
      globalContingencyPct: 10,
      generalReqts: [{ id: 'g1', code: 'A', description: 'Mob', unitPrice: 10000, qty: 1 }],
      generalReqMarkupPct: 10,
      components: [
        { id: 'c1', description: 'PLC', unitCost: 100000, forex: 1, qty: 1, contingencyPct: 8, discountPct: 3 },
      ],
      productMarkupPct: 25,
      servicesFromManpower: true,
      manpower,
      laborMarkupPct: 30,
    }),
  ],
  [
    'legacy without snapshot, baked general-req contingency',
    q({
      formulaVersion: 'legacy',
      globalContingencyPct: 10,
      generalReqContingencyMode: 'baked',
      generalReqts: [{ id: 'g1', code: 'A', description: 'Mob', unitPrice: 10000, qty: 1 }],
      generalReqMarkupPct: 10,
      servicesFromManpower: true,
      manpower,
    }),
  ],
];

describe('server.js quotationGrandTotal parity with calc.ts computeTotals', () => {
  it.each(FIXTURES)('%s', (_name, quotation) => {
    expect(serverGrandTotal(quotation)).toBeCloseTo(computeTotals(quotation).grandTotal, 6);
  });

  it('legacy with snapshot returns the frozen grand total', () => {
    const legacy = q({
      formulaVersion: 'legacy',
      legacyTotalsSnapshot: { grandTotal: 350000 },
      manpower,
      servicesFromManpower: true,
      laborMarkupPct: 40,
    });
    expect(serverGrandTotal(legacy)).toBe(350000);
    expect(computeTotals(legacy).grandTotal).toBe(350000);
  });
});
