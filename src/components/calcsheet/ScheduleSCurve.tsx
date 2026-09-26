import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip as MuiTooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ScheduleTask } from '../../types/ScheduleTask';
import { computeSCurve, manpowerContributors, type SCurveBucket, type SCurveSnapshot } from '../../utils/calcsheet/scheduleSCurve';
import { mspDate } from '../../utils/calcsheet/scheduleTimescale';
import { addDays } from '../../utils/calcsheet/scheduleDates';
import { blurNumberInputOnWheel } from '../../utils/calcsheet/numberInput';

// Validated pair (dataviz validator, light surface): planned = brand blue,
// actual = orange. Manpower bars reuse the Gantt task-bar blue.
const PLANNED = '#2c5aa0';
const ACTUAL = '#eb6834';
const MANPOWER = '#5F8FD1';
// Baseline = the reference plan: neutral grey, dashed (never colour alone).
const BASELINE = '#8C8C8C';
const TODAY = '#E07B00';
const GRID = '#ECECEC';
// Over capacity: status red, always with the warning icon + label below the chart.
const OVER = '#e34948';
// Roles, in fixed order (dataviz reference categorical palette — validated for
// adjacent pairs; roles past the eighth fold into a neutral "Other"). Three
// slots sit under 3:1 on white, so the legend, tooltip and table carry names.
const ROLE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const OTHER = '#8c8c8c';
const AXIS_W = 52;
// Legend text stays in ink; the swatch carries the colour.
const legendText = (value: string) => <span style={{ color: '#262626' }}>{value}</span>;
const MARGIN = { top: 8, right: 24, left: 0, bottom: 0 };

interface Props {
  tasks: ScheduleTask[];
  workingDays: boolean;
  /** Saved schedule versions as dated status snapshots (actual-progress points). */
  loadSnapshots: () => Promise<SCurveSnapshot[]>;
  /** The saved baseline's tasks — adds a dashed baseline curve. */
  baselineTasks?: ScheduleTask[];
  /** Storage key for the manpower capacity. */
  projectId?: string;
  /** Open the manpower breakdown for this date (bump `n`). */
  focus?: { date: string; n: number } | null;
}

const pct = (n: number | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const pref = <T,>(key: string, fallback: T, ok: (v: string) => boolean): T => {
  try { const v = localStorage.getItem(key); return v !== null && ok(v) ? (v as unknown as T) : fallback; } catch { return fallback; }
};
const save = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };

