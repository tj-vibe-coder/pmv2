import { buildProjectListWorkbook, ProjectListExportRow } from './xlsxExport';

const rows: ProjectListExportRow[] = [
  {
    code: 'PCS2601001-ABC-00', name: 'Line 3 automation', customer: 'ABC Corp',
    partner: 'ACTI', date: '05 Jan 2026', status: 'sent', ongoing: 'Yes', notes: 'follow up',
  },
  {
    code: 'PCS2601002-XYZ-00', name: 'SCADA upgrade', customer: 'XYZ Inc',
    partner: '', date: '', status: 'draft', ongoing: '—', notes: '',
  },
];

test('workbook has a Projects sheet with header + one row per project', () => {
  const ws = buildProjectListWorkbook(rows).getWorksheet('Projects')!;
  expect(ws).toBeTruthy();
  expect(ws.getRow(1).getCell(1).value).toBe('Code');
  expect(ws.getRow(1).getCell(8).value).toBe('Updated Status');
  expect(ws.rowCount).toBe(3);
  expect(ws.getRow(2).getCell(1).value).toBe('PCS2601001-ABC-00');
  expect(ws.getRow(2).getCell(6).value).toBe('sent');
  expect(ws.getRow(3).getCell(3).value).toBe('XYZ Inc');
  expect(ws.getRow(3).getCell(7).value).toBe('—');
});

test('Updated Status data cells start blank and carry the status dropdown', () => {
  const ws = buildProjectListWorkbook(rows).getWorksheet('Projects')!;
  for (const r of [2, 3]) {
    const cell = ws.getRow(r).getCell(8);
    expect(cell.value ?? null).toBeNull();
    expect(cell.dataValidation).toMatchObject({
      type: 'list',
      allowBlank: true,
      formulae: ['"draft,sent,won,lost,inactive"'],
    });
  }
});

test('header row is bold, frozen, and autofiltered across all 10 columns', () => {
  const ws = buildProjectListWorkbook(rows).getWorksheet('Projects')!;
  expect(ws.getRow(1).font).toMatchObject({ bold: true });
  expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  expect(ws.autoFilter).toBeTruthy();
});
