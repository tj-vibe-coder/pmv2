import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  Alert,
  Tooltip,
  Link,
  CircularProgress,
  FormControlLabel,
  useMediaQuery,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ArrowBack as ArrowBackIcon,
  MyLocation as MyLocationIcon,
  LocationOn as LocationOnIcon,
  LocationOff as LocationOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import type { DTREntry, DayType } from '../../types/Payroll';
import { isPaidDate, type PaidPeriod } from '../../utils/dtr';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

const DAY_TYPES: { value: DayType; label: string }[] = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'REST_DAY', label: 'Rest Day' },
  { value: 'SPECIAL_HOLIDAY', label: 'Special Hol.' },
  { value: 'REGULAR_HOLIDAY', label: 'Regular Hol.' },
  { value: 'DOUBLE_HOLIDAY', label: 'Double Hol.' },
];

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const API_BASE = '';

/** Get all dates in a given month. */
function getMonthDates(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeHours(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  let diff = (outH * 60 + outM) - (inH * 60 + inM);
  if (diff < 0) diff += 24 * 60;
  return Math.round(diff / 30) * 0.5;
}

// Hours worked beyond this many in a day are classified as overtime. OT hours are
// recorded for monitoring; whether they are *paid* is a separate per-employee
// setting (applyOvertimePay) handled by the payroll engine.
const OT_DAILY_THRESHOLD_HOURS = 9;

/** Split a day's total worked hours into regular (capped at the threshold) and overtime. */
function splitWorkedHours(total: number): { regular: number; overtime: number } {
  if (total <= OT_DAILY_THRESHOLD_HOURS) return { regular: total, overtime: 0 };
  return { regular: OT_DAILY_THRESHOLD_HOURS, overtime: Math.round((total - OT_DAILY_THRESHOLD_HOURS) * 2) / 2 };
}

type GeoLoc = { lat: number; lng: number; accuracy: number };

/** Current wall-clock time as HH:MM (24h). */
function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Best-effort browser geolocation. Resolves to null (never rejects) when the
 * API is missing, permission is denied, or it times out — clock-in still logs
 * the time in that case.
 */
function getLocation(): Promise<GeoLoc | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

const mapsHref = (loc: GeoLoc) => `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;

/** Small pin next to a punch: green Maps link when located, grey "off" when not. */
const LocIndicator: React.FC<{ loc?: GeoLoc; hasTime: boolean }> = ({ loc, hasTime }) => {
  if (loc) {
    return (
      <Tooltip title={`Location captured · ±${Math.round(loc.accuracy)}m — open in Maps`}>
        <Link href={mapsHref(loc)} target="_blank" rel="noopener" sx={{ display: 'inline-flex', ml: 0.25 }}>
          <LocationOnIcon sx={{ fontSize: 15 }} color="success" />
        </Link>
      </Tooltip>
    );
  }
  if (hasTime) {
    return (
      <Tooltip title="Location unavailable for this punch">
        <LocationOffIcon sx={{ fontSize: 15, ml: 0.25 }} color="disabled" />
      </Tooltip>
    );
  }
  return null;
};

interface DayRow {
  date: Date;
  dateStr: string;
  dayName: string;
  isWeekend: boolean;
  // editable fields
  timeIn: string;
  timeOut: string;
  dayType: DayType;
  regularHours: number;
  overtimeHours: number;
  isAbsent: boolean;
  remarks: string;
  // captured on clock-in/out (best-effort GPS)
  clockInLocation?: GeoLoc;
  clockOutLocation?: GeoLoc;
  // tracking
  existingId: string | null; // Firestore doc id if already saved
  dirty: boolean; // changed since load
}

interface DTRPageProps {
  /** Admin view: the linked user-account id of the employee whose DTR to show/edit. Defaults to the logged-in user. */
  employeeId?: string;
  /** Admin view: display name shown in the header. */
  employeeName?: string;
  /** Admin view: back handler to return to the employee list. */
  onBack?: () => void;
}

const DTRPage: React.FC<DTRPageProps> = ({ employeeId: propEmployeeId, employeeName, onBack }) => {
  const { user } = useAuth();
  const isAdminView = propEmployeeId != null;
  const employeeId = propEmployeeId ?? (user?.id != null ? String(user.id) : '');
  // Below the table's min width, switch from the horizontally-scrolling grid to
  // a stacked card-per-day layout that fits a phone screen.
  const isNarrow = useMediaQuery('(max-width:720px)');

  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<DayRow[]>([]);
  const [entries, setEntries] = useState<DTREntry[]>([]);
  const [paidPeriods, setPaidPeriods] = useState<PaidPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Fetch all entries for this employee
  const fetchEntries = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(
        `${API_BASE}/api/dtr?employeeId=${encodeURIComponent(employeeId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to fetch');
      setEntries(await res.json());
    } catch {
      setFeedback({ severity: 'error', message: 'Failed to load DTR entries.' });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Fetch the employee's own payslips to know which dates are already paid.
  // Best-effort: a failure just means no paid-date highlighting.
  const fetchPaidPeriods = useCallback(async () => {
    // my-payslips is self-only; skip in admin view so we don't overlay the
    // admin's own paid periods onto another employee's DTR.
    if (isAdminView) { setPaidPeriods([]); return; }
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/payroll/my-payslips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const slips = await res.json() as { periodStart?: string; periodEnd?: string; runStatus?: string }[];
      setPaidPeriods(
        slips
          .filter(s => s.runStatus === 'PAID' && s.periodStart && s.periodEnd)
          .map(s => ({ periodStart: s.periodStart as string, periodEnd: s.periodEnd as string })),
      );
    } catch {
      /* ignore — highlighting is non-critical */
    }
  }, [isAdminView]);

  useEffect(() => { fetchPaidPeriods(); }, [fetchPaidPeriods]);

  // Build month rows whenever viewMonth/viewYear or entries change
  useEffect(() => {
    const dates = getMonthDates(viewYear, viewMonth);
    const entryMap = new Map<string, DTREntry>();
    entries.forEach(e => entryMap.set(e.entryDate, e));

    setRows(dates.map((d) => {
      const dateStr = toDateStr(d);
      const existing = entryMap.get(dateStr);
      const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      return {
        date: d,
        dateStr,
        dayName: DAY_ABBR[dayOfWeek],
        isWeekend,
        timeIn: existing?.timeIn || '',
        timeOut: existing?.timeOut || '',
        dayType: existing?.dayType || (isWeekend ? 'REST_DAY' : 'REGULAR'),
        regularHours: existing?.regularHours ?? 0,
        overtimeHours: existing?.overtimeHours ?? 0,
        isAbsent: existing?.isAbsent ?? false,
        remarks: existing?.remarks || '',
        clockInLocation: existing?.clockInLocation,
        clockOutLocation: existing?.clockOutLocation,
        existingId: existing?.id || null,
        dirty: false,
      };
    }));
  }, [viewMonth, viewYear, entries]);

  const updateRow = (index: number, field: keyof DayRow, value: string | number | boolean) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const updated = { ...r, [field]: value, dirty: true };
      // Auto-compute hours when time changes
      if (field === 'timeIn' || field === 'timeOut') {
        const tIn = field === 'timeIn' ? (value as string) : r.timeIn;
        const tOut = field === 'timeOut' ? (value as string) : r.timeOut;
        if (tIn && tOut) {
          const { regular, overtime } = splitWorkedHours(computeHours(tIn, tOut));
          updated.regularHours = regular;
          updated.overtimeHours = overtime;
        }
      }
      // Absent clears times and hours
      if (field === 'isAbsent' && value === true) {
        updated.timeIn = '';
        updated.timeOut = '';
        updated.regularHours = 0;
        updated.overtimeHours = 0;
      }
      return updated;
    }));
  };

  // Which cell is currently acquiring GPS (disables its button + shows spinner).
  const [clocking, setClocking] = useState<{ index: number; field: 'in' | 'out' } | null>(null);

  // Stamp the current time on a row and attach a best-effort GPS fix. Location
  // failure never blocks the punch — the time is still recorded.
  const handleClock = async (index: number, field: 'in' | 'out') => {
    setClocking({ index, field });
    const stamp = nowHM();
    const loc = await getLocation();
    setRows(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const updated: DayRow = { ...r, dirty: true };
      if (field === 'in') {
        updated.timeIn = stamp;
        updated.clockInLocation = loc ?? undefined;
      } else {
        updated.timeOut = stamp;
        updated.clockOutLocation = loc ?? undefined;
      }
      if (updated.timeIn && updated.timeOut) {
        const { regular, overtime } = splitWorkedHours(computeHours(updated.timeIn, updated.timeOut));
        updated.regularHours = regular;
        updated.overtimeHours = overtime;
      }
      return updated;
    }));
    setClocking(null);
    setFeedback(
      loc
        ? { severity: 'success', message: `Clocked ${field === 'in' ? 'in' : 'out'} at ${stamp} · location captured.` }
        : { severity: 'warning', message: `Clocked ${field === 'in' ? 'in' : 'out'} at ${stamp} — location unavailable (permission denied or GPS off).` },
    );
  };

  const dirtyRows = useMemo(() => rows.filter(r => r.dirty), [rows]);
  const monthTotal = useMemo(() => rows.reduce((s, r) => s + r.regularHours + r.overtimeHours, 0), [rows]);

  const handleSaveWeek = async () => {
    if (!employeeId) {
      setFeedback({ severity: 'error', message: 'User ID not available. Please log out and log back in.' });
      return;
    }
    if (dirtyRows.length === 0) {
      setFeedback({ severity: 'warning', message: 'No changes to save.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const token = localStorage.getItem('netpacific_token');
    let saved = 0;
    let errors = 0;
    for (const row of dirtyRows) {
      const body = {
        employeeId,
        entryDate: row.dateStr,
        timeIn: row.isAbsent ? '' : row.timeIn,
        timeOut: row.isAbsent ? '' : row.timeOut,
        dayType: row.dayType,
        regularHours: row.isAbsent ? 0 : row.regularHours,
        overtimeHours: row.isAbsent ? 0 : row.overtimeHours,
        nightDiffHours: 0,
        isAbsent: row.isAbsent,
        tardinessMinutes: 0,
        remarks: row.remarks,
        clockInLocation: row.isAbsent ? null : (row.clockInLocation ?? null),
        clockOutLocation: row.isAbsent ? null : (row.clockOutLocation ?? null),
      };
      try {
        const url = row.existingId ? `${API_BASE}/api/dtr/${row.existingId}` : `${API_BASE}/api/dtr`;
        const method = row.existingId ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error || 'Save failed');
        }
        saved++;
      } catch {
        errors++;
      }
    }
    setSaving(false);
    if (errors > 0) {
      setFeedback({ severity: 'warning', message: `Saved ${saved} entries, ${errors} failed. Check for duplicate dates.` });
    } else {
      setFeedback({ severity: 'success', message: `Saved ${saved} entries.` });
    }
    await fetchEntries();
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const goToCurrentMonth = () => { setViewMonth(new Date().getMonth()); setViewYear(new Date().getFullYear()); };

  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  const now = new Date();
  const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();

  // Time In / Out cell. Today (unpaid) → Clock In/Out button that stamps the
  // current time + GPS; other days keep the manual time picker.
  const renderTimeCell = (row: DayRow, index: number, field: 'in' | 'out', paid: boolean, isToday: boolean) => {
    const value = field === 'in' ? row.timeIn : row.timeOut;
    const loc = field === 'in' ? row.clockInLocation : row.clockOutLocation;
    const busy = clocking?.index === index && clocking.field === field;

    // Manual picker for other days, paid (locked) rows, or the admin editing
    // someone else's DTR — clock-in only makes sense on your own today's row.
    if (!isToday || paid || isAdminView) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            size="small"
            type="time"
            value={value}
            onChange={(e) => updateRow(index, field === 'in' ? 'timeIn' : 'timeOut', e.target.value)}
            disabled={row.isAbsent || paid}
            variant="standard"
            InputProps={{ disableUnderline: true }}
            inputProps={{ style: { fontSize: '0.8125rem', padding: '2px 0' } }}
            fullWidth
          />
          <LocIndicator loc={loc} hasTime={!!value} />
        </Box>
      );
    }

    if (value) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{value}</Typography>
          <LocIndicator loc={loc} hasTime />
          {!row.isAbsent && (
            <Tooltip title={`Re-clock ${field} (update time & location)`}>
              <span>
                <IconButton size="small" onClick={() => handleClock(index, field)} disabled={busy} sx={{ p: 0.25 }}>
                  {busy ? <CircularProgress size={13} /> : <MyLocationIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      );
    }

    return (
      <Button
        size="small"
        variant="outlined"
        startIcon={busy ? <CircularProgress size={13} /> : <LocationOnIcon sx={{ fontSize: 16 }} />}
        onClick={() => handleClock(index, field)}
        disabled={row.isAbsent || busy}
        sx={{ textTransform: 'none', py: 0.1, px: 0.75, minWidth: 0, fontSize: '0.72rem', whiteSpace: 'nowrap' }}
      >
        {busy ? 'Locating…' : field === 'in' ? 'Clock In' : 'Clock Out'}
      </Button>
    );
  };

  // Phone layout: one card per day instead of a wide horizontally-scrolling row.
  const renderDayCard = (row: DayRow, index: number, paid: boolean, isToday: boolean) => {
    const bg = paid ? '#e8f5e9' : row.dirty ? '#fffde7' : row.isAbsent ? '#fce4ec' : isToday ? '#e8f0fe' : '#fff';
    const capSx = { display: 'block', color: 'text.secondary', fontSize: '0.68rem', mb: 0.25 } as const;
    return (
      <Paper
        key={row.dateStr}
        variant="outlined"
        sx={{ p: 1.25, bgcolor: bg, borderColor: isToday && !paid ? NET_PACIFIC_COLORS.primary : '#e2e8f0' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {row.dayName} · {row.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Typography>
            {paid && <Chip label="Paid" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />}
            {!paid && isToday && <Chip label="Today" size="small" color="info" sx={{ height: 18, fontSize: '0.65rem' }} />}
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={row.isAbsent}
                disabled={paid}
                onChange={(e) => updateRow(index, 'isAbsent', e.target.checked)}
                sx={{ p: 0.25 }}
              />
            }
            label="Absent"
            sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.72rem' } }}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
          <Box>
            <Typography component="span" sx={capSx}>Time In</Typography>
            {renderTimeCell(row, index, 'in', paid, isToday)}
          </Box>
          <Box>
            <Typography component="span" sx={capSx}>Time Out</Typography>
            {renderTimeCell(row, index, 'out', paid, isToday)}
          </Box>
          <Box>
            <Typography component="span" sx={capSx}>Reg. Hours</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.regularHours}</Typography>
          </Box>
          <Box>
            <Typography component="span" sx={capSx}>OT</Typography>
            <TextField
              size="small"
              type="number"
              value={row.overtimeHours}
              onChange={(e) => updateRow(index, 'overtimeHours', Number(e.target.value))}
              disabled={row.isAbsent || paid}
              variant="standard"
              InputProps={{ disableUnderline: true }}
              inputProps={{ min: 0, max: 16, step: 0.5, style: { fontSize: '0.8125rem', padding: '2px 0' } }}
              fullWidth
            />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Box>
            <Typography component="span" sx={capSx}>Day Type</Typography>
            <FormControl size="small" variant="standard" fullWidth>
              <Select
                value={row.dayType}
                onChange={(e) => updateRow(index, 'dayType', e.target.value)}
                disableUnderline
                disabled={paid}
                sx={{ fontSize: '0.8125rem' }}
              >
                {DAY_TYPES.map(dt => (
                  <MenuItem key={dt.value} value={dt.value} sx={{ fontSize: '0.8125rem' }}>{dt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography component="span" sx={capSx}>Remarks</Typography>
            <TextField
              size="small"
              value={row.remarks}
              onChange={(e) => updateRow(index, 'remarks', e.target.value)}
              disabled={paid}
              placeholder="—"
              variant="standard"
              InputProps={{ disableUnderline: true }}
              inputProps={{ style: { fontSize: '0.8125rem', padding: '2px 0' } }}
              fullWidth
            />
          </Box>
        </Box>
      </Paper>
    );
  };

  const cellSx = { py: 0.5, px: 0.5, fontSize: '0.8125rem' };
  const headerSx = { fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', py: 1, px: 0.5, whiteSpace: 'nowrap' as const };

  return (
    <Box>
      {/* Admin view header */}
      {isAdminView && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}>
            Employees
          </Button>
          <Typography sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            {employeeName || 'Employee'} — DTR
          </Typography>
        </Box>
      )}

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mb: 1.5 }}>
          {feedback.message}
        </Alert>
      )}

      {/* Month navigation */}
      <Paper sx={{ p: { xs: 1, sm: 1.5 }, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: { xs: 1, sm: 0 } }}>
          <IconButton size="small" onClick={prevMonth} title="Previous month">
            <ChevronLeftIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, textAlign: 'center', fontSize: { xs: '0.95rem', sm: '1.25rem' }, minWidth: 160 }}>
            {monthLabel}
          </Typography>
          <IconButton size="small" onClick={nextMonth} title="Next month">
            <ChevronRightIcon />
          </IconButton>
          {!isCurrentMonth && (
            <Button size="small" onClick={goToCurrentMonth} sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary, minWidth: 0, px: 1 }}>
              Today
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
          {loading && <Chip label="Loading..." size="small" variant="outlined" />}
          <Chip label={`${monthTotal} hrs`} size="small" color="primary" variant="outlined" />
          {dirtyRows.length > 0 && (
            <Chip label={`${dirtyRows.length} unsaved`} size="small" color="warning" variant="outlined" />
          )}
        </Box>
      </Paper>

      {/* Phone: stacked day cards */}
      {isNarrow && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
          {rows.map((row, index) => {
            const isToday = row.dateStr === toDateStr(new Date());
            const paid = isPaidDate(row.dateStr, paidPeriods);
            return renderDayCard(row, index, paid, isToday);
          })}
          {rows.length > 0 && (
            <Paper variant="outlined" sx={{ p: 1, display: 'flex', justifyContent: 'space-between', bgcolor: '#f8fafc' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>Month Total</Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                {rows.reduce((s, r) => s + r.regularHours, 0)} hrs
                {rows.reduce((s, r) => s + r.overtimeHours, 0) > 0 ? ` + ${rows.reduce((s, r) => s + r.overtimeHours, 0)} OT` : ''}
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* Weekly timesheet grid (tablet/desktop) */}
      {!isNarrow && (
      <TableContainer component={Paper} sx={{ mb: 1.5, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Table size="small" sx={{ minWidth: 700, '& td, & th': { border: '1px solid #e2e8f0' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerSx}>Day</TableCell>
              <TableCell sx={headerSx}>Date</TableCell>
              <TableCell sx={headerSx}>Time In</TableCell>
              <TableCell sx={headerSx}>Time Out</TableCell>
              <TableCell sx={headerSx}>Hours</TableCell>
              <TableCell sx={headerSx}>OT</TableCell>
              <TableCell sx={headerSx}>Day Type</TableCell>
              <TableCell sx={{ ...headerSx, textAlign: 'center' }}>Absent</TableCell>
              <TableCell sx={headerSx}>Remarks</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => {
              const isToday = row.dateStr === toDateStr(new Date());
              const paid = isPaidDate(row.dateStr, paidPeriods);
              const rowBg = paid
                ? '#e8f5e9'
                : row.dirty
                ? '#fffde7'
                : row.isAbsent
                ? '#fce4ec'
                : row.isWeekend
                ? '#f5f5f5'
                : isToday
                ? '#e8f0fe'
                : '#fff';
              return (
                <TableRow key={row.dateStr} sx={{ bgcolor: rowBg }}>
                  <TableCell sx={{ ...cellSx, fontWeight: 600, width: 40 }}>
                    {row.dayName}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', width: 90 }}>
                    {row.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {paid && <Chip label="Paid" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }} color="success" />}
                    {!paid && isToday && <Chip label="Today" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }} color="info" />}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 118 }}>
                    {renderTimeCell(row, index, 'in', paid, isToday)}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 118 }}>
                    {renderTimeCell(row, index, 'out', paid, isToday)}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 60, textAlign: 'right', fontWeight: 600 }}>
                    {row.regularHours}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 55 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.overtimeHours}
                      onChange={(e) => updateRow(index, 'overtimeHours', Number(e.target.value))}
                      disabled={row.isAbsent || paid}
                      variant="standard"
                      InputProps={{ disableUnderline: true }}
                      inputProps={{ min: 0, max: 16, step: 0.5, style: { fontSize: '0.8125rem', padding: '2px 0', textAlign: 'right' } }}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 110 }}>
                    <FormControl size="small" variant="standard" fullWidth>
                      <Select
                        value={row.dayType}
                        onChange={(e) => updateRow(index, 'dayType', e.target.value)}
                        disableUnderline
                        disabled={paid}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        {DAY_TYPES.map(dt => (
                          <MenuItem key={dt.value} value={dt.value} sx={{ fontSize: '0.8125rem' }}>{dt.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 50, textAlign: 'center' }}>
                    <Checkbox
                      size="small"
                      checked={row.isAbsent}
                      onChange={(e) => updateRow(index, 'isAbsent', e.target.checked)}
                      disabled={paid}
                      sx={{ p: 0 }}
                    />
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <TextField
                      size="small"
                      value={row.remarks}
                      onChange={(e) => updateRow(index, 'remarks', e.target.value)}
                      disabled={paid}
                      placeholder="—"
                      variant="standard"
                      InputProps={{ disableUnderline: true }}
                      inputProps={{ style: { fontSize: '0.8125rem', padding: '2px 0' } }}
                      fullWidth
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals row */}
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell colSpan={4} sx={{ ...cellSx, fontWeight: 600, textAlign: 'right' }}>
                Month Total
              </TableCell>
              <TableCell sx={{ ...cellSx, fontWeight: 700, textAlign: 'right' }}>
                {rows.reduce((s, r) => s + r.regularHours, 0)}
              </TableCell>
              <TableCell sx={{ ...cellSx, fontWeight: 700, textAlign: 'right' }}>
                {rows.reduce((s, r) => s + r.overtimeHours, 0) || '—'}
              </TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      )}

      {/* Save bar */}
      <Paper
        elevation={3}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          borderTop: `2px solid ${NET_PACIFIC_COLORS.primary}`,
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1, minWidth: 120, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
          {monthLabel} — {monthTotal} total hours
        </Typography>
        <Button
          variant="contained"
          size="small"
          onClick={handleSaveWeek}
          disabled={saving || dirtyRows.length === 0}
          sx={{ bgcolor: NET_PACIFIC_COLORS.primary, whiteSpace: 'nowrap' }}
          fullWidth={false}
        >
          {saving ? 'Saving...' : dirtyRows.length > 0 ? `Save ${dirtyRows.length} day${dirtyRows.length > 1 ? 's' : ''}` : 'Saved'}
        </Button>
      </Paper>
    </Box>
  );
};

export default DTRPage;
