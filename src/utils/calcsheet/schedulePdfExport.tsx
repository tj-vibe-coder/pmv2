import { Document, Page, Text, View, Svg, Rect, Polygon, Path, Line, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { ScheduleTask } from '../../types/ScheduleTask';
import type { TreeRow } from './scheduleTree';
import { daysBetween, durationOf, toDate, todayStr, workingDaysBetween } from './scheduleDates';
import { dayAt, mspDate, snapRange, timescaleTiers, type GanttZoom, type TimescaleSeg } from './scheduleTimescale';

type ScheduleProjectRef = { code?: string; name?: string };

// A3 landscape, in points. Everything is scaled to land on this one page.
const PAGE_W = 1190.55;
const PAGE_H = 841.89;
const MARGIN = 28;
const HEADER_H = 46;
const FOOTER_H = 22;
const TIER_H = 13;
const MAX_ROW_H = 16;

const C = {
  text: '#262626',
  sub: '#595959',
  border: '#D4D4D4',
  headerBg: '#F3F3F3',
  primary: '#2c5aa0',
  bar: '#8CB1E3',
  barEdge: '#5F8FD1',
  progress: '#1F3F77',
  critBar: '#F4A3A3',
  critEdge: '#D65C5C',
  critProgress: '#9C0006',
  summary: '#262626',
  link: '#4472C4',
  critLink: '#C00000',
  nonWorking: '#EFEFEF',
  today: '#E07B00',
};

interface Col { key: string; label: string; w: number; align?: 'left' | 'right' | 'center' }
const COLS: Col[] = [
  { key: 'id', label: 'ID', w: 22, align: 'right' },
  { key: 'name', label: 'Task Name', w: 220 },
  { key: 'dur', label: 'Duration', w: 50 },
  { key: 'start', label: 'Start', w: 58 },
  { key: 'finish', label: 'Finish', w: 58 },
  { key: 'pred', label: 'Predecessors', w: 50 },
  { key: 'pct', label: '% Comp.', w: 36, align: 'right' },
];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0);
const CHART_W = PAGE_W - MARGIN * 2 - TABLE_W;

