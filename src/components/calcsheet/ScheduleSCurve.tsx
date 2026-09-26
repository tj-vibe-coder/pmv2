import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ScheduleTask } from '../../types/ScheduleTask';
import { computeSCurve, type SCurveBucket, type SCurveSnapshot } from '../../utils/calcsheet/scheduleSCurve';
import { mspDate } from '../../utils/calcsheet/scheduleTimescale';

// Validated pair (dataviz validator, light surface): planned = brand blue,
// actual = orange. Manpower bars reuse the Gantt task-bar blue.
const PLANNED = '#2c5aa0';
const ACTUAL = '#eb6834';
const MANPOWER = '#5F8FD1';
// Baseline = the reference plan: neutral grey, dashed (never colour alone).
const BASELINE = '#8C8C8C';
const TODAY = '#E07B00';
const GRID = '#ECECEC';
const AXIS_W = 52;
const MARGIN = { top: 8, right: 24, left: 0, bottom: 0 };

interface Props {
  tasks: ScheduleTask[];
  workingDays: boolean;
  /** Saved schedule versions as dated status snapshots (actual-progress points). */
  loadSnapshots: () => Promise<SCurveSnapshot[]>;
  /** The saved baseline's tasks — adds a dashed baseline curve. */
  baselineTasks?: ScheduleTask[];
}

const pct = (n: number | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

export default function ScheduleSCurve({ tasks, workingDays, loadSnapshots, baselineTasks }: Props) {
  const [snapshots, setSnapshots] = useState<SCurveSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSnapshots()
      .then((s) => { if (alive) setSnapshots(s); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : 'Failed to load saved versions'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => computeSCurve(tasks, workingDays, snapshots, baselineTasks), [tasks, workingDays, snapshots, baselineTasks]);

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

  const tip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: SCurveBucket }> }) => {
    if (!active || !payload?.length) return null;
    const b = payload[0].payload;
    return (
      <Paper variant="outlined" sx={{ px: 1.25, py: 0.75, fontSize: 12, lineHeight: 1.6 }}>
        <Box sx={{ fontWeight: 700 }}>{periodOf(b)}</Box>
        <Box>Planned % complete: <b>{pct(b.plannedPct)}</b></Box>
        {data.hasBaseline && <Box>Baseline % complete: <b>{pct(b.baselinePct)}</b></Box>}
        <Box>Actual % complete: <b>{pct(b.actualPct)}</b></Box>
        {data.hasManpower && (
          <Box>Manpower: <b>{num(b.manpower)}/day{data.granularity === 'week' ? ' avg' : ''}</b>{data.granularity === 'week' && b.peak > 0 ? ` · peak ${num(b.peak)}` : ''}</Box>
        )}
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

  return (
    <Paper sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
      {loading && <LinearProgress sx={{ mb: 1.5 }} />}
      {err && <Alert severity="warning" sx={{ mb: 1.5 }}>{err} — showing the planned curve only.</Alert>}

      {/* Headline numbers */}
      <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
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
          <>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Peak manpower</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{data.peak ? num(data.peak.pax) : '—'}</Typography>
              {data.peak && <Typography variant="caption" color="text.secondary">{mspDate(data.peak.date)}</Typography>}
            </Box>
          </>
        )}
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
          <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {today}
          {data.hasBaseline && (
            <Line name="Baseline" type="monotone" dataKey="baselinePct" stroke={BASELINE} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          )}
          <Line name="Planned" type="monotone" dataKey="plannedPct" stroke={PLANNED} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Actual" type="linear" dataKey="actualPct" stroke={ACTUAL} strokeWidth={2} connectNulls
            dot={{ r: 4, fill: ACTUAL, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2 }}>
        Manpower loading (per day{data.granularity === 'week' ? ', weekly average' : ''})
      </Typography>
      {data.hasManpower ? (
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data.buckets} margin={MARGIN} syncId="scurve" barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            {xAxis}
            <YAxis width={AXIS_W} allowDecimals={false} tick={{ fontSize: 11, fill: '#595959' }} tickLine={false} axisLine={false} />
            <Tooltip content={tip} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {today}
            <Bar name="Manpower" dataKey="manpower" fill={MANPOWER} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Alert severity="info" sx={{ mt: 1 }}>
          No manpower entered yet. Set <b>Manpower</b> on tasks (double-click a task in the Gantt) to see daily headcount here.
        </Alert>
      )}

      <Box sx={{ mt: 1.5 }}>
        <Button size="small" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Hide table' : 'Show table'}</Button>
      </Box>
      {showTable && (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>{data.granularity === 'week' ? 'Week of' : 'Date'}</TableCell>
              <TableCell align="right">Planned % complete</TableCell>
              {data.hasBaseline && <TableCell align="right">Baseline % complete</TableCell>}
              <TableCell align="right">Actual % complete</TableCell>
              {data.hasManpower && <TableCell align="right">Manpower (per day{data.granularity === 'week' ? ' avg' : ''})</TableCell>}
              {data.hasManpower && data.granularity === 'week' && <TableCell align="right">Peak</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.buckets.map((b) => (
              <TableRow key={b.key} selected={b.key === data.todayKey}>
                <TableCell>{mspDate(b.start)}</TableCell>
                <TableCell align="right">{pct(b.plannedPct)}</TableCell>
                {data.hasBaseline && <TableCell align="right">{pct(b.baselinePct)}</TableCell>}
                <TableCell align="right">{pct(b.actualPct)}</TableCell>
                {data.hasManpower && <TableCell align="right">{num(b.manpower)}</TableCell>}
                {data.hasManpower && data.granularity === 'week' && <TableCell align="right">{num(b.peak)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
