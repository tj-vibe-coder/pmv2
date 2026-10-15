import fixture from './__fixtures__/lq016-physical-order.json';
import { sortLiquidationRows, withPhysicalItemNumbers, receiptRowLabel, makeLiquidationReceiptFilename } from './receiptRows';
const rows = withPhysicalItemNumbers([{ id: 'later', date: '2026-10-15', amount: 100, particulars: 'Parking' },
  { id: 'earlier', date: '2026-10-01', amount: 200, particulars: 'Fuel' },
  { id: 'same-day', date: '2026-10-01', amount: 50, particulars: 'Toll' },
  { id: 'undated', date: '', amount: 0, particulars: '' }]);
test('oldest first, same-date order stable, blanks last without mutating saved rows', () => {
  expect(sortLiquidationRows(rows).map(r => r.id)).toEqual(['earlier', 'same-day', 'later', 'undated']);
  expect(rows[0].id).toBe('later');
  expect(sortLiquidationRows(rows, { key: 'date', direction: 'desc' }).map(r => r.id)).toEqual(['later', 'earlier', 'same-day', 'undated']);
});
test('receipt labels follow stable row identity in the current display/export order', () => {
  expect(receiptRowLabel(sortLiquidationRows(rows), 'later')).toBe('Item 3 · Parking');
  expect(receiptRowLabel(sortLiquidationRows(rows, { key: 'amount', direction: 'desc' }), 'later')).toBe('Item 3 · Parking');
  expect(receiptRowLabel(sortLiquidationRows(rows), 'earlier')).toBe('Item 1 · Fuel');
  expect(receiptRowLabel(rows, 'deleted')).toBe('Unlinked receipt');
});


test('new receipt filenames use form/date/particulars, one extension and preserved uniqueness', () => {
  const input = { formNo: 'LQ26-022-RJR', date: '2026-10-01', particulars: 'Fuel: project / visit', file: { name: 'photo.pdf.pdf', type: 'application/pdf' }, uniqueId: 'rcpt-1792033062001-unique' };
  expect(makeLiquidationReceiptFilename(input)).toBe('LQ26-022-RJR_2026-10-01_Fuel project visit_rcpt-1792033062001-unique.pdf');
  const long = makeLiquidationReceiptFilename({ ...input, particulars: 'description'.repeat(60), uniqueId: 'rcpt-other' });
  expect(long.length).toBeLessThan(240); expect(long.endsWith('_rcpt-other.pdf')).toBe(true);
  expect(makeLiquidationReceiptFilename({ ...input, file: { name: 'photo.png', type: 'image/jpeg' } })).toMatch(/\.jpg$/);
});


test('LQ016 baseline agrees with all 27 verified physical references before correction', () => {
  const numbered = withPhysicalItemNumbers(fixture.rows);
  for (const row of numbered) expect(row.physicalItemNo).toBe(row.expectedPhysicalItemNo);
  const corrected = numbered.map(row => row.id === fixture.targetRowId ? { ...row, date: '2026-06-29', amount: 601 } : row);
  expect(sortLiquidationRows(corrected)[0].physicalItemNo).toBe(7);
  expect(receiptRowLabel(sortLiquidationRows(corrected), fixture.targetRowId)).toBe('Item 7');
  expect(sortLiquidationRows(corrected, { key: 'amount', direction: 'desc' }).find(row => row.id === fixture.targetRowId)?.physicalItemNo).toBe(7);
});
test('new numbered receipt filenames include the permanent physical reference', () => {
  expect(makeLiquidationReceiptFilename({ formNo: 'LQ26-016-KKS', date: '2026-06-29', particulars: 'Diesel', physicalItemNo: 7,
    file: { name: 'scan.pdf', type: 'application/pdf' }, uniqueId: 'unique' })).toBe('LQ26-016-KKS_Item-7_2026-06-29_Diesel_unique.pdf');
});
