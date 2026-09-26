import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  Box, Button, Chip, Divider, IconButton, LinearProgress, MenuItem, Slider, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { SCHEDULE_TASK_CATEGORIES, type ScheduleTask } from '../../types/ScheduleTask';
import { formatLink, linksOf } from '../../utils/calcsheet/scheduleLinks';
import { finishVariance, varianceLabel } from '../../utils/calcsheet/scheduleBaseline';
import { mspDate } from '../../utils/calcsheet/scheduleTimescale';
import { workingDaysBetween } from '../../utils/calcsheet/scheduleDates';
import { blurNumberInputOnWheel } from '../../utils/calcsheet/numberInput';

// Task inspector: the right-hand side panel for the selected task, so the
// Gantt stays clean and common edits don't need the full dialog. Each field
// commits on Enter / blur as one undoable change.

export type InspectorPatch = Partial<Pick<ScheduleTask,
  'name' | 'category' | 'notes' | 'manpower' | 'weight' | 'progressPct' | 'mode' | 'startDate' | 'endDate' | 'durationDays'>>;

interface Props {
  /** The stored task (for a phase: its rolled-up version). */
  task: ScheduleTask;
  isSummary: boolean;
  tasks: ScheduleTask[];
  idNumbers: Map<string, number>;
  workingDays: boolean;
  baseline?: ScheduleTask | null;
  float?: number | null;
  onChange: (patch: InspectorPatch, label: string) => void;
  onEditLink: (predId: string, succId: string, e: ReactMouseEvent) => void;
  onRemoveLink: (predId: string, succId: string) => void;
  onGoto: (id: string) => void;
  onOpenDialog: () => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ px: 2, py: 1.25 }}>
      <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 1, lineHeight: 2 }}>{title}</Typography>
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  );
}

const small = { size: 'small' as const, fullWidth: true };