// Helvetica averages ~0.52em per character; trim with an ellipsis so a long
// value can't wrap and push the row taller than the page allows.
function fit(text: string, width: number, fontSize: number): string {
  const max = Math.max(1, Math.floor((width - 5) / (fontSize * 0.52)));
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

interface ExportOptions { workingDays: boolean; criticalIds?: Set<string> }

function ScheduleDoc({ project, rows, opts }: { project: ScheduleProjectRef; rows: TreeRow[]; opts: ExportOptions }) {
  const crit = opts.criticalIds ?? new Set<string>();
  const leaves = rows.filter((r) => !r.isSummary).map((r) => r.task);
  const spanTasks = leaves.length ? leaves : rows.map((r) => r.task);

  let rawStart = toDate(todayStr());
  let rawEnd = new Date(rawStart.getFullYear(), rawStart.getMonth(), rawStart.getDate() + 13);
  if (spanTasks.length) {
    rawStart = toDate(spanTasks[0].startDate);
    rawEnd = toDate(spanTasks[0].endDate);
    for (const t of spanTasks) {
      if (toDate(t.startDate) < rawStart) rawStart = toDate(t.startDate);
      if (toDate(t.endDate) > rawEnd) rawEnd = toDate(t.endDate);
    }
  }
  const est = CHART_W / Math.max(1, daysBetween(rawStart, rawEnd) + 1);
  const zoom: GanttZoom = est >= 14 ? 'day' : est >= 3 ? 'week' : 'month';
  const range = snapRange(rawStart, rawEnd, zoom);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const dayW = CHART_W / totalDays;
  const tiers = timescaleTiers(zoom, range.start, totalDays, dayW);

  const bodyAvail = PAGE_H - MARGIN * 2 - HEADER_H - FOOTER_H - TIER_H * 2 - 6;
  const rowH = Math.min(MAX_ROW_H, bodyAvail / Math.max(1, rows.length));
  const fs = Math.max(3, Math.min(8, rowH * 0.55));
  const bodyH = rows.length * rowH;

  const idNum = new Map(rows.map((r, i) => [r.task.id, i + 1]));
  const barGeom = (t: ScheduleTask) => ({
    left: daysBetween(range.start, toDate(t.startDate)) * dayW,
    width: Math.max(dayW, durationOf(t.startDate, t.endDate) * dayW),
  });
  const durLabel = (r: TreeRow) => {
    if (r.task.isMilestone && !r.isSummary) return '0 days';
    const n = r.isSummary || r.task.durationDays == null
      ? workingDaysBetween(r.task.startDate, r.task.endDate, opts.workingDays)
      : r.task.durationDays;
    return `${n} day${n === 1 ? '' : 's'}`;
  };

  // Project roll-up for the header line.
  let pStart = '';
  let pEnd = '';
  let wProg = 0;
  let wDays = 0;
  for (const t of leaves) {
    if (!pStart || t.startDate < pStart) pStart = t.startDate;
    if (!pEnd || t.endDate > pEnd) pEnd = t.endDate;
    const d = t.isMilestone ? 1 : durationOf(t.startDate, t.endDate);
    wProg += (t.progressPct || 0) * d;
    wDays += d;
  }
  const pct = wDays ? Math.round(wProg / wDays) : 0;

  const cellText = (r: TreeRow, c: Col): string => {
    const t = r.task;
    switch (c.key) {
      case 'id': return String(idNum.get(t.id) ?? '');
      case 'name': return fit(t.name, c.w - r.depth * fs * 1.2, fs);
      case 'dur': return durLabel(r);
      case 'start': return mspDate(t.startDate);
      case 'finish': return mspDate(t.endDate);
      case 'pred': return fit((t.predecessors || []).map((p) => idNum.get(p)).filter((n) => n != null).join(','), c.w, fs);
      case 'pct': return `${Math.round(t.progressPct || 0)}%`;
      default: return '';
    }
  };

  // Finish-to-start links, routed like the on-screen chart.
  const barTop = rowH * 0.25;
  const barH = rowH * 0.5;
  const links: { d: string; crit: boolean; ex: number; ey: number; dir: 'down' | 'up' | 'right' }[] = [];
  const idx = new Map(rows.map((r, i) => [r.task.id, i]));
  rows.forEach((row, si) => {
    const s = row.task;
    (s.predecessors || []).forEach((pid) => {
      const pi = idx.get(pid);
      if (pi === undefined || pi === si) return;
      const p = rows[pi].task;
      const pg = barGeom(p);
      const sg = barGeom(s);
      const x1 = p.isMilestone ? pg.left + dayW / 2 + rowH * 0.35 : pg.left + pg.width;
      const y1 = pi * rowH + rowH / 2;
      const sX = s.isMilestone ? sg.left + dayW / 2 : sg.left;
      const down = si > pi;
      const inset = s.isMilestone ? 0 : Math.min(4, sg.width / 2);
      const isCrit = crit.has(pid) && crit.has(s.id);
      if (sX + inset >= x1 + 1.5) {
        const yEnd = down ? si * rowH + barTop - 0.3 : si * rowH + barTop + barH + 0.3;
        links.push({ d: `M ${x1} ${y1} H ${sX + inset} V ${yEnd}`, crit: isCrit, ex: sX + inset, ey: yEnd, dir: down ? 'down' : 'up' });
      } else {
        const mid = (down ? pi + 1 : pi) * rowH;
        const y2 = si * rowH + rowH / 2;
        links.push({ d: `M ${x1} ${y1} h 4 V ${mid} H ${sX - 5} V ${y2} H ${sX}`, crit: isCrit, ex: sX, ey: y2, dir: 'right' });
      }
    });
  });

  const nonWorking: number[] = [];
  if (dayW >= 4) {
    for (let i = 0; i < totalDays; i++) {
      const g = dayAt(range.start, i).getDay();
      if (g === 0 || g === 6) nonWorking.push(i);
    }
  }
  const today = toDate(todayStr());
  const todayX = today >= range.start && today <= range.end ? daysBetween(range.start, today) * dayW + dayW / 2 : null;

  const tierRow = (segs: TimescaleSeg[], align: 'left' | 'center') => (
    <View style={{ position: 'relative', height: TIER_H, borderBottomWidth: 0.5, borderColor: C.border }}>
      {segs.map((s) => (
        <View
          key={s.key}
          style={{
            position: 'absolute', left: s.left, width: s.width, top: 0, height: TIER_H,
            borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center',
            alignItems: align === 'center' ? 'center' : 'flex-start', paddingLeft: align === 'center' ? 0 : 3,
          }}
        >
          <Text style={{ fontSize: 6.5 }}>{s.width >= (align === 'center' ? 6 : 26) ? fit(s.label, s.width, 6.5) : ''}</Text>
        </View>
      ))}
    </View>
  );


  return (
    <Document>
      <Page size="A3" orientation="landscape" style={{ padding: MARGIN, fontFamily: 'Helvetica', color: C.text }}>
        <View wrap={false}>
          {/* Header */}
          <View style={{ height: HEADER_H, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.primary }}>Gantt Chart</Text>
              <Text style={{ fontSize: 9, color: C.sub, marginTop: 2 }}>{project.code} — {project.name}</Text>
            </View>
            {pStart !== '' && (
              <View style={{ flexDirection: 'row' }}>
                {[
                  ['Start', mspDate(pStart)],
                  ['Finish', mspDate(pEnd)],
                  ['Duration', `${workingDaysBetween(pStart, pEnd, opts.workingDays)} days`],
                  ['% Complete', `${pct}%`],
                  ['Tasks', String(leaves.length)],
                ].map(([k, v]) => (
                  <View key={k} style={{ marginLeft: 18 }}>
                    <Text style={{ fontSize: 7, color: C.sub }}>{k}</Text>
                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>{v}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Table + chart */}
          <View style={{ flexDirection: 'row', borderWidth: 0.5, borderColor: C.border }}>
            <View style={{ width: TABLE_W, borderRightWidth: 1, borderColor: '#9E9E9E' }}>
              <View style={{ height: TIER_H * 2, flexDirection: 'row', backgroundColor: C.headerBg, borderBottomWidth: 0.5, borderColor: C.border }}>
                {COLS.map((c) => (
                  <View key={c.key} style={{ width: c.w, borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center', paddingHorizontal: 2.5 }}>
                    <Text style={{ fontSize: 7, textAlign: c.align === 'right' ? 'right' : 'left' }}>{c.key === 'id' ? '' : c.label}</Text>
                  </View>
                ))}
              </View>
              {rows.map((r) => (
                <View key={r.task.id} style={{ height: rowH, flexDirection: 'row', borderBottomWidth: 0.4, borderColor: C.border }}>
                  {COLS.map((c) => (
                    <View
                      key={c.key}
                      style={{
                        width: c.w, borderRightWidth: 0.4, borderColor: C.border, justifyContent: 'center', overflow: 'hidden',
                        paddingHorizontal: 2.5, paddingLeft: c.key === 'name' ? 2.5 + r.depth * fs * 1.2 : 2.5,
                        backgroundColor: c.key === 'id' ? C.headerBg : undefined,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fs, textAlign: c.align === 'right' ? 'right' : 'left',
                          fontFamily: r.isSummary && c.key !== 'id' && c.key !== 'pred' && c.key !== 'pct' ? 'Helvetica-Bold' : 'Helvetica',
                          color: c.key === 'id' ? C.sub : C.text,
                        }}
                      >
                        {cellText(r, c)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            <View style={{ width: CHART_W }}>
              {tierRow(tiers.top, 'left')}
              {tierRow(tiers.bottom, 'center')}
              <View style={{ position: 'relative', height: bodyH }}>
                <Svg width={CHART_W} height={bodyH} style={{ position: 'absolute', top: 0, left: 0 }}>
                  {nonWorking.map((d) => <Rect key={`nw${d}`} x={d * dayW} y={0} width={dayW} height={bodyH} fill={C.nonWorking} />)}
                  {rows.map((r, i) => {
                    const t = r.task;
                    const { left, width } = barGeom(t);
                    const y = i * rowH;
                    const isCrit = crit.has(t.id);
                    if (r.isSummary) {
                      const th = rowH * 0.2;
                      const tw = Math.min(width / 2, rowH * 0.32);
                      const top = y + rowH * 0.3;
                      return (
                        <Path
                          key={t.id}
                          d={`M ${left} ${top} H ${left + width} V ${top + th + rowH * 0.22} L ${left + width - tw} ${top + th} H ${left + tw} L ${left} ${top + th + rowH * 0.22} Z`}
                          fill={C.summary}
                        />
                      );
                    }
                    if (t.isMilestone) {
                      const cx = left + dayW / 2;
                      const cy = y + rowH / 2;
                      const m = rowH * 0.3;
                      return <Polygon key={t.id} points={`${cx},${cy - m} ${cx + m},${cy} ${cx},${cy + m} ${cx - m},${cy}`} fill={isCrit ? C.critProgress : C.summary} />;
                    }
                    const p = Math.min(100, Math.max(0, t.progressPct || 0));
                    const ph = barH * 0.36;
                    return [
                      <Rect key={`${t.id}b`} x={left} y={y + barTop} width={width} height={barH} fill={isCrit ? C.critBar : C.bar} stroke={isCrit ? C.critEdge : C.barEdge} strokeWidth={0.5} />,
                      p > 0 ? <Rect key={`${t.id}p`} x={left} y={y + barTop + (barH - ph) / 2} width={(width * p) / 100} height={ph} fill={isCrit ? C.critProgress : C.progress} /> : null,
                    ];
                  })}
                  {links.map((l, i) => {
                    const a = Math.max(1.6, rowH * 0.16);
                    const head = l.dir === 'down'
                      ? `${l.ex - a},${l.ey - a * 1.6} ${l.ex + a},${l.ey - a * 1.6} ${l.ex},${l.ey}`
                      : l.dir === 'up'
                        ? `${l.ex - a},${l.ey + a * 1.6} ${l.ex + a},${l.ey + a * 1.6} ${l.ex},${l.ey}`
                        : `${l.ex - a * 1.6},${l.ey - a} ${l.ex - a * 1.6},${l.ey + a} ${l.ex},${l.ey}`;
                    const col = l.crit ? C.critLink : C.link;
                    return [
                      <Path key={`l${i}`} d={l.d} fill="none" stroke={col} strokeWidth={0.6} />,
                      <Polygon key={`a${i}`} points={head} fill={col} />,
                    ];
                  })}
                  {todayX !== null && <Line x1={todayX} y1={0} x2={todayX} y2={bodyH} stroke={C.today} strokeWidth={0.6} strokeDasharray="2,1.5" />}
                </Svg>
                {rows.map((r, i) => {
                  const t = r.task;
                  if (r.isSummary || fs < 4) return null;
                  const { left, width } = barGeom(t);
                  const x = t.isMilestone ? left + dayW / 2 + rowH * 0.45 : left + width + 3;
                  const label = t.isMilestone ? `${toDate(t.startDate).getMonth() + 1}/${toDate(t.startDate).getDate()}` : (t.category || '');
                  if (!label || x > CHART_W - 10) return null;
                  return (
                    <Text key={`lbl${t.id}`} style={{ position: 'absolute', left: x, top: i * rowH + (rowH - fs) / 2 - 0.5, fontSize: fs * 0.9, color: C.text }}>
                      {fit(label, CHART_W - x, fs * 0.9)}
                    </Text>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Legend */}
          <View style={{ height: FOOTER_H, flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            {[
              { key: 'task', label: 'Task', sw: <Rect x={0} y={2} width={22} height={6} fill={C.bar} stroke={C.barEdge} strokeWidth={0.5} /> },
              { key: 'prog', label: 'Progress', sw: <Rect x={0} y={3.9} width={22} height={2.2} fill={C.progress} /> },
              { key: 'sum', label: 'Summary', sw: <Path d="M 0 2 H 22 V 8 L 19 5 H 3 L 0 8 Z" fill={C.summary} /> },
              { key: 'ms', label: 'Milestone', sw: <Polygon points="11,1 15,5 11,9 7,5" fill={C.summary} /> },
              ...(crit.size > 0 ? [{ key: 'crit', label: 'Critical', sw: <Rect x={0} y={2} width={22} height={6} fill={C.critBar} stroke={C.critEdge} strokeWidth={0.5} /> }] : []),
            ].map((it) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 18 }}>
                <Svg width={22} height={10}>{it.sw}</Svg>
                <Text style={{ fontSize: 7, marginLeft: 4 }}>{it.label}</Text>
              </View>
            ))}
            <View style={{ flexGrow: 1 }} />
            <Text style={{ fontSize: 7, color: C.sub }}>Printed {mspDate(todayStr())}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function exportSchedulePdf(project: ScheduleProjectRef, rows: TreeRow[], opts: ExportOptions): Promise<void> {
  const blob = await pdf(<ScheduleDoc project={project} rows={rows} opts={opts} />).toBlob();
  saveAs(blob, `${project.code || 'schedule'}-gantt-chart.pdf`);
}
