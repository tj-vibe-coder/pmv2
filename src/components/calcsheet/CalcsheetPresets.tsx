import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { useQuotationStore } from '../../store/quotationStore';
import type { LaborRolePreset } from '../../types/Quotation';
import { PHP } from '../../utils/calcsheet/calc';
import { parseLenientFloat } from '../../utils/calcsheet/numberInput';
import { MATERIAL_SLOTS } from '../../utils/calcsheet/installationMaterials';

const empty: Omit<LaborRolePreset, 'id'> = {
  role: '', group: 'engineering', dailyRate: 0, allowance: 0,
};

export default function Presets() {
  const presets = useQuotationStore((s) => s.laborPresets);
  const addPreset = useQuotationStore((s) => s.addPreset);
  const updatePreset = useQuotationStore((s) => s.updatePreset);
  const deletePreset = useQuotationStore((s) => s.deletePreset);
  const resetPresets = useQuotationStore((s) => s.resetPresets);
  const settings = useQuotationStore((s) => s.settings);
  const updateSettings = useQuotationStore((s) => s.updateSettings);
  const installMaterialPrices = useQuotationStore((s) => s.installMaterialPrices);
  const updateInstallMaterialPrice = useQuotationStore((s) => s.updateInstallMaterialPrice);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LaborRolePreset | null>(null);
  const [form, setForm] = useState(empty);
  const [confirmReset, setConfirmReset] = useState(false);

  // Quotation defaults local edit state
  const [titleDraft, setTitleDraft] = useState<{ IOCT: string; ACTI: string }>({
    IOCT: settings.defaultJobTitles?.IOCT ?? '',
    ACTI: settings.defaultJobTitles?.ACTI ?? '',
  });
  const [titleSaving, setTitleSaving] = useState(false);
  const titlesDirty =
    titleDraft.IOCT !== (settings.defaultJobTitles?.IOCT ?? '') ||
    titleDraft.ACTI !== (settings.defaultJobTitles?.ACTI ?? '');

  const saveDefaultTitles = async () => {
    setTitleSaving(true);
    try {
      await updateSettings({ defaultJobTitles: { IOCT: titleDraft.IOCT || undefined, ACTI: titleDraft.ACTI || undefined } });
    } finally {
      setTitleSaving(false);
    }
  };

  // Installation Work material pricing — local edit state, same pattern as
  // the Quotation Defaults titles above: one dirty flag per row, batch-saved.
  const [materialDraft, setMaterialDraft] = useState<Record<string, { brand: string; unitCost: number }>>(() => {
    const d: Record<string, { brand: string; unitCost: number }> = {};
    MATERIAL_SLOTS.forEach((s) => {
      const existing = installMaterialPrices[s.key];
      d[s.key] = { brand: existing?.brand ?? '', unitCost: existing?.unitCost ?? 0 };
    });
    return d;
  });
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const setMaterialField = (key: string, field: 'brand' | 'unitCost', value: string | number) =>
    setMaterialDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));
  const materialRowDirty = (key: string) => {
    const draft = materialDraft[key];
    const saved = installMaterialPrices[key];
    return draft.brand !== (saved?.brand ?? '') || draft.unitCost !== (saved?.unitCost ?? 0);
  };
  const materialsDirty = MATERIAL_SLOTS.some((s) => materialRowDirty(s.key));
  const saveMaterialPrices = async () => {
    setMaterialsSaving(true);
    try {
      const changed = MATERIAL_SLOTS.filter((s) => materialRowDirty(s.key));
      await Promise.all(changed.map((s) =>
        updateInstallMaterialPrice(s.key, { brand: materialDraft[s.key].brand || undefined, unitCost: materialDraft[s.key].unitCost }),
      ));
    } finally {
      setMaterialsSaving(false);
    }
  };

  const startNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (p: LaborRolePreset) => { setEditing(p); setForm(p); setOpen(true); };
  const save = () => {
    if (!form.role) return;
    if (editing) updatePreset(editing.id, form);
    else addPreset(form);
    setOpen(false);
  };

  const engineering = presets.filter((p) => p.group === 'engineering');
  const labor = presets.filter((p) => p.group === 'labor');

  const Section = ({ title, rows, color }: { title: string; rows: LaborRolePreset[]; color: 'primary' | 'secondary' }) => (
    <Paper>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip size="small" label={title} color={color} />
          <Typography variant="caption" color="text.secondary">{rows.length} role{rows.length !== 1 ? 's' : ''}</Typography>
        </Stack>
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Role</TableCell>
            <TableCell align="right">Daily Rate</TableCell>
            <TableCell align="right">Allowance</TableCell>
            <TableCell align="right">Daily Cost (rate + allowance)</TableCell>
            <TableCell align="right" sx={{ width: 100 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} hover>
              <TableCell>{p.role}</TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{PHP(p.dailyRate)}</TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{PHP(p.allowance)}</TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(p.dailyRate + p.allowance)}</TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => startEdit(p)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => deletePreset(p.id)}><DeleteIcon fontSize="small" /></IconButton>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>No presets in this group</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </Box>
    </Paper>
  );

  return (
    <Stack spacing={3}>
      {/* ── Quotation Defaults ── */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Quotation Defaults</Typography>
            <Typography variant="body2" color="text.secondary">
              Default job title pre-filled in the PDF signature block for each quotation type.
              Can still be overridden per-quotation in the editor.
            </Typography>
          </Stack>
          <Divider />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="IOCT — default job title"
              size="small"
              fullWidth
              value={titleDraft.IOCT}
              onChange={(e) => setTitleDraft((d) => ({ ...d, IOCT: e.target.value }))}
              placeholder="e.g. Solutions Engineer"
              helperText="Appears as job title under the preparer's name on IOCT quotation PDFs"
            />
            <TextField
              label="ACTI — default job title"
              size="small"
              fullWidth
              value={titleDraft.ACTI}
              onChange={(e) => setTitleDraft((d) => ({ ...d, ACTI: e.target.value }))}
              placeholder="e.g. Sales Engineer"
              helperText="Appears as job title under the preparer's name on ACTI quotation PDFs"
            />
          </Stack>
          <Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              disabled={!titlesDirty || titleSaving}
              onClick={saveDefaultTitles}
            >
              {titleSaving ? 'Saving…' : 'Save defaults'}
            </Button>
          </Box>
        </Stack>
      </Paper>

      {/* ── Labor Rate Presets ── */}
      <Stack direction="row" flexWrap="wrap" useFlexGap rowGap={1} columnGap={2} alignItems="center" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Labor Rate Presets</Typography>
          <Typography variant="body2" color="text.secondary">
            Default daily rates and allowances per role. New manpower entries auto-fill from these.
            Edit when rates change so future quotations stay current.
          </Typography>
        </Stack>
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
          <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={() => setConfirmReset(true)} size="small">
            Reset to defaults
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={startNew}>
            Add role
          </Button>
        </Stack>
      </Stack>

      <Section title="Engineering / Automation" rows={engineering} color="primary" />
      <Section title="Laborers" rows={labor} color="secondary" />

      {/* ── Installation Work material pricing ── */}
      <Stack spacing={0.5}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Installation Materials — Unit Pricing</Typography>
        <Typography variant="body2" color="text.secondary">
          Brand and unit cost for each conduit material the Installation Work calculator (Section B, "Installation Work")
          can insert. A material left at ₱0 still inserts into the BOM — just needs pricing filled in here first.
        </Typography>
      </Stack>
      <Paper>
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Material</TableCell>
              <TableCell sx={{ width: 90 }}>UOM</TableCell>
              <TableCell sx={{ width: 200 }}>Brand</TableCell>
              <TableCell align="right" sx={{ width: 160 }}>Unit Cost (PHP)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {MATERIAL_SLOTS.map((s) => (
              <TableRow key={s.key} hover>
                <TableCell>{s.label}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{s.uom}</TableCell>
                <TableCell>
                  <TextField
                    variant="standard" size="small" fullWidth
                    value={materialDraft[s.key]?.brand ?? ''}
                    onChange={(e) => setMaterialField(s.key, 'brand', e.target.value)}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    variant="standard" size="small" type="text" inputMode="decimal"
                    value={materialDraft[s.key]?.unitCost ?? 0}
                    onChange={(e) => setMaterialField(s.key, 'unitCost', parseLenientFloat(e.target.value))}
                    inputProps={{ style: { textAlign: 'right' } }}
                    fullWidth
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </Box>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            disabled={!materialsDirty || materialsSaving}
            onClick={saveMaterialPrices}
          >
            {materialsSaving ? 'Saving…' : 'Save pricing'}
          </Button>
        </Box>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit role preset' : 'New role preset'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Role name" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} fullWidth autoFocus />
            <TextField select label="Group" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as 'engineering' | 'labor' })} fullWidth>
              <MenuItem value="engineering">Engineering / Automation</MenuItem>
              <MenuItem value="labor">Laborers</MenuItem>
            </TextField>
            <TextField label="Daily Rate (PHP)" type="text" inputMode="decimal" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: parseLenientFloat(e.target.value) })} fullWidth />
            <TextField label="Allowance (PHP)" type="text" inputMode="decimal" value={form.allowance} onChange={(e) => setForm({ ...form, allowance: parseLenientFloat(e.target.value) })} fullWidth />
            <Typography variant="caption" color="text.secondary">
              Daily cost = {PHP(form.dailyRate + form.allowance)}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} maxWidth="xs">
        <DialogTitle>Reset presets?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This replaces all current presets with the current 15 defaults. Existing manpower entries on quotations are not affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => { resetPresets(); setConfirmReset(false); }}>
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
