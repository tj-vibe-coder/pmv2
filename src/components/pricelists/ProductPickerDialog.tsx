import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ProductHistoryTab from '../calcsheet/ProductHistoryTab';
import type { ProductHistoryAddSelection } from '../../types/ProductHistory';
import type { PricelistItem } from '../../types/Pricelist';
import { usePricelistStore } from '../../store/pricelistStore';
import { filterItems } from './filterItems';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddPricelist: (items: PricelistItem[]) => void;
  onAddHistory: (selection: ProductHistoryAddSelection) => void;
  analysisDate: string;
  expectedPurchaseDate: string;
  defaultContingencyPct: number;
}

export default function ProductPickerDialog({
  open,
  onClose,
  onAddPricelist,
  onAddHistory,
  analysisDate,
  expectedPurchaseDate,
  defaultContingencyPct,
}: Props) {
  const items = usePricelistStore((state) => state.items);
  const loading = usePricelistStore((state) => state.loading);
  const filters = usePricelistStore((state) => state.filters);
  const fetchItems = usePricelistStore((state) => state.fetchItems);
  const fetchFilters = usePricelistStore((state) => state.fetchFilters);
  const resetFilters = usePricelistStore((state) => state.resetFilters);
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<Map<string, PricelistItem>>(new Map());

  useEffect(() => {
    if (!open) return;
    setTab(0);
    resetFilters();
    fetchFilters();
    fetchItems();
    setSelected(new Map());
  }, [fetchFilters, fetchItems, open, resetFilters]);

  const filtered = useMemo(() => filterItems(items, filters), [filters, items]);
  const hasActiveFilters = Boolean(
    filters.search
    || filters.suppliers.length
    || filters.categories.length
    || filters.brands.length
    || filters.poles != null
    || filters.minPrice != null
    || filters.maxPrice != null
  );
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);

  const toggleItem = useCallback((item: PricelistItem) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }, []);

  const togglePage = useCallback((pageItems: PricelistItem[], select: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      pageItems.forEach((item) => {
        if (select) next.set(item.id, item);
        else next.delete(item.id);
      });
      return next;
    });
  }, []);

  const handlePricelistConfirm = () => {
    onAddPricelist(Array.from(selected.values()));
    onClose();
  };

  const handleHistoryAdd = (selection: ProductHistoryAddSelection) => {
    onAddHistory(selection);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '85vh' } }}
    >
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <MenuBookIcon />
          <span>Add Product</span>
          {tab === 0 && selected.size > 0 && (
            <Chip label={`${selected.size} selected`} color="primary" size="small" />
          )}
        </Stack>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value)}
        aria-label="Product source"
        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Pricelists" />
        <Tab label="Quotation History" />
      </Tabs>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
        {tab === 0 ? (
          <>
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
          </>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <ProductHistoryTab
              active
              analysisDate={analysisDate}
              expectedPurchaseDate={expectedPurchaseDate}
              defaultContingencyPct={defaultContingencyPct}
              onAdd={handleHistoryAdd}
            />
          </Box>
        )}
      </DialogContent>
      {tab === 0 && (
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selected.size}
            onClick={handlePricelistConfirm}
          >
            Add {selected.size > 0 ? `${selected.size} ` : ''}item{selected.size === 1 ? '' : 's'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
