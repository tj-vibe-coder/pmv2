import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import CampaignIcon from '@mui/icons-material/Campaign';
import NoteIcon from '@mui/icons-material/StickyNote2';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import AddIcon from '@mui/icons-material/Add';
import NewCalcsheetProjectDialog, { type NewProjectNotice } from './calcsheet/NewCalcsheetProjectDialog';
import type { Project } from '../types/Quotation';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteboardStore } from '../store/whiteboardStore';
import { WHITEBOARD_PEOPLE, whiteboardLinkHref, whiteboardPersonOf } from '../types/Whiteboard';
import type { WhiteboardItem, WhiteboardKind, WhiteboardLink, WhiteboardPerson, WhiteboardVisibility } from '../types/Whiteboard';

const linkIcon = (link: WhiteboardLink) =>
  link.type === 'project' ? <FolderOutlinedIcon sx={{ fontSize: 14 }} /> : <CalculateOutlinedIcon sx={{ fontSize: 14 }} />;

// Optional "connect this note to…" picker — Project List projects and
// calcsheet proposals in one searchable list, grouped by type — plus a
// "New proposal" button for when the project doesn't exist yet.
function LinkPicker({ value, onChange, options, onCreateNew }: {
  value: WhiteboardLink | null;
  onChange: (link: WhiteboardLink | null) => void;
  options: WhiteboardLink[];
  onCreateNew: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Autocomplete
        size="small"
        options={options}
        value={value}
        onChange={(_e, v) => onChange(v)}
        groupBy={(o) => (o.type === 'project' ? 'Projects' : 'Calcsheet proposals')}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
        renderInput={(params) => <TextField {...params} label="Link to project / calcsheet (optional)" />}
        sx={{ minWidth: 240, flex: 1 }}
      />
      <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onCreateNew} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        New proposal
      </Button>
    </Stack>
  );
}

const KIND_OPTIONS: { kind: WhiteboardKind; label: string; icon: ReactElement }[] = [
  { kind: 'update', label: 'Update', icon: <CampaignIcon fontSize="small" /> },
  { kind: 'note', label: 'Note', icon: <NoteIcon fontSize="small" /> },
  { kind: 'todo', label: 'To-Do', icon: <ChecklistIcon fontSize="small" /> },
];

type DueInfo = { label: string; color: 'error' | 'warning' | 'text.secondary' } | null;

// Deadline urgency for a to-do — null if it has no due date. Once done, the
// date is just informational (no overdue/soon coloring).
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

