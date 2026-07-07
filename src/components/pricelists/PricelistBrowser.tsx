import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert, Stack, Chip,
  Autocomplete, TextField, IconButton, Tooltip, Divider,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { nanoid } from 'nanoid';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';
import PricelistItemForm from './PricelistItemForm';
import PricelistHistoryDialog from './PricelistHistoryDialog';
import { filterItems } from './filterItems';
import { usePricelistStore } from '../../store/pricelistStore';
import { useQuotationStore } from '../../store/quotationStore';
import type { PricelistItem } from '../../types/Pricelist';
import type { ComponentLine } from '../../types/Quotation';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

const PHP = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Convert the selected pricelist items (with quantities) into ComponentLine objects */
function toComponentLines(picks: { item: PricelistItem; qty: number }[], existingComponents: ComponentLine[]): ComponentLine[] {
  let nextNum = 10;
  if (existingComponents.length) {
    const nums = existingComponents.map((c) => parseInt(c.code.replace(/^B-/, ''), 10)).filter((n) => !isNaN(n));
    if (nums.length) nextNum = Math.max(...nums) + 10;
  }
  return picks.map(({ item, qty }, idx) => ({
    id: nanoid(),
    code: `B-${String(nextNum + idx * 10).padStart(4, '0')}`,
    description: `${item.description} [${item.catalogNo}]`,
    brand: item.brand || '',
    partNo: item.catalogNo,
    qty,
    uom: item.uom || 'pc',
    unitCost: item.sellingPrice,
    forex: 1,
    contingencyPct: 0,
    contingencyPctOverridden: false,
    discountPct: 0,
  }));
}

