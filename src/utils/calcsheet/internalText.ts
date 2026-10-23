import type { Quotation } from '../../types/Quotation';

// Safety net for the printed text on a quotation: team-only wording ("budgetary", "[Pricelist: …]", "for supplier
// quote") belongs in a line's internal note, not in the fields that go on the PDF/Excel. This finds printed fields
// that look like they hold internal wording, so the editor can warn before an export. It only reports — it never
// changes or strips anything, because legitimate text can contain brackets.

export interface InternalTextFinding {
  section: 'General Requirements' | 'Components' | 'Services';
  /** The line's code (may be blank for header rows). */
  code: string;
  /** Which printed field it was found in. */
  field: 'description' | 'subheader' | 'brand' | 'partNo' | 'group';
  /** The field's text, as printed. */
  text: string;
  /** What looked internal: bracket tags like "[Not in pricelist]" and/or the flagged words. */
  matches: string[];
}

const BRACKET_TAG = /\[[^\]]*\]/g;
// Words that mark price-provenance / internal wording. Case-insensitive.
const INTERNAL_WORDS = /budgetary|for supplier quote|supplier quote|price ?list/gi;

function scan(text: string): string[] {
  const found = [...(text.match(BRACKET_TAG) ?? []), ...(text.match(INTERNAL_WORDS) ?? [])];
  // Listed once each, ignoring case ("Budgetary" and "budgetary" are the same flag).
  const seen = new Map<string, string>();
  found.forEach((m) => { const t = m.trim(); if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t); });
  return Array.from(seen.values());
}

type Printable = { code?: string; description?: string; subheader?: string; brand?: string; partNo?: string; group?: string };

function collect(section: InternalTextFinding['section'], lines: Printable[] | undefined, fields: InternalTextFinding['field'][]): InternalTextFinding[] {
  const out: InternalTextFinding[] = [];
  for (const line of lines ?? []) {
    for (const field of fields) {
      const text = line[field];
      if (typeof text !== 'string' || !text.trim()) continue;
      const matches = scan(text);
      if (matches.length) out.push({ section, code: line.code ?? '', field, text, matches });
    }
  }
  return out;
}

export function findInternalLookingText(q: Pick<Quotation, 'generalReqts' | 'components' | 'services'>): InternalTextFinding[] {
  return [
    ...collect('General Requirements', q.generalReqts, ['description']),
    ...collect('Components', q.components, ['description', 'subheader', 'brand', 'partNo', 'group']),
    ...collect('Services', q.services, ['description', 'subheader', 'group']),
  ];
}
