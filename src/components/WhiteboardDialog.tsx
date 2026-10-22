import { useEffect, useMemo, useState, type DragEvent, type ReactElement } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RepeatIcon from '@mui/icons-material/Repeat';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import CircleIcon from '@mui/icons-material/Circle';
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
import {
  WHITEBOARD_CATEGORIES, WHITEBOARD_LINK_GROUPS, WHITEBOARD_RECURRENCES, WHITEBOARD_WEEKDAYS, defaultRecurrenceDay,
  sortWhiteboardPending, whiteboardCategoryOf, whiteboardDueState, whiteboardFirstDueDate, whiteboardLinkHref,
  whiteboardMonthDayLabel, whiteboardRecurrenceLabel,
} from '../types/Whiteboard';
import type { WhiteboardCategory, WhiteboardItem, WhiteboardKind, WhiteboardLink, WhiteboardRecurrence } from '../types/Whiteboard';

// The Whiteboard is four shared team lists — General, Project, Sales,
// Finance — plus each user's private "Just for me" list. There are no
// per-person columns or assignments. Items posted to the old person columns
// (visibility 'public') and items saved before categories existed show in
// General — nothing is migrated in Firestore.
const isGeneral = (i: WhiteboardItem) => i.visibility === 'general' || i.visibility === 'public';

const linkIcon = (link: WhiteboardLink) => {
  switch (link.type) {
    case 'project': return <FolderOutlinedIcon sx={{ fontSize: 14 }} />;
    case 'invoice': return <ReceiptLongOutlinedIcon sx={{ fontSize: 14 }} />;
    case 'liquidation': return <AssignmentTurnedInOutlinedIcon sx={{ fontSize: 14 }} />;
    default: return <CalculateOutlinedIcon sx={{ fontSize: 14 }} />;
  }
};
const LINK_TITLE: Record<WhiteboardLink['type'], string> = {
  project: 'project', calcsheet: 'calcsheet proposal', invoice: 'invoice', liquidation: 'liquidation form',
};
const LINK_FALLBACK_LABEL: Record<WhiteboardLink['type'], string> = {
  project: 'Project', calcsheet: 'Calcsheet', invoice: 'Invoice', liquidation: 'Liquidation',
};


// Older items were posted as an Update or a Note — keep a small icon so they
// read the same as before; to-dos (everything new) get no icon.
const KIND_ICON: Partial<Record<WhiteboardKind, { label: string; icon: ReactElement }>> = {
  update: { label: 'Update', icon: <CampaignIcon sx={{ fontSize: 15 }} /> },
  note: { label: 'Note', icon: <NoteIcon sx={{ fontSize: 15 }} /> },
};

// Full-screen (on phones) chooser for "connect this item to…": a search box, filter chips by type and big
// tap rows — much easier to hit than a small dropdown that opens right above the keyboard.
const LINK_FILTERS: { key: WhiteboardLink['type'] | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'project', label: 'Projects' },
  { key: 'calcsheet', label: 'Proposals' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'liquidation', label: 'Liquidations' },
];
const LINK_RESULT_LIMIT = 60;

function LinkPickerDialog({ open, onClose, options, value, onPick, onCreateNew }: {
  open: boolean;
  onClose: () => void;
  options: WhiteboardLink[];
  value: WhiteboardLink | null;
  onPick: (link: WhiteboardLink | null) => void;
  onCreateNew?: () => void;
}) {
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<WhiteboardLink['type'] | 'all'>('all');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options.filter((o) => (type === 'all' || o.type === type) && words.every((w) => o.label.toLowerCase().includes(w)));
  const pick = (link: WhiteboardLink | null) => { onPick(link); onClose(); };
  return (
    <Dialog open={open} onClose={onClose} fullScreen={isPhone} fullWidth maxWidth="sm" data-testid="wb-link-picker">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.25 }}>
        Link to…
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 1.5 }}>
        <TextField
          autoFocus={!isPhone} fullWidth size="small" placeholder="Search by name or number…" value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75} sx={{ my: 1.25 }}>
          {LINK_FILTERS.map((f) => (
            <Chip
              key={f.key} label={f.label} size="medium" onClick={() => setType(f.key)}
              color={type === f.key ? 'primary' : 'default'} variant={type === f.key ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
        {matches.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            {options.length === 0 ? 'Nothing to link to yet.' : 'No matches — try fewer words or another type.'}
          </Typography>
        )}
        <List disablePadding>
          {matches.slice(0, LINK_RESULT_LIMIT).map((o) => (
            <ListItemButton
              key={`${o.type}-${o.id}`} onClick={() => pick(o)} selected={value?.type === o.type && value?.id === o.id}
              sx={{ minHeight: 56, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{linkIcon(o)}</ListItemIcon>
              <ListItemText
                primary={o.label}
                secondary={WHITEBOARD_LINK_GROUPS[o.type]}
                slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 600, overflowWrap: 'anywhere' } }, secondary: { variant: 'caption' } }}
              />
            </ListItemButton>
          ))}
        </List>
        {matches.length > LINK_RESULT_LIMIT && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 1, textAlign: 'center' }}>
            Showing the first {LINK_RESULT_LIMIT} of {matches.length} — type to narrow it down.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        {onCreateNew ? <Button size="small" startIcon={<AddIcon />} onClick={() => { onClose(); onCreateNew(); }}>New proposal</Button> : <span />}
        {value && <Button size="small" color="inherit" onClick={() => pick(null)}>Remove link</Button>}
      </DialogActions>
    </Dialog>
  );
}

