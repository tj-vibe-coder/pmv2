import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, IconButton, LinearProgress, Slider, Stack, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteboardStore } from '../store/whiteboardStore';
import type { WhiteboardItem } from '../types/Whiteboard';

// "Oct 22, 3:10 PM" — with the year only when it isn't this year.
export const formatNoteTime = (iso: string): string => {
  const d = new Date(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'MMM d, h:mm a' : 'MMM d yyyy, h:mm a');
};

// "Renzel Punongbayan" → "Renzel": full names wrap onto a second line in a narrow list.
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

// Thin progress bar with its percentage — shown on the row so everyone sees how far a task is without opening it.
export function ProgressBar({ value }: { value: number }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }} data-testid="wb-progress">
      <LinearProgress
        variant="determinate" value={value} color={value >= 100 ? 'success' : 'primary'}
        aria-label={`Progress ${value}%`} sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{value}%</Typography>
    </Stack>
  );
}

// The expandable part of a task: its subtasks, and the dated status notes with the poster's progress bar.
// Anyone can tick subtasks and add notes; only the poster adds/removes subtasks and moves progress.
export default function WhiteboardItemDetail({ item, isOwner }: { item: WhiteboardItem; isOwner: boolean }) {
  const { user } = useAuth();
  const addSubtask = useWhiteboardStore((s) => s.addSubtask);
  const setSubtaskDone = useWhiteboardStore((s) => s.setSubtaskDone);
  const deleteSubtask = useWhiteboardStore((s) => s.deleteSubtask);
  const addUpdate = useWhiteboardStore((s) => s.addUpdate);
  const deleteUpdate = useWhiteboardStore((s) => s.deleteUpdate);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  // null until the poster moves the slider — a note then carries the new progress; otherwise it leaves it alone.
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtasks = item.subtasks ?? [];
  const notes = [...(item.updates ?? [])].reverse(); // newest first
  const sliderValue = pct ?? item.progress ?? 0;

  // Run a store action, surfacing the server's message (e.g. "Only the poster can…") instead of failing silently.
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setError(null);
    try { await action(); return true; } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
      return false;
    }
  };

  const postSubtask = async () => {
    const text = subtaskDraft.trim();
    if (!text) return;
    if (await run(() => addSubtask(item.id, text))) setSubtaskDraft('');
  };

  const postNote = async () => {
    const text = noteDraft.trim();
    if (!text) return;
    setBusy(true);
    const ok = await run(() => addUpdate(item.id, { text, ...(pct !== null ? { progress: pct } : {}) }));
    setBusy(false);
    if (ok) { setNoteDraft(''); setPct(null); }
  };

  return (
    <Box data-testid={`wb-detail-${item.id}`} sx={{ pb: 1, pt: 0.5, pl: { xs: 0.5, sm: 3.5 }, pr: 0.5 }}>
      {error && <Alert severity="warning" sx={{ mb: 1, py: 0 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Subtasks ── */}
      {(subtasks.length > 0 || isOwner) && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.3 }}>
            SUBTASKS{subtasks.length > 0 ? ` · ${subtasks.filter((s) => s.done).length}/${subtasks.length}` : ''}
          </Typography>
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
                      ✓ {firstName(s.doneByName)}{s.doneAt ? ` · ${formatNoteTime(s.doneAt)}` : ''}
                    </Typography>
                  )}
                </Typography>
              </Box>
              {isOwner && (
                <IconButton size="small" onClick={() => void run(() => deleteSubtask(item.id, s.id))} aria-label={`Delete subtask ${s.text}`} sx={{ p: { xs: 0.75, sm: 0.25 } }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Stack>
          ))}
          {isOwner && (
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <TextField
                size="small" fullWidth placeholder="Add a subtask…" value={subtaskDraft} sx={{ bgcolor: 'white' }}
                onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void postSubtask(); } }}
                inputProps={{ 'aria-label': 'New subtask', maxLength: 200 }}
              />
              <Button size="small" variant="outlined" disabled={!subtaskDraft.trim()} onClick={() => void postSubtask()} sx={{ flexShrink: 0 }}>Add</Button>
            </Stack>
          )}
        </Box>
      )}

      {/* ── Status notes + progress ── */}
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.3 }}>
        STATUS NOTES{notes.length > 0 ? ` · ${notes.length}` : ''}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        <TextField
          size="small" fullWidth multiline minRows={2} sx={{ bgcolor: 'white' }}
          placeholder={isOwner ? 'What’s the status? e.g. waiting on supplier quote…' : 'Add a note…'}
          value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
          inputProps={{ 'aria-label': 'Status note', maxLength: 1000 }}
        />
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {isOwner && (
            <Box sx={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Progress</Typography>
              <Slider
                size="small" min={0} max={100} step={5} value={sliderValue} onChange={(_e, v) => setPct(v as number)}
                valueLabelDisplay="auto" aria-label="Progress"
              />
              <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{sliderValue}%</Typography>
            </Box>
          )}
          <Button size="small" variant="contained" disabled={!noteDraft.trim() || busy} onClick={() => void postNote()} sx={{ ml: 'auto', flexShrink: 0 }}>
            {busy ? 'Posting…' : 'Post note'}
          </Button>
        </Stack>
      </Box>

      {notes.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>No notes yet — post one so the team knows where this stands.</Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {notes.map((n) => (
            <Box key={n.id} data-testid={`wb-detail-note-${n.id}`} sx={{ borderLeft: '3px solid', borderColor: 'divider', pl: 1 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{n.byName}</Typography>
                <Typography variant="caption" color="text.disabled">{formatNoteTime(n.at)}</Typography>
                {n.progress !== undefined && (
                  <Chip size="small" label={`${n.progress}%`} color={n.progress >= 100 ? 'success' : 'primary'} variant="outlined" sx={{ height: 18, fontSize: 11 }} />
                )}
                {(isOwner || n.by === String(user?.id)) && (
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
