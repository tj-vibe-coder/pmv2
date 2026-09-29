import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton,
  List, ListItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteboardStore } from '../store/whiteboardStore';
import type { WhiteboardItem, WhiteboardKind, WhiteboardVisibility } from '../types/Whiteboard';

const TABS: { kind: WhiteboardKind; label: string; placeholder: string; defaultVisibility: WhiteboardVisibility }[] = [
  { kind: 'update', label: 'Updates', placeholder: "What's the update? (visible to the whole team by default)", defaultVisibility: 'public' },
  { kind: 'note', label: 'Notes', placeholder: 'Jot a note… (private by default — flip to Public to share it)', defaultVisibility: 'private' },
  { kind: 'todo', label: 'To-Dos', placeholder: 'Add a to-do… (private by default — flip to Public for a shared task)', defaultVisibility: 'private' },
];

interface WhiteboardDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function WhiteboardDialog({ open, onClose }: WhiteboardDialogProps) {
  const { user } = useAuth();
  const items = useWhiteboardStore((s) => s.items);
  const loading = useWhiteboardStore((s) => s.loading);
  const fetchItems = useWhiteboardStore((s) => s.fetchItems);
  const addItem = useWhiteboardStore((s) => s.addItem);
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const deleteItem = useWhiteboardStore((s) => s.deleteItem);

  const [tab, setTab] = useState(0);
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<WhiteboardVisibility>(TABS[0].defaultVisibility);
  const [dueDate, setDueDate] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) fetchItems(); }, [open, fetchItems]);
  // Reset the composer's visibility (and any due date) to that tab's sensible
  // default whenever the active tab changes — still freely overridable per
  // item either way.
  useEffect(() => { setVisibility(TABS[tab].defaultVisibility); setDueDate(''); }, [tab]);

  const activeKind = TABS[tab].kind;
  const rows = useMemo(
    () => items.filter((i) => i.kind === activeKind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items, activeKind],
  );

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';
  const isOwner = (item: WhiteboardItem) => String(item.createdBy) === String(user?.id);
  const canDelete = (item: WhiteboardItem) => isOwner(item) || (isAdmin && item.visibility === 'public');

  // Deadline urgency for a to-do — null if it has no due date. Once done, the
  // date is just informational (no overdue/soon coloring).
  const dueInfo = (item: WhiteboardItem): { label: string; color: 'error' | 'warning' | 'text.secondary' } | null => {
    if (!item.dueDate) return null;
    const due = new Date(`${item.dueDate}T00:00:00`);
    if (item.done) return { label: `Due ${format(due, 'MMM d')}`, color: 'text.secondary' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    const label = diffDays < 0 ? `Overdue · was due ${format(due, 'MMM d')}`
      : diffDays === 0 ? 'Due today'
      : diffDays === 1 ? 'Due tomorrow'
      : `Due ${format(due, 'MMM d')}`;
    const color = diffDays < 0 ? 'error' : diffDays <= 1 ? 'warning' : 'text.secondary';
    return { label, color };
  };

  const post = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      await addItem({
        kind: activeKind, visibility, text: trimmed,
        done: activeKind === 'todo' ? false : undefined,
        dueDate: activeKind === 'todo' && dueDate ? dueDate : undefined,
      });
      setText('');
      setDueDate('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post that.');
    } finally {
      setPosting(false);
    }
  };

  const toggleDone = async (item: WhiteboardItem) => {
    try {
      await updateItem(item.id, { done: !item.done });
    } catch {
      setError('Could not update that to-do.');
    }
  };

  const remove = async (item: WhiteboardItem) => {
    try {
      await deleteItem(item.id);
    } catch {
      setError('Could not delete that item.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Whiteboard
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((t) => <Tab key={t.kind} label={t.label} />)}
      </Tabs>
      <DialogContent>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}

        <Stack spacing={1} sx={{ mb: 2 }}>
          <TextField
            multiline minRows={2} fullWidth size="small"
            placeholder={TABS[tab].placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip
                size="small"
                icon={visibility === 'public' ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                label={visibility === 'public' ? 'Public — whole team' : 'Private — only you'}
                color={visibility === 'public' ? 'primary' : 'default'}
                variant={visibility === 'public' ? 'filled' : 'outlined'}
                onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}
                sx={{ cursor: 'pointer' }}
              />
              {activeKind === 'todo' && (
                <TextField
                  type="date" size="small" label="Due date" InputLabelProps={{ shrink: true }}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  sx={{ width: 160 }}
                />
              )}
            </Stack>
            <Button variant="contained" size="small" disabled={!text.trim() || posting} onClick={post}>
              {posting ? 'Posting…' : 'Post'}
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ mb: 1 }} />

        {loading && rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Loading…</Typography>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Nothing here yet — be the first to post {TABS[tab].label.toLowerCase()}.
          </Typography>
        ) : (
          <List dense disablePadding>
            {rows.map((item) => {
              const due = item.kind === 'todo' ? dueInfo(item) : null;
              return (
              <ListItem key={item.id} disableGutters sx={{ alignItems: 'flex-start', py: 1 }}>
                {item.kind === 'todo' && (
                  <Checkbox
                    size="small"
                    checked={!!item.done}
                    onChange={() => toggleDone(item)}
                    disabled={item.visibility === 'private' && !isOwner(item)}
                    sx={{ p: 0, mr: 1, mt: 0.25 }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', textDecoration: item.done ? 'line-through' : undefined, color: item.done ? 'text.secondary' : undefined }}
                  >
                    {item.text}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                    <Tooltip title={item.visibility === 'public' ? 'Visible to the whole team' : 'Only visible to you'}>
                      {item.visibility === 'public'
                        ? <PublicIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        : <LockIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary">
                      {item.visibility === 'public' ? item.createdByName : 'You'} · {format(new Date(item.createdAt), 'MMM d, h:mm a')}
                    </Typography>
                    {due && (
                      <Chip
                        size="small"
                        label={due.label}
                        color={due.color === 'text.secondary' ? 'default' : due.color}
                        variant={due.color === 'text.secondary' ? 'outlined' : 'filled'}
                        sx={{ height: 18, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }}
                      />
                    )}
                  </Stack>
                </Box>
                {canDelete(item) && (
                  <IconButton size="small" onClick={() => remove(item)} title="Delete">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
