import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, IconButton, Alert, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Link, Stack, Divider,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Place as PlaceIcon } from '@mui/icons-material';
import type { WorkSite } from '../../types/Payroll';

const API_BASE = '';
const NET = '#2c5aa0';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

type Draft = { id?: string; name: string; lat: string; lng: string; radiusMeters: string };
const EMPTY: Draft = { name: '', lat: '', lng: '', radiusMeters: '150' };

const WorkSitesManager: React.FC = () => {
  const [sites, setSites] = useState<WorkSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<{ lat: number; lng: number; count: number; lastSeen: string }[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/work-sites`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setSites(Array.isArray(data.sites) ? data.sites : []);
      setError(null);
    } catch {
      setError('Failed to load work sites.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setDraft(EMPTY); setSuggestions(null); setDialogOpen(true); };
  const openEdit = (s: WorkSite) => {
    setDraft({ id: s.id, name: s.name, lat: String(s.lat), lng: String(s.lng), radiusMeters: String(s.radiusMeters ?? 150) });
    setSuggestions(null);
    setDialogOpen(true);
  };

  const loadSuggestions = async () => {
    setLoadingSug(true);
    try {
      const res = await fetch(`${API_BASE}/api/work-sites/suggestions`, { headers: authHeaders() });
      const data = res.ok ? await res.json() : { points: [] };
      setSuggestions(Array.isArray(data.points) ? data.points : []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSug(false);
    }
  };

  const save = async () => {
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    if (!draft.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Name and valid coordinates are required.');
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: draft.name.trim(), lat, lng, radiusMeters: Number(draft.radiusMeters) || 150 });
      const url = draft.id ? `${API_BASE}/api/work-sites/${draft.id}` : `${API_BASE}/api/work-sites`;
      const res = await fetch(url, { method: draft.id ? 'PUT' : 'POST', headers: authHeaders(), body });
      if (!res.ok) throw new Error('Save failed');
      setDialogOpen(false);
      await load();
    } catch {
      setError('Failed to save site.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: WorkSite) => {
    if (!window.confirm(`Delete site "${s.name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/work-sites/${s.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Delete failed');
      await load();
    } catch {
      setError('Failed to delete site.');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: NET }}>Work Sites</Typography>
          <Typography variant="caption" color="text.secondary">
            Named locations used to attribute clock-in hours on the employee hours dashboard.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew} sx={{ bgcolor: NET }}>Add site</Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f7fa' } }}>
                <TableCell>Name</TableCell>
                <TableCell>Coordinates</TableCell>
                <TableCell align="right">Radius (m)</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sites.length === 0 ? (
                <TableRow><TableCell colSpan={4} sx={{ color: 'text.secondary' }}>No sites yet. Add one to start attributing hours.</TableCell></TableRow>
              ) : sites.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <PlaceIcon sx={{ fontSize: 16, color: NET }} />{s.name}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Link href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </Link>
                  </TableCell>
                  <TableCell align="right">{s.radiusMeters}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(s)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => remove(s)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{draft.id ? 'Edit site' : 'Add site'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} fullWidth autoFocus />
            <Stack direction="row" spacing={1}>
              <TextField label="Latitude" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} fullWidth />
              <TextField label="Longitude" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} fullWidth />
            </Stack>
            <TextField label="Radius (metres)" type="number" value={draft.radiusMeters} onChange={(e) => setDraft({ ...draft, radiusMeters: e.target.value })} fullWidth helperText="Clock-ins within this distance count as this site (default 150m)." />
            <Typography variant="caption" color="text.secondary">
              Tip: in Google Maps, right-click the spot and click the "lat, lng" numbers to copy them.
            </Typography>

            <Divider sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>or pick from recorded clock-ins</Divider>
            <Button size="small" variant="outlined" onClick={loadSuggestions} disabled={loadingSug} sx={{ alignSelf: 'flex-start' }}>
              {loadingSug ? 'Loading…' : 'Load clock-in spots'}
            </Button>
            {suggestions && (
              suggestions.length === 0 ? (
                <Typography variant="caption" color="text.secondary">No clock-in locations recorded yet.</Typography>
              ) : (
                <Box sx={{ maxHeight: 168, overflowY: 'auto', border: '1px solid #eee', borderRadius: 1 }}>
                  {suggestions.map((p, i) => (
                    <Box
                      key={i}
                      onClick={() => setDraft((d) => ({ ...d, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }))}
                      sx={{ px: 1, py: 0.75, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #f2f2f2', '&:hover': { bgcolor: '#f5f7fa' } }}
                    >
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {p.count} punch{p.count === 1 ? '' : 'es'}{p.lastSeen ? ` · ${p.lastSeen}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving} sx={{ bgcolor: NET }}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WorkSitesManager;
