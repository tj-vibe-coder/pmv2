import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, Stack, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import CampaignIcon from '@mui/icons-material/Campaign';
import NoteIcon from '@mui/icons-material/StickyNote2';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import AddIcon from '@mui/icons-material/Add';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import NewCalcsheetProjectDialog, { type NewProjectNotice } from './calcsheet/NewCalcsheetProjectDialog';
import type { Project } from '../types/Quotation';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteboardStore } from '../store/whiteboardStore';
import { whiteboardLinkHref } from '../types/Whiteboard';
import type { WhiteboardItem, WhiteboardKind, WhiteboardLink } from '../types/Whiteboard';

// The Whiteboard is one shared "General updates" list for the whole team
// (pinned on top) plus each user's private "Just for me" list. There are no
// per-person columns or assignments. Items posted to the old person columns
// (visibility 'public') are shown in General updates too — nothing is migrated
// in Firestore, they're simply treated as general.
const isGeneral = (i: WhiteboardItem) => i.visibility === 'general' || i.visibility === 'public';

const linkIcon = (link: WhiteboardLink) =>
  link.type === 'project' ? <FolderOutlinedIcon sx={{ fontSize: 14 }} /> : <CalculateOutlinedIcon sx={{ fontSize: 14 }} />;

// Older items were posted as an Update or a Note — keep a small icon so they
// read the same as before; to-dos (everything new) get no icon.
const KIND_ICON: Partial<Record<WhiteboardKind, { label: string; icon: ReactElement }>> = {
  update: { label: 'Update', icon: <CampaignIcon sx={{ fontSize: 15 }} /> },
  note: { label: 'Note', icon: <NoteIcon sx={{ fontSize: 15 }} /> },
};

// Optional "connect this item to…" picker — Project List projects and
// calcsheet proposals in one searchable list, grouped by type — plus a
// "New proposal" button for when the project doesn't exist yet.
function LinkPicker({ value, onChange, options, onCreateNew }: {
  value: WhiteboardLink | null;
  onChange: (link: WhiteboardLink | null) => void;
  options: WhiteboardLink[];
  onCreateNew: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Autocomplete
        size="small"
        options={options}
        value={value}
        onChange={(_e, v) => onChange(v)}
        groupBy={(o) => (o.type === 'project' ? 'Projects' : 'Calcsheet proposals')}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
        renderInput={(params) => <TextField {...params} label="Link to project / calcsheet (optional)" />}
        sx={{ minWidth: { xs: '100%', sm: 240 }, flex: 1 }}
      />
      <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onCreateNew} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        New proposal
      </Button>
    </Stack>
  );
}

type DueInfo = { label: string; color: 'error' | 'warning' | 'text.secondary' } | null;

// Deadline urgency — null if it has no due date. Once done, the date is just
// informational (no overdue/soon coloring).
function dueInfo(item: WhiteboardItem): DueInfo {
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
}

// One checklist line — used by both the General and the private list.
function ItemRow({ item, canEdit, onToggleDone, onEdit, onDelete, onOpenLink }: {
  item: WhiteboardItem;
  canEdit: boolean;
  onToggleDone: (item: WhiteboardItem) => void;
  onEdit: (item: WhiteboardItem) => void;
  onDelete: (item: WhiteboardItem) => void;
  onOpenLink: (link: WhiteboardLink) => void;
}) {
  const due = dueInfo(item);
  const kind = KIND_ICON[item.kind];
  return (
    <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ py: 0.5, borderBottom: '1px dashed', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Checkbox size="small" checked={!!item.done} onChange={() => onToggleDone(item)} sx={{ p: 0, mt: 0.25 }} title={item.done ? 'Mark as pending' : 'Mark as done'} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', textDecoration: item.done ? 'line-through' : undefined, color: item.done ? 'text.secondary' : 'text.primary' }}>
          {item.text}
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
          {kind && (
            <Tooltip title={kind.label}><Box sx={{ display: 'flex', color: 'text.disabled' }}>{kind.icon}</Box></Tooltip>
          )}
          {due && (
            <Chip size="small" label={due.label} color={due.color === 'text.secondary' ? 'default' : due.color} variant={due.color === 'text.secondary' ? 'outlined' : 'filled'}
              sx={{ height: 18, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }} />
          )}
          {item.link && (
            <Chip size="small" icon={linkIcon(item.link)} label={item.link.label || (item.link.type === 'project' ? 'Project' : 'Calcsheet')} onClick={() => onOpenLink(item.link!)} variant="outlined"
              title={`Open ${item.link.type === 'project' ? 'project' : 'calcsheet proposal'}`}
              sx={{ height: 18, fontSize: 11, maxWidth: '100%', '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' } }} />
          )}
          <Typography variant="caption" color="text.disabled">{item.createdByName} · {format(new Date(item.createdAt), 'MMM d')}</Typography>
        </Stack>
      </Box>
      {canEdit && (
        <>
          <IconButton size="small" onClick={() => onEdit(item)} title="Edit" sx={{ p: 0.25 }}><EditOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
          <IconButton size="small" onClick={() => onDelete(item)} title="Delete" sx={{ p: 0.25 }}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
        </>
      )}
    </Stack>
  );
}

