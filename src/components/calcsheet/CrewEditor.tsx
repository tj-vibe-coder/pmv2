import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { CREW_ROLES, crewTotal, type CrewMember } from '../../types/ScheduleTask';
import { blurNumberInputOnWheel } from '../../utils/calcsheet/numberInput';

// Crew composition for a task: role × headcount rows. The task's manpower is
// the total. `commit` fires on blur / Enter / add / remove (one undoable edit
// from the inspector); the dialog can just track every change.

interface Props {
  crew: CrewMember[];
  onCommit: (crew: CrewMember[]) => void;
  /** Roles already used in this project, offered first. */
  knownRoles?: string[];
  disabled?: boolean;
}

export default function CrewEditor({ crew, onCommit, knownRoles = [], disabled }: Props) {
  const [rows, setRows] = useState<{ role: string; qty: string }[]>(() => crew.map((c) => ({ role: c.role, qty: String(c.qty) })));
  const key = JSON.stringify(crew);
  useEffect(() => { setRows(crew.map((c) => ({ role: c.role, qty: String(c.qty) }))); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const clean = (list: { role: string; qty: string }[]): CrewMember[] => list
    .map((r) => ({ role: r.role.trim(), qty: Math.max(0, Math.round((Number(r.qty) || 0) * 10) / 10) }))
    .filter((r) => r.role && r.qty > 0);
  const commit = (list = rows) => {
    const next = clean(list);
    if (JSON.stringify(next) !== JSON.stringify(crew)) onCommit(next);
  };
  const options = Array.from(new Set([...knownRoles, ...CREW_ROLES]));
  const total = crewTotal(clean(rows));

  return (
    <Box>
      {rows.map((r, i) => (
        <Stack key={i} direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
          <Autocomplete
            freeSolo size="small" options={options} value={r.role} disabled={disabled} sx={{ flex: 1 }}
            onInputChange={(_, v) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, role: v } : x)))}
            onChange={(_, v) => { const next = rows.map((x, j) => (j === i ? { ...x, role: String(v ?? '') } : x)); setRows(next); commit(next); }}
            onBlur={() => commit()}
            renderInput={(params) => <TextField {...params} placeholder="Role" />}
          />
          <TextField
            size="small" type="number" value={r.qty} disabled={disabled} inputProps={{ min: 0, step: 1 }} sx={{ width: 72 }}
            onWheel={blurNumberInputOnWheel}
            onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
            onBlur={() => commit()}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); }}
          />
          <IconButton size="small" disabled={disabled} onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next); commit(next); }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Button size="small" startIcon={<AddIcon />} disabled={disabled} onClick={() => setRows((prev) => [...prev, { role: '', qty: '1' }])}>
          Add role
        </Button>
        {rows.length > 0 && <Typography variant="caption" color="text.secondary">Total: <b>{total}</b> / day</Typography>}
      </Stack>
    </Box>
  );
}
