import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { Project } from '../../types/Quotation';
import { SCHEDULE_CATEGORY_COLORS, type ScheduleTask } from '../../types/ScheduleTask';
import { addDays, daysBetween, durationOf, formatLocalDate, MS_PER_DAY, toDate } from './scheduleDates';

const PRIMARY = '#2c5aa0';
const TEXT = '#222';
const TEXT_LIGHT = '#666';
const BORDER = '#ccc';
const SECTION_BG = '#EAF0F8';

// A4 landscape, in points.
const PAGE_WIDTH = 841.89;
const MARGIN = 28;
const LABEL_WIDTH = 150;

const styles = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: 36, paddingHorizontal: MARGIN, fontSize: 8, fontFamily: 'Helvetica', color: TEXT },
  title: { fontSize: 16, fontWeight: 700, color: PRIMARY, marginBottom: 2 },
  subtitle: { fontSize: 9, color: TEXT_LIGHT, marginBottom: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  legendSwatch: { width: 7, height: 7, borderRadius: 1, marginRight: 3 },
  legendLabel: { fontSize: 7, color: TEXT_LIGHT },
  ganttRow: { flexDirection: 'row' },
  monthHeaderCell: { height: 16, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0.75, borderColor: BORDER, backgroundColor: SECTION_BG },
  taskLabelRow: { height: 15, justifyContent: 'center', borderBottomWidth: 0.5, borderColor: '#eee', paddingRight: 4 },
  sectionBar: { backgroundColor: PRIMARY, color: 'white', fontWeight: 700, fontSize: 9, padding: '3 6', marginTop: 16, marginBottom: 4 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: SECTION_BG, borderBottomWidth: 0.75, borderColor: BORDER, paddingVertical: 3 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#eee', paddingVertical: 3 },
  th: { fontSize: 7.5, fontWeight: 700, color: TEXT_LIGHT, paddingHorizontal: 3 },
  td: { fontSize: 7.5, paddingHorizontal: 3 },
});

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

function buildMonths(range: { start: Date; end: Date }, totalDays: number): { label: string; days: number }[] {
  const out: { label: string; days: number }[] = [];
  let cursorStr = formatLocalDate(range.start);
  for (let i = 0; i < totalDays; i++) {
    const label = toDate(cursorStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    if (out.length === 0 || out[out.length - 1].label !== label) {
      out.push({ label, days: 1 });
    } else {
      out[out.length - 1].days += 1;
    }
    cursorStr = addDays(cursorStr, 1);
  }
  return out;
}

function categoryOf(t: ScheduleTask): string { return t.category || 'Other'; }
function colorOf(t: ScheduleTask): string { return SCHEDULE_CATEGORY_COLORS[categoryOf(t)] || '#8e8e93'; }

function ScheduleDoc({ project, tasks }: { project: Project; tasks: ScheduleTask[] }) {
  const range = computeRange(tasks);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const available = PAGE_WIDTH - MARGIN * 2 - LABEL_WIDTH;
  const dayWidth = Math.max(3, Math.min(16, available / totalDays));
  const months = buildMonths(range, totalDays);

  const categoriesUsed = Array.from(new Set(tasks.map(categoryOf)));

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Work Schedule</Text>
        <Text style={styles.subtitle}>{project.code} — {project.name}</Text>

        {categoriesUsed.length > 0 && (
          <View style={styles.legendRow}>
            {categoriesUsed.map((c) => (
              <View key={c} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: SCHEDULE_CATEGORY_COLORS[c] || '#8e8e93' }]} />
                <Text style={styles.legendLabel}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.ganttRow}>
          <View style={{ width: LABEL_WIDTH }}>
            <View style={styles.monthHeaderCell}><Text style={{ fontSize: 7, fontWeight: 700 }}>Task</Text></View>
            {tasks.map((t) => (
              <View key={t.id} style={styles.taskLabelRow}>
                <Text style={{ fontSize: 7, fontWeight: t.isMilestone ? 700 : 400 }}>{t.name}</Text>
              </View>
            ))}
          </View>
          <View style={{ width: totalDays * dayWidth, position: 'relative' }}>
            <View style={{ flexDirection: 'row', height: 16 }}>
              {months.map((m, i) => (
                <View key={i} style={{ width: m.days * dayWidth, borderRightWidth: 0.5, borderColor: BORDER, backgroundColor: SECTION_BG, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 6.5 }}>{m.label}</Text>
                </View>
              ))}
            </View>
            {tasks.map((t) => {
              const offset = daysBetween(range.start, toDate(t.startDate)) * dayWidth;
              const dur = t.isMilestone ? 1 : durationOf(t.startDate, t.endDate);
              const width = Math.max(dayWidth, dur * dayWidth);
              const color = colorOf(t);
              return (
                <View key={t.id} style={{ height: 15, position: 'relative', borderBottomWidth: 0.5, borderColor: '#eee' }}>
                  {t.isMilestone ? (
                    <View style={{
                      position: 'absolute', left: offset + dayWidth / 2 - 4, top: 3.5, width: 8, height: 8,
                      backgroundColor: color, transform: 'rotate(45deg)',
                    }}
                    />
                  ) : (
                    <View style={{
                      position: 'absolute', left: offset, top: 3, width, height: 9,
                      borderWidth: 0.75, borderColor: color, borderRadius: 1, overflow: 'hidden',
                    }}
                    >
                      <View style={{ width: `${Math.min(100, Math.max(0, t.progressPct))}%`, height: '100%', backgroundColor: color }} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionBar}>TASK LIST</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.th, { width: '30%' }]}>Task</Text>
          <Text style={[styles.th, { width: '14%' }]}>Category</Text>
          <Text style={[styles.th, { width: '12%' }]}>Start</Text>
          <Text style={[styles.th, { width: '12%' }]}>End</Text>
          <Text style={[styles.th, { width: '10%' }]}>Duration</Text>
          <Text style={[styles.th, { width: '10%' }]}>Progress</Text>
          <Text style={[styles.th, { width: '12%' }]}>Milestone</Text>
        </View>
        {tasks.map((t) => (
          <View key={t.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.td, { width: '30%' }]}>{t.name}</Text>
            <Text style={[styles.td, { width: '14%' }]}>{categoryOf(t)}</Text>
            <Text style={[styles.td, { width: '12%' }]}>{t.startDate}</Text>
            <Text style={[styles.td, { width: '12%' }]}>{t.isMilestone ? '—' : t.endDate}</Text>
            <Text style={[styles.td, { width: '10%' }]}>{t.isMilestone ? '—' : `${durationOf(t.startDate, t.endDate)}d`}</Text>
            <Text style={[styles.td, { width: '10%' }]}>{t.progressPct}%</Text>
            <Text style={[styles.td, { width: '12%' }]}>{t.isMilestone ? 'Yes' : ''}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function exportSchedulePdf(project: Project, tasks: ScheduleTask[]): Promise<void> {
  const blob = await pdf(<ScheduleDoc project={project} tasks={tasks} />).toBlob();
  saveAs(blob, `${project.code || 'schedule'}-work-schedule.pdf`);
}
