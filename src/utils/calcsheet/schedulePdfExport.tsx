import { Document, Page, Text, View, Svg, Rect, Polygon, Path, Line, Circle, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { TASK_HIGHLIGHTS, type ScheduleTask } from '../../types/ScheduleTask';
import type { TreeRow } from './scheduleTree';
import { daysBetween, durationOf, toDate, todayStr, workingDaysBetween } from './scheduleDates';
import { dayAt, mspDate, snapRange, timescaleTiers, type GanttZoom, type TimescaleSeg } from './scheduleTimescale';
import { computeSCurve, type SCurveSnapshot } from './scheduleSCurve';
import { leafWeights, projectPercent } from './scheduleWeights';
import { finishVariance, matchBaseline, varianceLabel, type ScheduleBaseline } from './scheduleBaseline';
import { leafTasks } from './scheduleTree';

type ScheduleProjectRef = { code?: string; name?: string };

// A3 landscape, in points. Everything is scaled to land on this one page.
const PAGE_W = 1190.55;
const PAGE_H = 841.89;
const MARGIN = 28;
const HEADER_H = 46;
const FOOTER_H = 22;
const TIER_H = 13;
const MAX_ROW_H = 16;
// Page 2: full-width S-Curve.
const SC_GUTTER = 34;             // y-axis labels
const SC_PLOT_W = PAGE_W - MARGIN * 2 - SC_GUTTER;
const SC_PAD = 10;
const SC_LEGEND_H = 30;

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
  manualBar: '#8FD3CB',
  manualEdge: '#2E9C8F',
  manualProgress: '#14665C',
  summary: '#262626',
  link: '#4472C4',
  critLink: '#C00000',
  nonWorking: '#EFEFEF',
  today: '#E07B00',
  planned: '#2c5aa0',
  actual: '#eb6834',
  manpower: '#5F8FD1',
  baseline: '#A6A6A6',
  baselineCurve: '#8C8C8C',
  late: '#C00000',
  early: '#2E7D32',
  grid: '#E6E6E6',
};

interface Col { key: string; label: string; w: number; align?: 'left' | 'right' | 'center' }
const COLS: Col[] = [
  { key: 'id', label: 'ID', w: 22, align: 'right' },
  { key: 'name', label: 'Task Name', w: 220 },
  { key: 'dur', label: 'Duration', w: 50 },
  { key: 'start', label: 'Start', w: 58 },
  { key: 'finish', label: 'Finish', w: 58 },
  { key: 'pred', label: 'Predecessors', w: 50 },
  { key: 'mp', label: 'Manpower', w: 44, align: 'right' },
  { key: 'pct', label: '% Comp.', w: 36, align: 'right' },
  { key: 'wt', label: 'Weight', w: 38, align: 'right' },
];
// With a baseline: Baseline Finish + Finish Variance after Finish.
const COLS_WITH_BASELINE: Col[] = COLS.flatMap((c) => (c.key === 'finish'
  ? [c, { key: 'bfin', label: 'Baseline Fin.', w: 58 }, { key: 'fvar', label: 'Var.', w: 40, align: 'right' as const }]
  : [c]));

