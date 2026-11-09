import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, TextField, FormControl, InputLabel, Select, MenuItem,
  Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Button, Checkbox, Chip,
  Tooltip, IconButton, Alert, CircularProgress, Link, Collapse, LinearProgress, useMediaQuery,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';

// Project Activity — one page for everything logged against projects: the
// action items on the Whiteboard (Project list), project updates and the
// emails TJ's agents log. Data: GET /api/project-activity (server/projectActivity.js).

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
  accent2: '#3c6ba5',
  success: '#00b894',
  warning: '#fdcb6e',
  error: '#e84393',
  info: '#74b9ff',
};

const API = `${API_BASE}/api`;

// Board people (src/types/Whiteboard.ts WHITEBOARD_PEOPLE).
const OWNERS: { key: string; label: string; tag: string }[] = [
  { key: 'tj', label: 'TJ', tag: 'TJC' },
  { key: 'rj', label: 'RJ', tag: 'RJR' },
  { key: 'renzel', label: 'Renzel', tag: 'RPP' },
  { key: 'nylle', label: 'Nylle', tag: 'NDM' },
  { key: 'kim', label: 'Kim', tag: 'KKS' },
];

const PERIODS = [7, 14, 30, 90, 365];

interface LatestUpdate { date?: string; note?: string; by?: string; next_step?: string; next_date?: string; risk?: string }
interface ProjectRow {
  project_id: string; ovp_number: string; project_name: string; account_name: string; project_status: string; progress: number;
  open_items: number; overdue_items: number; done_items: number; next_due: string | null; updates: number; emails: number;
  last_activity: string | null; latest_update: LatestUpdate | null;
}
interface ActionItem {
  id: string; project_id: string; project: string; text: string; owner: string | null; due_date: string | null; overdue: boolean;
  done: boolean; done_by: string | null; done_at: string | null; progress: number | null; subtasks_total: number; subtasks_done: number;
  latest_note: string | null; posted_by: string; via: string; created_at: string | null;
}
interface UpdateRow {
  id: string; project_id: string; project: string; date: string | null; type: string; note: string; status: string | null;
  progress: number | null; next_step: string | null; next_date: string | null; risk: string | null; link: string | null;
  posted_by: string; via: string; created_at: string | null;
}
interface EmailRow {
  id: string; project_id: string; project: string; date: string | null; direction: string; subject: string; from: string; to: string[];
  summary: string; category: string; attachments: { name: string; link?: string }[]; link: string | null; logged_by: string;
}
interface ActivityData {
  days: number; since: string; today: string;
  totals: { open_items: number; overdue_items: number; due_this_week: number; done_items: number; updates: number; emails: number; projects_active: number };
  by_project: ProjectRow[]; action_items: ActionItem[]; updates: UpdateRow[]; emails: EmailRow[];
}

type TabKey = 'projects' | 'items' | 'updates' | 'emails';

const headSx = { fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' } as const;
const cellSx = { fontSize: '0.8rem' } as const;
const rowSx = { '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' } } as const;

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function ViaBadge({ via, by }: { via: string; by: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {via === 'agent' && (
        <Tooltip title="Logged by an agent" arrow>
          <SmartToyIcon sx={{ fontSize: 16, color: NET_PACIFIC_COLORS.accent1 }} />
        </Tooltip>
      )}
      <span>{by || '—'}</span>
    </Box>
  );
}

