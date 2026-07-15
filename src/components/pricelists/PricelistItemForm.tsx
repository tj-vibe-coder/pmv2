import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Box, Autocomplete,
} from '@mui/material';
import type { PricelistItem } from '../../types/Pricelist';

type Draft = {
  description: string; sellingPrice: string; uom: string; category: string;
  brand: string; supplier: string; catalogNo: string; sepEquivalent: string;
  poles: string; ampRating: string;
};

const EMPTY: Draft = {
  description: '', sellingPrice: '', uom: 'pc', category: '', brand: '',
  supplier: '', catalogNo: '', sepEquivalent: '', poles: '', ampRating: '',
};

interface Props {
  open: boolean;
  /** null = add mode, otherwise edit that item */
  item: PricelistItem | null;
  /** existing values to power the free-solo suggestions */
  categoryOptions: string[];
  brandOptions: string[];
  supplierOptions?: string[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}

export default function PricelistItemForm({ open, item, categoryOptions, brandOptions, supplierOptions = [], onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(item ? {
      description: item.description || '',
      sellingPrice: String(item.sellingPrice ?? ''),
      uom: item.uom || 'pc',
      category: item.category || '',
      brand: item.brand || '',
      supplier: item.supplier || '',
      catalogNo: item.catalogNo || '',
      sepEquivalent: item.sepEquivalent || '',
      poles: item.poles != null ? String(item.poles) : '',
      ampRating: item.ampRating != null ? String(item.ampRating) : '',
    } : { ...EMPTY });
  }, [open, item]);

  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.description.trim()) { setError('Description is required.'); return; }
    if (!(Number(draft.sellingPrice) >= 0) || draft.sellingPrice === '') { setError('A valid selling price is required.'); return; }
    setSaving(true); setError(null);
    try {
      await onSave({
        ...draft,
        sellingPrice: Number(draft.sellingPrice),
        poles: draft.poles === '' ? null : Number(draft.poles),
        ampRating: draft.ampRating === '' ? null : Number(draft.ampRating),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{item ? 'Edit item' : 'Add pricelist item'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Description" required value={draft.description} onChange={(e) => set('description')(e.target.value)} fullWidth multiline maxRows={3} autoFocus />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="Selling Price (₱)" required type="number" value={draft.sellingPrice} onChange={(e) => set('sellingPrice')(e.target.value)} />
            <TextField label="UOM" value={draft.uom} onChange={(e) => set('uom')(e.target.value)} placeholder="pc, m, length, box…" />
            <Autocomplete freeSolo options={categoryOptions} value={draft.category} onInputChange={(_, v) => set('category')(v)}
              renderInput={(p) => <TextField {...p} label="Category" />} />
            <Autocomplete freeSolo options={brandOptions} value={draft.brand} onInputChange={(_, v) => set('brand')(v)}
              renderInput={(p) => <TextField {...p} label="Brand" />} />
            <Autocomplete freeSolo options={supplierOptions} value={draft.supplier} onInputChange={(_, v) => set('supplier')(v)}
              renderInput={(p) => <TextField {...p} label="Supplier" />} />
            <TextField label="Catalog No. (optional)" value={draft.catalogNo} onChange={(e) => set('catalogNo')(e.target.value)} />
            <TextField label="Poles (optional)" type="number" value={draft.poles} onChange={(e) => set('poles')(e.target.value)} />
            <TextField label="Amps (optional)" type="number" value={draft.ampRating} onChange={(e) => set('ampRating')(e.target.value)} />
            <TextField label="SEP Equivalent (optional)" value={draft.sepEquivalent} onChange={(e) => set('sepEquivalent')(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          </Box>
          {error && <Box sx={{ color: 'error.main', fontSize: '0.85rem' }}>{error}</Box>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving} sx={{ backgroundColor: '#2c5aa0' }}>
          {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
