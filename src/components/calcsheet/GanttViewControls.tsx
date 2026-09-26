import { useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton,
  ListItemText, Menu, MenuItem, Popover, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import ViewQuiltOutlinedIcon from '@mui/icons-material/ViewQuiltOutlined';
import {
  DISPLAY_OPTIONS, GANTT_COLUMNS, columnDef,
  type GanttColumn, type GanttColumnKey, type GanttDisplay, type GanttView,
} from '../../utils/calcsheet/ganttViews';

// View picker + Columns + Display controls for the Gantt (workspace
// customization). The page owns the state; this only edits it.

interface Props {
  views: GanttView[];
  viewId: string | null;
  modified: boolean;
  onApply: (v: GanttView) => void;
  onSaveAs: (name: string) => void;
  onDelete: (id: string) => void;
  columns: GanttColumn[];
  onColumnsChange: (cols: GanttColumn[]) => void;
  display: GanttDisplay;
  onDisplayChange: (key: keyof GanttDisplay, value: boolean) => void;
  hasBaseline: boolean;
}

const btn = { size: 'small' as const, variant: 'outlined' as const, sx: { textTransform: 'none', py: 0.25 } };

export default function GanttViewControls({
  views, viewId, modified, onApply, onSaveAs, onDelete, columns, onColumnsChange, display, onDisplayChange, hasBaseline,
}: Props) {
  const [viewMenu, setViewMenu] = useState<HTMLElement | null>(null);
  const [colAnchor, setColAnchor] = useState<HTMLElement | null>(null);
  const [dispAnchor, setDispAnchor] = useState<HTMLElement | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [dragKey, setDragKey] = useState<GanttColumnKey | null>(null);

  const current = views.find((v) => v.id === viewId);
  const shown = new Set(columns.map((c) => c.key));
  // Column list: shown columns in order, then the hidden ones.
  const ordered: GanttColumnKey[] = [...columns.map((c) => c.key), ...GANTT_COLUMNS.map((c) => c.key).filter((k) => !shown.has(k))];

  const toggleColumn = (key: GanttColumnKey, on: boolean) => {
    if (key === 'name') return;
    if (on) {
      // Re-insert at its place in the list above.
      const pos = ordered.indexOf(key);
      const before = ordered.slice(0, pos).filter((k) => shown.has(k));
      const at = before.length ? columns.findIndex((c) => c.key === before[before.length - 1]) + 1 : 0;
      onColumnsChange([...columns.slice(0, at), { key, w: columnDef(key).w }, ...columns.slice(at)]);
    } else {
      onColumnsChange(columns.filter((c) => c.key !== key));
    }
  };
  const dropOn = (e: ReactDragEvent, target: GanttColumnKey) => {
    e.preventDefault();
    if (!dragKey || dragKey === target || !shown.has(dragKey) || !shown.has(target)) return;
    const moving = columns.find((c) => c.key === dragKey) as GanttColumn;
    const rest = columns.filter((c) => c.key !== dragKey);
    const at = rest.findIndex((c) => c.key === target);
    const fromIdx = columns.findIndex((c) => c.key === dragKey);
    const toIdx = columns.findIndex((c) => c.key === target);
    const pos = fromIdx < toIdx ? at + 1 : at;
    onColumnsChange([...rest.slice(0, pos), moving, ...rest.slice(pos)]);
  };

  const builtIns = views.filter((v) => v.builtIn);
  const custom = views.filter((v) => !v.builtIn);

  return (
    <>
      <Button {...btn} startIcon={<ViewQuiltOutlinedIcon />} endIcon={<ArrowDropDownIcon />} onClick={(e) => setViewMenu(e.currentTarget)}>
        View: {current ? current.name : 'Custom'}{modified && current ? ' *' : ''}
      </Button>
      <Button {...btn} startIcon={<TableChartOutlinedIcon />} onClick={(e) => setColAnchor(e.currentTarget)}>Columns</Button>
      <Button {...btn} startIcon={<TuneIcon />} onClick={(e) => setDispAnchor(e.currentTarget)}>Display</Button>

      <Menu open={!!viewMenu} anchorEl={viewMenu} onClose={() => setViewMenu(null)} slotProps={{ list: { dense: true } }}>
        {builtIns.map((v) => (
          <MenuItem key={v.id} onClick={() => { onApply(v); setViewMenu(null); }} sx={{ minWidth: 300 }}>
            <Box sx={{ width: 24 }}>{v.id === viewId && <CheckIcon fontSize="small" />}</Box>
            <ListItemText primary={v.name} secondary={v.description} />
          </MenuItem>
        ))}
        {custom.length > 0 && <Divider />}
        {custom.map((v) => (
          <MenuItem key={v.id} onClick={() => { onApply(v); setViewMenu(null); }}>
            <Box sx={{ width: 24 }}>{v.id === viewId && <CheckIcon fontSize="small" />}</Box>
            <ListItemText primary={v.name} secondary="My view" />
            <Tooltip title="Delete this view">
              <IconButton size="small" edge="end" onClick={(e) => { e.stopPropagation(); onDelete(v.id); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Tooltip>
          </MenuItem>
        ))}
        <Divider />
        {current && modified && (
          <MenuItem onClick={() => { onApply(current); setViewMenu(null); }}>
            <Box sx={{ width: 24 }} /><ListItemText primary={`Reset “${current.name}”`} secondary="Undo layout changes since choosing this view" />
          </MenuItem>
        )}
        <MenuItem onClick={() => { setSaveName(current && !current.builtIn ? current.name : ''); setSaveOpen(true); setViewMenu(null); }}>
          <Box sx={{ width: 24 }} /><ListItemText primary="Save current layout as a view…" secondary="Columns, display, filters and zoom" />
        </MenuItem>
      </Menu>

      <Popover open={!!colAnchor} anchorEl={colAnchor} onClose={() => setColAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, width: 260 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Columns</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Tick to show · drag ⋮⋮ to reorder. You can also drag headers in the table, and their right edge to resize.
          </Typography>
          {ordered.map((key) => {
            const def = columnDef(key);
            const on = shown.has(key);
            return (
              <Stack
                key={key} direction="row" alignItems="center"
                draggable={on}
                onDragStart={(e) => { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); }}
                onDragOver={(e) => { if (dragKey && on) e.preventDefault(); }}
                onDrop={(e) => dropOn(e, key)}
                onDragEnd={() => setDragKey(null)}
                sx={{ opacity: dragKey === key ? 0.5 : 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <DragIndicatorIcon sx={{ fontSize: 16, color: on ? 'text.secondary' : 'transparent', cursor: on ? 'grab' : 'default' }} />
                <FormControlLabel
                  sx={{ flex: 1, my: -0.5, mr: 0 }}
                  control={<Checkbox size="small" checked={on} disabled={key === 'name'} onChange={(e) => toggleColumn(key, e.target.checked)} />}
                  label={(
                    <Tooltip title={def.hint || ''} placement="right">
                      <Typography variant="body2">{def.label}</Typography>
                    </Tooltip>
                  )}
                />
              </Stack>
            );
          })}
          <Button size="small" sx={{ mt: 1 }} onClick={() => onColumnsChange(columns.map((c) => ({ ...c, w: columnDef(c.key).w })))}>Reset widths</Button>
        </Box>
      </Popover>

      <Popover open={!!dispAnchor} anchorEl={dispAnchor} onClose={() => setDispAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, width: 230 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Show on the chart</Typography>
          {DISPLAY_OPTIONS.map((o) => {
            const disabled = o.key === 'baseline' && !hasBaseline;
            return (
              <FormControlLabel
                key={o.key} sx={{ display: 'flex', my: -0.5 }} disabled={disabled}
                control={<Checkbox size="small" checked={display[o.key] && !disabled} onChange={(e) => onDisplayChange(o.key, e.target.checked)} />}
                label={<Typography variant="body2">{o.label}{disabled ? ' (none set)' : ''}</Typography>}
              />
            );
          })}
        </Box>
      </Popover>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save view</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Saves the current columns, display options, filters and zoom. Views are kept in this browser and work on every project.
          </Typography>
          <TextField
            autoFocus fullWidth size="small" label="View name" value={saveName} onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && saveName.trim()) { onSaveAs(saveName.trim()); setSaveOpen(false); } }}
            helperText={custom.some((v) => v.name.toLowerCase() === saveName.trim().toLowerCase()) ? 'Replaces your view with this name' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!saveName.trim()} onClick={() => { onSaveAs(saveName.trim()); setSaveOpen(false); }}>Save view</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
