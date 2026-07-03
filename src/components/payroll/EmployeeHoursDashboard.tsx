import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, Paper, Grid, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, CircularProgress, Alert, Link, Stack,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  Schedule as ScheduleIcon, MoreTime as MoreTimeIcon, EventAvailable as EventAvailableIcon, Place as PlaceIcon,
} from '@mui/icons-material';
import type { DTREntry, WorkSite } from '../../types/Payroll';
import { nearestSite } from '../../utils/workSites';

const API_BASE = '';
const NET = '#2c5aa0';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NO_GPS = 'No GPS recorded';
const OFF_SITE = 'Off-site';
const UNASSIGNED = 'Unassigned';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const hrs = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} h`;

interface Props {
  employeeId: string;   // linked user-account id (DTR entries key off this)
  employeeName?: string;
  onBack?: () => void;
}

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <Paper sx={{ p: 2, borderRadius: 2, borderLeft: `4px solid ${color}`, height: '100%' }}>
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box sx={{ color, fontSize: 30, display: 'flex' }}>{icon}</Box>
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{value}</Typography>
      </Box>
    </Stack>
  </Paper>
);

const EmployeeHoursDashboard: React.FC<Props> = ({ employeeId, employeeName, onBack }) => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [entries, setEntries] = useState<DTREntry[]>([]);
  const [sites, setSites] = useState<WorkSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) { setError('This employee has no linked user account, so no DTR/location data.'); setLoading(false); return; }
    setLoading(true);
    try {
      const [eRes, sRes] = await Promise.all([
        fetch(`${API_BASE}/api/dtr?employeeId=${encodeURIComponent(employeeId)}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/work-sites`, { headers: authHeaders() }),
      ]);
      if (!eRes.ok) throw new Error('dtr');
      setEntries(await eRes.json());
      setSites(sRes.ok ? ((await sRes.json()).sites ?? []) : []);
      setError(null);
    } catch {
      setError('Failed to load hours data.');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthEntries = useMemo(
    () => entries.filter((e) => (e.entryDate || '').slice(0, 7) === monthKey && !e.isAbsent),
    [entries, monthKey],
  );

  const stats = useMemo(() => {
    let regular = 0, extended = 0, daysWorked = 0;
    const perSite = new Map<string, number>();
    const perProject = new Map<string, number>();
    for (const e of monthEntries) {
      const reg = Number(e.regularHours) || 0;
      const ot = Number(e.overtimeHours) || 0;
      const dayTotal = reg + ot;
      regular += reg;
      extended += ot;
      if (reg > 0 || ot > 0) daysWorked++;
      const loc = e.clockInLocation ?? e.clockOutLocation ?? null;
      let key: string;
      if (!loc) key = NO_GPS;
      else { const s = nearestSite(loc, sites); key = s ? s.name : OFF_SITE; }
      perSite.set(key, (perSite.get(key) ?? 0) + dayTotal);
      const proj = (e.projectName || '').trim() || UNASSIGNED;
      perProject.set(proj, (perProject.get(proj) ?? 0) + dayTotal);
    }
    const total = regular + extended;
    const toRows = (m: Map<string, number>) => Array.from(m.entries())
      .map(([name, hours]) => ({ name, hours, pct: total > 0 ? (hours / total) * 100 : 0 }))
      .sort((a, b) => b.hours - a.hours);
    return { regular, extended, total, daysWorked, siteRows: toRows(perSite), projectRows: toRows(perProject) };
  }, [monthEntries, sites]);

  const prev = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const siteFor = (e: DTREntry): { label: string; loc: { lat: number; lng: number } | null } => {
    const loc = e.clockInLocation ?? e.clockOutLocation ?? null;
    if (!loc) return { label: NO_GPS, loc: null };
    const s = nearestSite(loc, sites);
    return { label: s ? s.name : OFF_SITE, loc };
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {onBack && <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ textTransform: 'none', color: NET }}>Employees</Button>}
        <Typography sx={{ fontWeight: 700, color: NET, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
          {employeeName || 'Employee'} — Hours Dashboard
        </Typography>
      </Stack>

      {/* Month nav */}
      <Paper sx={{ p: 1, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <IconButton size="small" onClick={prev}><ChevronLeftIcon /></IconButton>
        <Typography sx={{ fontWeight: 600, color: NET, minWidth: 150, textAlign: 'center' }}>{MONTHS[month]} {year}</Typography>
        <IconButton size="small" onClick={next}><ChevronRightIcon /></IconButton>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, md: 3 }}><KpiCard icon={<ScheduleIcon fontSize="inherit" />} label="Regular hours" value={hrs(stats.regular)} color="#2853c0" /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><KpiCard icon={<MoreTimeIcon fontSize="inherit" />} label="Extended (OT) hours" value={hrs(stats.extended)} color="#ff9800" /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><KpiCard icon={<ScheduleIcon fontSize="inherit" />} label="Total hours" value={hrs(stats.total)} color="#4caf50" /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><KpiCard icon={<EventAvailableIcon fontSize="inherit" />} label="Days worked" value={String(stats.daysWorked)} color="#9c27b0" /></Grid>
          </Grid>

          {/* Hours per project (where to charge) */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NET, mb: 1 }}>Hours per project</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f7fa' } }}>
                  <TableCell>Project (charge to)</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Share</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.projectRows.length === 0 ? (
                  <TableRow><TableCell colSpan={3} sx={{ color: 'text.secondary' }}>No hours recorded this month.</TableCell></TableRow>
                ) : stats.projectRows.map((r) => (
                  <TableRow key={r.name} hover>
                    <TableCell sx={{ color: r.name === UNASSIGNED ? 'text.secondary' : 'inherit' }}>
                      {r.name}
                      {r.name === UNASSIGNED && <Chip size="small" label="no project" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem' }} />}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{hrs(r.hours)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{r.pct.toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Hours per site */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NET, mb: 1 }}>Hours per location</Typography>
          {sites.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>No work sites defined yet. Add sites under the Work Sites tab so clocked hours can be attributed to named locations.</Alert>
          )}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f7fa' } }}>
                  <TableCell>Location</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Share</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.siteRows.length === 0 ? (
                  <TableRow><TableCell colSpan={3} sx={{ color: 'text.secondary' }}>No hours recorded this month.</TableCell></TableRow>
                ) : stats.siteRows.map((r) => (
                  <TableRow key={r.name} hover>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PlaceIcon sx={{ fontSize: 15, color: r.name === NO_GPS || r.name === OFF_SITE ? 'text.disabled' : NET }} />
                        {r.name}
                        {(r.name === NO_GPS || r.name === OFF_SITE) && <Chip size="small" label="unattributed" sx={{ height: 16, fontSize: '0.6rem' }} />}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{hrs(r.hours)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{r.pct.toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Daily detail */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NET, mb: 1 }}>Daily detail</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f7fa', whiteSpace: 'nowrap' } }}>
                  <TableCell>Date</TableCell>
                  <TableCell>In</TableCell>
                  <TableCell>Out</TableCell>
                  <TableCell align="right">Reg</TableCell>
                  <TableCell align="right">OT</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Location</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {monthEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={7} sx={{ color: 'text.secondary' }}>No entries this month.</TableCell></TableRow>
                ) : [...monthEntries].sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || '')).map((e) => {
                  const site = siteFor(e);
                  return (
                    <TableRow key={e.id || e.entryDate} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.entryDate}</TableCell>
                      <TableCell>{e.timeIn || '—'}</TableCell>
                      <TableCell>{e.timeOut || '—'}</TableCell>
                      <TableCell align="right">{Number(e.regularHours) || 0}</TableCell>
                      <TableCell align="right" sx={{ color: (Number(e.overtimeHours) || 0) > 0 ? '#ff9800' : 'inherit', fontWeight: (Number(e.overtimeHours) || 0) > 0 ? 700 : 400 }}>
                        {Number(e.overtimeHours) || 0}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.projectName || <Typography component="span" variant="body2" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {site.loc ? (
                          <Link href={`https://www.google.com/maps?q=${site.loc.lat},${site.loc.lng}`} target="_blank" rel="noopener" sx={{ fontSize: '0.8rem' }}>
                            {site.label} 📍
                          </Link>
                        ) : <Typography component="span" variant="body2" color="text.disabled">{site.label}</Typography>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
};

export default EmployeeHoursDashboard;
