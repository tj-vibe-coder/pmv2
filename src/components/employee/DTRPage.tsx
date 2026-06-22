import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Alert,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import type { DTREntry, DayType } from '../../types/Payroll';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

const DAY_TYPES: { value: DayType; label: string }[] = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'REST_DAY', label: 'Rest Day' },
  { value: 'SPECIAL_HOLIDAY', label: 'Special Holiday' },
  { value: 'REGULAR_HOLIDAY', label: 'Regular Holiday' },
  { value: 'DOUBLE_HOLIDAY', label: 'Double Holiday' },
];

const API_BASE = '';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DTRPage: React.FC = () => {
  const { user } = useAuth();
  const employeeId = user?.id != null ? String(user.id) : '';

  // Form state
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [dayType, setDayType] = useState<DayType>('REGULAR');
  const [regularHours, setRegularHours] = useState(8);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightDiffHours, setNightDiffHours] = useState(0);
  const [tardinessMinutes, setTardinessMinutes] = useState(0);
  const [isAbsent, setIsAbsent] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Auto-compute regular hours from time in/out
  useEffect(() => {
    if (!timeIn || !timeOut || isAbsent) return;
    const [inH, inM] = timeIn.split(':').map(Number);
    const [outH, outM] = timeOut.split(':').map(Number);
    let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // overnight shift
    const hours = Math.round(diffMinutes / 30) * 0.5; // round to nearest 0.5
    setRegularHours(Math.max(0, hours));
  }, [timeIn, timeOut, isAbsent]);

  // Data state
  const [entries, setEntries] = useState<DTREntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(() => new Date().getMonth());
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());

  // Accordion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    entry: true,
    history: true,
  });
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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
      const data = await res.json();
      setEntries(data);
    } catch {
      setFeedback({ severity: 'error', message: 'Failed to load DTR entries.' });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filteredEntries = useMemo(() => {
    return entries
      .filter(e => {
        const d = new Date(e.entryDate);
        return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      })
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }, [entries, filterMonth, filterYear]);

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setTimeIn('');
    setTimeOut('');
    setDayType('REGULAR');
    setRegularHours(8);
    setOvertimeHours(0);
    setNightDiffHours(0);
    setTardinessMinutes(0);
    setIsAbsent(false);
    setRemarks('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!employeeId) {
      setFeedback({ severity: 'error', message: 'User ID not available. Please log out and log back in.' });
      return;
    }
    if (!entryDate) {
      setFeedback({ severity: 'warning', message: 'Please select a date.' });
      return;
    }
    const token = localStorage.getItem('netpacific_token');
    const body = {
      employeeId,
      entryDate,
      timeIn: isAbsent ? '' : timeIn,
      timeOut: isAbsent ? '' : timeOut,
      dayType,
      regularHours: isAbsent ? 0 : regularHours,
      overtimeHours: isAbsent ? 0 : overtimeHours,
      nightDiffHours: isAbsent ? 0 : nightDiffHours,
      isAbsent,
      tardinessMinutes: isAbsent ? 0 : tardinessMinutes,
      remarks,
    };
    try {
      const url = editingId ? `${API_BASE}/api/dtr/${editingId}` : `${API_BASE}/api/dtr`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Save failed');
      }
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2000);
      resetForm();
      await fetchEntries();
    } catch (e) {
      setFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to save.' });
    }
  };

  const handleLoad = (entry: DTREntry) => {
    setEntryDate(entry.entryDate);
    setTimeIn(entry.timeIn || '');
    setTimeOut(entry.timeOut || '');
    setDayType(entry.dayType);
    setRegularHours(entry.regularHours);
    setOvertimeHours(entry.overtimeHours);
    setNightDiffHours(entry.nightDiffHours);
    setTardinessMinutes(entry.tardinessMinutes);
    setIsAbsent(entry.isAbsent);
    setRemarks(entry.remarks || '');
    setEditingId(entry.id || null);
    setExpandedSections(prev => ({ ...prev, entry: true }));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this DTR entry? This cannot be undone.')) return;
    const token = localStorage.getItem('netpacific_token');
    try {
      const res = await fetch(`${API_BASE}/api/dtr/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      if (editingId === id) resetForm();
      await fetchEntries();
    } catch {
      setFeedback({ severity: 'error', message: 'Failed to delete entry.' });
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ pb: 2 }}>
        {feedback && (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mb: 1 }}>
            {feedback.message}
          </Alert>
        )}

        {/* Accordion 1: New / Edit Entry */}
        <Accordion
          expanded={expandedSections.entry}
          onChange={() => toggleSection('entry')}
          disableGutters
          elevation={0}
          sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
              {editingId ? 'Edit Entry' : 'New Entry'}
            </Typography>
            {entryDate && (
              <Chip label="Ready" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
            )}
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Day Type</InputLabel>
                  <Select
                    value={dayType}
                    label="Day Type"
                    onChange={(e) => setDayType(e.target.value as DayType)}
                  >
                    {DAY_TYPES.map(dt => (
                      <MenuItem key={dt.value} value={dt.value}>{dt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Time In"
                  type="time"
                  value={timeIn}
                  onChange={(e) => setTimeIn(e.target.value)}
                  disabled={isAbsent}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Time Out"
                  type="time"
                  value={timeOut}
                  onChange={(e) => setTimeOut(e.target.value)}
                  disabled={isAbsent}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isAbsent}
                      onChange={(e) => {
                        setIsAbsent(e.target.checked);
                        if (e.target.checked) {
                          setTimeIn('');
                          setTimeOut('');
                          setRegularHours(0);
                          setOvertimeHours(0);
                          setNightDiffHours(0);
                          setTardinessMinutes(0);
                        } else {
                          setRegularHours(8);
                        }
                      }}
                    />
                  }
                  label="Absent"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Regular Hours"
                  type="number"
                  value={regularHours}
                  onChange={(e) => setRegularHours(Number(e.target.value))}
                  disabled={isAbsent}
                  inputProps={{ min: 0, max: 24, step: 0.5 }}
                  helperText={timeIn && timeOut && !isAbsent ? 'Auto-computed from time in/out' : ''}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Overtime Hours"
                  type="number"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(Number(e.target.value))}
                  disabled={isAbsent}
                  inputProps={{ min: 0, max: 16, step: 0.5 }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Night Diff Hours"
                  type="number"
                  value={nightDiffHours}
                  onChange={(e) => setNightDiffHours(Number(e.target.value))}
                  disabled={isAbsent}
                  inputProps={{ min: 0, max: 16, step: 0.5 }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Tardiness (min)"
                  type="number"
                  value={tardinessMinutes}
                  onChange={(e) => setTardinessMinutes(Number(e.target.value))}
                  disabled={isAbsent}
                  inputProps={{ min: 0, step: 1 }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. site work at LBI plant"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Accordion 2: DTR History */}
        <Accordion
          expanded={expandedSections.history}
          onChange={() => toggleSection('history')}
          disableGutters
          elevation={0}
          sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
              My DTR History
            </Typography>
            <Chip
              label={loading ? 'Loading…' : `${filteredEntries.length} entries`}
              size="small"
              variant="outlined"
              sx={{ mr: 1 }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {/* Month / Year filters */}
            <Box sx={{ display: 'flex', gap: 1.5, px: 2, py: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Month</InputLabel>
                <Select
                  value={filterMonth}
                  label="Month"
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <MenuItem key={i} value={i}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Year</InputLabel>
                <Select
                  value={filterYear}
                  label="Year"
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                >
                  {years.map(y => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <TableContainer>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Time In</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Time Out</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Day Type</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Hrs</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>OT</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Remarks</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No entries for {MONTHS[filterMonth]} {filterYear}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        hover
                        selected={editingId === entry.id}
                        sx={editingId === entry.id ? { bgcolor: '#e8f0fe' } : undefined}
                      >
                        <TableCell>
                          {new Date(entry.entryDate + 'T00:00:00').toLocaleDateString('en-US', { dateStyle: 'medium' })}
                        </TableCell>
                        <TableCell>{entry.timeIn || '—'}</TableCell>
                        <TableCell>{entry.timeOut || '—'}</TableCell>
                        <TableCell>
                          {entry.isAbsent ? (
                            <Chip label="Absent" size="small" color="error" variant="outlined" />
                          ) : (
                            DAY_TYPES.find(dt => dt.value === entry.dayType)?.label ?? entry.dayType
                          )}
                        </TableCell>
                        <TableCell align="right">{entry.regularHours}</TableCell>
                        <TableCell align="right">{entry.overtimeHours || '—'}</TableCell>
                        <TableCell
                          sx={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.remarks || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Button
                            size="small"
                            onClick={() => handleLoad(entry)}
                            sx={{ color: NET_PACIFIC_COLORS.primary, textTransform: 'none', minWidth: 0 }}
                          >
                            Edit
                          </Button>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(entry.id!)}
                            title="Delete entry"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Sticky bottom bar */}
      <Paper
        elevation={3}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          borderTop: `2px solid ${NET_PACIFIC_COLORS.primary}`,
          px: 2,
          py: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              {MONTHS[filterMonth]} {filterYear} — {filteredEntries.length} entries
            </Typography>
            {editingId && (
              <Chip
                label={`Editing ${new Date(entryDate + 'T00:00:00').toLocaleDateString('en-US', { dateStyle: 'medium' })}`}
                size="small"
                color="info"
                variant="outlined"
                sx={{ mt: 0.5 }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {editingId && (
              <Button
                variant="outlined"
                size="small"
                onClick={resetForm}
                sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="contained"
              size="small"
              onClick={handleSave}
              disabled={!entryDate}
              sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
            >
              {saveFeedback ? 'Saved!' : editingId ? 'Update' : 'Save Entry'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default DTRPage;
