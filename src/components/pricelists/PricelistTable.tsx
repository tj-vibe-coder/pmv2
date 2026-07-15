import { useState, useMemo, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button,
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
  /** ids of the currently selected items (selection itself lives in the parent and may span filters) */
  selectedIds?: Set<string>;
  /** toggle a single item in/out of the selection */
  onToggleItem?: (item: PricelistItem) => void;
  /** select (true) or deselect (false) all items on the current page — additive, never wipes off-page selections */
  onTogglePage?: (pageItems: PricelistItem[], select: boolean) => void;
  manageable?: boolean;
  onEdit?: (item: PricelistItem) => void;
  onDelete?: (item: PricelistItem) => void;
  onHistory?: (item: PricelistItem) => void;
  /** true when the parent has active filters — changes the empty-state message */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

type SortKey = 'catalogNo' | 'description' | 'category' | 'brand' | 'supplier' | 'poles' | 'ampRating' | 'sellingPrice';
type SortDir = 'asc' | 'desc';

export default function PricelistTable({
  items, loading, selectable = false, selectedIds, onToggleItem, onTogglePage,
  manageable = false, onEdit, onDelete, onHistory, hasActiveFilters = false, onClearFilters,
}: Props) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>('catalogNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Clamp the page when the result set shrinks (e.g. a filter change) so the table never shows an empty slice
  const maxPage = Math.max(0, Math.ceil(items.length / rowsPerPage) - 1);
  useEffect(() => {
    if (page > maxPage) setPage(0);
  }, [page, maxPage]);

  // Hide breaker-specific columns when nothing in the current result set uses them (e.g. materials/cables)
  // Blank counts as its own group so a mix of named-supplier and compiled (supplier-less) items still shows the column
  const showSupplier = useMemo(() => new Set(items.map((i) => i.supplier || '')).size > 1, [items]);
  const showPoles = useMemo(() => items.some((i) => i.poles != null), [items]);
  const showAmps = useMemo(() => items.some((i) => i.ampRating != null), [items]);
  const showSep = useMemo(() => items.some((i) => i.sepEquivalent), [items]);

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
  const pageSelectedCount = selectedIds ? paged.filter((i) => selectedIds.has(i.id)).length : 0;
  const allPageSelected = paged.length > 0 && pageSelectedCount === paged.length;

  const handleSort = (key: SortKey) => {
    setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
    setPage(0);
  };

  if (loading && !items.length) {
    return (
      <Box sx={{ p: 1 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (!items.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          {hasActiveFilters ? 'No items match your search or filters' : 'The catalog is empty'}
        </Typography>
        {hasActiveFilters && onClearFilters && (
          <Button size="small" onClick={onClearFilters}>Clear filters</Button>
        )}
      </Box>
    );
  }

  const sortLabel = (key: SortKey, label: string) => (
    <TableSortLabel active={sortKey === key} direction={sortKey === key ? sortDir : 'asc'} onClick={() => handleSort(key)}>
      {label}
    </TableSortLabel>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox">
                  <Tooltip title={allPageSelected ? 'Deselect this page' : 'Select this page'}>
                    <Checkbox
                      indeterminate={pageSelectedCount > 0 && !allPageSelected}
                      checked={allPageSelected}
                      onChange={() => onTogglePage?.(paged, !allPageSelected)}
                      size="small"
                    />
                  </Tooltip>
                </TableCell>
              )}
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('catalogNo', 'Catalog No.')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('description', 'Description')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('category', 'Category')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('brand', 'Brand')}</TableCell>
              {showSupplier && <TableCell sx={{ fontWeight: 600 }}>{sortLabel('supplier', 'Supplier')}</TableCell>}
              {showPoles && <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('poles', 'Poles')}</TableCell>}
              {showAmps && <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('ampRating', 'Amps')}</TableCell>}
              <TableCell sx={{ fontWeight: 600 }} align="center">UOM</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">{sortLabel('sellingPrice', 'Price')}</TableCell>
              {showSep && <TableCell sx={{ fontWeight: 600 }}>SEP Equiv.</TableCell>}
              {manageable && <TableCell sx={{ fontWeight: 600 }}>Last Updated</TableCell>}
              {manageable && <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((item) => (
              <TableRow key={item.id} hover selected={selectedIds?.has(item.id)}>
                {selectable && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds?.has(item.id) ?? false}
                      onChange={() => onToggleItem?.(item)}
                      size="small"
                    />
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{item.catalogNo}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell><Chip label={item.category} size="small" variant="outlined" /></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.brand || '—'}</TableCell>
                {showSupplier && (
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={[item.pricelistName, item.pricelistDate].filter(Boolean).join(' · ')}>
                      <span>{item.supplier || '—'}</span>
                    </Tooltip>
                  </TableCell>
                )}
                {showPoles && <TableCell align="center">{item.poles ? `${item.poles}P` : '—'}</TableCell>}
                {showAmps && <TableCell align="center">{item.ampRating ?? '—'}</TableCell>}
                <TableCell align="center">{item.uom || '—'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{PHP(item.sellingPrice)}</TableCell>
                {showSep && <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{item.sepEquivalent ?? '—'}</TableCell>}
                {manageable && (
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.85rem' }}>
                    <Tooltip title={item.updatedBy ? `${item.updatedBy} · ${fmtDateTime(item.updatedAt)}` : fmtDateTime(item.updatedAt)}>
                      <span>{fmtDate(item.updatedAt)}{item.updatedBy ? ` · ${item.updatedBy}` : ''}</span>
                    </Tooltip>
                  </TableCell>
                )}
                {manageable && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="History"><IconButton size="small" onClick={() => onHistory?.(item)}><HistoryIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => onEdit?.(item)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => onDelete?.(item)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
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
        page={Math.min(page, maxPage)}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider' }}
      />
    </Box>
  );
}