// The "connect to…" control: shows the current link as a chip (tap to change, × to remove) or a button that
// opens the picker.
function LinkField({ value, onChange, options, onCreateNew }: {
  value: WhiteboardLink | null;
  onChange: (link: WhiteboardLink | null) => void;
  options: WhiteboardLink[];
  onCreateNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {value ? (
        <Chip
          icon={linkIcon(value)} label={value.label} onClick={() => setOpen(true)} onDelete={() => onChange(null)}
          title={`Linked to ${LINK_TITLE[value.type]} — tap to change`} sx={{ maxWidth: '100%', height: 36, justifyContent: 'flex-start', bgcolor: 'white' }}
        />
      ) : (
        <Button
          size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setOpen(true)}
          sx={{ justifyContent: 'flex-start', minHeight: 40, bgcolor: 'white', textTransform: 'none', color: 'text.secondary', borderColor: 'divider' }}
        >
          Link to a project, invoice, liquidation…
        </Button>
      )}
      <LinkPickerDialog open={open} onClose={() => setOpen(false)} options={options} value={value} onPick={onChange} onCreateNew={onCreateNew} />
    </>
  );
}

// Optional "connect this item to…" picker — Project List projects, calcsheet proposals, invoices and
// liquidation forms, grouped by type — plus a "New proposal" button for when the project doesn't exist yet.
// Desktop: a type-to-search dropdown. Phones: a button that opens the full-screen chooser above.
function LinkPicker({ value, onChange, options, onCreateNew }: {
  value: WhiteboardLink | null;
  onChange: (link: WhiteboardLink | null) => void;
  options: WhiteboardLink[];
  onCreateNew: () => void;
}) {
  const isPhone = useMediaQuery('(max-width:599.95px)');
  if (isPhone) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <LinkField value={value} onChange={onChange} options={options} onCreateNew={onCreateNew} />
        </Box>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Autocomplete
        size="small"
        options={options}
        value={value}
        onChange={(_e, v) => onChange(v)}
        groupBy={(o) => WHITEBOARD_LINK_GROUPS[o.type]}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
        renderInput={(params) => <TextField {...params} label="Link to project / proposal / invoice / liquidation (optional)" />}
        sx={{ minWidth: { xs: '100%', sm: 240 }, flex: 1 }}
      />
      <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onCreateNew} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        New proposal
      </Button>
    </Stack>
  );
}

// Optional extras when adding an item: a due date and how often it repeats (on which day).
type AddOptions = { dueDate?: string; recurrence?: WhiteboardRecurrence; recurrenceDay?: number; link?: WhiteboardLink };

