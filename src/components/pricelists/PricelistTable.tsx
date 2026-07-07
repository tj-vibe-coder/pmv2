import { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, Chip, TablePagination, Skeleton, Typography, Box, TableSortLabel, IconButton, Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import type { PricelistItem } from '../../types/Pricelist';
import { fmtDate, fmtDateTime } from './pricelistDate';

const PHP = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  items: PricelistItem[];
  loading: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  manageable?: boolean;
  onEdit?: (item: PricelistItem) => void;
  onDelete?: (item: PricelistItem) => void;
  onHistory?: (item: PricelistItem) => void;
}

type SortKey = 'catalogNo' | 'description' | 'category' | 'brand' | 'poles' | 'ampRating' | 'sellingPrice';
type SortDir = 'asc' | 'desc';

export default function PricelistTable({ items, loading, selectable = false, selected, onSelectionChange, manageable = false, onEdit, onDelete, onHistory }: Props) {
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
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('brand', 'Brand')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('poles', 'Poles')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('ampRating', 'Amps')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">UOM</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">{sortLabel('sellingPrice', 'Price')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>SEP Equiv.</TableCell>
              {manageable && <TableCell sx={{ fontWeight: 600 }}>Last Updated</TableCell>}
              {manageable && <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>}
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
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.brand || '—'}</TableCell>
                <TableCell align="center">{item.poles ? `${item.poles}P` : '—'}</TableCell>
                <TableCell align="center">{item.ampRating ?? '—'}</TableCell>
                <TableCell align="center">{item.uom || '—'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{PHP(item.sellingPrice)}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{item.sepEquivalent ?? '—'}</TableCell>
                {manageable && (
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.85rem' }}>
                    <Tooltip title={item.updatedBy ? `${item.updatedBy} · ${fmtDateTime(item.updatedAt)}` : fmtDateTime(item.updatedAt)}>
                      <span>{fmtDate(item.updatedAt)}{item.updatedBy ? ` · ${item.updatedBy}` : ''}</span>
                    </Tooltip>
                  </TableCell>
                )}
                {manageable && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" title="History" onClick={() => onHistory?.(item)}><HistoryIcon fontSize="small" /></IconButton>
                    <IconButton size="small" title="Edit" onClick={() => onEdit?.(item)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" title="Delete" onClick={() => onDelete?.(item)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                )}
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