// Helvetica averages ~0.52em per character; trim with an ellipsis so a long
// value can't wrap and push the row taller than the page allows.
function fit(text: string, width: number, fontSize: number): string {
  const max = Math.max(1, Math.floor((width - 5) / (fontSize * 0.52)));
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

interface ExportOptions {
  workingDays: boolean;
  criticalIds?: Set<string>;
  /** Saved versions as dated status snapshots (S-Curve actual points). */
  snapshots?: SCurveSnapshot[];
  /** When set: grey baseline bars, Baseline Finish / Var. columns, baseline curve. */
  baseline?: ScheduleBaseline | null;
}

function ScheduleDoc({ project, rows, opts }: { project: ScheduleProjectRef; rows: TreeRow[]; opts: ExportOptions }) {
  const crit = opts.criticalIds ?? new Set<string>();
  const leaves = rows.filter((r) => !r.isSummary).map((r) => r.task);
  const bmap = matchBaseline(rows.map((r) => r.task), opts.baseline ?? null);
  const hasBaseline = bmap.size > 0;
  const baseLeaves = hasBaseline && opts.baseline ? leafTasks(opts.baseline.tasks) : [];
  const COLS_NOW = hasBaseline ? COLS_WITH_BASELINE : COLS;
  const TABLE_W = COLS_NOW.reduce((sum, c) => sum + c.w, 0);
  const CHART_W = PAGE_W - MARGIN * 2 - TABLE_W;
  const spanTasks = [...(leaves.length ? leaves : rows.map((r) => r.task)), ...baseLeaves];

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

  const sc = computeSCurve(rows.map((r) => r.task), opts.workingDays, opts.snapshots ?? [], hasBaseline && opts.baseline ? opts.baseline.tasks : undefined);

  const bodyAvail = PAGE_H - MARGIN * 2 - HEADER_H - FOOTER_H - TIER_H * 2 - 6;
  const rowH = Math.min(MAX_ROW_H, bodyAvail / Math.max(1, rows.length));
  const fs = Math.max(3, Math.min(8, rowH * 0.55));
  const bodyH = rows.length * rowH;

  const idNum = new Map(rows.map((r, i) => [r.task.id, i + 1]));
  const barGeom = (t: ScheduleTask) => {
    const half = t.startDate === t.endDate && !t.isMilestone && t.durationDays != null && t.durationDays > 0 && t.durationDays < 1;
    return {
      left: daysBetween(range.start, toDate(t.startDate)) * dayW,
      width: half ? Math.max(1, t.durationDays! * dayW) : Math.max(dayW, durationOf(t.startDate, t.endDate) * dayW),
    };
  };
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
  for (const t of leaves) {
    if (!pStart || t.startDate < pStart) pStart = t.startDate;
    if (!pEnd || t.endDate > pEnd) pEnd = t.endDate;
  }
  const allTasks = rows.map((r) => r.task);
  const pct = Math.round(projectPercent(allTasks) ?? 0);

  // Each task's share of project progress; a phase's share is its tasks' sum.
  const { mode: wMode, weights, total: wTotal } = leafWeights(allTasks);
  const share = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r.isSummary) { share.set(r.task.id, wTotal > 0 ? ((weights.get(r.task.id) || 0) / wTotal) * 100 : 0); return; }
    let sum = 0;
    for (let j = i + 1; j < rows.length && rows[j].depth > r.depth; j++) {
      if (!rows[j].isSummary) sum += wTotal > 0 ? ((weights.get(rows[j].task.id) || 0) / wTotal) * 100 : 0;
    }
    share.set(r.task.id, sum);
  });

  const cellText = (r: TreeRow, c: Col): string => {
    const t = r.task;
    switch (c.key) {
      case 'id': return String(idNum.get(t.id) ?? '');
      case 'name': return fit(t.name, c.w - r.depth * fs * 1.2, fs);
      case 'dur': return durLabel(r);
      case 'start': return mspDate(t.startDate);
      case 'finish': return mspDate(t.endDate);
      case 'bfin': { const b = bmap.get(t.id); return b ? mspDate(b.endDate) : ''; }
      case 'fvar': { const b = bmap.get(t.id); return b ? varianceLabel(finishVariance(t.endDate, b.endDate, opts.workingDays)) : ''; }
      case 'pred': return fit((t.predecessors || []).map((p) => idNum.get(p)).filter((n) => n != null).join(','), c.w, fs);
      case 'mp': return !r.isSummary && !t.isMilestone && (t.manpower || 0) > 0 ? String(t.manpower) : '';
      case 'pct': return `${Math.round(t.progressPct || 0)}%`;
      case 'wt': return share.has(t.id) ? `${(share.get(t.id) || 0).toFixed(1)}%` : '';
      default: return '';
    }
  };

  const varColor = (r: TreeRow) => {
    const b = bmap.get(r.task.id);
    const v = b ? finishVariance(r.task.endDate, b.endDate, opts.workingDays) : 0;
    return v > 0 ? C.late : v < 0 ? C.early : C.text;
  };

  // Finish-to-start links, routed like the on-screen chart.
  // With a baseline the task bar moves up to make room for the grey bar below.
  const barTop = hasBaseline ? rowH * 0.16 : rowH * 0.25;
  const barH = hasBaseline ? rowH * 0.46 : rowH * 0.5;
  const baseTop = barTop + barH + rowH * 0.06;
  const baseH = rowH * 0.16;
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
                  ...(hasBaseline ? (() => {
                    const bEnd = baseLeaves.reduce((m, t) => (t.endDate > m ? t.endDate : m), baseLeaves[0].endDate);
                    return [['Baseline Finish', mspDate(bEnd)], ['Finish Var.', varianceLabel(finishVariance(pEnd, bEnd, opts.workingDays))]];
                  })() : []),
                  ['% Complete', `${pct}%`],
                  ['Weighting', wMode === 'manual' ? 'Manual weights' : 'By duration'],
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
                {COLS_NOW.map((c) => (
                  <View key={c.key} style={{ width: c.w, borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center', paddingHorizontal: 2.5 }}>
                    <Text style={{ fontSize: 7, textAlign: c.align === 'right' ? 'right' : 'left' }}>{c.key === 'id' ? '' : c.label}</Text>
                  </View>
                ))}
              </View>
              {rows.map((r) => (
                <View key={r.task.id} style={{ height: rowH, flexDirection: 'row', borderBottomWidth: 0.4, borderColor: C.border }}>
                  {COLS_NOW.map((c) => (
                    <View
                      key={c.key}
                      style={{
                        width: c.w, borderRightWidth: 0.4, borderColor: C.border, justifyContent: 'center', overflow: 'hidden',
                        paddingHorizontal: 2.5, paddingLeft: c.key === 'name' ? 2.5 + r.depth * fs * 1.2 : 2.5,
                        backgroundColor: c.key === 'id' ? C.headerBg : r.task.highlight ? TASK_HIGHLIGHTS[r.task.highlight] : undefined,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fs, textAlign: c.align === 'right' ? 'right' : 'left',
                          fontFamily: r.isSummary && c.key !== 'id' && c.key !== 'pred' && c.key !== 'pct' ? 'Helvetica-Bold' : 'Helvetica',
                          color: c.key === 'id' ? C.sub : c.key === 'fvar' ? varColor(r) : C.text,
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
                  {hasBaseline && rows.map((r, i) => {
                    const b = bmap.get(r.task.id);
                    if (!b) return null;
                    const g = barGeom(b);
                    const y = i * rowH + baseTop;
                    if (b.isMilestone && !r.isSummary) {
                      const cx = g.left + dayW / 2;
                      const m = baseH * 1.1;
                      const cy = y + baseH / 2;
                      return <Polygon key={`bl${r.task.id}`} points={`${cx},${cy - m} ${cx + m},${cy} ${cx},${cy + m} ${cx - m},${cy}`} fill="#ffffff" stroke={C.baseline} strokeWidth={0.5} />;
                    }
                    return <Rect key={`bl${r.task.id}`} x={g.left} y={y} width={g.width} height={baseH} fill={C.baseline} />;
                  })}
                  {rows.map((r, i) => {
                    const t = r.task;
                    const { left, width } = barGeom(t);
                    const y = i * rowH;
                    const isCrit = crit.has(t.id);
                    if (r.isSummary) {
                      const th = rowH * 0.2;
                      const tw = Math.min(width / 2, rowH * 0.32);
                      const top = y + (hasBaseline ? rowH * 0.14 : rowH * 0.3);
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
                      const cy = hasBaseline ? y + barTop + barH / 2 : y + rowH / 2;
                      const m = hasBaseline ? rowH * 0.26 : rowH * 0.3;
                      return <Polygon key={t.id} points={`${cx},${cy - m} ${cx + m},${cy} ${cx},${cy + m} ${cx - m},${cy}`} fill={isCrit ? C.critProgress : C.summary} />;
                    }
                    const p = Math.min(100, Math.max(0, t.progressPct || 0));
                    const ph = barH * 0.36;
                    const manual = t.mode === 'manual';
                    return [
                      <Rect key={`${t.id}b`} x={left} y={y + barTop} width={width} height={barH} fill={isCrit ? C.critBar : manual ? C.manualBar : C.bar} stroke={isCrit ? C.critEdge : manual ? C.manualEdge : C.barEdge} strokeWidth={0.5} />,
                      p > 0 ? <Rect key={`${t.id}p`} x={left} y={y + barTop + (barH - ph) / 2} width={(width * p) / 100} height={ph} fill={isCrit ? C.critProgress : manual ? C.manualProgress : C.progress} /> : null,
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
                  const label = t.isMilestone ? `${toDate(t.startDate).getMonth() + 1}/${toDate(t.startDate).getDate()}` : [t.category, (t.manpower || 0) > 0 ? `[${t.manpower}]` : ''].filter(Boolean).join(' ');
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
              ...(rows.some((r) => !r.isSummary && r.task.mode === 'manual') ? [{ key: 'man', label: 'Manual task', sw: <Rect x={0} y={2} width={22} height={6} fill={C.manualBar} stroke={C.manualEdge} strokeWidth={0.5} /> }] : []),
              ...(hasBaseline ? [{ key: 'base', label: 'Baseline', sw: <Rect x={0} y={3.5} width={22} height={3} fill={C.baseline} /> }] : []),
              ...(crit.size > 0 ? [{ key: 'crit', label: 'Critical', sw: <Rect x={0} y={2} width={22} height={6} fill={C.critBar} stroke={C.critEdge} strokeWidth={0.5} /> }] : []),
            ].map((it) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 18 }}>
                <Svg width={22} height={10}>{it.sw}</Svg>
                <Text style={{ fontSize: 7, marginLeft: 4 }}>{it.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
      {/* Page 2 — S-Curve (project % complete) */}
      {sc && (() => {
        const scDayW = SC_PLOT_W / totalDays;
        const scTiers = timescaleTiers(zoom, range.start, totalDays, scDayW);
        const mpH = sc.hasManpower ? 150 : 0;
        const plotH = PAGE_H - MARGIN * 2 - HEADER_H - SC_LEGEND_H - TIER_H * 2 - 2 - (mpH ? mpH + 22 : 0);
        const x0 = (d: string) => daysBetween(range.start, toDate(d)) * scDayW;
        const xEnd = (d: string) => x0(d) + scDayW;
        const yOf = (pv: number) => SC_PAD + (1 - pv / 100) * (plotH - SC_PAD - 2);
        const first = sc.daily[0];
        const plannedD = [`M ${x0(first.date)} ${yOf(0)}`, ...sc.daily.map((d) => `L ${xEnd(d.date)} ${yOf(d.plannedPct)}`)].join(' ');
        const baselineD = sc.hasBaseline
          ? [`M ${x0(first.date)} ${yOf(0)}`, ...sc.daily.map((d) => `L ${xEnd(d.date)} ${yOf(d.baselinePct ?? 0)}`)].join(' ')
          : null;
        const actual = sc.actualPoints.map((a) => ({ x: xEnd(a.date), y: yOf(a.pct), pct: a.pct }));
        const actualD = actual.map((a, i) => `${i ? 'L' : 'M'} ${a.x} ${a.y}`).join(' ');
        const lastA = actual[actual.length - 1];
        const vsBaseline = sc.hasBaseline && sc.baselineToday != null;
        const variance = sc.actualToday - (vsBaseline ? (sc.baselineToday as number) : sc.plannedToday);
        const tX = today >= range.start && today <= range.end ? daysBetween(range.start, today) * scDayW + scDayW / 2 : null;
        const maxPax = Math.max(1, ...sc.daily.map((d) => d.pax));
        const paxTicks = Array.from(new Set([0, Math.round(maxPax / 2), maxPax]));
        const barGap = Math.min(1, scDayW * 0.18);
        const pctTicks = [0, 25, 50, 75, 100];
        const kpis: [string, string][] = [
          ['Planned to date', `${sc.plannedToday.toFixed(1)}%`],
          ...(sc.hasBaseline && sc.baselineToday != null ? [['Baseline to date', `${sc.baselineToday.toFixed(1)}%`] as [string, string]] : []),
          ['Actual to date', `${sc.actualToday.toFixed(1)}%`],
          [vsBaseline ? 'Variance vs baseline' : 'Variance', `${variance > 0 ? '+' : ''}${variance.toFixed(1)} pts ${Math.abs(variance) < 0.5 ? '(on plan)' : variance > 0 ? '(ahead)' : '(behind)'}`],
          ...(sc.hasManpower ? [
            ['Peak manpower', sc.peak ? `${sc.peak.pax} · ${mspDate(sc.peak.date)}` : '—'] as [string, string],
          ] : []),
        ];
        const tierAt = (segs: TimescaleSeg[], align: 'left' | 'center') => (
          <View style={{ position: 'relative', height: TIER_H, marginLeft: SC_GUTTER, borderBottomWidth: 0.5, borderColor: C.border }}>
            {segs.map((sg) => (
              <View key={sg.key} style={{ position: 'absolute', left: sg.left, width: sg.width, top: 0, height: TIER_H, borderRightWidth: 0.5, borderColor: C.border, justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start', paddingLeft: align === 'center' ? 0 : 3 }}>
                <Text style={{ fontSize: 7 }}>{sg.width >= sg.label.length * 7 * 0.55 + 6 ? sg.label : ''}</Text>
              </View>
            ))}
          </View>
        );
        return (
          <Page size="A3" orientation="landscape" style={{ padding: MARGIN, fontFamily: 'Helvetica', color: C.text }}>
            <View wrap={false}>
              <View style={{ height: HEADER_H, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.primary }}>S-Curve — Project % Complete</Text>
                  <Text style={{ fontSize: 9, color: C.sub, marginTop: 2 }}>{project.code} — {project.name}</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  {kpis.map(([k, v]) => (
                    <View key={k} style={{ marginLeft: 18 }}>
                      <Text style={{ fontSize: 7, color: C.sub }}>{k}</Text>
                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ height: SC_LEGEND_H, flexDirection: 'row', alignItems: 'center' }}>
                <Svg width={18} height={6}><Line x1={0} y1={3} x2={18} y2={3} stroke={C.planned} strokeWidth={1.8} /></Svg>
                <Text style={{ fontSize: 8, marginLeft: 4, marginRight: 16 }}>Planned</Text>
                {sc.hasBaseline && <Svg width={18} height={6}><Line x1={0} y1={3} x2={18} y2={3} stroke={C.baselineCurve} strokeWidth={1.8} strokeDasharray="4,2.5" /></Svg>}
                {sc.hasBaseline && <Text style={{ fontSize: 8, marginLeft: 4, marginRight: 16 }}>Baseline</Text>}
                <Svg width={18} height={6}>
                  <Line x1={0} y1={3} x2={18} y2={3} stroke={C.actual} strokeWidth={1.8} />
                  <Circle cx={9} cy={3} r={2.4} fill={C.actual} />
                </Svg>
                <Text style={{ fontSize: 8, marginLeft: 4, marginRight: 16 }}>Actual</Text>
                <Svg width={18} height={6}><Line x1={0} y1={3} x2={18} y2={3} stroke={C.today} strokeWidth={0.8} strokeDasharray="2,1.5" /></Svg>
                <Text style={{ fontSize: 8, marginLeft: 4, marginRight: 24 }}>Today</Text>
                <Text style={{ fontSize: 7, color: C.sub }}>
                  Tasks weighted {sc.weighting === 'manual' ? 'by entered progress weights' : 'by duration'}, same as % Complete on the Gantt. Actual points are saved schedule versions plus today.
                </Text>
              </View>

              {/* % complete plot */}
              <View style={{ flexDirection: 'row', height: plotH }}>
                <View style={{ width: SC_GUTTER, position: 'relative' }}>
                  {pctTicks.map((v) => (
                    <Text key={v} style={{ position: 'absolute', right: 4, top: yOf(v) - 4, fontSize: 7.5, color: C.sub }}>{v}%</Text>
                  ))}
                </View>
                <View style={{ width: SC_PLOT_W, position: 'relative', borderLeftWidth: 0.5, borderColor: C.border }}>
                  <Svg width={SC_PLOT_W} height={plotH} style={{ position: 'absolute', top: 0, left: 0 }}>
                    {pctTicks.map((v) => <Line key={v} x1={0} y1={yOf(v)} x2={SC_PLOT_W} y2={yOf(v)} stroke={C.grid} strokeWidth={0.6} />)}
                    {tX !== null && <Line x1={tX} y1={0} x2={tX} y2={plotH} stroke={C.today} strokeWidth={0.8} strokeDasharray="3,2" />}
                    {baselineD && <Path d={baselineD} fill="none" stroke={C.baselineCurve} strokeWidth={1.8} strokeDasharray="4,2.5" />}
                    <Path d={plannedD} fill="none" stroke={C.planned} strokeWidth={1.8} />
                    {actual.length > 1 && <Path d={actualD} fill="none" stroke={C.actual} strokeWidth={1.8} />}
                    {actual.map((a, i) => <Circle key={i} cx={a.x} cy={a.y} r={3} fill={C.actual} stroke="#ffffff" strokeWidth={1} />)}
                  </Svg>
                  {lastA && (
                    <Text style={{ position: 'absolute', left: Math.min(lastA.x + 5, SC_PLOT_W - 34), top: lastA.y - 13, fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>
                      {lastA.pct.toFixed(1)}%
                    </Text>
                  )}
                </View>
              </View>
              {/* Manpower loading */}
              {mpH > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3, marginLeft: SC_GUTTER }}>Manpower loading (per day)</Text>
                  <View style={{ flexDirection: 'row', height: mpH - 12 }}>
                    <View style={{ width: SC_GUTTER, position: 'relative' }}>
                      {paxTicks.map((v) => (
                        <Text key={v} style={{ position: 'absolute', right: 4, top: (mpH - 12) - (v / maxPax) * (mpH - 20) - 4, fontSize: 7.5, color: C.sub }}>{v}</Text>
                      ))}
                    </View>
                    <View style={{ width: SC_PLOT_W, borderLeftWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.border }}>
                      <Svg width={SC_PLOT_W} height={mpH - 12}>
                        {paxTicks.map((v) => <Line key={v} x1={0} y1={(mpH - 12) - (v / maxPax) * (mpH - 20)} x2={SC_PLOT_W} y2={(mpH - 12) - (v / maxPax) * (mpH - 20)} stroke={C.grid} strokeWidth={0.6} />)}
                        {tX !== null && <Line x1={tX} y1={0} x2={tX} y2={mpH - 12} stroke={C.today} strokeWidth={0.8} strokeDasharray="3,2" />}
                        {sc.daily.filter((d) => d.pax > 0).map((d) => {
                          const h = (d.pax / maxPax) * (mpH - 20);
                          return <Rect key={d.date} x={x0(d.date) + barGap / 2} y={(mpH - 12) - h} width={Math.max(0.5, scDayW - barGap)} height={h} fill={C.manpower} />;
                        })}
                      </Svg>
                    </View>
                  </View>
                </View>
              )}
              <View style={{ borderTopWidth: 0.5, borderColor: C.border, marginLeft: SC_GUTTER }} />
              {tierAt(scTiers.bottom, 'center')}
              {tierAt(scTiers.top, 'left')}
            </View>
          </Page>
        );
      })()}
    </Document>
  );
}

export async function exportSchedulePdf(project: ScheduleProjectRef, rows: TreeRow[], opts: ExportOptions): Promise<void> {
  const blob = await pdf(<ScheduleDoc project={project} rows={rows} opts={opts} />).toBlob();
  saveAs(blob, `${project.code || 'schedule'}-gantt-chart.pdf`);
}