// "Repeats" plus, for weekly / monthly, the specific day it falls on. Picking a frequency pre-selects the
// due date's weekday / day of the month, so one tap is enough when that's what you want.
function RepeatFields({ dueDate, recurrence, day, onChange }: {
  dueDate: string;
  recurrence: WhiteboardRecurrence | '';
  day: number | null;
  onChange: (recurrence: WhiteboardRecurrence | '', day: number | null) => void;
}) {
  const firstDue = recurrence && !dueDate ? whiteboardFirstDueDate(recurrence, day) : null;
  return (
    <>
      <TextField
        select size="small" label="Repeats" value={recurrence}
        onChange={(e) => { const rec = e.target.value as WhiteboardRecurrence | ''; onChange(rec, defaultRecurrenceDay(rec, dueDate)); }}
        SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ minWidth: 0, bgcolor: 'white' }}
        helperText={recurrence === 'yearly' ? 'On the due date each year' : undefined}
      >
        <MenuItem value="">Doesn’t repeat</MenuItem>
        {WHITEBOARD_RECURRENCES.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
      </TextField>
      {recurrence === 'weekly' && (
        <TextField
          select size="small" label="On" value={day ?? 1} onChange={(e) => onChange(recurrence, Number(e.target.value))}
          InputLabelProps={{ shrink: true }} sx={{ minWidth: 0, bgcolor: 'white' }}
          helperText={firstDue ? `First due: ${format(new Date(`${firstDue}T00:00:00`), 'EEE, MMM d')}` : undefined}
        >
          {WHITEBOARD_WEEKDAYS.map((name, i) => <MenuItem key={name} value={i}>{name}</MenuItem>)}
        </TextField>
      )}
      {recurrence === 'monthly' && (
        <TextField
          select size="small" label="On day" value={day ?? 1} onChange={(e) => onChange(recurrence, Number(e.target.value))}
          InputLabelProps={{ shrink: true }} sx={{ minWidth: 0, bgcolor: 'white' }}
          helperText={firstDue ? `First due: ${format(new Date(`${firstDue}T00:00:00`), 'EEE, MMM d')}` : undefined}
          SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 300 } } } }}
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{whiteboardMonthDayLabel(n)}</MenuItem>)}
          <MenuItem value={0}>{whiteboardMonthDayLabel(0)}</MenuItem>
        </TextField>
      )}
      {recurrence && recurrence !== 'weekly' && recurrence !== 'monthly' && !dueDate && (
        <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>First due date: today</Typography>
      )}
    </>
  );
}

// The add-box extras, shown open by default: link, due date and repeat (+ its day).
function AddOptionsFields({ dueDate, recurrence, day, link, linkOptions, onDueDate, onRepeat, onLink }: {
  dueDate: string; recurrence: WhiteboardRecurrence | ''; day: number | null;
  link: WhiteboardLink | null; linkOptions: WhiteboardLink[];
  onDueDate: (v: string) => void; onRepeat: (rec: WhiteboardRecurrence | '', day: number | null) => void;
  onLink: (link: WhiteboardLink | null) => void;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, mt: 1, alignItems: 'start' }} data-testid="wb-add-options">
      <Box sx={{ gridColumn: '1 / -1', display: 'flex', minWidth: 0 }}>
        <LinkField value={link} onChange={onLink} options={linkOptions} />
      </Box>
      <TextField
        type="date" size="small" label="Due date" value={dueDate} onChange={(e) => onDueDate(e.target.value)}
        InputLabelProps={{ shrink: true }} sx={{ minWidth: 0, bgcolor: 'white' }}
      />
      <RepeatFields dueDate={dueDate} recurrence={recurrence} day={day} onChange={onRepeat} />
    </Box>
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

// Drag payload type for moving a shared item between the team lists.
const DRAG_TYPE = 'application/x-whiteboard-item';