// A checklist with an inline "add" field and done items folded away under
// "Show done". Used for General updates (team-wide) and Just for me (private).
function ItemList({
  items, emptyText, placeholder, isOwner, onAdd, onToggleDone, onEdit, onDelete, onOpenLink, maxHeight,
}: {
  items: WhiteboardItem[];
  emptyText: string;
  placeholder: string;
  isOwner: (item: WhiteboardItem) => boolean;
  onAdd: (text: string) => Promise<void>;
  onToggleDone: (item: WhiteboardItem) => void;
  onEdit: (item: WhiteboardItem) => void;
  onDelete: (item: WhiteboardItem) => void;
  onOpenLink: (link: WhiteboardLink) => void;
  maxHeight: string;
}) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    setAdding(true);
    try { await onAdd(t); setDraft(''); } catch { /* error shown by the dialog */ } finally { setAdding(false); }
  };
  const row = (item: WhiteboardItem) => (
    <ItemRow key={item.id} item={item} canEdit={isOwner(item)} onToggleDone={onToggleDone} onEdit={onEdit} onDelete={onDelete} onOpenLink={onOpenLink} />
  );
  return (
    <>
      <Box sx={{ maxHeight: { xs: 'none', sm: maxHeight }, overflowY: 'auto', pr: 0.5 }}>
        {pending.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 0.5 }}>{emptyText}</Typography>
        )}
        {pending.map(row)}
        {showDone && done.map(row)}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField
          size="small" fullWidth placeholder={placeholder} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void add(); } }}
          sx={{ bgcolor: 'white' }}
        />
        <Button variant="contained" size="small" disabled={!draft.trim() || adding} onClick={() => void add()} sx={{ flexShrink: 0 }}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </Stack>
      {done.length > 0 && (
        <Button size="small" onClick={() => setShowDone((v) => !v)} sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}>
          {showDone ? 'Hide done' : `Show done (${done.length})`}
        </Button>
      )}
    </>
  );
}

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
  const linkOptions = useWhiteboardStore((s) => s.linkOptions);
  const fetchLinkOptions = useWhiteboardStore((s) => s.fetchLinkOptions);
  const addLinkOption = useWhiteboardStore((s) => s.addLinkOption);
  const [newProposalOpen, setNewProposalOpen] = useState(false);
  const [notice, setNotice] = useState<NewProjectNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Edit dialog — owner-only.
  const [editing, setEditing] = useState<WhiteboardItem | null>(null);
  const [editText, setEditText] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
  const [editLink, setEditLink] = useState<WhiteboardLink | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  // Always reload on open so teammates' new items show up.
  useEffect(() => { if (open) { fetchItems({ force: true }).catch(() => {}); fetchLinkOptions(); } }, [open, fetchItems, fetchLinkOptions]);

  // Clicking an item's link chip closes the Whiteboard and opens that page.
  const openLink = (l: WhiteboardLink) => {
    onClose();
    navigate(whiteboardLinkHref(l));
  };

  // A proposal created from the edit dialog is linked straight away to the
  // item being edited (not saved yet — the user still clicks Save).
  const onProposalCreated = (project: Project, createNotice: NewProjectNotice | null) => {
    const l: WhiteboardLink = { type: 'calcsheet', id: project.id, label: [project.code, project.name].filter(Boolean).join(' – ') };
    addLinkOption(l);
    setEditLink(l);
    setNotice(createNotice ?? { severity: 'success', message: `Created ${l.label} — linked to this item. Save to keep it.` });
  };

  // Oldest first, like a checklist — new items go to the bottom.
  const general = useMemo(() => items.filter(isGeneral).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [items]);
  const myPrivate = useMemo(() => items.filter((i) => i.visibility === 'private').sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [items]);
  const pendingGeneral = general.filter((i) => !i.done).length;

  const isOwner = (item: WhiteboardItem) => String(item.createdBy) === String(user?.id);

  const add = (visibility: 'general' | 'private') => async (t: string) => {
    setError(null);
    try {
      await addItem({ kind: 'todo', visibility, text: t, done: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that item.');
      throw e;
    }
  };

  // Anyone may tick a General item; private items are only ever the owner's.
  const toggleDone = async (item: WhiteboardItem) => {
    try {
      await updateItem(item.id, { done: !item.done });
    } catch {
      setError('Could not update that item.');
    }
  };

  const remove = async (item: WhiteboardItem) => {
    try {
      await deleteItem(item.id);
    } catch {
      setError('Could not delete that item.');
    }
  };

  const startEdit = (item: WhiteboardItem) => {
    setEditing(item);
    setEditText(item.text);
    setEditPrivate(item.visibility === 'private');
    setEditDueDate(item.dueDate ?? '');
    setEditLink(item.link ?? null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    setSavingEdit(true);
    setError(null);
    try {
      await updateItem(editing.id, {
        text: trimmed,
        visibility: editPrivate ? 'private' : 'general',
        assignedTo: null,
        dueDate: editDueDate || null,
        link: editLink,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that edit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const listProps = { isOwner, onToggleDone: toggleDone, onEdit: startEdit, onDelete: remove, onOpenLink: openLink };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Whiteboard
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert severity={notice.severity} sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>{notice.message}</Alert>}

        {loading && items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Loading…</Typography>
        ) : (
          <>
            {/* ── General updates — the whole team's pending list ── */}
            <Box sx={{ border: '1px solid', borderColor: '#f0b357', bgcolor: '#fffaf0', borderRadius: 1.5, p: 1.25 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <PushPinOutlinedIcon sx={{ fontSize: 18, color: '#c77d12' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>General updates</Typography>
                <Chip
                  size="small" label={pendingGeneral ? `${pendingGeneral} pending` : 'All clear'}
                  color={pendingGeneral ? 'warning' : 'success'} sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
                />
              </Stack>
              <ItemList
                {...listProps} items={general} maxHeight="45vh"
                emptyText="Nothing pending — add an item below so the whole team sees it."
                placeholder="Add a pending item for the team…"
                onAdd={add('general')}
              />
            </Box>

            {/* ── Just for me — private, only you see these ── */}
            <Divider sx={{ my: 2 }} textAlign="left">
              <Typography variant="caption" color="text.secondary">
                <LockIcon sx={{ fontSize: 13, mr: 0.5, verticalAlign: '-2px' }} />Just for me ({myPrivate.filter((i) => !i.done).length})
              </Typography>
            </Divider>
            <ItemList
              {...listProps} items={myPrivate} maxHeight="25vh"
              emptyText="Nothing private yet — only you can see what you add here."
              placeholder="Add a private reminder…"
              onAdd={add('private')}
            />
          </>
        )}
      </DialogContent>

      <NewCalcsheetProjectDialog
        open={newProposalOpen}
        onClose={() => setNewProposalOpen(false)}
        onCreated={onProposalCreated}
      />

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit item</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              multiline minRows={2} fullWidth size="small" autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <LinkPicker value={editLink} onChange={setEditLink} options={linkOptions} onCreateNew={() => setNewProposalOpen(true)} />
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" gap={1}>
              <Chip
                size="small"
                icon={editPrivate ? <LockIcon fontSize="small" /> : <PublicIcon fontSize="small" />}
                label={editPrivate ? 'Private — just for me' : 'General — whole team'}
                color={editPrivate ? 'default' : 'primary'}
                variant={editPrivate ? 'outlined' : 'filled'}
                onClick={() => setEditPrivate((v) => !v)}
                sx={{ cursor: 'pointer' }}
              />
              <TextField
                type="date" size="small" label="Due date" InputLabelProps={{ shrink: true }}
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                sx={{ width: 160 }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" disabled={!editText.trim() || savingEdit} onClick={saveEdit}>
            {savingEdit ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
