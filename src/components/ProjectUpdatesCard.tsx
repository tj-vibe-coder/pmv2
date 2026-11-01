import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import {
  PROJECT_UPDATE_STATUSES,
  PROJECT_UPDATE_TYPES,
  ProjectUpdate,
  ProjectUpdateType,
  deleteProjectUpdate,
  listProjectUpdates,
  postProjectUpdate,
} from '../services/projectUpdatesService';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

const TYPE_COLORS: Record<ProjectUpdateType, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'> = {
  Progress: 'primary',
  Submittal: 'info',
  'Site work': 'success',
  Delivery: 'success',
  Meeting: 'secondary',
  Client: 'secondary',
  Billing: 'warning',
  Issue: 'error',
  Other: 'default',
};

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface ProjectUpdatesCardProps {
  projectId: string | number;
  currentUserId?: string | number | null;
  isSuperadmin?: boolean;
  canPost?: boolean;
  /** Open the Post update dialog on load (e.g. from a ?update=1 link on a phone). */
  openOnLoad?: boolean;
  /** Called with the list on load, and after a post or delete so the page can refresh status/progress and the timeline. */
  onChanged?: (updates: ProjectUpdate[], reason: 'load' | 'post' | 'delete') => void;
}

const EMPTY_FORM = {
  date: todayIso(),
  type: 'Progress' as ProjectUpdateType,
  note: '',
  status: '',
  progress: '',
  next_step: '',
  next_date: '',
  link: '',
};

export default function ProjectUpdatesCard({
  projectId,
  currentUserId,
  isSuperadmin = false,
  canPost = true,
  openOnLoad = false,
  onChanged,
}: ProjectUpdatesCardProps): React.ReactElement {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await listProjectUpdates(projectId);
      setUpdates(rows);
      return rows;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load updates');
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load().then((rows) => { if (rows) onChanged?.(rows, 'load'); });
    // onChanged is a callback prop; reloading on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (openOnLoad && canPost) {
      setForm({ ...EMPTY_FORM, date: todayIso() });
      setOpen(true);
    }
  }, [openOnLoad, canPost]);

  const openDialog = () => {
    setForm({ ...EMPTY_FORM, date: todayIso() });
    setSaveError('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.note.trim()) {
      setSaveError('Write what happened.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await postProjectUpdate(projectId, {
        note: form.note.trim(),
        type: form.type,
        date: form.date || undefined,
        status: form.status || undefined,
        progress: form.progress === '' ? undefined : Number(form.progress),
        next_step: form.next_step.trim() || undefined,
        next_date: form.next_date || undefined,
        link: form.link.trim() || undefined,
      });
      setOpen(false);
      const rows = await load();
      if (rows) onChanged?.(rows, 'post');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: ProjectUpdate) => {
    if (!window.confirm('Delete this update?')) return;
    try {
      await deleteProjectUpdate(projectId, u.id);
      const rows = await load();
      if (rows) onChanged?.(rows, 'delete');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const visible = showAll ? updates : updates.slice(0, 8);

  return (
    <Paper
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
        mb: 3,
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          rowGap: 1,
          columnGap: 1,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            Project Updates
          </Typography>
          <Typography variant="caption" color="text.secondary">
            What happened on this job, newest first. Posted by the team and by Claude.
          </Typography>
        </Box>
        {canPost && (
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openDialog}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Post update
          </Button>
        )}
      </Box>

      <Box sx={{ p: 1.5 }}>
        {loadError && <Alert severity="error" sx={{ mb: 1.5 }}>{loadError}</Alert>}
        {loading && updates.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Loading updates…</Typography>
        ) : updates.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No updates yet. Post the first one, e.g. "Sent shop drawings Rev.0 to the client."
          </Typography>
        ) : (
          <Stack spacing={1.25}>
            {visible.map((u) => {
              const canDelete = isSuperadmin || (currentUserId != null && String(currentUserId) === String(u.posted_by_id));
              return (
                <Box
                  key={u.id}
                  sx={{
                    borderLeft: '3px solid',
                    borderColor: u.risk === 'high' || u.type === 'Issue' ? 'error.main' : '#cbd5e1',
                    pl: 1.5,
                    py: 0.25,
                  }}
                >
                  <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={0.75} sx={{ mb: 0.25 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>{formatDate(u.date)}</Typography>
                    <Chip label={u.type} size="small" color={TYPE_COLORS[u.type] || 'default'} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    {u.status && <Chip label={u.status} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />}
                    {u.progress != null && <Chip label={`${u.progress}%`} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      {u.posted_via === 'agent' && <SmartToyOutlinedIcon sx={{ fontSize: 14 }} />}
                      {u.posted_by}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    {canDelete && (
                      <Tooltip title="Delete update">
                        <IconButton size="small" aria-label="Delete update" onClick={() => void remove(u)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{u.note}</Typography>
                  {(u.next_step || u.next_date) && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      Next: {u.next_step || '—'}{u.next_date ? ` (by ${formatDate(u.next_date)})` : ''}
                    </Typography>
                  )}
                  {u.link && (
                    <Link href={u.link} target="_blank" rel="noopener noreferrer" variant="caption">
                      Open link
                    </Link>
                  )}
                </Box>
              );
            })}
            {updates.length > 8 && (
              <Button size="small" variant="text" onClick={() => setShowAll((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
                {showAll ? 'Show fewer' : `Show all ${updates.length}`}
              </Button>
            )}
          </Stack>
        )}
      </Box>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ fontWeight: 600 }}>Post project update</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <TextField
              label="What happened?"
              placeholder="e.g. Sent shop drawings Rev.0 to ISTS for review"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              multiline
              minRows={3}
              autoFocus
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ProjectUpdateType })}
                sx={{ minWidth: { xs: '100%', sm: 160 } }}
              >
                {PROJECT_UPDATE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: { xs: '100%', sm: 160 } }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Change status (optional)"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                sx={{ minWidth: { xs: '100%', sm: 200 } }}
              >
                <MenuItem value="">No change</MenuItem>
                {PROJECT_UPDATE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField
                label="Site progress % (optional)"
                type="number"
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
                inputProps={{ min: 0, max: 100, step: 1 }}
                sx={{ minWidth: { xs: '100%', sm: 180 } }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Next step (optional)"
                placeholder="e.g. Await client comments"
                value={form.next_step}
                onChange={(e) => setForm({ ...form, next_step: e.target.value })}
                fullWidth
              />
              <TextField
                label="Next date"
                type="date"
                value={form.next_date}
                onChange={(e) => setForm({ ...form, next_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: { xs: '100%', sm: 160 } }}
              />
            </Stack>
            <TextField
              label="Link (optional)"
              placeholder="OneDrive file or email link (https://…)"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={saving}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {saving ? 'Saving…' : 'Post'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
