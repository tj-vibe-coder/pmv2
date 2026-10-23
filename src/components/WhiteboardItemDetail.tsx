import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, IconButton, LinearProgress, Slider, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteboardStore } from '../store/whiteboardStore';
import { whiteboardTag } from '../types/Whiteboard';
import type { WhiteboardItem } from '../types/Whiteboard';

// "Oct 22, 3:10 PM" — with the year only when it isn't this year.
export const formatNoteTime = (iso: string): string => {
  const d = new Date(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'MMM d, h:mm a' : 'MMM d yyyy, h:mm a');
};

// Thin progress bar with its percentage — shown on the row so everyone sees how far a task is without opening it.
export function ProgressBar({ value }: { value: number }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.25 }} data-testid="wb-progress">
      <LinearProgress
        variant="determinate" value={value} color={value >= 100 ? 'success' : 'primary'}
        aria-label={`Progress ${value}%`} sx={{ flex: 1, height: 4, borderRadius: 2 }}
      />
      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11, lineHeight: 1, minWidth: 28, textAlign: 'right' }}>{value}%</Typography>
    </Stack>
  );
}

// Small uppercase section label with an optional action on the right ("+ Add subtask", "+ Post update").
function SectionHeader({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 28 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.3 }}>{label}</Typography>
      {actionLabel && onAction && (
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: '16px !important' }} />} onClick={onAction} sx={{ py: 0.25, minWidth: 0, textTransform: 'none' }}>
          {actionLabel}
        </Button>
      )}
    </Stack>
  );
}