export default function ScheduleSCurve({ tasks, workingDays, loadSnapshots, baselineTasks, projectId, focus }: Props) {
  const [snapshots, setSnapshots] = useState<SCurveSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showTable, setShowTable] = useState(false);
  const [gran, setGran] = useState<'auto' | 'day' | 'week'>(() => pref('scurve-gran', 'auto', (v) => ['auto', 'day', 'week'].includes(v)));
  const [mpMode, setMpMode] = useState<'total' | 'role'>(() => pref('scurve-mp-mode', 'total', (v) => v === 'total' || v === 'role'));
  const capKey = `scurve-cap-${projectId || 'default'}`;
  const [capText, setCapText] = useState<string>(() => pref(capKey, '', () => true));
  const cap = Number(capText) > 0 ? Number(capText) : null;
  // Drill-down: a date, so it follows into the matching bucket when Daily/Weekly changes.
  const [drill, setDrill] = useState<string | null>(null);
  const drillRef = useRef<HTMLDivElement>(null);
  useEffect(() => save('scurve-gran', gran), [gran]);
  useEffect(() => save('scurve-mp-mode', mpMode), [mpMode]);
  useEffect(() => save(capKey, capText), [capKey, capText]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSnapshots()
      .then((s) => { if (alive) setSnapshots(s); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : 'Failed to load saved versions'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(
    () => computeSCurve(tasks, workingDays, snapshots, baselineTasks, { granularity: gran === 'auto' ? undefined : gran }),
    [tasks, workingDays, snapshots, baselineTasks, gran],
  );
  const bucketAt = (date: string) => data?.buckets.find((b) => b.start <= date && date <= b.end) ?? null;
  const openDrill = (date: string) => {
    if (!bucketAt(date)) return;
    setDrill(date);
    window.setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };
  useEffect(() => { if (focus) openDrill(focus.date); }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Add dated tasks to see the S-Curve.</Typography>
      </Paper>
    );
  }

  const labelOf = new Map(data.buckets.map((b) => [b.key, b.label]));
  const periodOf = (b: SCurveBucket) => (data.granularity === 'week' ? `Week of ${mspDate(b.start)}` : mspDate(b.start));
  // With a baseline, slippage is measured against it — re-planning the
  // current schedule must not hide that the project is behind.
  const vsBaseline = data.hasBaseline && data.baselineToday != null;
  const variance = data.actualToday - (vsBaseline ? (data.baselineToday as number) : data.plannedToday);
  const varianceTone = Math.abs(variance) < 0.5 ? 'on' : variance > 0 ? 'ahead' : 'behind';
  const actualPoints = data.buckets.filter((b) => b.actualPct != null).length;

  // Roles shown in the stacked chart: first eight, the rest folded into Other.
  const shownRoles = data.roles.slice(0, data.roles.length > 8 ? 7 : 8);
  const hasOther = data.roles.length > shownRoles.length;
  const colorOf = (r: string) => (r === 'Other' ? OTHER : ROLE_COLORS[shownRoles.indexOf(r)] ?? OTHER);
  const stackKeys = [...shownRoles, ...(hasOther ? ['Other'] : [])];
  const chartData = data.buckets.map((b) => {
    const row: Record<string, unknown> = { ...b };
    shownRoles.forEach((r) => { row[`role:${r}`] = b.byRole[r] || 0; });
    if (hasOther) row['role:Other'] = Object.entries(b.byRole).filter(([r]) => !shownRoles.includes(r)).reduce((s, [, v]) => s + v, 0);
    return row;
  });

  // Over-capacity days, grouped into runs of consecutive dates.
  const overRuns: { from: string; to: string; peak: number }[] = [];
  if (cap) {
    data.daily.forEach((d) => {
      if (d.pax <= cap) return;
      const last = overRuns[overRuns.length - 1];
      if (last && (addDays(last.to, 1) === d.date || (workingDays && addDays(last.to, 3) >= d.date && new Date(`${d.date}T00:00:00`).getDay() === 1))) {
        last.to = d.date;
        last.peak = Math.max(last.peak, d.pax);
      } else overRuns.push({ from: d.date, to: d.date, peak: d.pax });
    });
  }
  const overDays = cap ? data.daily.filter((d) => d.pax > cap).length : 0;
  const isOver = (b: SCurveBucket) => !!cap && (data.granularity === 'day' ? b.manpower > cap : b.peak > cap);

  const tip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: SCurveBucket }> }) => {
    if (!active || !payload?.length) return null;
    const b = payload[0].payload;
    const roles = Object.entries(b.byRole).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    return (
      <Paper variant="outlined" sx={{ px: 1.25, py: 0.75, fontSize: 12, lineHeight: 1.6 }}>
        <Box sx={{ fontWeight: 700 }}>{periodOf(b)}</Box>
        <Box>Planned % complete: <b>{pct(b.plannedPct)}</b></Box>
        {data.hasBaseline && <Box>Baseline % complete: <b>{pct(b.baselinePct)}</b></Box>}
        <Box>Actual % complete: <b>{pct(b.actualPct)}</b></Box>
        {data.hasManpower && (
          <Box>Manpower: <b>{num(b.manpower)}/day{data.granularity === 'week' ? ' avg' : ''}</b>{data.granularity === 'week' && b.peak > 0 ? ` · peak ${num(b.peak)}` : ''}</Box>
        )}
        {data.hasManpower && mpMode === 'role' && roles.map(([r, v]) => (
          <Box key={r} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colorOf(shownRoles.includes(r) ? r : 'Other') }} />{r}: <b>{num(v)}</b>
          </Box>
        ))}
        {data.hasManpower && b.manpower > 0 && <Box sx={{ opacity: 0.7, mt: 0.25 }}>Click for the tasks behind this</Box>}
      </Paper>
    );
  };

  const xAxis = (
    <XAxis
      dataKey="key" tickFormatter={(k: string) => labelOf.get(k) || ''}
      tick={{ fontSize: 11, fill: '#595959' }} tickLine={false} axisLine={{ stroke: '#BDBDBD' }}
      interval="preserveStartEnd" minTickGap={18}
    />
  );
  const today = data.todayKey && (
    <ReferenceLine x={data.todayKey} stroke={TODAY} strokeDasharray="4 3" label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: '#595959' }} />
  );

  const drillBucket = drill ? bucketAt(drill) : null;
  const contributors = drillBucket ? manpowerContributors(tasks, drillBucket.start, drillBucket.end, workingDays) : [];
  const toggleSx = { '& .MuiToggleButton-root': { py: 0.25, px: 1.25, textTransform: 'none', fontSize: 12 } };

  return (
    <Paper sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
      {loading && <LinearProgress sx={{ mb: 1.5 }} />}
      {err && <Alert severity="warning" sx={{ mb: 1.5 }}>{err} — showing the planned curve only.</Alert>}

      {/* Headline numbers */}
      <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} alignItems="flex-start">
        {[
          { label: 'Planned % complete', value: pct(data.plannedToday), sub: 'as of today' },
          ...(data.hasBaseline ? [{ label: 'Baseline % complete', value: pct(data.baselineToday ?? undefined), sub: 'as of today' }] : []),
          { label: 'Actual % complete', value: pct(data.actualToday), sub: 'as of today' },
        ].map((k) => (
          <Box key={k.label}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{k.label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{k.value}</Typography>
            {k.sub && <Typography variant="caption" color="text.secondary">{k.sub}</Typography>}
          </Box>
        ))}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Variance{vsBaseline ? ' vs baseline' : ''}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center"
            sx={{ color: varianceTone === 'behind' ? 'error.main' : varianceTone === 'ahead' ? 'success.main' : 'text.primary' }}>
            {varianceTone === 'behind' ? <TrendingDownIcon fontSize="small" /> : varianceTone === 'ahead' ? <TrendingUpIcon fontSize="small" /> : <TrendingFlatIcon fontSize="small" />}
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {variance > 0 ? '+' : ''}{variance.toFixed(1)} pts
            </Typography>
            <Typography variant="body2">{varianceTone === 'behind' ? 'Behind' : varianceTone === 'ahead' ? 'Ahead' : vsBaseline ? 'On baseline' : 'On plan'}</Typography>
          </Stack>
        </Box>
        {data.hasManpower && (
          <MuiTooltip title={data.peak ? 'Show the tasks behind the peak' : ''}>
            <Box sx={{ cursor: data.peak ? 'pointer' : 'default' }} onClick={() => data.peak && openDrill(data.peak.date)}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Peak manpower</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{data.peak ? num(data.peak.pax) : '—'}</Typography>
              {data.peak && <Typography variant="caption" color="primary">{mspDate(data.peak.date)} ›</Typography>}
            </Box>
          </MuiTooltip>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Timescale</Typography>
          <ToggleButtonGroup size="small" exclusive value={gran} onChange={(_, v) => v && setGran(v)} sx={toggleSx}>
            <ToggleButton value="auto">Auto</ToggleButton>
            <ToggleButton value="day">Daily</ToggleButton>
            <ToggleButton value="week">Weekly</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Stack>

      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>S-Curve — project % complete</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Tasks weighted {data.weighting === 'manual' ? 'by the progress weights you entered' : 'by duration'}, same as Overall progress. Actual points come from saved versions
        {actualPoints <= 1 ? ' — click Save version at each progress update to build the actual curve' : ''}.
      </Typography>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data.buckets} margin={MARGIN} syncId="scurve">
          <CartesianGrid vertical={false} stroke={GRID} />
          {xAxis}
          <YAxis width={AXIS_W} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: '#595959' }} tickLine={false} axisLine={false} />
          <Tooltip content={tip} cursor={{ stroke: '#9E9E9E', strokeWidth: 1 }} />
          <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          {today}
          {data.hasBaseline && (
            <Line name="Baseline" type="monotone" dataKey="baselinePct" stroke={BASELINE} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          )}
          <Line name="Planned" type="monotone" dataKey="plannedPct" stroke={PLANNED} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Actual" type="linear" dataKey="actualPct" stroke={ACTUAL} strokeWidth={2} connectNulls
            dot={{ r: 4, fill: ACTUAL, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 2, mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Manpower loading (per day{data.granularity === 'week' ? ', weekly average' : ''})
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {data.hasManpower && (
          <>
            <ToggleButtonGroup size="small" exclusive value={mpMode} onChange={(_, v) => v && setMpMode(v)} sx={toggleSx}>
              <ToggleButton value="total">Total</ToggleButton>
              <ToggleButton value="role">By discipline</ToggleButton>
            </ToggleButtonGroup>
            <MuiTooltip title="Most people you can have on site per day — days above it are flagged">
              <TextField
                size="small" type="number" label="Capacity" value={capText} placeholder="none"
                onChange={(e) => setCapText(e.target.value)} onWheel={blurNumberInputOnWheel}
                inputProps={{ min: 0, step: 1 }} sx={{ width: 110, '& .MuiInputBase-input': { py: 0.6 } }}
              />
            </MuiTooltip>
          </>
        )}
      </Stack>
      {data.hasManpower ? (
        <>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart
              data={chartData} margin={MARGIN} syncId="scurve" barCategoryGap={2}
              onClick={(st: { activeTooltipIndex?: number | string | null } | null) => {
                const i = Number(st?.activeTooltipIndex);
                const b = Number.isFinite(i) ? data.buckets[i] : null;
                if (b && b.manpower > 0) { setDrill(b.start); window.setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              {xAxis}
              <YAxis width={AXIS_W} allowDecimals={false} tick={{ fontSize: 11, fill: '#595959' }} tickLine={false} axisLine={false} />
              <Tooltip content={tip} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              {today}
              {drillBucket && <ReferenceLine x={drillBucket.key} stroke="#1F3F77" strokeWidth={2} strokeOpacity={0.35} />}
              {cap && (
                <ReferenceLine y={cap} stroke={OVER} strokeDasharray="5 3" label={{ value: `Capacity ${cap}`, position: 'insideTopLeft', fontSize: 11, fill: '#8a1c1c' }} />
              )}
              {mpMode === 'role' && <Legend verticalAlign="top" align="right" height={24} iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={legendText} itemSorter={(item) => stackKeys.indexOf(String(item.value))} />}
              {mpMode === 'total' ? (
                <Bar name="Manpower" dataKey="manpower" fill={MANPOWER} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {data.buckets.map((b) => <Cell key={b.key} fill={isOver(b) ? OVER : MANPOWER} />)}
                </Bar>
              ) : stackKeys.map((r) => (
                <Bar key={r} name={r} dataKey={`role:${r}`} stackId="mp" fill={colorOf(r)} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {cap && overDays > 0 && (
            <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 1, py: 0 }}>
              Over capacity ({cap}) on {overDays} day{overDays === 1 ? '' : 's'}:{' '}
              {overRuns.slice(0, 6).map((r, i) => (
                <Box key={r.from} component="span">
                  {i > 0 && ' · '}
                  <Box component="span" sx={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => openDrill(r.from)}>
                    {r.from === r.to ? mspDate(r.from) : `${mspDate(r.from)} – ${mspDate(r.to)}`}
                  </Box>
                  {` (peak ${num(r.peak)})`}
                </Box>
              ))}
              {overRuns.length > 6 ? ` · +${overRuns.length - 6} more` : ''}
            </Alert>
          )}
          {cap && overDays === 0 && <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>Within capacity ({cap}) every day.</Typography>}

          {/* Drill-down: which tasks make up the selected bar */}
          {drillBucket && (
            <Paper ref={drillRef} variant="outlined" sx={{ mt: 1.5, p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {data.granularity === 'week'
                    ? `Week of ${mspDate(drillBucket.start)} — ${num(drillBucket.manpower)}/day average, peak ${num(drillBucket.peak)}`
                    : `${mspDate(drillBucket.start)} — ${num(drillBucket.manpower)} ${drillBucket.manpower === 1 ? 'person' : 'people'}`}
                </Typography>
                {isOver(drillBucket) && <Chip size="small" color="error" variant="outlined" icon={<WarningAmberIcon />} label="Over capacity" />}
                <Box sx={{ flexGrow: 1 }} />
                <IconButton size="small" onClick={() => setDrill(null)}><CloseIcon fontSize="small" /></IconButton>
              </Stack>
              {Object.keys(drillBucket.byRole).length > 0 && (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                  {Object.entries(drillBucket.byRole).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([r, v]) => (
                    <Chip key={r} size="small" variant="outlined" label={`${r} ${num(v)}`}
                      icon={<Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: colorOf(shownRoles.includes(r) ? r : 'Other'), ml: '6px !important' }} />} />
                  ))}
                </Stack>
              )}
              {contributors.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No tasks with manpower in this period.</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Task</TableCell>
                      <TableCell>Dates</TableCell>
                      <TableCell>Crew</TableCell>
                      <TableCell align="right">People / day</TableCell>
                      {data.granularity === 'week' && <TableCell align="right">Days this week</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {contributors.map((c) => (
                      <TableRow key={c.task.id}>
                        <TableCell>{c.task.name}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{mspDate(c.task.startDate)} – {mspDate(c.task.endDate)}</TableCell>
                        <TableCell>{Object.entries(c.roles).map(([r, v]) => `${r} ${num(v)}`).join(' · ')}</TableCell>
                        <TableCell align="right"><b>{num(c.pax)}</b></TableCell>
                        {data.granularity === 'week' && <TableCell align="right">{c.days}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>
          )}
        </>
      ) : (
        <Alert severity="info" sx={{ mt: 1 }}>
          No manpower entered yet. Set <b>Manpower</b> (or a crew by role) on tasks to see daily headcount here.
        </Alert>
      )}

      <Box sx={{ mt: 1.5 }}>
        <Button size="small" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Hide table' : 'Show table'}</Button>
      </Box>
      {showTable && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>{data.granularity === 'week' ? 'Week of' : 'Date'}</TableCell>
                <TableCell align="right">Planned % complete</TableCell>
                {data.hasBaseline && <TableCell align="right">Baseline % complete</TableCell>}
                <TableCell align="right">Actual % complete</TableCell>
                {data.hasManpower && <TableCell align="right">Manpower (per day{data.granularity === 'week' ? ' avg' : ''})</TableCell>}
                {data.hasManpower && data.granularity === 'week' && <TableCell align="right">Peak</TableCell>}
                {data.hasManpower && mpMode === 'role' && data.roles.map((r) => <TableCell key={r} align="right">{r}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.buckets.map((b) => (
                <TableRow key={b.key} selected={b.key === data.todayKey}>
                  <TableCell>{mspDate(b.start)}</TableCell>
                  <TableCell align="right">{pct(b.plannedPct)}</TableCell>
                  {data.hasBaseline && <TableCell align="right">{pct(b.baselinePct)}</TableCell>}
                  <TableCell align="right">{pct(b.actualPct)}</TableCell>
                  {data.hasManpower && <TableCell align="right" sx={{ color: isOver(b) ? 'error.main' : undefined }}>{num(b.manpower)}</TableCell>}
                  {data.hasManpower && data.granularity === 'week' && <TableCell align="right">{num(b.peak)}</TableCell>}
                  {data.hasManpower && mpMode === 'role' && data.roles.map((r) => <TableCell key={r} align="right">{num(b.byRole[r] || 0)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