export default function ScheduleTaskInspector({
  task, isSummary, tasks, idNumbers, workingDays, baseline, float, onChange, onEditLink, onRemoveLink, onGoto, onOpenDialog, onClose,
}: Props) {
  const dur = task.isMilestone ? 0 : (task.durationDays ?? workingDaysBetween(task.startDate, task.endDate, workingDays));
  const [name, setName] = useState(task.name);
  const [notes, setNotes] = useState(task.notes || '');
  const [durText, setDurText] = useState(String(dur));
  const [mp, setMp] = useState(String(task.manpower ?? 0));
  const [wt, setWt] = useState(String(task.weight ?? 0));
  const [pct, setPct] = useState(task.progressPct || 0);
  // Re-sync drafts when another task is selected or the task changes elsewhere.
  useEffect(() => {
    setName(task.name);
    setNotes(task.notes || '');
    setDurText(String(dur));
    setMp(String(task.manpower ?? 0));
    setWt(String(task.weight ?? 0));
    setPct(task.progressPct || 0);
  }, [task.id, task.name, task.notes, dur, task.manpower, task.weight, task.progressPct]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = `"${task.name}"`;
  const enter = (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); };
  const commitNumber = (raw: string, current: number, key: 'manpower' | 'weight', what: string) => {
    const v = Math.max(0, Math.round((Number(raw) || 0) * 10) / 10);
    if (v !== current) onChange({ [key]: v }, `${what} of ${label} → ${v}`);
  };

  const num = idNumbers.get(task.id);
  const preds = linksOf(task);
  const succs = tasks.filter((t) => (t.predecessors || []).includes(task.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const variance = baseline ? finishVariance(task.endDate, baseline.endDate, workingDays) : null;
  const auto = (task.mode ?? 'auto') === 'auto';
  const drivenByLinks = auto && preds.length > 0;

  return (
    <Box sx={{ width: 340, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1.25, pb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">Task {num ?? ''}</Typography>
        <Chip size="small" variant="outlined" label={isSummary ? 'Phase' : task.isMilestone ? 'Milestone' : 'Task'} sx={{ height: 20 }} />
        {float === 0 && !isSummary && <Chip size="small" color="error" variant="outlined" label="Critical" sx={{ height: 20 }} />}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="All fields (Task Information)"><IconButton size="small" onClick={onOpenDialog}><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Close (I)"><IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          {...small} variant="standard" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enter}
          onBlur={() => { const v = name.trim(); if (v && v !== task.name) onChange({ name: v }, `Rename ${label}`); else setName(task.name); }}
          InputProps={{ sx: { fontSize: 18, fontWeight: 600 } }}
        />
      </Box>
      <Divider />

      <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <Section title="Schedule">
          {!isSummary && (
            <ToggleButtonGroup
              size="small" exclusive fullWidth value={task.mode ?? 'auto'}
              onChange={(_, v: 'auto' | 'manual' | null) => v && v !== (task.mode ?? 'auto') && onChange({ mode: v }, `${v === 'manual' ? 'Manually schedule' : 'Auto schedule'} ${label}`)}
              sx={{ '& .MuiToggleButton-root': { py: 0.25, textTransform: 'none' } }}
            >
              <ToggleButton value="auto">Auto scheduled</ToggleButton>
              <ToggleButton value="manual">Manual</ToggleButton>
            </ToggleButtonGroup>
          )}
          {isSummary ? (
            <Typography variant="body2">
              {mspDate(task.startDate)} – {mspDate(task.endDate)} · {workingDaysBetween(task.startDate, task.endDate, workingDays)} days
              <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>Rolled up from its tasks</Typography>
            </Typography>
          ) : (
            <>
              <Stack direction="row" spacing={1}>
                <TextField
                  {...small} type="date" label="Start" InputLabelProps={{ shrink: true }} value={task.startDate}
                  disabled={drivenByLinks}
                  onChange={(e) => e.target.value && onChange({ startDate: e.target.value }, `Reschedule ${label}`)}
                  helperText={drivenByLinks ? 'Set by its links' : ' '}
                />
                {!task.isMilestone && (
                  <TextField
                    {...small} type="date" label="Finish" InputLabelProps={{ shrink: true }} value={task.endDate}
                    onChange={(e) => e.target.value && e.target.value >= task.startDate && onChange({ endDate: e.target.value }, `Change finish of ${label}`)}
                    helperText=" "
                  />
                )}
              </Stack>
              {!task.isMilestone && (
                <TextField
                  {...small} type="number" label="Duration (days)" value={durText} inputProps={{ step: 0.5, min: 0.5 }}
                  onWheel={blurNumberInputOnWheel} onChange={(e) => setDurText(e.target.value)} onKeyDown={enter}
                  onBlur={() => {
                    const v = Math.max(0.5, Math.round((Number(durText) || 0) * 2) / 2);
                    if (v !== dur) onChange({ durationDays: v }, `Duration of ${label} → ${v} days`); else setDurText(String(dur));
                  }}
                />
              )}
            </>
          )}
          {baseline && (
            <Typography variant="body2" color="text.secondary">
              Baseline {mspDate(baseline.startDate)} – {mspDate(baseline.endDate)}
              {variance !== null && (
                <Box component="span" sx={{ ml: 1, fontWeight: 600, color: variance > 0 ? 'error.main' : variance < 0 ? 'success.main' : 'text.primary' }}>
                  {varianceLabel(variance)}
                </Box>
              )}
            </Typography>
          )}
          {float != null && !isSummary && (
            <Typography variant="body2" color="text.secondary">
              Total float: <b>{float} day{float === 1 ? '' : 's'}</b>{float === 0 ? ' — on the critical path' : ''}
            </Typography>
          )}
        </Section>
        <Divider />

        <Section title="Progress">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: 5 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, width: 42, textAlign: 'right' }}>{Math.round(pct)}%</Typography>
          </Stack>
          {!isSummary && (
            <Stack direction="row" spacing={0.5}>
              <Slider
                size="small" value={pct} step={5} min={0} max={100} sx={{ flex: 1, mx: 1 }}
                onChange={(_, v) => setPct(v as number)}
                onChangeCommitted={(_, v) => { if (v !== task.progressPct) onChange({ progressPct: v as number }, `Progress of ${label} → ${v}%`); }}
              />
            </Stack>
          )}
          {!isSummary && (
            <Stack direction="row" spacing={0.5}>
              {[0, 25, 50, 75, 100].map((v) => (
                <Button key={v} size="small" variant={Math.round(pct) === v ? 'contained' : 'outlined'} sx={{ minWidth: 0, flex: 1, py: 0 }}
                  onClick={() => { setPct(v); if (v !== task.progressPct) onChange({ progressPct: v }, `Progress of ${label} → ${v}%`); }}>
                  {v}%
                </Button>
              ))}
            </Stack>
          )}
        </Section>
        <Divider />

        <Section title="Dependencies">
          <Box>
            <Typography variant="caption" color="text.secondary">Predecessors</Typography>
            {preds.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            {preds.map((l) => (
              <Stack key={l.id} direction="row" alignItems="center" spacing={0.5}>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => onGoto(l.id)}>
                  <b>{formatLink(idNumbers.get(l.id) ?? '?', l)}</b> {byId.get(l.id)?.name}
                </Typography>
                <Tooltip title="Link type / lag"><IconButton size="small" onClick={(e) => onEditLink(l.id, task.id, e)}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                <Tooltip title="Remove link"><IconButton size="small" onClick={() => onRemoveLink(l.id, task.id)}><LinkOffIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              </Stack>
            ))}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Successors</Typography>
            {succs.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            {succs.map((s) => {
              const l = linksOf(s).find((x) => x.id === task.id);
              return (
                <Typography key={s.id} variant="body2" sx={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => onGoto(s.id)}>
                  <b>{idNumbers.get(s.id)}</b>{l && (l.type !== 'FS' || l.lag) ? ` (${formatLink('', l)})` : ''} {s.name}
                </Typography>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary">Tip: drag from the dot at a bar's end onto another bar to link them.</Typography>
        </Section>
        <Divider />

        {!isSummary && (
          <>
            <Section title="Resources">
              <Stack direction="row" spacing={1}>
                <TextField
                  {...small} type="number" label="Manpower" value={mp} inputProps={{ min: 0, step: 1 }} disabled={task.isMilestone}
                  onWheel={blurNumberInputOnWheel} onChange={(e) => setMp(e.target.value)} onKeyDown={enter}
                  onBlur={() => commitNumber(mp, task.manpower ?? 0, 'manpower', 'Manpower')}
                  helperText="Headcount / day"
                />
                <TextField
                  {...small} type="number" label="Weight" value={wt} inputProps={{ min: 0, step: 1 }}
                  onWheel={blurNumberInputOnWheel} onChange={(e) => setWt(e.target.value)} onKeyDown={enter}
                  onBlur={() => commitNumber(wt, task.weight ?? 0, 'weight', 'Weight')}
                  helperText="Progress weight"
                />
              </Stack>
              <TextField
                {...small} select label="Category" value={task.category || 'Other'}
                onChange={(e) => e.target.value !== (task.category || 'Other') && onChange({ category: e.target.value }, `Category of ${label}`)}
              >
                {SCHEDULE_TASK_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Section>
            <Divider />
          </>
        )}

        <Section title="Notes">
          <TextField
            {...small} multiline minRows={3} placeholder="Add notes…" value={notes} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (task.notes || '')) onChange({ notes }, `Notes of ${label}`); }}
          />
        </Section>
      </Box>
    </Box>
  );
}
