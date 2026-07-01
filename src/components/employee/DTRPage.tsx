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
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import type { DTREntry, DayType } from '../../types/Payroll';
import { needsTimeInput, isPaidDate, type PaidPeriod } from '../../utils/dtr';

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
  // tracking
  existingId: string | null; // Firestore doc id if already saved
  dirty: boolean; // changed since load
}

const DTRPage: React.FC = () => {
  const { user } = useAuth();
  const employeeId = user?.id != null ? String(user.id) : '';

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
  }, []);

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
          updated.regularHours = computeHours(tIn, tOut);
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

  const cellSx = { py: 0.5, px: 0.5, fontSize: '0.8125rem' };
  const headerSx = { fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', py: 1, px: 0.5, whiteSpace: 'nowrap' as const };

  return (
    <Box>
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

      {/* Weekly timesheet grid */}
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
                  <TableCell sx={{ ...cellSx, width: 100 }}>
                    <TextField
                      size="small"
                      type="time"
                      value={row.timeIn}
                      onChange={(e) => updateRow(index, 'timeIn', e.target.value)}
                      disabled={row.isAbsent || paid}
                      variant="standard"
                      InputProps={{ disableUnderline: true }}
                      inputProps={{ style: { fontSize: '0.8125rem', padding: '2px 0' } }}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 100 }}>
                    <TextField
                      size="small"
                      type="time"
                      value={row.timeOut}
                      onChange={(e) => updateRow(index, 'timeOut', e.target.value)}
                      disabled={row.isAbsent || paid}
                      variant="standard"
                      InputProps={{ disableUnderline: true }}
                      inputProps={{ style: { fontSize: '0.8125rem', padding: '2px 0' } }}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      ...cellSx,
                      width: 60,
                      textAlign: 'right',
                      fontWeight: 600,
                      ...(!paid && needsTimeInput(row)
                        ? { bgcolor: '#ffcdd2', color: '#c62828' }
                        : {}),
                    }}
                    title={!paid && needsTimeInput(row) ? 'No time entered' : undefined}
                  >
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
