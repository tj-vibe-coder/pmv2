import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert, Stack, Chip,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { nanoid } from 'nanoid';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';
import { usePricelistStore } from '../../store/pricelistStore';
import { useQuotationStore } from '../../store/quotationStore';
import type { PricelistItem } from '../../types/Pricelist';
import type { ComponentLine } from '../../types/Quotation';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

/** Convert a set of selected pricelist items into ComponentLine objects */
function toComponentLines(items: PricelistItem[], existingComponents: ComponentLine[]): ComponentLine[] {
  let nextNum = 10;
  if (existingComponents.length) {
    const nums = existingComponents.map((c) => parseInt(c.code.replace(/^B-/, ''), 10)).filter((n) => !isNaN(n));
    if (nums.length) nextNum = Math.max(...nums) + 10;
  }
  return items.map((item, idx) => ({
    id: nanoid(),
    code: `B-${String(nextNum + idx * 10).padStart(4, '0')}`,
    description: `${item.description} [${item.catalogNo}]`,
    brand: 'ABB',
    partNo: item.catalogNo,
    qty: 1,
    uom: 'pc',
    unitCost: item.sellingPrice,
    forex: 1,
    contingencyPct: 0,
    contingencyPctOverridden: false,
    discountPct: 0,
  }));
}

export default function PricelistBrowser() {
  const items = usePricelistStore((s) => s.items);
  const loading = usePricelistStore((s) => s.loading);
  const fetchFilters = usePricelistStore((s) => s.fetchFilters);

  const projects = useQuotationStore((s) => s.projects);
  const quotations = useQuotationStore((s) => s.quotations);
  const updateQuotation = useQuotationStore((s) => s.updateQuotation);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetQuotationId, setTargetQuotationId] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  const selectedItems = items.filter((i) => selected.has(i.id));
  const projectQuotations = quotations.filter((q) => q.projectId === targetProjectId);

  const handleAddToQuotation = useCallback(async () => {
    if (!targetQuotationId) return;
    const quotation = quotations.find((q) => q.id === targetQuotationId);
    if (!quotation) return;

    const newLines = toComponentLines(selectedItems, quotation.components);
    try {
      await updateQuotation(targetQuotationId, {
        components: [...quotation.components, ...newLines],
      });
      setSnackbar({ open: true, message: `Added ${newLines.length} item(s) to quotation`, severity: 'success' });
      setDialogOpen(false);
      setSelected(new Set());
      setTargetProjectId('');
      setTargetQuotationId('');
    } catch {
      setSnackbar({ open: true, message: 'Failed to add items to quotation', severity: 'error' });
    }
  }, [targetQuotationId, selectedItems, quotations, updateQuotation]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 2, pb: 0 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Pricelists</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          HVC DCPI — ABB Products (March 2026) &middot; {items.length} items
        </Typography>
      </Box>

      <Box sx={{ px: 2, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <PricelistFilters />
        <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <PricelistTable
            items={items}
            loading={loading}
            selectable
            selected={selected}
            onSelectionChange={setSelected}
          />
        </Paper>
      </Box>

      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            p: 1.5, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '1px solid #e0e0e0',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={`${selected.size} item${selected.size > 1 ? 's' : ''} selected`} color="primary" />
            <Button size="small" onClick={() => setSelected(new Set())}>Clear</Button>
          </Stack>
          <Button
            variant="contained"
            startIcon={<AddShoppingCartIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add to Quotation
          </Button>
        </Paper>
      )}

      {/* Target quotation picker dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add {selected.size} item(s) to quotation</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 2 }}>
            <InputLabel>Project</InputLabel>
            <Select
              value={targetProjectId}
              onChange={(e) => { setTargetProjectId(e.target.value); setTargetQuotationId(''); }}
              label="Project"
            >
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" disabled={!targetProjectId}>
            <InputLabel>Quotation</InputLabel>
            <Select value={targetQuotationId} onChange={(e) => setTargetQuotationId(e.target.value)} label="Quotation">
              {projectQuotations.map((q) => (
                <MenuItem key={q.id} value={q.id}>{q.kind} Rev {q.revision || '1'}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!targetQuotationId} onClick={handleAddToQuotation}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add items
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