// A single sticky note. Draggable ONLY via its handle icon (not the whole
// card) — the card also hosts a checkbox and edit/delete buttons, and making
// the entire surface a drag source would fight with clicking those. The
// handle only appears for the poster's own public notes (dragging is
// poster-only, same as editing — server.js enforces it too); private notes
// never drag, there's no column to drop them in.
function StickyNote({
  item, bg, draggable, canToggleDone, canEdit, canDelete, onToggleDone, onEdit, onDelete, onOpenLink,
}: {
  item: WhiteboardItem;
  bg: string;
  draggable: boolean;
  canToggleDone: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleDone: (item: WhiteboardItem) => void;
  onEdit: (item: WhiteboardItem) => void;
  onDelete: (item: WhiteboardItem) => void;
  onOpenLink: (link: WhiteboardLink) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: !draggable });
  const due = item.kind === 'todo' ? dueInfo(item) : null;
  const kindMeta = KIND_OPTIONS.find((k) => k.kind === item.kind)!;
  return (
    <Box
      ref={setNodeRef}
      sx={{
        bgcolor: bg, borderRadius: 1, p: 1.25, mb: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={0.5}>
        {draggable && (
          <Box {...attributes} {...listeners} sx={{ cursor: 'grab', color: 'text.disabled', display: 'flex', mt: 0.25, touchAction: 'none' }} title="Drag to another column">
            <DragIndicatorIcon fontSize="small" />
          </Box>
        )}
        {item.kind === 'todo' && (
          <Checkbox
            size="small"
            checked={!!item.done}
            disabled={!canToggleDone}
            onChange={() => onToggleDone(item)}
            title={canToggleDone ? undefined : 'Only the poster or the assigned person can tick this'}
            sx={{ p: 0, mt: 0.25 }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', textDecoration: item.done ? 'line-through' : undefined, color: item.done ? 'text.secondary' : 'text.primary' }}
          >
            {item.text}
          </Typography>
          {item.link && (
            <Chip
              size="small"
              icon={linkIcon(item.link)}
              label={item.link.label || (item.link.type === 'project' ? 'Project' : 'Calcsheet')}
              onClick={() => onOpenLink(item.link!)}
              title={`Open ${item.link.type === 'project' ? 'project' : 'calcsheet proposal'}`}
              variant="outlined"
              sx={{ mt: 0.5, maxWidth: '100%', height: 20, fontSize: 11, bgcolor: 'rgba(255,255,255,0.6)', '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' } }}
            />
          )}
        </Box>
        {canEdit && (
          <IconButton size="small" onClick={() => onEdit(item)} title="Edit" sx={{ p: 0.25 }}>
            <EditOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
        {canDelete && (
          <IconButton size="small" onClick={() => onDelete(item)} title="Delete" sx={{ p: 0.25 }}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
        <Tooltip title={kindMeta.label}>
          <Box sx={{ display: 'flex', color: 'text.disabled' }}>{kindMeta.icon}</Box>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {item.createdByName} · {format(new Date(item.createdAt), 'MMM d')}
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
  );
}

// One board column — a drop target for reassigning a sticky note to this
// person. Highlights while something's dragged over it.
function WhiteboardColumn({
  person, items: colItems, canDragItem, canToggleDoneItem, canEditItem, canDeleteItem, onToggleDone, onEdit, onDelete, onOpenLink,
}: {
  person: (typeof WHITEBOARD_PEOPLE)[number];
  items: WhiteboardItem[];
  canDragItem: (item: WhiteboardItem) => boolean;
  canToggleDoneItem: (item: WhiteboardItem) => boolean;
  canEditItem: (item: WhiteboardItem) => boolean;
  canDeleteItem: (item: WhiteboardItem) => boolean;
  onToggleDone: (item: WhiteboardItem) => void;
  onEdit: (item: WhiteboardItem) => void;
  onDelete: (item: WhiteboardItem) => void;
  onOpenLink: (link: WhiteboardLink) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: person.key });
  return (
    <Box>
      <Box sx={{ bgcolor: person.color, color: 'white', fontWeight: 700, textAlign: 'center', borderRadius: 1, py: 0.75, mb: 1 }}>
        {person.label}
        <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.85 }}>
          ({colItems.length})
        </Typography>
      </Box>
      <Box
        ref={setNodeRef}
        sx={{
          maxHeight: 360, overflowY: 'auto', pr: 0.5, minHeight: 60, borderRadius: 1,
          outline: isOver ? '2px dashed' : 'none', outlineColor: person.color, outlineOffset: 2,
          transition: 'outline-color 0.1s',
        }}
      >
        {colItems.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
            Nothing here yet
          </Typography>
        ) : (
          colItems.map((item) => (
            <StickyNote
              key={item.id} item={item} bg={person.lightColor} draggable={canDragItem(item)}
              canToggleDone={canToggleDoneItem(item)} canEdit={canEditItem(item)} canDelete={canDeleteItem(item)}
              onToggleDone={onToggleDone} onEdit={onEdit} onDelete={onDelete} onOpenLink={onOpenLink}
            />
          ))
        )}
      </Box>
    </Box>
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
  // Which form asked for a new proposal — the new-post composer or the edit
  // dialog — so the created proposal gets linked to the right note.
  const [newProposalFor, setNewProposalFor] = useState<'compose' | 'edit' | null>(null);
  const [notice, setNotice] = useState<NewProjectNotice | null>(null);
  const navigate = useNavigate();

  const [kind, setKind] = useState<WhiteboardKind>('update');
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<WhiteboardVisibility>('public');
  const [assignedTo, setAssignedTo] = useState<WhiteboardPerson>('tj');
  const [dueDate, setDueDate] = useState('');
  const [link, setLink] = useState<WhiteboardLink | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog — owner-only (unlike the done-toggle/drag exceptions above,
  // editing the actual content is never opened up to non-owners).
  const [editing, setEditing] = useState<WhiteboardItem | null>(null);
  const [editText, setEditText] = useState('');
  const [editVisibility, setEditVisibility] = useState<WhiteboardVisibility>('public');
  const [editAssignedTo, setEditAssignedTo] = useState<WhiteboardPerson>('tj');
  const [editDueDate, setEditDueDate] = useState('');
  const [editLink, setEditLink] = useState<WhiteboardLink | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => { if (open) { fetchItems(); fetchLinkOptions(); } }, [open, fetchItems, fetchLinkOptions]);

  // Clicking a note's link chip closes the Whiteboard and opens that page.
  const openLink = (l: WhiteboardLink) => {
    onClose();
    navigate(whiteboardLinkHref(l));
  };

  // A proposal created from the Whiteboard is linked straight away to the
  // note that asked for it (not saved yet — the user still posts/saves).
  const onProposalCreated = (project: Project, createNotice: NewProjectNotice | null) => {
    const l: WhiteboardLink = { type: 'calcsheet', id: project.id, label: [project.code, project.name].filter(Boolean).join(' – ') };
    addLinkOption(l);
    if (newProposalFor === 'edit') setEditLink(l); else setLink(l);
    setNotice(createNotice ?? { severity: 'success', message: `Created ${l.label} — linked to this note. Post/save to keep it.` });
  };

  const publicByPerson = useMemo(() => {
    const map: Record<WhiteboardPerson, WhiteboardItem[]> = { tj: [], rj: [], renzel: [], nylle: [] };
    items
      .filter((i) => i.visibility === 'public' && i.assignedTo)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((i) => map[i.assignedTo as WhiteboardPerson].push(i));
    return map;
  }, [items]);

  const myPrivate = useMemo(
    () => items.filter((i) => i.visibility === 'private').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items],
  );

  const isOwner = (item: WhiteboardItem) => String(item.createdBy) === String(user?.id);
  const myPerson = whiteboardPersonOf(user);
  const canDelete = (item: WhiteboardItem) => isOwner(item);
  const canEdit = (item: WhiteboardItem) => isOwner(item);
  const canDrag = (item: WhiteboardItem) => isOwner(item);
  // The poster, or — on a public to-do — the person it's assigned to.
  const canToggleDone = (item: WhiteboardItem) =>
    isOwner(item) || (item.visibility === 'public' && !!myPerson && item.assignedTo === myPerson);

  const post = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      await addItem({
        kind, visibility, text: trimmed,
        assignedTo: visibility === 'public' ? assignedTo : undefined,
        done: kind === 'todo' ? false : undefined,
        dueDate: kind === 'todo' && dueDate ? dueDate : undefined,
        link: link ?? undefined,
      });
      setText('');
      setDueDate('');
      setLink(null);
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

  const startEdit = (item: WhiteboardItem) => {
    setEditing(item);
    setEditText(item.text);
    setEditVisibility(item.visibility);
    setEditAssignedTo(item.assignedTo ?? 'tj');
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
        visibility: editVisibility,
        assignedTo: editVisibility === 'public' ? editAssignedTo : null,
        ...(editing.kind === 'todo' ? { dueDate: editDueDate || null } : {}),
        link: editLink,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that edit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const targetPerson = over.id as WhiteboardPerson;
    const item = items.find((i) => i.id === active.id);
    if (!item || item.assignedTo === targetPerson) return;
    try {
      await updateItem(item.id, { assignedTo: targetPerson });
    } catch {
      setError('Could not move that note — try again.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Whiteboard
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert severity={notice.severity} sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>{notice.message}</Alert>}

        {/* ── Composer ── */}
        <Stack spacing={1} sx={{ mb: 2 }}>
          <ToggleButtonGroup
            size="small" exclusive value={kind}
            onChange={(_e, v) => { if (v) setKind(v); }}
          >
            {KIND_OPTIONS.map((k) => (
              <ToggleButton key={k.kind} value={k.kind} sx={{ textTransform: 'none', gap: 0.5, px: 1.5 }}>
                {k.icon}{k.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            multiline minRows={2} fullWidth size="small"
            placeholder={kind === 'todo' ? 'Add a to-do…' : kind === 'update' ? "What's the update?" : 'Jot a note…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <LinkPicker value={link} onChange={setLink} options={linkOptions} onCreateNew={() => setNewProposalFor('compose')} />
          <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" gap={1}>
              <Chip
                size="small"
                icon={visibility === 'public' ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                label={visibility === 'public' ? 'Public — on the board' : 'Private — just for me'}
                color={visibility === 'public' ? 'primary' : 'default'}
                variant={visibility === 'public' ? 'filled' : 'outlined'}
                onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}
                sx={{ cursor: 'pointer' }}
              />
              {visibility === 'public' && (
                <TextField
                  select size="small" label="Column" value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value as WhiteboardPerson)}
                  sx={{ width: 130 }}
                >
                  {WHITEBOARD_PEOPLE.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
                </TextField>
              )}
              {kind === 'todo' && (
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

        <Divider sx={{ mb: 0.5 }} />
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
          Drag the ⠿ handle on one of your own notes to move it to another column.
        </Typography>

        {/* ── 4-column board ── */}
        {loading && items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Loading…</Typography>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 1.5, overflowX: 'auto' }}>
              {WHITEBOARD_PEOPLE.map((p) => (
                <WhiteboardColumn
                  key={p.key} person={p} items={publicByPerson[p.key]}
                  canDragItem={canDrag} canToggleDoneItem={canToggleDone}
                  canEditItem={canEdit} canDeleteItem={canDelete}
                  onToggleDone={toggleDone} onEdit={startEdit} onDelete={remove} onOpenLink={openLink}
                />
              ))}
            </Box>
          </DndContext>
        )}

        {/* ── Just for me (private) ── */}
        <Divider sx={{ my: 2 }} textAlign="left">
          <Typography variant="caption" color="text.secondary">Just for me ({myPrivate.length})</Typography>
        </Divider>
        {myPrivate.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
            Nothing private yet — post something above and switch it to Private.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            {myPrivate.map((item) => (
              <StickyNote
                key={item.id} item={item} bg="#f2f2f2" draggable={false}
                canToggleDone={canToggleDone(item)} canEdit={canEdit(item)} canDelete={canDelete(item)}
                onToggleDone={toggleDone} onEdit={startEdit} onDelete={remove} onOpenLink={openLink}
              />
            ))}
          </Box>
        )}
      </DialogContent>

      <NewCalcsheetProjectDialog
        open={newProposalFor !== null}
        onClose={() => setNewProposalFor(null)}
        onCreated={onProposalCreated}
      />

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit {editing ? KIND_OPTIONS.find((k) => k.kind === editing.kind)?.label.toLowerCase() : ''}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              multiline minRows={2} fullWidth size="small" autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <LinkPicker value={editLink} onChange={setEditLink} options={linkOptions} onCreateNew={() => setNewProposalFor('edit')} />
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" gap={1}>
              <Chip
                size="small"
                icon={editVisibility === 'public' ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                label={editVisibility === 'public' ? 'Public — on the board' : 'Private — just for me'}
                color={editVisibility === 'public' ? 'primary' : 'default'}
                variant={editVisibility === 'public' ? 'filled' : 'outlined'}
                onClick={() => setEditVisibility(editVisibility === 'public' ? 'private' : 'public')}
                sx={{ cursor: 'pointer' }}
              />
              {editVisibility === 'public' && (
                <TextField
                  select size="small" label="Column" value={editAssignedTo}
                  onChange={(e) => setEditAssignedTo(e.target.value as WhiteboardPerson)}
                  sx={{ width: 130 }}
                >
                  {WHITEBOARD_PEOPLE.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
                </TextField>
              )}
              {editing?.kind === 'todo' && (
                <TextField
                  type="date" size="small" label="Due date" InputLabelProps={{ shrink: true }}
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  sx={{ width: 160 }}
                />
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" disabled={!editText.trim() || savingEdit} onClick={saveEdit}>
            {savingEdit ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