export default function PricelistBrowser() {
  const navigate = useNavigate();
  const items = usePricelistStore((s) => s.items);
  const loading = usePricelistStore((s) => s.loading);
  const error = usePricelistStore((s) => s.error);
  const filters = usePricelistStore((s) => s.filters);
  const resetFilters = usePricelistStore((s) => s.resetFilters);
  const fetchItems = usePricelistStore((s) => s.fetchItems);
  const fetchFilters = usePricelistStore((s) => s.fetchFilters);
  const filterOptions = usePricelistStore((s) => s.filterOptions);
  const createItem = usePricelistStore((s) => s.createItem);
  const updateItem = usePricelistStore((s) => s.updateItem);
  const deleteItem = usePricelistStore((s) => s.deleteItem);

  const initQuotations = useQuotationStore((s) => s.init);
  const projects = useQuotationStore((s) => s.projects);
  const quotations = useQuotationStore((s) => s.quotations);
  const updateQuotation = useQuotationStore((s) => s.updateQuotation);

  // Selection lives here as full items (not just ids) so it survives filter/search changes
  const [selected, setSelected] = useState<Map<string, PricelistItem>>(new Map());
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PricelistItem | null>(null);
  const [historyItem, setHistoryItem] = useState<PricelistItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PricelistItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetQuotationId, setTargetQuotationId] = useState('');
  const [adding, setAdding] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error'; quotationId?: string }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchItems();
    fetchFilters();
    initQuotations();
  }, [fetchItems, fetchFilters, initQuotations]);

  const filtered = useMemo(() => filterItems(items, filters), [items, filters]);
  const hasActiveFilters = Boolean(filters.search || filters.suppliers.length || filters.categories.length ||
    filters.brands.length || filters.poles != null || filters.minPrice != null || filters.maxPrice != null);

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const selectedItems = useMemo(() => Array.from(selected.values()), [selected]);
  const projectQuotations = quotations.filter((q) => q.projectId === targetProjectId);
  const targetQuotation = quotations.find((q) => q.id === targetQuotationId);
  const existingPartNos = useMemo(
    () => new Set((targetQuotation?.components ?? []).map((c) => c.partNo).filter(Boolean)),
    [targetQuotation],
  );

  const toggleItem = useCallback((item: PricelistItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item);
      return next;
    });
  }, []);

  const togglePage = useCallback((pageItems: PricelistItem[], select: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      pageItems.forEach((item) => { if (select) next.set(item.id, item); else next.delete(item.id); });
      return next;
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setQtys((prev) => ({ ...prev, [id]: qty }));
  }, []);

  const clearSelection = useCallback(() => { setSelected(new Map()); setQtys({}); }, []);

  const handleAddToQuotation = useCallback(async () => {
    if (!targetQuotationId || !selectedItems.length) return;
    const quotation = quotations.find((q) => q.id === targetQuotationId);
    if (!quotation) return;

    const picks = selectedItems.map((item) => ({ item, qty: Math.max(1, qtys[item.id] ?? 1) }));
    const newLines = toComponentLines(picks, quotation.components);
    setAdding(true);
    try {
      await updateQuotation(targetQuotationId, {
        components: [...quotation.components, ...newLines],
      });
      setSnackbar({ open: true, message: `Added ${newLines.length} item(s) to quotation`, severity: 'success', quotationId: targetQuotationId });
      setDialogOpen(false);
      clearSelection();
      setTargetProjectId('');
      setTargetQuotationId('');
    } catch {
      setSnackbar({ open: true, message: 'Failed to add items to quotation', severity: 'error' });
    } finally {
      setAdding(false);
    }
  }, [targetQuotationId, selectedItems, qtys, quotations, updateQuotation, clearSelection]);

  const handleSaveForm = useCallback(async (payload: Record<string, unknown>) => {
    if (editingItem) await updateItem(editingItem.id, payload);
    else await createItem(payload);
    setSnackbar({ open: true, message: editingItem ? 'Item updated' : 'Item added', severity: 'success' });
  }, [editingItem, updateItem, createItem]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteItem(deleteTarget.id);
      setSelected((prev) => {
        if (!prev.has(deleteTarget.id)) return prev;
        const next = new Map(prev); next.delete(deleteTarget.id); return next;
      });
      setSnackbar({ open: true, message: 'Item deleted', severity: 'success' });
      setDeleteTarget(null);
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete item', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleteItem]);

  const selectedProject = projects.find((p) => p.id === targetProjectId) ?? null;
  const selectionTotal = selectedItems.reduce((sum, item) => sum + item.sellingPrice * Math.max(1, qtys[item.id] ?? 1), 0);

  return (
    // AppLayout only sets minHeight, so bind to the viewport (80px header + page padding) for internal scrolling
    <Box sx={{ height: { xs: 'calc(100vh - 96px)', md: 'calc(100vh - 112px)' }, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ p: 2, pb: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Pricelists</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Supplier catalog — search, filter and select items to add to a quotation &middot;{' '}
            {hasActiveFilters ? `${filtered.length} of ${items.length}` : items.length} item{items.length === 1 ? '' : 's'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => { setEditingItem(null); setFormOpen(true); }}
          sx={{ flexShrink: 0, backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
        >
          Add item
        </Button>
      </Box>

      <Box sx={{ px: 2, pb: 2, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <PricelistFilters />
        {error && !items.length ? (
          <Alert
            severity="error"
            action={<Button color="inherit" size="small" onClick={fetchItems}>Retry</Button>}
          >
            Could not load the pricelist catalog. {error}
          </Alert>
        ) : (
          <Paper sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <PricelistTable
              items={filtered}
              loading={loading}
              selectable
              selectedIds={selectedIds}
              onToggleItem={toggleItem}
              onTogglePage={togglePage}
              manageable
              onEdit={(item) => { setEditingItem(item); setFormOpen(true); }}
              onDelete={(item) => setDeleteTarget(item)}
              onHistory={(item) => setHistoryItem(item)}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={resetFilters}
            />
          </Paper>
        )}
      </Box>

      {/* Floating selection bar — overlays the content so the table doesn't reflow when it appears */}
      {selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, borderRadius: 99, py: 1, px: 2,
            display: 'flex', alignItems: 'center', gap: 1.5, whiteSpace: 'nowrap',
          }}
        >
          <Chip label={`${selected.size} item${selected.size > 1 ? 's' : ''} selected`} color="primary" />
          <Button size="small" onClick={clearSelection}>Clear</Button>
          <Button
            variant="contained"
            startIcon={<AddShoppingCartIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ borderRadius: 99, backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add to Quotation
          </Button>
        </Paper>
      )}

      {/* Target quotation picker + selection review dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add {selected.size} item{selected.size === 1 ? '' : 's'} to quotation</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={projects}
            value={selectedProject}
            onChange={(_, p) => { setTargetProjectId(p?.id ?? ''); setTargetQuotationId(''); }}
            getOptionLabel={(p) => `${p.code} — ${p.name}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Project" size="small" />}
            sx={{ mt: 1, mb: 2 }}
          />
          <FormControl fullWidth size="small" disabled={!targetProjectId}>
            <InputLabel>Quotation</InputLabel>
            <Select value={targetQuotationId} onChange={(e) => setTargetQuotationId(e.target.value)} label="Quotation">
              {projectQuotations.map((q) => (
                <MenuItem key={q.id} value={q.id}>{q.kind} Rev {q.revision || '1'}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {targetProjectId && !projectQuotations.length && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              This project has no quotations yet — create one from the project page first.
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />
          <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
            {selectedItems.map((item) => {
              const dup = existingPartNos.has(item.catalogNo);
              return (
                <Stack key={item.id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap title={item.description}>{item.description}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {item.catalogNo} · {PHP(item.sellingPrice)}{item.uom ? ` / ${item.uom}` : ''}
                      {dup && <Chip label="already in quotation" size="small" color="warning" sx={{ ml: 1, height: 18 }} />}
                    </Typography>
                  </Box>
                  <TextField
                    label="Qty"
                    type="number"
                    size="small"
                    sx={{ width: 80, flexShrink: 0 }}
                    value={qtys[item.id] ?? 1}
                    onChange={(e) => setQty(item.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
                    slotProps={{ htmlInput: { min: 1 } }}
                  />
                  <Tooltip title="Remove from selection">
                    <IconButton size="small" onClick={() => toggleItem(item)}><CloseIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Stack>
              );
            })}
          </Box>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" align="right" sx={{ fontWeight: 600 }}>
            Total: {PHP(selectionTotal)}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!targetQuotationId || !selectedItems.length || adding}
            onClick={handleAddToQuotation}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {adding ? 'Adding…' : 'Add items'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete item?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            "{deleteTarget?.description}" will be removed from the catalog. This does not affect quotations it was already added to.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <PricelistItemForm
        open={formOpen}
        item={editingItem}
        categoryOptions={filterOptions.categories}
        brandOptions={filterOptions.brands}
        supplierOptions={filterOptions.suppliers}
        onClose={() => setFormOpen(false)}
        onSave={handleSaveForm}
      />

      <PricelistHistoryDialog item={historyItem} onClose={() => setHistoryItem(null)} />

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          action={snackbar.quotationId ? (
            <Button color="inherit" size="small" onClick={() => navigate(`/sales/calcsheet/quotations/${snackbar.quotationId}`)}>
              Open quotation
            </Button>
          ) : undefined}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