// One checklist line — used by both the team lists and the private list.
// Shared items (onMove set) can be dragged to another list or moved with the
// "Move to…" menu — by anyone, like ticking them done.
function ItemRow({ item, canEdit, onToggleDone, onEdit, onDelete, onOpenLink, onMove, isPhone }: {
  isPhone?: boolean;
  item: WhiteboardItem;
  canEdit: boolean;
  onToggleDone: (item: WhiteboardItem) => void;
  onEdit: (item: WhiteboardItem) => void;
  onDelete: (item: WhiteboardItem) => void;
  onOpenLink: (link: WhiteboardLink) => void;
  onMove?: (item: WhiteboardItem, category: WhiteboardCategory) => void;
}) {
  const due = dueInfo(item);
  const dueState = item.done ? null : whiteboardDueState(item.dueDate);
  const kind = KIND_ICON[item.kind];
  const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const current = whiteboardCategoryOf(item);
  // Phones: one ⋮ menu (move / edit / delete) instead of three tiny icons.
  const phoneMenu = isPhone && (onMove || canEdit) ? [
    ...(onMove ? [
      <MenuItem key="mh" disabled dense sx={{ fontSize: 12 }}>Move to…</MenuItem>,
      ...WHITEBOARD_CATEGORIES.filter((c) => c.key !== current).map((c) => (
        <MenuItem key={`m-${c.key}`} dense onClick={() => { setMenuAnchor(null); onMove(item, c.key); }}>
          <ListItemIcon sx={{ minWidth: 24 }}><CircleIcon sx={{ fontSize: 10, color: c.color }} /></ListItemIcon>
          {c.label}
        </MenuItem>
      )),
    ] : []),
    ...(canEdit ? [
      ...(onMove ? [<Divider key="d" />] : []),
      <MenuItem key="edit" dense onClick={() => { setMenuAnchor(null); onEdit(item); }}>Edit</MenuItem>,
      <MenuItem key="del" dense sx={{ color: 'error.main' }} onClick={() => { setMenuAnchor(null); onDelete(item); }}>Delete</MenuItem>,
    ] : []),
  ] : null;
  return (
    <Stack
      direction="row" alignItems="flex-start" spacing={1} data-testid={`wb-item-${item.id}`}
      draggable={!!onMove && !isPhone}
      onDragStart={onMove ? (e) => { e.dataTransfer.setData(DRAG_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      sx={{
        py: 0.5, borderBottom: '1px dashed', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 },
        ...(onMove && !isPhone ? { cursor: 'grab', '&:hover .wb-drag': { opacity: 1 } } : {}),
        ...(dueState === 'overdue' ? { borderLeft: '3px solid', borderLeftColor: 'error.main', pl: 0.75 } : {}),
      }}
    >
{onMove && !isPhone && <DragIndicatorIcon className="wb-drag" sx={{ fontSize: 16, color: 'text.disabled', mt: 0.25, ml: -0.5, mr: -0.75, opacity: { xs: 0, sm: 0.35 } }} />}
      <Checkbox size="small" checked={!!item.done} onChange={() => onToggleDone(item)} sx={{ p: isPhone ? 0.75 : 0, mt: isPhone ? -0.25 : 0.25, ml: isPhone ? -0.5 : 0 }} title={item.done ? 'Mark as pending' : 'Mark as done'} />
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
          {item.recurrence && (
            <Chip size="small" icon={<RepeatIcon sx={{ fontSize: '12px !important' }} />} label={whiteboardRecurrenceLabel(item.recurrence, item.recurrenceDay)} variant="outlined"
              title="Repeats — ticking it creates the next one"
              sx={{ height: 18, fontSize: 11, '& .MuiChip-label': { px: 0.5 } }} />
          )}
          {item.link && (
            <Chip size="small" icon={linkIcon(item.link)} label={item.link.label || LINK_FALLBACK_LABEL[item.link.type]} onClick={() => onOpenLink(item.link!)} variant="outlined"
              title={`Open ${LINK_TITLE[item.link.type]}`}
              sx={{ height: 18, fontSize: 11, maxWidth: '100%', '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' } }} />
          )}
          <Typography variant="caption" color="text.disabled">{item.createdByName} · {format(new Date(item.createdAt), 'MMM d')}</Typography>
          {item.done && item.doneByName && (
            <Typography variant="caption" color="success.main" data-testid="wb-done-by">
              ✓ {item.doneByName}{item.doneAt ? ` · ${format(new Date(item.doneAt), 'MMM d')}` : ''}
            </Typography>
          )}
        </Stack>
      </Box>
      {phoneMenu && (
        <>
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Item actions"><MoreVertIcon fontSize="small" /></IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>{phoneMenu}</Menu>
        </>
      )}
      {!isPhone && onMove && (
        <>
          <IconButton size="small" onClick={(e) => setMoveAnchor(e.currentTarget)} title="Move to another list" aria-label="Move to another list" sx={{ p: 0.25 }}>
            <DriveFileMoveOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Menu anchorEl={moveAnchor} open={!!moveAnchor} onClose={() => setMoveAnchor(null)}>
            <MenuItem disabled dense sx={{ fontSize: 12 }}>Move to…</MenuItem>
            {WHITEBOARD_CATEGORIES.filter((c) => c.key !== current).map((c) => (
              <MenuItem key={c.key} dense onClick={() => { setMoveAnchor(null); onMove(item, c.key); }}>
                <ListItemIcon sx={{ minWidth: 24 }}><CircleIcon sx={{ fontSize: 10, color: c.color }} /></ListItemIcon>
                {c.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
      {!isPhone && canEdit && (
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
  items, emptyText, placeholder, isOwner, onAdd, onToggleDone, onEdit, onDelete, onOpenLink, onMove, maxHeight, isPhone, hideAdd, linkOptions = [],
}: {
  isPhone?: boolean;
  /** Phones add from the bar at the bottom instead of a field in every list. */
  hideAdd?: boolean;
  /** Things an item can be linked to (projects, proposals, invoices, liquidations). */
  linkOptions?: WhiteboardLink[];
  items: WhiteboardItem[];
  emptyText: string;
  placeholder: string;
  isOwner: (item: WhiteboardItem) => boolean;
  onAdd: (text: string, opts?: AddOptions) => Promise<void>;
  onToggleDone: (item: WhiteboardItem) => void;
  onEdit: (item: WhiteboardItem) => void;
  onDelete: (item: WhiteboardItem) => void;
  onOpenLink: (link: WhiteboardLink) => void;
  onMove?: (item: WhiteboardItem, category: WhiteboardCategory) => void;
  /** Cap on the scroll area; omit to fill the parent (a flex column) instead. */
  maxHeight?: string;
}) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showOpts, setShowOpts] = useState(true); // open by default — due date & repeat are one glance away
  const [draftDue, setDraftDue] = useState('');
  const [draftRec, setDraftRec] = useState<WhiteboardRecurrence | ''>('');
  const [draftDay, setDraftDay] = useState<number | null>(null);
  const [draftLink, setDraftLink] = useState<WhiteboardLink | null>(null);
  // Overdue and soonest-due first, then oldest-first like a checklist; newest-completed first under "Show done".
  const pending = sortWhiteboardPending(items.filter((i) => !i.done));
  const done = items.filter((i) => i.done)
    .sort((a, b) => String(b.doneAt || b.updatedAt).localeCompare(String(a.doneAt || a.updatedAt)));
  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    setAdding(true);
    try {
      await onAdd(t, {
        ...(draftDue ? { dueDate: draftDue } : {}),
        ...(draftRec ? { recurrence: draftRec, ...(draftDay != null ? { recurrenceDay: draftDay } : {}) } : {}),
        ...(draftLink ? { link: draftLink } : {}),
      });
      setDraft(''); setDraftDue(''); setDraftRec(''); setDraftDay(null); setDraftLink(null);
    } catch { /* error shown by the dialog */ } finally { setAdding(false); }
  };
  const row = (item: WhiteboardItem) => (
    <ItemRow key={item.id} item={item} canEdit={isOwner(item)} onToggleDone={onToggleDone} onEdit={onEdit} onDelete={onDelete} onOpenLink={onOpenLink} onMove={onMove} isPhone={isPhone} />
  );
  return (
    <>
      <Box sx={{ overflowY: 'auto', pr: 0.5, ...(maxHeight ? { maxHeight: { xs: 'none', sm: maxHeight } } : { flex: { sm: 1 }, minHeight: 0, '@media (max-height: 600px)': { flex: 'none', maxHeight: 180, minHeight: 56 } }) }}>
        {pending.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 0.5 }}>{emptyText}</Typography>
        )}
        {pending.map(row)}
        {showDone && done.map(row)}
      </Box>
      {!hideAdd && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField
          size="small" fullWidth placeholder={placeholder} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void add(); } }}
          sx={{ bgcolor: 'white' }}
        />
        <Tooltip title="Link, due date & repeat">
          <IconButton size="small" onClick={() => setShowOpts((v) => !v)} aria-label="Link, due date and repeat options" color={showOpts || draftDue || draftRec || draftLink ? 'primary' : 'default'}>
            <EventRepeatOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button variant="contained" size="small" disabled={!draft.trim() || adding} onClick={() => void add()} sx={{ flexShrink: 0 }}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </Stack>}
      {!hideAdd && showOpts && <AddOptionsFields
        dueDate={draftDue} recurrence={draftRec} day={draftDay} link={draftLink} linkOptions={linkOptions}
        onDueDate={setDraftDue} onRepeat={(rec, day) => { setDraftRec(rec); setDraftDay(day); }} onLink={setDraftLink}
      />}
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
  // Portrait phones (< 600 px): lists become collapsible sections and adding happens from a bar at the bottom.
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [phoneOpen, setPhoneOpen] = useState<Record<string, boolean> | null>(null);
  const [quickText, setQuickText] = useState('');
  const [quickTarget, setQuickTarget] = useState<WhiteboardCategory | 'private'>('general');
  const [quickAdding, setQuickAdding] = useState(false);
  const [quickOpts, setQuickOpts] = useState(true);
  const [quickDue, setQuickDue] = useState('');
  const [quickRec, setQuickRec] = useState<WhiteboardRecurrence | ''>('');
  const [quickDay, setQuickDay] = useState<number | null>(null);
  const [quickLink, setQuickLink] = useState<WhiteboardLink | null>(null);
  const [newProposalOpen, setNewProposalOpen] = useState(false);
  const [notice, setNotice] = useState<NewProjectNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Edit dialog — owner-only.
  const [editing, setEditing] = useState<WhiteboardItem | null>(null);
  const [editText, setEditText] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editCategory, setEditCategory] = useState<WhiteboardCategory>('general');
  const [editDueDate, setEditDueDate] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<WhiteboardRecurrence | ''>('');
  const [editRecurrenceDay, setEditRecurrenceDay] = useState<number | null>(null);
  const [editLink, setEditLink] = useState<WhiteboardLink | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Team list a dragged item is hovering over (highlighted as a drop target).
  const [dropTarget, setDropTarget] = useState<WhiteboardCategory | null>(null);

  // Always reload on open so teammates' new items show up.
  useEffect(() => { if (open) { fetchItems({ force: true }).catch(() => {}); fetchLinkOptions(); } }, [open, fetchItems, fetchLinkOptions]);

  // Clicking an item's link chip closes the Whiteboard and opens that page.
  const openLink = (l: WhiteboardLink) => {
    onClose();
    navigate(whiteboardLinkHref(l, `${window.location.pathname}${window.location.search}`));
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
  const byCategory = useMemo(() => {
    const map = Object.fromEntries(WHITEBOARD_CATEGORIES.map((c) => [c.key, [] as WhiteboardItem[]])) as Record<WhiteboardCategory, WhiteboardItem[]>;
    items.filter(isGeneral).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((i) => map[whiteboardCategoryOf(i)].push(i));
    return map;
  }, [items]);
  const myPrivate = useMemo(() => items.filter((i) => i.visibility === 'private').sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [items]);

  // Phone sections: open the first list that has something pending, unless the user has opened/closed some.
  const firstWithPending = WHITEBOARD_CATEGORIES.find((c) => byCategory[c.key].some((i) => !i.done))?.key ?? 'general';
  const openMap: Record<string, boolean> = phoneOpen ?? { [firstWithPending]: true };

  // How much is overdue / due today across everything the viewer can see.
  const dueSummary = useMemo(() => {
    const pending = items.filter((i) => !i.done && i.dueDate);
    return {
      overdue: pending.filter((i) => whiteboardDueState(i.dueDate) === 'overdue').length,
      today: pending.filter((i) => whiteboardDueState(i.dueDate) === 'today').length,
    };
  }, [items]);

  const isOwner = (item: WhiteboardItem) => String(item.createdBy) === String(user?.id);

  const add = (visibility: 'general' | 'private', category?: WhiteboardCategory) => async (t: string, opts?: AddOptions) => {
    setError(null);
    try {
      await addItem({ kind: 'todo', visibility, text: t, done: false, ...(category ? { category } : {}), ...(opts ?? {}) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that item.');
      throw e;
    }
  };

  // Anyone may tick a General item; private items are only ever the owner's.
  const toggleDone = async (item: WhiteboardItem) => {
    try {
      const res = await updateItem(item.id, { done: !item.done });
      if (res && res.spawned?.dueDate) {
        setNotice({ severity: 'info', message: `Done — the next one is due ${format(new Date(`${res.spawned.dueDate}T00:00:00`), 'MMM d')}.` });
      }
    } catch {
      setError('Could not update that item.');
    }
  };

  // Phone quick-add bar: one field + list picker instead of an add field in every list.
  const quickAdd = async () => {
    const t = quickText.trim();
    if (!t) return;
    setQuickAdding(true);
    try {
      const opts: AddOptions = {
        ...(quickDue ? { dueDate: quickDue } : {}),
        ...(quickRec ? { recurrence: quickRec, ...(quickDay != null ? { recurrenceDay: quickDay } : {}) } : {}),
        ...(quickLink ? { link: quickLink } : {}),
      };
      await (quickTarget === 'private' ? add('private')(t, opts) : add('general', quickTarget)(t, opts));
      setQuickText(''); setQuickDue(''); setQuickRec(''); setQuickDay(null); setQuickLink(null);
      setPhoneOpen({ ...openMap, [quickTarget]: true });
    } catch { /* error shown above the lists */ } finally { setQuickAdding(false); }
  };

  // Anyone may move a shared item to another team list (drag or "Move to…").
  const move = async (item: WhiteboardItem, category: WhiteboardCategory) => {
    if (whiteboardCategoryOf(item) === category) return;
    setError(null);
    try {
      await updateItem(item.id, { category });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move that item.');
    }
  };

  const dropProps = (category: WhiteboardCategory) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== category) setDropTarget(category);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget((t) => (t === category ? null : t));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const item = items.find((i) => i.id === e.dataTransfer.getData(DRAG_TYPE));
      if (item) void move(item, category);
    },
  });

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
    setEditCategory(whiteboardCategoryOf(item));
    setEditDueDate(item.dueDate ?? '');
    setEditRecurrence(item.recurrence ?? '');
    setEditRecurrenceDay(item.recurrenceDay ?? null);
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
        ...(editPrivate ? {} : { category: editCategory }),
        assignedTo: null,
        dueDate: editDueDate || null,
        ...(editing.kind === 'todo' ? { recurrence: editRecurrence || null, recurrenceDay: editRecurrence ? editRecurrenceDay : null } : {}),
        link: editLink,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that edit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const listProps = { isOwner, onToggleDone: toggleDone, onEdit: startEdit, onDelete: remove, onOpenLink: openLink, isPhone, linkOptions };

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.25 }}>
        <Box>
          Whiteboard
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1.5, display: { xs: 'none', sm: 'inline' } }}>
            Drag an item to another list to move it
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert severity={notice.severity} sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>{notice.message}</Alert>}

        {loading && items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Loading…</Typography>
        ) : (
          <>
            {/* Overdue / due-today summary */}
            {(dueSummary.overdue > 0 || dueSummary.today > 0) && (
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} data-testid="wb-due-summary">
                {dueSummary.overdue > 0 && <Chip size="small" color="error" label={`${dueSummary.overdue} overdue`} sx={{ fontWeight: 600 }} />}
                {dueSummary.today > 0 && <Chip size="small" color="warning" label={`${dueSummary.today} due today`} sx={{ fontWeight: 600 }} />}
              </Stack>
            )}
            {isPhone ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pb: 1 }}>
                {WHITEBOARD_CATEGORIES.map((c) => {
                  const list = byCategory[c.key];
                  const pending = list.filter((i) => !i.done).length;
                  const overdue = list.filter((i) => !i.done && whiteboardDueState(i.dueDate) === 'overdue').length;
                  return (
                    <Accordion
                      key={c.key} disableGutters expanded={!!openMap[c.key]} onChange={(_e, ex) => setPhoneOpen({ ...openMap, [c.key]: ex })}
                      sx={{ border: '1px solid', borderColor: c.color, bgcolor: c.lightColor, borderRadius: 1.5, boxShadow: 'none', '&:before': { display: 'none' } }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {c.key === 'general' && <PushPinOutlinedIcon sx={{ fontSize: 18, color: c.color }} />}
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: c.color }}>{c.label}</Typography>
                          <Chip size="small" label={pending ? `${pending} pending` : 'All clear'} color={pending ? 'warning' : 'success'} sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
                          {overdue > 0 && <Chip size="small" label={`${overdue} overdue`} color="error" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />}
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        <ItemList {...listProps} hideAdd items={list} onMove={move} emptyText={`Nothing pending in ${c.label}.`} placeholder="" onAdd={add('general', c.key)} />
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
                <Accordion
                  disableGutters expanded={!!openMap.private} onChange={(_e, ex) => setPhoneOpen({ ...openMap, private: ex })}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, boxShadow: 'none', '&:before': { display: 'none' } }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <LockIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Just for me</Typography>
                      <Chip size="small" label={`${myPrivate.filter((i) => !i.done).length} pending`} sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <ItemList {...listProps} hideAdd items={myPrivate} emptyText="Nothing private yet — only you can see what you add here." placeholder="" onAdd={add('private')} />
                  </AccordionDetails>
                </Accordion>
              </Box>
            ) : (
            <>
            {/* ── Team lists — General, Project, Sales, Finance; fill the screen, items drag between them ── */}
            <Box sx={{
              display: 'grid', gap: 1.5, flex: { sm: 1 }, minHeight: { sm: 0 },
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              gridAutoRows: { sm: 'minmax(0, 1fr)' },
              // Short screens (phone landscape): don't squeeze the lists into the leftover
              // height — let each take its natural size and the dialog scroll.
              '@media (max-height: 600px)': { flex: 'none', gridAutoRows: 'auto' },
            }}>
              {WHITEBOARD_CATEGORIES.map((c) => {
                const list = byCategory[c.key];
                const pending = list.filter((i) => !i.done).length;
                const isTarget = dropTarget === c.key;
                return (
                  <Box
                    key={c.key} data-testid={`wb-list-${c.key}`} {...dropProps(c.key)}
                    sx={{
                      border: isTarget ? '2px dashed' : '1px solid', borderColor: c.color, bgcolor: c.lightColor, borderRadius: 1.5,
                      p: isTarget ? 'calc(10px - 1px)' : 1.25, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
                      boxShadow: isTarget ? `0 0 0 3px ${c.color}33` : undefined, transition: 'box-shadow 120ms',
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                      {c.key === 'general' && <PushPinOutlinedIcon sx={{ fontSize: 18, color: c.color }} />}
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: c.color }}>{c.label}</Typography>
                      <Chip
                        size="small" label={pending ? `${pending} pending` : 'All clear'}
                        color={pending ? 'warning' : 'success'} sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
                      />
                    </Stack>
                    <ItemList
                      {...listProps} items={list} onMove={move}
                      emptyText={`Nothing pending in ${c.label}.`}
                      placeholder={`Add to ${c.label}…`}
                      onAdd={add('general', c.key)}
                    />
                  </Box>
                );
              })}
            </Box>

            {/* ── Just for me — private, only you see these ── */}
            <Divider sx={{ my: 2 }} textAlign="left">
              <Typography variant="caption" color="text.secondary">
                <LockIcon sx={{ fontSize: 13, mr: 0.5, verticalAlign: '-2px' }} />Just for me ({myPrivate.filter((i) => !i.done).length})
              </Typography>
            </Divider>
            <ItemList
              {...listProps} items={myPrivate} maxHeight="20vh"
              emptyText="Nothing private yet — only you can see what you add here."
              placeholder="Add a private reminder…"
              onAdd={add('private')}
            />
            </>
            )}
          </>
        )}
      </DialogContent>

      {/* Phone quick-add bar: one field and a list picker, always in thumb reach */}
      {isPhone && !(loading && items.length === 0) && (
        <Box sx={{ p: 1, pb: 'calc(8px + env(safe-area-inset-bottom))', borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        {quickOpts && <Box sx={{ mb: 1, mt: -0.5 }}><AddOptionsFields
            dueDate={quickDue} recurrence={quickRec} day={quickDay} link={quickLink} linkOptions={linkOptions}
            onDueDate={setQuickDue} onRepeat={(rec, day) => { setQuickRec(rec); setQuickDay(day); }} onLink={setQuickLink}
          /></Box>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            select size="small" value={quickTarget} onChange={(e) => setQuickTarget(e.target.value as WhiteboardCategory | 'private')}
            sx={{ width: 108, flexShrink: 0 }} aria-label="Add to list"
          >
            {WHITEBOARD_CATEGORIES.map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
            <MenuItem value="private">Just me</MenuItem>
          </TextField>
          <TextField
            size="small" fullWidth placeholder="Add an item…" value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void quickAdd(); } }}
          />
          <IconButton onClick={() => setQuickOpts((v) => !v)} aria-label="Link, due date and repeat options" color={quickOpts || quickDue || quickRec || quickLink ? 'primary' : 'default'} sx={{ flexShrink: 0 }}>
            <EventRepeatOutlinedIcon />
          </IconButton>
          <Button variant="contained" size="small" disabled={!quickText.trim() || quickAdding} onClick={() => void quickAdd()} sx={{ flexShrink: 0 }}>Add</Button>
        </Box>
        </Box>
      )}

      <NewCalcsheetProjectDialog
        open={newProposalOpen}
        onClose={() => setNewProposalOpen(false)}
        onCreated={onProposalCreated}
      />

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth fullScreen={isPhone}>
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
                label={editPrivate ? 'Private — just for me' : 'Shared — whole team'}
                color={editPrivate ? 'default' : 'primary'}
                variant={editPrivate ? 'outlined' : 'filled'}
                onClick={() => setEditPrivate((v) => !v)}
                sx={{ cursor: 'pointer' }}
              />
              {!editPrivate && (
                <TextField select size="small" label="List" value={editCategory} onChange={(e) => setEditCategory(e.target.value as WhiteboardCategory)} sx={{ width: 140 }}>
                  {WHITEBOARD_CATEGORIES.map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                </TextField>
              )}
              <TextField
                type="date" size="small" label="Due date" InputLabelProps={{ shrink: true }}
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                sx={{ width: 160 }}
              />
              {editing?.kind === 'todo' && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, width: '100%', alignItems: 'start' }}>
                  <RepeatFields
                    dueDate={editDueDate} recurrence={editRecurrence} day={editRecurrenceDay}
                    onChange={(rec, day) => { setEditRecurrence(rec); setEditRecurrenceDay(day); }}
                  />
                </Box>
              )}
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
