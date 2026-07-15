import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Chip, Stack,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';
import { filterItems } from './filterItems';
import { usePricelistStore } from '../../store/pricelistStore';
import type { PricelistItem } from '../../types/Pricelist';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (items: PricelistItem[]) => void;
}

export default function PricelistPickerDialog({ open, onClose, onAdd }: Props) {
  const items = usePricelistStore((s) => s.items);
  const loading = usePricelistStore((s) => s.loading);
  const filters = usePricelistStore((s) => s.filters);
  const fetchItems = usePricelistStore((s) => s.fetchItems);
  const fetchFilters = usePricelistStore((s) => s.fetchFilters);
  const resetFilters = usePricelistStore((s) => s.resetFilters);

  // Full items (not just ids) so the selection survives filter/search changes
  const [selected, setSelected] = useState<Map<string, PricelistItem>>(new Map());

  useEffect(() => {
    if (open) {
      resetFilters();
      fetchFilters();
      fetchItems();
      setSelected(new Map());
    }
  }, [open, fetchItems, fetchFilters, resetFilters]);

  const filtered = useMemo(() => filterItems(items, filters), [items, filters]);
  const hasActiveFilters = Boolean(filters.search || filters.suppliers.length || filters.categories.length ||
    filters.brands.length || filters.poles != null || filters.minPrice != null || filters.maxPrice != null);
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);

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

  const handleConfirm = () => {
    onAdd(Array.from(selected.values()));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '85vh' } }}>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <MenuBookIcon />
          <span>Browse Catalog</span>
          {selected.size > 0 && <Chip label={`${selected.size} selected`} color="primary" size="small" />}
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
        <PricelistFilters />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <PricelistTable
            items={filtered}
            loading={loading}
            selectable
            selectedIds={selectedIds}
            onToggleItem={toggleItem}
            onTogglePage={togglePage}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={resetFilters}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!selected.size} onClick={handleConfirm}>
          Add {selected.size > 0 ? `${selected.size} ` : ''}item{selected.size === 1 ? '' : 's'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
