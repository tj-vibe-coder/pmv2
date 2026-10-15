export type RowSort = { key: 'date' | 'amount'; direction: 'asc' | 'desc' };
export const DEFAULT_ROW_SORT: RowSort = { key: 'date', direction: 'asc' };

export function sortLiquidationRows<T extends { id: string; date: string; amount: number }>(rows: readonly T[], sort: RowSort = DEFAULT_ROW_SORT): T[] {
  return [...rows].sort((a, b) => {
    // Undated rows stay at the end in either direction so blanks don't lead review.
    if (sort.key === 'date') {
      if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0;
      const comparison = a.date.localeCompare(b.date);
      return sort.direction === 'asc' ? comparison : -comparison;
    }
    const comparison = (Number(a.amount) || 0) - (Number(b.amount) || 0);
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

export function receiptRowLabel(rows: readonly { id: string; particulars?: string; physicalItemNo?: number }[], rowId: string): string {
  const index = rows.findIndex(row => row.id === rowId);
  if (index < 0) return 'Unlinked receipt';
  const details = (rows[index].particulars || '').trim();
  return `Item ${rows[index].physicalItemNo ?? '—'}${details ? ` · ${details}` : ''}`;
}

/** Freeze legacy print chronology once on load, never after a date/sort edit. */
export function withPhysicalItemNumbers<T extends { id: string; date: string; amount: number; physicalItemNo?: number }>(rows: readonly T[]): (T & { physicalItemNo: number })[] {
  const numbers = new Map<string, number>();
  const reserved = new Set<number>();
  for (const row of rows) {
    if (row.physicalItemNo !== undefined) {
      if (!Number.isSafeInteger(row.physicalItemNo) || row.physicalItemNo < 1 || reserved.has(row.physicalItemNo)) throw new Error('Invalid physical item numbering; reload the liquidation');
      numbers.set(row.id, row.physicalItemNo); reserved.add(row.physicalItemNo);
    }
  }
  let next = Math.max(0, ...Array.from(reserved)) + 1;
  const baseline = numbers.size ? rows : sortLiquidationRows(rows);
  for (const row of baseline) if (!numbers.has(row.id)) numbers.set(row.id, next++);
  return rows.map(row => ({ ...row, physicalItemNo: numbers.get(row.id)! }));
}

/** Human-readable new-upload name; row numbering stays a live label, not file identity. */
export function makeLiquidationReceiptFilename({ formNo, date, particulars, file, uniqueId, physicalItemNo }: {
  formNo?: string; date?: string; particulars?: string; file: Pick<File, 'name' | 'type'>; uniqueId: string; physicalItemNo?: number;
}): string {
  const safe = (value: string, limit: number) => value.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, limit);
  const extension = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf'
    : file.type === 'image/jpeg' ? 'jpg' : file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1].toLowerCase() || 'jpg';
  const item = Number.isSafeInteger(physicalItemNo) && (physicalItemNo || 0) > 0 ? `_Item-${physicalItemNo}` : '';
  return `${safe(formNo || 'draft', 40) || 'draft'}${item}_${safe(date || 'undated', 10) || 'undated'}_${safe(particulars || 'Receipt', 80) || 'Receipt'}_${safe(uniqueId, 60)}.${extension}`;
}
