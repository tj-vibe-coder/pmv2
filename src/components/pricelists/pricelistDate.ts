// Pricelist timestamps are ISO strings for manually-entered items but Firestore
// Timestamp objects ({_seconds}) for script-seeded ones — normalize both.
type TS = string | { _seconds?: number; seconds?: number } | undefined | null;

export function toDate(v: TS): Date | null {
  if (!v) return null;
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  const s = v._seconds ?? v.seconds;
  return s ? new Date(s * 1000) : null;
}

export function fmtDate(v: TS): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function fmtDateTime(v: TS): string {
  const d = toDate(v);
  return d ? d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
