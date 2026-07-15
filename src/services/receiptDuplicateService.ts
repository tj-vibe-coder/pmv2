import { API_BASE } from '../config/api';

// ── Normalization helpers (mirrors the server's matching rules exactly) ────

export const normInvoice = (s?: string | null): string =>
  (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const normSupplier = (s?: string | null): string =>
  (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Coerce to a finite number ONLY for actual numbers or non-empty numeric strings;
// null/undefined/''/NaN all return null (never coerce to 0, which would otherwise
// falsely match against unset/zero amounts). Mirrors server.js's toFiniteAmount —
// keep both in sync.
export const toFiniteAmount = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const amountsEqual = (a?: number | string | null, b?: number | string | null): boolean => {
  const na = toFiniteAmount(a);
  const nb = toFiniteAmount(b);
  return na !== null && nb !== null && Math.abs(na - nb) < 0.01;
};

// ── Types (matches the /api/receipts/check-duplicates contract) ───────────

export type DuplicateMatchSource = 'project_expense' | 'overhead_expense' | 'liquidation_row';
export type DuplicateMatchType = 'image_hash' | 'invoice' | 'content';

export interface DuplicateMatch {
  source: DuplicateMatchSource;
  id?: string;
  liquidationId?: string;
  formNo?: string;
  projectId?: string | null;
  projectName?: string | null;
  supplier?: string;
  invoiceNo?: string;
  amount?: number;
  date?: string;
  description?: string;
  matchType: DuplicateMatchType;
  createdBy?: string | null;
  createdAt?: string | null;
  /** True when the caller isn't authorized to see this record's details (another
   * user's data); all identifying fields above are omitted/null in that case. */
  redacted?: boolean;
}

export interface DuplicateCheckCandidate {
  key: string;
  supplier?: string;
  invoiceNo?: string;
  amount?: number;
  date?: string;
  imageHash?: string;
}

const MAX_CANDIDATES = 25;

// ── Image hashing ───────────────────────────────────────────────────────────

/**
 * SHA-256 hex digest of the raw bytes of a base64-encoded image (no data: URI
 * prefix). Must never throw — duplicate detection is best-effort and should
 * never break the scan flow (e.g. crypto.subtle is unavailable outside a
 * secure context/localhost-exception).
 */
export async function computeImageHash(base64: string): Promise<string> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return '';
    const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[receiptDuplicateService] computeImageHash failed:', err);
    return '';
  }
}

// ── Server-side check ───────────────────────────────────────────────────────

/**
 * Calls POST /api/receipts/check-duplicates once for a single chunk (<= MAX_CANDIDATES).
 * Never throws — any network/HTTP failure logs a console.warn and resolves to an empty
 * array so a failed chunk simply contributes nothing.
 */
async function checkDuplicatesChunk(
  chunk: DuplicateCheckCandidate[]
): Promise<{ key: string; matches: DuplicateMatch[] }[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
    const res = await fetch(`${API_BASE}/api/receipts/check-duplicates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ candidates: chunk }),
    });
    if (!res.ok) {
      console.warn('[receiptDuplicateService] check-duplicates returned', res.status);
      return [];
    }
    const data = await res.json().catch(() => ({} as { results?: { key: string; matches: DuplicateMatch[] }[] }));
    return Array.isArray(data.results) ? data.results : [];
  } catch (err) {
    console.warn('[receiptDuplicateService] check-duplicates failed:', err);
    return [];
  }
}

/**
 * Calls POST /api/receipts/check-duplicates, chunking candidates into groups of
 * MAX_CANDIDATES and posting each chunk sequentially, merging results into one Map.
 * Never throws — a failed chunk logs console.warn and contributes nothing, so callers
 * can treat duplicate checking as purely additive.
 */
export async function checkDuplicates(
  candidates: DuplicateCheckCandidate[]
): Promise<Map<string, DuplicateMatch[]>> {
  const result = new Map<string, DuplicateMatch[]>();
  if (!candidates.length) return result;
  for (let i = 0; i < candidates.length; i += MAX_CANDIDATES) {
    const chunk = candidates.slice(i, i + MAX_CANDIDATES);
    const results = await checkDuplicatesChunk(chunk);
    for (const r of results) {
      if (r && typeof r.key === 'string' && Array.isArray(r.matches)) {
        result.set(r.key, r.matches);
      }
    }
  }
  return result;
}

// ── Client-side (intra-batch / within-form) matcher ────────────────────────

/**
 * Pure client-side duplicate matcher for comparing a candidate against a
 * pool of other candidates already in memory (e.g. earlier items in the same
 * scan batch, or rows already on a liquidation form). Same three rules and
 * priority order as the server:
 *   1. image_hash — identical image hash
 *   2. invoice — same invoice number AND (same supplier OR same amount)
 *   3. content — same supplier AND same amount AND same date (all present)
 */
export function findLocalDuplicates(
  candidate: DuplicateCheckCandidate,
  others: DuplicateCheckCandidate[]
): DuplicateCheckCandidate[] {
  const matches: DuplicateCheckCandidate[] = [];
  const candHash = (candidate.imageHash || '').trim();
  const candInvoice = normInvoice(candidate.invoiceNo);
  const candSupplier = normSupplier(candidate.supplier);
  const candAmount = candidate.amount;
  const candDate = (candidate.date || '').trim();

  for (const other of others) {
    if (other === candidate || other.key === candidate.key) continue;

    if (candHash && other.imageHash && other.imageHash === candHash) {
      matches.push(other);
      continue;
    }

    if (candInvoice && normInvoice(other.invoiceNo) === candInvoice) {
      const otherSupplier = normSupplier(other.supplier);
      const sameSupplier = !!candSupplier && !!otherSupplier && candSupplier === otherSupplier;
      const sameAmount = amountsEqual(candAmount, other.amount);
      if (sameSupplier || sameAmount) {
        matches.push(other);
        continue;
      }
    }

    if (
      candSupplier && normSupplier(other.supplier) === candSupplier &&
      amountsEqual(candAmount, other.amount) &&
      candDate && other.date && other.date === candDate
    ) {
      matches.push(other);
    }
  }
  return matches;
}

// ── Human-readable summary ──────────────────────────────────────────────────

const peso = (n?: number): string =>
  typeof n === 'number' ? `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '₱—';

const sourceLabel = (match: DuplicateMatch): string => {
  switch (match.source) {
    case 'project_expense': return 'an existing project expense';
    case 'overhead_expense': return 'an existing overhead expense';
    case 'liquidation_row': return `liquidation ${match.formNo || match.liquidationId || 'row'}`;
    default: return 'an existing record';
  }
};

/** Short human sentence describing why a candidate was flagged as a possible duplicate. */
export function describeMatch(match: DuplicateMatch): string {
  if (match.redacted) {
    return 'Possible duplicate of a receipt recorded by another user (details hidden).';
  }
  const details = [peso(match.amount), match.supplier, match.date].filter(Boolean).join(', ');
  const suffix = details ? ` (${details})` : '';
  switch (match.matchType) {
    case 'image_hash':
      return `Same photo as ${sourceLabel(match)}${suffix}.`;
    case 'invoice':
      return `Invoice no. matches ${sourceLabel(match)}${suffix}.`;
    case 'content':
    default:
      return `Looks like the same receipt as ${sourceLabel(match)}${suffix}.`;
  }
}
