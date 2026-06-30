import { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, Chip, TablePagination, Skeleton, Typography, Box, TableSortLabel,
} from '@mui/material';
import type { PricelistItem } from '../../types/Pricelist';

const PHP = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  items: PricelistItem[];
  loading: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
}

type SortKey = 'catalogNo' | 'description' | 'category' | 'poles' | 'ampRating' | 'sellingPrice';
type SortDir = 'asc' | 'desc';

export default function PricelistTable({ items, loading, selectable = false, selected, onSelectionChange }: Props) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>('catalogNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const paged = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSort = (key: SortKey) => {
    setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selected) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange || !selected) return;
    if (selected.size === items.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map((i) => i.id)));
    }
  };

  if (loading) {
    return (
      <Box>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (!items.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No items match your search</Typography>
      </Box>
    );
  }

  const sortLabel = (key: SortKey, label: string) => (
    <TableSortLabel active={sortKey === key} direction={sortKey === key ? sortDir : 'asc'} onClick={() => handleSort(key)}>
      {label}
    </TableSortLabel>
  );

  return (
    <>
      <TableContainer sx={{ maxHeight: 'calc(100vh - 340px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={!!selected && selected.size > 0 && selected.size < items.length}
                    checked={!!selected && selected.size === items.length}
                    onChange={toggleAll}
                    size="small"
                  />
                </TableCell>
              )}
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('catalogNo', 'Catalog No.')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('description', 'Description')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('category', 'Category')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('poles', 'Poles')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('ampRating', 'Amps')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">{sortLabel('sellingPrice', 'Price')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>SEP Equiv.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((item) => (
              <TableRow
                key={item.id}
                hover
                selected={selected?.has(item.id)}
                onClick={selectable ? () => toggleOne(item.id) : undefined}
                sx={selectable ? { cursor: 'pointer' } : undefined}
              >
                {selectable && (
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected?.has(item.id) ?? false} size="small" />
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{item.catalogNo}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell><Chip label={item.category} size="small" variant="outlined" /></TableCell>
                <TableCell align="center">{item.poles ? `${item.poles}P` : '—'}</TableCell>
                <TableCell align="center">{item.ampRating ?? '—'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{PHP(item.sellingPrice)}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{item.sepEquivalent ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={items.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </>
  );
}
