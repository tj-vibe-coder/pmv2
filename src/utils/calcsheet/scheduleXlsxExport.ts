import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Project } from '../../types/Quotation';
import { SCHEDULE_CATEGORY_COLORS, type ScheduleTask } from '../../types/ScheduleTask';
import { addDays, daysBetween, durationOf, formatLocalDate, MS_PER_DAY, toDate } from './scheduleDates';

function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

// Mix a category color toward white, used for the not-yet-completed portion
// of a task's bar so progress reads visually without a separate legend.
function lightenHex(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * factor);
  const toHex = (c: number) => c.toString(16).padStart(2, '0').toUpperCase();
  return `FF${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function computeRange(tasks: ScheduleTask[]): { start: Date; end: Date } {
  if (tasks.length === 0) {
    const start = new Date();
    return { start, end: new Date(start.getTime() + 13 * MS_PER_DAY) };
  }
  let min = toDate(tasks[0].startDate);
  let max = toDate(tasks[0].endDate);
  for (const t of tasks) {
    const s = toDate(t.startDate);
    const e = toDate(t.endDate);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  return { start: min, end: max };
}

export async function exportScheduleXlsx(project: Project, tasks: ScheduleTask[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IOCT Calcsheet';
  wb.created = new Date();

  // ── Tasks sheet ──────────────────────────────────────────────────────────
  const ts = wb.addWorksheet('Tasks', { properties: { defaultRowHeight: 16 } });
  ts.columns = [
    { header: 'Task', key: 'name', width: 36 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Milestone', key: 'milestone', width: 11 },
    { header: 'Start', key: 'start', width: 12 },
    { header: 'End', key: 'end', width: 12 },
    { header: 'Duration (days)', key: 'duration', width: 14 },
    { header: 'Progress (%)', key: 'progress', width: 12 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  const tsHeader = ts.getRow(1);
  tsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C5AA0' } };
  for (const t of tasks) {
    ts.addRow({
      name: t.name,
      category: t.category || 'Other',
      milestone: t.isMilestone ? 'Yes' : 'No',
      start: t.startDate,
      end: t.isMilestone ? '' : t.endDate,
      duration: t.isMilestone ? '' : durationOf(t.startDate, t.endDate),
      progress: t.progressPct,
      notes: t.notes || '',
    });
  }
  ts.autoFilter = { from: 'A1', to: 'H1' };

  // ── Gantt sheet ──────────────────────────────────────────────────────────
  const range = computeRange(tasks);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const gs = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  gs.getColumn(1).width = 32;

  const monthRow = gs.getRow(1);
  const dayRow = gs.getRow(2);
  monthRow.getCell(1).value = '';
  dayRow.getCell(1).value = 'Task';

  let cursorStr = formatLocalDate(range.start);
  let monthStartCol = 2;
  let curMonthLabel = toDate(cursorStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  for (let i = 0; i < totalDays; i++) {
    const col = 2 + i;
    const label = toDate(cursorStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    if (label !== curMonthLabel) {
      gs.mergeCells(1, monthStartCol, 1, col - 1);
      monthRow.getCell(monthStartCol).value = curMonthLabel;
      curMonthLabel = label;
      monthStartCol = col;
    }
    dayRow.getCell(col).value = toDate(cursorStr).getDate();
    gs.getColumn(col).width = 3;
    cursorStr = addDays(cursorStr, 1);
  }
  gs.mergeCells(1, monthStartCol, 1, 1 + totalDays);
  monthRow.getCell(monthStartCol).value = curMonthLabel;

  [monthRow, dayRow].forEach((r) => {
    r.eachCell((c) => {
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.font = { bold: true, size: 8 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF0F8' } };
    });
  });

  let rowIdx = 3;
  for (const t of tasks) {
    const row = gs.getRow(rowIdx);
    row.getCell(1).value = t.name;
    row.getCell(1).font = { bold: t.isMilestone };
    const color = SCHEDULE_CATEGORY_COLORS[t.category || 'Other'] || '#8e8e93';
    const startOffset = daysBetween(range.start, toDate(t.startDate));
    const dur = t.isMilestone ? 1 : durationOf(t.startDate, t.endDate);
    const completedDays = t.isMilestone ? 0 : Math.round(dur * (t.progressPct / 100));
    for (let d = 0; d < dur; d++) {
      const cell = row.getCell(2 + startOffset + d);
      const argb = d < completedDays ? hexToArgb(color) : lightenHex(color, 0.55);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      if (t.isMilestone) cell.value = '◆';
    }
    rowIdx++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, `${project.code || 'schedule'}-work-schedule.xlsx`);
}
