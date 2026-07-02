import { useState, useEffect } from 'react';
import {
  Box, TextField, InputAdornment, FormControl, InputLabel, Select, MenuItem,
  Chip, Stack, Button, OutlinedInput, SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { usePricelistStore } from '../../store/pricelistStore';

export default function PricelistFilters() {
  const filters = usePricelistStore((s) => s.filters);
  const filterOptions = usePricelistStore((s) => s.filterOptions);
  const setFilters = usePricelistStore((s) => s.setFilters);
  const resetFilters = usePricelistStore((s) => s.resetFilters);
  const fetchItems = usePricelistStore((s) => s.fetchItems);

  // Debounced search
  const [searchLocal, setSearchLocal] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchLocal !== filters.search) {
        setFilters({ search: searchLocal });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchLocal, filters.search, setFilters]);

  // Re-fetch when filters change (except search, which debounces above)
  useEffect(() => {
    fetchItems();
  }, [filters, fetchItems]);

  const handleCategoryChange = (e: SelectChangeEvent<string[]>) => {
    const val = e.target.value;
    setFilters({ categories: typeof val === 'string' ? val.split(',') : val });
  };

  const handlePolesChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setFilters({ poles: val ? Number(val) : null });
  };

  const hasFilters = filters.search || filters.categories.length || filters.poles != null ||
    filters.minPrice != null || filters.maxPrice != null;

  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search by catalog no., description, ABB ref, SEP equivalent..."
        value={searchLocal}
        onChange={(e) => setSearchLocal(e.target.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: searchLocal ? (
              <InputAdornment position="end">
                <ClearIcon fontSize="small" sx={{ cursor: 'pointer' }} onClick={() => { setSearchLocal(''); setFilters({ search: '' }); }} />
              </InputAdornment>
            ) : null,
          },
        }}
        sx={{ mb: 1.5 }}
      />
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Category</InputLabel>
          <Select
            multiple
            value={filters.categories}
            onChange={handleCategoryChange}
            input={<OutlinedInput label="Category" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((v) => <Chip key={v} label={v} size="small" />)}
              </Box>
            )}
          >
            {filterOptions.categories.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Poles</InputLabel>
          <Select value={filters.poles != null ? String(filters.poles) : ''} onChange={handlePolesChange} label="Poles">
            <MenuItem value="">All</MenuItem>
            {filterOptions.poles.map((p) => (
              <MenuItem key={p} value={String(p)}>{p}P</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Min Price"
          type="number"
          sx={{ width: 120 }}
          value={filters.minPrice ?? ''}
          onChange={(e) => setFilters({ minPrice: e.target.value ? Number(e.target.value) : null })}
        />
        <TextField
          size="small"
          label="Max Price"
          type="number"
          sx={{ width: 120 }}
          value={filters.maxPrice ?? ''}
          onChange={(e) => setFilters({ maxPrice: e.target.value ? Number(e.target.value) : null })}
        />

        {hasFilters && (
          <Button size="small" onClick={() => { resetFilters(); setSearchLocal(''); }}>
            Clear all
          </Button>
        )}
      </Stack>
    </Box>
  );
}
