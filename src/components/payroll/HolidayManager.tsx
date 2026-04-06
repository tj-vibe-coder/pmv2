import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Chip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import {
  getHolidays, addHoliday, updateHoliday, deleteHoliday, bulkSaveHolidays,
  StoredHoliday,
} from '../../utils/firebasePayroll';

// Nager.Date API response shape
interface NagerHoliday {
  date: string;
  name: string;
  localName: string;
  types: string[];
}

const NAGER_API = 'https://date.nager.at/api/v3/PublicHolidays';

// Nager.Date doesn't distinguish Regular vs Special for PH — we make a best guess
// based on known statutory holidays; user can always correct manually.
const KNOWN_REGULAR: string[] = [
  '01-01', // New Year
  '04-09', // Araw ng Kagitingan
  '05-01', // Labor Day
  '06-12', // Independence Day
  '08-25', '08-26', '08-27', '08-28', '08-29', '08-30', '08-31', // National Heroes (last Mon Aug)
  '11-30', // Bonifacio
  '12-25', // Christmas
  '12-30', // Rizal
  '04-02', '04-03', // Maundy Thu / Good Fri (variable but regular)
];

function guessType(dateStr: string): 'REGULAR' | 'SPECIAL' {
  const mmdd = dateStr.slice(5); // "MM-DD"
  return KNOWN_REGULAR.includes(mmdd) ? 'REGULAR' : 'SPECIAL';
}

const TYPE_COLOR: Record<string, 'error' | 'warning'> = {
  REGULAR: 'error',
  SPECIAL: 'warning',
};

interface FormState {
  date: string;
  name: string;
  type: 'REGULAR' | 'SPECIAL';
}

const EMPTY_FORM: FormState = { date: '', name: '', type: 'REGULAR' };

const HolidayManager: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<StoredHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StoredHoliday | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setHolidays(await getHolidays(year));
    } catch {
      setError('Failed to load holidays.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year]);

  // ── Sync from Nager.Date ────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    setError('');
    try {
      const res = await fetch(`${NAGER_API}/${year}/PH`);
      if (!res.ok) throw new Error('Nager.Date API unavailable');
      const data: NagerHoliday[] = await res.json();

      const mapped: Omit<StoredHoliday, 'id'>[] = data.map((h) => ({
        date: h.date,
        name: h.localName || h.name,
        type: guessType(h.date),
        year,
      }));

      await bulkSaveHolidays(mapped, year);
      setSyncMsg(`Synced ${mapped.length} holidays from Nager.Date. Review types below — Regular vs Special may need manual correction.`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Sync failed. Check your internet connection.');
    } finally {
      setSyncing(false);
    }
  };

  // ── Add / Edit ──────────────────────────────────────────────────────────
  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (h: StoredHoliday) => {
    setEditing(h);
    setForm({ date: h.date, name: h.name, type: h.type });
    setFormOpen(true);
  };

  const handleSaveForm = async () => {
    if (!form.date || !form.name) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await updateHoliday(editing.id, { ...form, year: parseInt(form.date.split('-')[0]) });
      } else {
        await addHoliday({ ...form, year: parseInt(form.date.split('-')[0]) });
      }
      setFormOpen(false);
      await load();
    } catch {
      setError('Failed to save holiday.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: StoredHoliday) => {
    if (!h.id || !window.confirm(`Delete "${h.name}"?`)) return;
    try {
      await deleteHoliday(h.id);
      load();
    } catch { setError('Failed to delete holiday.'); }
  };

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" fontWeight={600}>Holiday Calendar</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField select size="small" value={year} onChange={(e) => setYear(parseInt(e.target.value))} sx={{ width: 100 }}>
            {yearOptions.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
          <Tooltip title="Pull Philippine holidays from Nager.Date (free public API). Holiday types may need manual correction after sync.">
            <Button variant="outlined" startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
              onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing…' : `Sync ${year}`}
            </Button>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ bgcolor: '#2853c0' }}>
            Add Holiday
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {syncMsg && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setSyncMsg('')}>
          {syncMsg}
        </Alert>
      )}

      <Alert severity="warning" sx={{ mb: 2 }} icon={false}>
        <Typography variant="body2">
          <strong>Important:</strong> Nager.Date provides statutory national holidays only.
          Presidential proclamations (ad hoc special holidays) must be added manually.
          Always review holiday <em>types</em> after syncing — Regular vs Special affects OT rates.
        </Typography>
      </Alert>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#2c3242' }}>
              <TableRow>
                {['Date', 'Holiday Name', 'Type', 'OT Premium', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 600 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {holidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No holidays for {year}. Click "Sync {year}" to pull from Nager.Date or add manually.
                  </TableCell>
                </TableRow>
              ) : holidays.map((h) => (
                <TableRow key={h.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {new Date(h.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>
                    <Chip label={h.type.replace('_', ' ')} size="small" color={TYPE_COLOR[h.type]} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {h.type === 'REGULAR'
                        ? 'If absent: 100% pay · If worked: 200%'
                        : 'No work no pay · If worked: +30%'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => openEdit(h)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(h)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editing ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
            <TextField
              label="Holiday Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              select
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'REGULAR' | 'SPECIAL' }))}
              fullWidth
              helperText="Regular: 100% pay even if absent. Special: no work no pay."
            >
              <MenuItem value="REGULAR">Regular Holiday</MenuItem>
              <MenuItem value="SPECIAL">Special Non-Working Holiday</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveForm} disabled={saving} sx={{ bgcolor: '#2853c0' }}>
            {saving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HolidayManager;