// The expandable part of a task. By default it only reads: the subtasks, the dated status notes (newest first)
// and — on the row above — the progress bar. Adding a subtask or posting an update is one click away, and is open
// to everyone who can see the task. Removing is limited to whoever added it, or the task's poster (`isOwner`).
export default function WhiteboardItemDetail({ item, isOwner }: { item: WhiteboardItem; isOwner: boolean }) {
  const { user } = useAuth();
  const addSubtask = useWhiteboardStore((s) => s.addSubtask);
  const setSubtaskDone = useWhiteboardStore((s) => s.setSubtaskDone);
  const deleteSubtask = useWhiteboardStore((s) => s.deleteSubtask);
  const addUpdate = useWhiteboardStore((s) => s.addUpdate);
  const deleteUpdate = useWhiteboardStore((s) => s.deleteUpdate);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [postingNote, setPostingNote] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  // null until the slider is moved — the update then carries the new progress; otherwise it leaves it alone.
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = String(user?.id);
  const subtasks = item.subtasks ?? [];
  const notes = [...(item.updates ?? [])].reverse(); // newest first
  const sliderValue = pct ?? item.progress ?? 0;

  // Run a store action, surfacing the server's message instead of failing silently.
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setError(null);
    try { await action(); return true; } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
      return false;
    }
  };

  // The form stays open after adding so several subtasks can go in one after another; "Done" closes it.
  const postSubtask = async () => {
    const text = subtaskDraft.trim();
    if (!text) return;
    if (await run(() => addSubtask(item.id, text))) setSubtaskDraft('');
  };

  const closeNoteForm = () => { setPostingNote(false); setNoteDraft(''); setPct(null); };

  const postNote = async () => {
    const text = noteDraft.trim();
    if (!text) return;
    setBusy(true);
    const ok = await run(() => addUpdate(item.id, { text, ...(pct !== null ? { progress: pct } : {}) }));
    setBusy(false);
    if (ok) closeNoteForm();
  };

  return (
    <Box data-testid={`wb-detail-${item.id}`} sx={{ pb: 1, pt: 0.5, pl: { xs: 0.5, sm: 3.5 }, pr: 0.5 }}>
      {error && <Alert severity="warning" sx={{ mb: 1, py: 0 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Subtasks ── */}
      <Box sx={{ mb: 1.5 }}>
        <SectionHeader
          label={`SUBTASKS${subtasks.length > 0 ? ` · ${subtasks.filter((s) => s.done).length}/${subtasks.length}` : ''}`}
          actionLabel={addingSubtask ? undefined : 'Add subtask'} onAction={() => setAddingSubtask(true)}
        />
        {subtasks.length === 0 && !addingSubtask && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>No subtasks yet.</Typography>
        )}
        {subtasks.map((s) => (
          <Stack key={s.id} direction="row" alignItems="flex-start" spacing={0.5} data-testid={`wb-detail-subtask-${s.id}`}>
            <Checkbox
              size="small" checked={s.done} sx={{ p: { xs: 0.75, sm: 0.25 } }}
              onChange={() => void run(() => setSubtaskDone(item.id, s.id, !s.done))}
              title={s.done ? 'Mark as pending' : 'Mark as done'} inputProps={{ 'aria-label': s.text }}
            />
            <Box sx={{ flex: 1, minWidth: 0, pt: { xs: 0.9, sm: 0.4 } }}>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere', textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'text.secondary' : 'text.primary' }}>
                {s.text}
                {s.done && s.doneByName && (
                  <Typography component="span" variant="caption" color="success.main" sx={{ ml: 0.75 }} title={s.doneByName}>
                    ✓ {whiteboardTag(s.doneByName)}{s.doneAt ? ` · ${formatNoteTime(s.doneAt)}` : ''}
                  </Typography>
                )}
              </Typography>
            </Box>
            {(isOwner || s.createdBy === me) && (
              <IconButton size="small" onClick={() => void run(() => deleteSubtask(item.id, s.id))} aria-label={`Delete subtask ${s.text}`} sx={{ p: { xs: 0.75, sm: 0.25 } }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Stack>
        ))}
        {addingSubtask && (
          <Box sx={{ mt: 0.5 }}>
            <TextField
              size="small" fullWidth autoFocus placeholder="Add a subtask…" value={subtaskDraft} sx={{ bgcolor: 'white' }}
              onChange={(e) => setSubtaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void postSubtask(); }
                if (e.key === 'Escape') { e.stopPropagation(); setAddingSubtask(false); setSubtaskDraft(''); }
              }}
              inputProps={{ 'aria-label': 'New subtask', maxLength: 200 }}
            />
            <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 0.5 }}>
              <Button size="small" color="inherit" onClick={() => { setAddingSubtask(false); setSubtaskDraft(''); }}>Done</Button>
              <Button size="small" variant="contained" disabled={!subtaskDraft.trim()} onClick={() => void postSubtask()}>Add</Button>
            </Stack>
          </Box>
        )}
      </Box>

      {/* ── Status notes ── */}
      <SectionHeader
        label={`STATUS NOTES${notes.length > 0 ? ` · ${notes.length}` : ''}`}
        actionLabel={postingNote ? undefined : 'Post update'} onAction={() => setPostingNote(true)}
      />
      {postingNote && (
        <Box sx={{ mt: 0.5 }}>
          <TextField
            size="small" fullWidth multiline minRows={2} autoFocus sx={{ bgcolor: 'white' }}
            placeholder="What’s the status? e.g. waiting on supplier quote…"
            value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeNoteForm(); } }}
            inputProps={{ 'aria-label': 'Status note', maxLength: 1000 }}
          />
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Progress</Typography>
              <Slider
                size="small" min={0} max={100} step={5} value={sliderValue} onChange={(_e, v) => setPct(v as number)}
                valueLabelDisplay="auto" aria-label="Progress"
              />
              <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{sliderValue}%</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ ml: 'auto', flexShrink: 0 }}>
              <Button size="small" color="inherit" onClick={closeNoteForm}>Cancel</Button>
              <Button size="small" variant="contained" disabled={!noteDraft.trim() || busy} onClick={() => void postNote()}>
                {busy ? 'Posting…' : 'Post note'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

      {notes.length === 0 ? (
        !postingNote && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>No notes yet — post an update so the team knows where this stands.</Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {notes.map((n) => (
            <Box key={n.id} data-testid={`wb-detail-note-${n.id}`} sx={{ borderLeft: '3px solid', borderColor: 'divider', pl: 1 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" sx={{ fontWeight: 600 }} title={n.byName}>{whiteboardTag(n.byName)}</Typography>
                <Typography variant="caption" color="text.disabled">{formatNoteTime(n.at)}</Typography>
                {n.progress !== undefined && (
                  <Chip size="small" label={`${n.progress}%`} color={n.progress >= 100 ? 'success' : 'primary'} variant="outlined" sx={{ height: 18, fontSize: 11 }} />
                )}
                {(isOwner || n.by === me) && (
                  <IconButton size="small" onClick={() => void run(() => deleteUpdate(item.id, n.id))} aria-label="Delete note" title="Delete note" sx={{ p: { xs: 1, sm: 0.25 }, m: { xs: -0.75, sm: 0 }, ml: 'auto' }}>
                    <DeleteOutlineIcon sx={{ fontSize: { xs: 20, sm: 15 } }} />
                  </IconButton>
                )}
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.text}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