function EmailRowView({ e, onProject }: { e: EmailRow; onProject: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow hover sx={rowSx}>
        <TableCell sx={{ ...cellSx, width: 40 }}>
          <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Hide summary' : 'Show summary'}>
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{fmtDateTime(e.date)}</TableCell>
        <TableCell sx={cellSx}>
          <Link component="button" underline="hover" onClick={() => onProject(e.project_id)} sx={{ fontSize: '0.8rem', textAlign: 'left' }}>
            {e.project}
          </Link>
        </TableCell>
        <TableCell sx={cellSx}>
          <Chip size="small" label={e.direction === 'outbound' ? 'Sent' : 'Received'} variant="outlined"
            sx={{ height: 20, fontSize: '0.7rem', borderColor: e.direction === 'outbound' ? NET_PACIFIC_COLORS.success : NET_PACIFIC_COLORS.primary }} />
        </TableCell>
        <TableCell sx={{ ...cellSx, fontWeight: 500 }}>
          {e.subject || '(no subject)'}
          {e.attachments.length > 0 && (
            <Tooltip title={e.attachments.map((a) => a.name).join(', ')} arrow>
              <AttachFileIcon sx={{ fontSize: 14, ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
            </Tooltip>
          )}
        </TableCell>
        <TableCell sx={cellSx}>{e.from || '—'}</TableCell>
        <TableCell sx={cellSx}>{e.category || '—'}</TableCell>
        <TableCell sx={{ ...cellSx, width: 48 }}>
          {e.link && (
            <Tooltip title="Open email" arrow>
              <IconButton size="small" href={e.link} target="_blank" rel="noopener noreferrer">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6, fontSize: '0.8rem' }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{e.summary || 'No summary logged.'}</Typography>
              {e.to.length > 0 && <Typography variant="caption" color="text.secondary" component="div">To: {e.to.join(', ')}</Typography>}
              {e.attachments.length > 0 && (
                <Typography variant="caption" color="text.secondary" component="div">
                  Attachments: {e.attachments.map((a, i) => (
                    <span key={i}>{i > 0 && ', '}{a.link ? <Link href={a.link} target="_blank" rel="noopener noreferrer">{a.name}</Link> : a.name}</span>
                  ))}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" component="div">Logged by {e.logged_by || '—'}</Typography>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ── Phone (portrait, < 600 px): each tab's table becomes a list of cards ─────────────────────────
const clamp2 = { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' } as const;
const cardSx = { p: 1.25 } as const;

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1, color: danger && value ? '#e53935' : undefined }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

function ProjectCard({ p, onOpen }: { p: ProjectRow; onOpen: (id: string) => void }) {
  return (
    <Paper variant="outlined" data-testid={`activity-project-${p.project_id}`} onClick={() => onOpen(p.project_id)} sx={{ ...cardSx, cursor: 'pointer', '&:active': { bgcolor: 'action.hover' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.ovp_number || '—'}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere', display: 'block' }}>
            {p.project_name}{p.account_name ? ` · ${p.account_name}` : ''}
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" sx={{ flexShrink: 0 }} label={`${p.project_status || '—'}${p.progress ? ` · ${p.progress}%` : ''}`} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.5, mt: 1, textAlign: 'center' }}>
        <Stat label="Open" value={p.open_items} />
        <Stat label="Overdue" value={p.overdue_items} danger />
        <Stat label="Updates" value={p.updates} />
        <Stat label="Emails" value={p.emails} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        Next due {fmtDate(p.next_due)} · Last activity {fmtDateTime(p.last_activity)}
      </Typography>
      {p.latest_update && (
        <Box sx={{ mt: 0.75, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" sx={clamp2}>{p.latest_update.note}</Typography>
          {p.latest_update.next_step && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Next: {p.latest_update.next_step}{p.latest_update.next_date ? ` (${fmtDate(p.latest_update.next_date)})` : ''}
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}

function ActionItemCard({ i, saving, onToggle, onProject }: { i: ActionItem; saving: boolean; onToggle: (i: ActionItem) => void; onProject: (id: string) => void }) {
  return (
    <Paper variant="outlined" sx={{ ...cardSx, display: 'flex', alignItems: 'flex-start', gap: 0.5, pl: 0.5 }}>
      <Box sx={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {saving ? <CircularProgress size={18} /> : (
          <Checkbox checked={i.done} onChange={() => onToggle(i)} inputProps={{ 'aria-label': i.done ? 'Mark not done' : 'Mark done' }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, textDecoration: i.done ? 'line-through' : undefined, color: i.done ? 'text.secondary' : undefined, overflowWrap: 'anywhere' }}>
          {i.text}
        </Typography>
        <Link component="button" underline="hover" onClick={() => onProject(i.project_id)} sx={{ fontSize: '0.8rem', textAlign: 'left' }}>{i.project}</Link>
        <Typography variant="caption" sx={{ display: 'block', color: i.overdue ? '#e53935' : 'text.secondary', fontWeight: i.overdue ? 700 : undefined }}>
          Due {fmtDate(i.due_date)}{i.progress !== null ? ` · ${i.progress}%` : ''}{i.subtasks_total > 0 ? ` · ${i.subtasks_done}/${i.subtasks_total} subtasks` : ''}
        </Typography>
        {i.latest_note && <Typography variant="caption" color="text.secondary" sx={{ ...clamp2, mt: 0.25 }}>{i.latest_note}</Typography>}
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
          <ViaBadge via={i.via} by={i.posted_by} />
          {i.done && i.done_by ? ` · done by ${i.done_by} · ${fmtDateTime(i.done_at)}` : ''}
        </Typography>
      </Box>
    </Paper>
  );
}

function UpdateCard({ u, onProject }: { u: UpdateRow; onProject: (id: string) => void }) {
  return (
    <Paper variant="outlined" sx={cardSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{fmtDate(u.date)} · {u.type}</Typography>
        {u.risk && u.risk !== 'low' && (
          <Chip size="small" label={`${u.risk} risk`} sx={{ height: 20, fontSize: '0.7rem', color: 'white', backgroundColor: u.risk === 'high' ? '#e53935' : NET_PACIFIC_COLORS.accent2 }} />
        )}
      </Box>
      <Link component="button" underline="hover" onClick={() => onProject(u.project_id)} sx={{ fontSize: '0.8rem', textAlign: 'left', display: 'block', mt: 0.25 }}>{u.project}</Link>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5, overflowWrap: 'anywhere' }}>{u.note}</Typography>
      {(u.status || u.progress !== null) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {[u.status, u.progress !== null ? `${u.progress}% site progress` : null].filter(Boolean).join(' · ')}
        </Typography>
      )}
      {u.next_step && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Next: {u.next_step}{u.next_date ? ` (${fmtDate(u.next_date)})` : ''}
        </Typography>
      )}
      {u.link && <Link href={u.link} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '0.8rem', display: 'block' }}>Open link</Link>}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}><ViaBadge via={u.via} by={u.posted_by} /></Typography>
    </Paper>
  );
}

function EmailCard({ e, onProject }: { e: EmailRow; onProject: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={cardSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{fmtDateTime(e.date)}</Typography>
        <Chip size="small" label={e.direction === 'outbound' ? 'Sent' : 'Received'} variant="outlined"
          sx={{ height: 20, fontSize: '0.7rem', borderColor: e.direction === 'outbound' ? NET_PACIFIC_COLORS.success : NET_PACIFIC_COLORS.primary }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25, overflowWrap: 'anywhere' }}>
        {e.subject || '(no subject)'}
        {e.attachments.length > 0 && <AttachFileIcon sx={{ fontSize: 14, ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />}
      </Typography>
      <Link component="button" underline="hover" onClick={() => onProject(e.project_id)} sx={{ fontSize: '0.8rem', textAlign: 'left', display: 'block' }}>{e.project}</Link>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {[e.from, e.category].filter(Boolean).join(' · ') || '—'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, mx: -0.5 }}>
        <Button size="small" onClick={() => setOpen((v) => !v)} endIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />} sx={{ textTransform: 'none' }}>
          {open ? 'Hide summary' : 'Show summary'}
        </Button>
        <Box sx={{ flex: 1 }} />
        {e.link && (
          <IconButton href={e.link} target="_blank" rel="noopener noreferrer" aria-label="Open email"><OpenInNewIcon fontSize="small" /></IconButton>
        )}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 0.5 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1, overflowWrap: 'anywhere' }}>{e.summary || 'No summary logged.'}</Typography>
          {e.to.length > 0 && <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: 'anywhere' }}>To: {e.to.join(', ')}</Typography>}
          {e.attachments.length > 0 && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: 'anywhere' }}>
              Attachments: {e.attachments.map((a, i) => (
                <span key={i}>{i > 0 && ', '}{a.link ? <Link href={a.link} target="_blank" rel="noopener noreferrer">{a.name}</Link> : a.name}</span>
              ))}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" component="div">Logged by {e.logged_by || '—'}</Typography>
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function ProjectActivityPage() {
  const navigate = useNavigate();
  // Portrait phones (< 600 px): each tab's table becomes a list of cards.
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<TabKey>('projects');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [itemStatus, setItemStatus] = useState<'open' | 'overdue' | 'done' | 'all'>('open');
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API}/project-activity?days=${days}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      setData(body as ActivityData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const toggleDone = async (item: ActionItem) => {
    setSaving(item.id);
    setError('');
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API}/agent/action-items/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ done: !item.done }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the action item.');
    } finally {
      setSaving(null);
    }
  };

  const projectOptions = useMemo(
    () => (data?.by_project || []).map((p) => ({ id: p.project_id, label: [p.ovp_number, p.project_name].filter(Boolean).join(' · ') }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );

  const q = search.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => (f || '').toLowerCase().includes(q));
  const sourceOk = (via: string) => !sourceFilter || (sourceFilter === 'agent' ? via === 'agent' : via !== 'agent');
  const projectOk = (id: string) => !projectFilter || id === projectFilter;

  const items = useMemo(() => (data?.action_items || []).filter((i) =>
    projectOk(i.project_id) && sourceOk(i.via) && (!ownerFilter || i.owner === ownerFilter)
    && (itemStatus === 'all' || (itemStatus === 'done' ? i.done : itemStatus === 'overdue' ? i.overdue : !i.done))
    && matches(i.text, i.project, i.latest_note, i.posted_by)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, projectFilter, sourceFilter, ownerFilter, itemStatus, q]);
  const updates = useMemo(() => (data?.updates || []).filter((u) =>
    projectOk(u.project_id) && sourceOk(u.via) && matches(u.note, u.project, u.type, u.next_step, u.posted_by)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, projectFilter, sourceFilter, q]);
  const emails = useMemo(() => (data?.emails || []).filter((e) =>
    projectOk(e.project_id) && matches(e.subject, e.project, e.from, e.summary, e.category)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, projectFilter, q]);
  const projects = useMemo(() => (data?.by_project || []).filter((p) =>
    projectOk(p.project_id) && matches(p.ovp_number, p.project_name, p.account_name, p.latest_update?.note)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, projectFilter, q]);

  const t = data?.totals;
  const openProject = (id: string) => navigate(`/projects/${encodeURIComponent(id)}`);
  const counts: Record<TabKey, number> = { projects: projects.length, items: items.length, updates: updates.length, emails: emails.length };
  const tabTitle: Record<TabKey, string> = { projects: 'Projects', items: 'Action items', updates: 'Updates', emails: 'Emails' };

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Project Activity
        </Typography>
      </Box>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white', cursor: 'pointer' }}
            onClick={() => { setTab('items'); setItemStatus('open'); }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Open action items</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{t ? t.open_items : '—'}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{t ? `${t.due_this_week} due this week` : ' '}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          {t && t.overdue_items > 0 ? (
            <Card sx={{ background: 'linear-gradient(135deg, #e53935 0%, #ef9a9a 100%)', color: 'white', cursor: 'pointer' }}
              onClick={() => { setTab('items'); setItemStatus('overdue'); }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Overdue</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{t.overdue_items}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>past their due date</Typography>
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white', cursor: 'pointer' }}
              onClick={() => { setTab('items'); setItemStatus('done'); }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Done</Typography>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{t ? t.done_items : '—'}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>nothing overdue</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white', cursor: 'pointer' }}
            onClick={() => setTab('updates')}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Updates</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{t ? t.updates : '—'}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{t ? `${t.projects_active} projects with activity` : ' '}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436', cursor: 'pointer' }}
            onClick={() => setTab('emails')}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Emails logged</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{t ? t.emails : '—'}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{data ? `since ${fmtDate(data.since)}` : ' '}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth label="Search" size="small" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="activity-project-label">Project</InputLabel>
              <Select labelId="activity-project-label" label="Project" value={projectFilter} onChange={(e) => setProjectFilter(String(e.target.value))}>
                <MenuItem value="">All projects</MenuItem>
                {projectOptions.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="activity-period-label">Period</InputLabel>
              <Select labelId="activity-period-label" label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {PERIODS.map((d) => <MenuItem key={d} value={d}>{d === 365 ? 'Last 12 months' : `Last ${d} days`}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="activity-owner-label">Owner</InputLabel>
              <Select labelId="activity-owner-label" label="Owner" value={ownerFilter} onChange={(e) => setOwnerFilter(String(e.target.value))}>
                <MenuItem value="">Anyone</MenuItem>
                {OWNERS.map((o) => <MenuItem key={o.key} value={o.key}>{o.label} ({o.tag})</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="activity-source-label">Logged by</InputLabel>
              <Select labelId="activity-source-label" label="Logged by" value={sourceFilter} onChange={(e) => setSourceFilter(String(e.target.value))}>
                <MenuItem value="">Agents and people</MenuItem>
                <MenuItem value="agent">Agents only</MenuItem>
                <MenuItem value="people">People only</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
        <Box sx={{ px: 1.5, pt: 0.5, borderBottom: '1px solid #e0e0e0' }}>
          <Tabs value={tab} onChange={(_e, v: TabKey) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {(Object.keys(tabTitle) as TabKey[]).map((k) => <Tab key={k} value={k} label={`${tabTitle[k]} (${counts[k]})`} />)}
          </Tabs>
        </Box>
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0', flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            {tabTitle[tab]} ({counts[tab]})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {tab === 'items' && (
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 140 } }}>
                <InputLabel id="activity-status-label">Status</InputLabel>
                <Select labelId="activity-status-label" label="Status" value={itemStatus} onChange={(e) => setItemStatus(e.target.value as typeof itemStatus)}>
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="overdue">Overdue</MenuItem>
                  <MenuItem value="done">Done</MenuItem>
                  <MenuItem value="all">All</MenuItem>
                </Select>
              </FormControl>
            )}
            <Button variant="contained" size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}
              sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>
              Refresh
            </Button>
          </Box>
        </Box>
        {loading && <LinearProgress />}

        {isPhone ? (
          <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1, minHeight: 200 }}>
            {!data && loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : tab === 'projects' ? (
              projects.length ? projects.map((p) => <ProjectCard key={p.project_id} p={p} onOpen={openProject} />)
                : <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No activity in this period.</Typography>
            ) : tab === 'items' ? (
              items.length ? items.map((i) => <ActionItemCard key={i.id} i={i} saving={saving === i.id} onToggle={toggleDone} onProject={openProject} />)
                : <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No action items match.</Typography>
            ) : tab === 'updates' ? (
              updates.length ? updates.map((u) => <UpdateCard key={`${u.project_id}-${u.id}`} u={u} onProject={openProject} />)
                : <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No updates in this period.</Typography>
            ) : (
              emails.length ? emails.map((e) => <EmailCard key={e.id} e={e} onProject={openProject} />)
                : <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No emails logged in this period.</Typography>
            )}
          </Box>
        ) : (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 480px)', minHeight: 300 }}>
          {!data && loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : tab === 'projects' ? (
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Project</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx} align="right">Open</TableCell>
                  <TableCell sx={headSx} align="right">Overdue</TableCell>
                  <TableCell sx={headSx}>Next due</TableCell>
                  <TableCell sx={headSx} align="right">Updates</TableCell>
                  <TableCell sx={headSx} align="right">Emails</TableCell>
                  <TableCell sx={headSx}>Latest update</TableCell>
                  <TableCell sx={headSx}>Last activity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.project_id} hover sx={{ ...rowSx, cursor: 'pointer' }} onClick={() => openProject(p.project_id)}>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{p.ovp_number || '—'}</Typography>
                      <Typography sx={{ fontSize: '0.75rem' }} color="text.secondary">{p.project_name}{p.account_name ? ` · ${p.account_name}` : ''}</Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{p.project_status || '—'}{p.progress ? ` · ${p.progress}%` : ''}</TableCell>
                    <TableCell sx={cellSx} align="right">{p.open_items}</TableCell>
                    <TableCell sx={{ ...cellSx, color: p.overdue_items ? '#e53935' : undefined, fontWeight: p.overdue_items ? 700 : undefined }} align="right">{p.overdue_items}</TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{fmtDate(p.next_due)}</TableCell>
                    <TableCell sx={cellSx} align="right">{p.updates}</TableCell>
                    <TableCell sx={cellSx} align="right">{p.emails}</TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 360 }}>
                      {p.latest_update ? (
                        <>
                          <Typography sx={{ fontSize: '0.8rem' }} noWrap title={p.latest_update.note}>{p.latest_update.note}</Typography>
                          {p.latest_update.next_step && (
                            <Typography sx={{ fontSize: '0.75rem' }} color="text.secondary" noWrap>
                              Next: {p.latest_update.next_step}{p.latest_update.next_date ? ` (${fmtDate(p.latest_update.next_date)})` : ''}
                            </Typography>
                          )}
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{fmtDateTime(p.last_activity)}</TableCell>
                  </TableRow>
                ))}
                {!projects.length && <TableRow><TableCell colSpan={9} sx={{ ...cellSx, textAlign: 'center', py: 4 }}>No activity in this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          ) : tab === 'items' ? (
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headSx, width: 48 }}>Done</TableCell>
                  <TableCell sx={headSx}>Action item</TableCell>
                  <TableCell sx={headSx}>Project</TableCell>
                  <TableCell sx={headSx}>Due</TableCell>
                  <TableCell sx={headSx}>Progress</TableCell>
                  <TableCell sx={headSx}>Latest note</TableCell>
                  <TableCell sx={headSx}>Posted by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id} hover sx={rowSx}>
                    <TableCell sx={cellSx}>
                      {saving === i.id ? <CircularProgress size={18} /> : (
                        <Checkbox size="small" checked={i.done} onChange={() => toggleDone(i)} inputProps={{ 'aria-label': i.done ? 'Mark not done' : 'Mark done' }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textDecoration: i.done ? 'line-through' : undefined, color: i.done ? 'text.secondary' : undefined }}>
                      {i.text}
                      {i.subtasks_total > 0 && (
                        <Typography component="span" sx={{ fontSize: '0.75rem', ml: 1 }} color="text.secondary">
                          {i.subtasks_done}/{i.subtasks_total} subtasks
                        </Typography>
                      )}
                      {i.done && i.done_by && (
                        <Typography sx={{ fontSize: '0.7rem' }} color="text.secondary">Done by {i.done_by} · {fmtDateTime(i.done_at)}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Link component="button" underline="hover" onClick={() => openProject(i.project_id)} sx={{ fontSize: '0.8rem', textAlign: 'left' }}>{i.project}</Link>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', color: i.overdue ? '#e53935' : undefined, fontWeight: i.overdue ? 700 : undefined }}>
                      {fmtDate(i.due_date)}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{i.progress !== null ? `${i.progress}%` : '—'}</TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 300 }}><Typography sx={{ fontSize: '0.8rem' }} noWrap title={i.latest_note || ''}>{i.latest_note || '—'}</Typography></TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}><ViaBadge via={i.via} by={i.posted_by} /></TableCell>
                  </TableRow>
                ))}
                {!items.length && <TableRow><TableCell colSpan={7} sx={{ ...cellSx, textAlign: 'center', py: 4 }}>No action items match.</TableCell></TableRow>}
              </TableBody>
            </Table>
          ) : tab === 'updates' ? (
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Date</TableCell>
                  <TableCell sx={headSx}>Project</TableCell>
                  <TableCell sx={headSx}>Type</TableCell>
                  <TableCell sx={headSx}>Update</TableCell>
                  <TableCell sx={headSx}>Next step</TableCell>
                  <TableCell sx={headSx}>Posted by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {updates.map((u) => (
                  <TableRow key={`${u.project_id}-${u.id}`} hover sx={rowSx}>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{fmtDate(u.date)}</TableCell>
                    <TableCell sx={cellSx}>
                      <Link component="button" underline="hover" onClick={() => openProject(u.project_id)} sx={{ fontSize: '0.8rem', textAlign: 'left' }}>{u.project}</Link>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                      {u.type}
                      {u.risk && u.risk !== 'low' && (
                        <Chip size="small" label={`${u.risk} risk`} sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', color: 'white', backgroundColor: u.risk === 'high' ? '#e53935' : NET_PACIFIC_COLORS.accent2 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 420, whiteSpace: 'pre-wrap' }}>
                      {u.note}
                      {(u.status || u.progress !== null) && (
                        <Typography sx={{ fontSize: '0.7rem' }} color="text.secondary">
                          {[u.status, u.progress !== null ? `${u.progress}% site progress` : null].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                      {u.link && <Link href={u.link} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '0.75rem', display: 'block' }}>Open link</Link>}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 240 }}>{u.next_step ? `${u.next_step}${u.next_date ? ` (${fmtDate(u.next_date)})` : ''}` : '—'}</TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}><ViaBadge via={u.via} by={u.posted_by} /></TableCell>
                  </TableRow>
                ))}
                {!updates.length && <TableRow><TableCell colSpan={6} sx={{ ...cellSx, textAlign: 'center', py: 4 }}>No updates in this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          ) : (
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headSx, width: 40 }} />
                  <TableCell sx={headSx}>Date</TableCell>
                  <TableCell sx={headSx}>Project</TableCell>
                  <TableCell sx={headSx}>Direction</TableCell>
                  <TableCell sx={headSx}>Subject</TableCell>
                  <TableCell sx={headSx}>From</TableCell>
                  <TableCell sx={headSx}>Category</TableCell>
                  <TableCell sx={{ ...headSx, width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {emails.map((e) => <EmailRowView key={e.id} e={e} onProject={openProject} />)}
                {!emails.length && <TableRow><TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4 }}>No emails logged in this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
