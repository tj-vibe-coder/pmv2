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

  const handleMultiChange = (key: 'suppliers' | 'categories' | 'brands') => (e: SelectChangeEvent<string[]>) => {
    const val = e.target.value;
    setFilters({ [key]: typeof val === 'string' ? val.split(',') : val });
  };

  const handlePolesChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setFilters({ poles: val ? Number(val) : null });
  };

  const hasFilters = filters.search || filters.suppliers.length || filters.categories.length ||
    filters.brands.length || filters.poles != null || filters.minPrice != null || filters.maxPrice != null;

  const multiSelect = (key: 'suppliers' | 'categories' | 'brands', label: string, options: string[], minWidth: number) => (
    <FormControl size="small" sx={{ minWidth }}>
      <InputLabel>{label}</InputLabel>
      <Select
        multiple
        value={filters[key]}
        onChange={handleMultiChange(key)}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {selected.map((v) => <Chip key={v} label={v} size="small" />)}
          </Box>
        )}
      >
        {options.map((o) => (
          <MenuItem key={o} value={o}>{o}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search catalog no., description, brand, supplier…"
        value={filters.search}
        onChange={(e) => setFilters({ search: e.target.value })}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: filters.search ? (
              <InputAdornment position="end">
                <ClearIcon fontSize="small" sx={{ cursor: 'pointer' }} onClick={() => setFilters({ search: '' })} />
              </InputAdornment>
            ) : null,
          },
        }}
        sx={{ mb: 1.5 }}
      />
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        {filterOptions.suppliers.length > 1 && multiSelect('suppliers', 'Supplier', filterOptions.suppliers, 160)}
        {multiSelect('categories', 'Category', filterOptions.categories, 200)}
        {multiSelect('brands', 'Brand', filterOptions.brands, 180)}

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
          sx={{ width: 130 }}
          value={filters.minPrice ?? ''}
          onChange={(e) => setFilters({ minPrice: e.target.value ? Number(e.target.value) : null })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
        />
        <TextField
          size="small"
          label="Max Price"
          type="number"
          sx={{ width: 130 }}
          value={filters.maxPrice ?? ''}
          onChange={(e) => setFilters({ maxPrice: e.target.value ? Number(e.target.value) : null })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
        />

        {hasFilters && (
          <Button size="small" onClick={resetFilters}>
            Clear all
          </Button>
        )}
      </Stack>
    </Box>
  );
}
