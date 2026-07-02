import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Chip, Stack,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';
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
  const fetchItems = usePricelistStore((s) => s.fetchItems);
  const fetchFilters = usePricelistStore((s) => s.fetchFilters);
  const resetFilters = usePricelistStore((s) => s.resetFilters);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      resetFilters();
      fetchFilters();
      fetchItems();
      setSelected(new Set());
    }
  }, [open, fetchItems, fetchFilters, resetFilters]);

  const handleConfirm = () => {
    const picked = items.filter((i) => selected.has(i.id));
    onAdd(picked);
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
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <PricelistTable
            items={items}
            loading={loading}
            selectable
            selected={selected}
            onSelectionChange={setSelected}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={selected.size === 0} onClick={handleConfirm}>
          Add {selected.size || ''} item{selected.size !== 1 ? 's' : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
