import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Autocomplete,
  Alert,
  Divider,
  MenuItem,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Search as SearchIcon } from '@mui/icons-material';
import type { Supplier, SupplierProduct } from './SuppliersPage';

const ESTIMATES_STORAGE_KEY = 'estimatesList';
const SUPPLIERS_STORAGE_KEY = 'suppliersList';

export interface BOMLine {
  id: string;
  description: string;
  partNo: string;
  brand: string;
  quantity: number;
  unit: string;
  /** From supplier DB or manual; null = leave blank for manual input */
  unitPrice: number | null;
  supplierName: string;
}

export interface Estimate {
  id: string;
  title: string;
  projectRef: string;
  date: string;
  items: BOMLine[];
  createdAt: string;
}

const defaultLine = (): BOMLine => ({
  id: `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  description: '',
  partNo: '',
  brand: '',
  quantity: 1,
  unit: 'pcs',
  unitPrice: null,
  supplierName: '',
});

const units = ['pcs', 'pc', 'unit', 'units', 'length', 'lengths', 'mtrs', 'meters', 'box', 'boxes', 'pack', 'packs', 'set', 'sets', 'lot', 'lots', 'assy', 'roll'];

type ProductOption = SupplierProduct & { supplierName: string };

const loadSuppliersFromStorage = (): Supplier[] => {
  try {
    const raw = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const loadEstimates = (): Estimate[] => {
  try {
    const raw = localStorage.getItem(ESTIMATES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const saveEstimates = (list: Estimate[]) => {
  try {
    localStorage.setItem(ESTIMATES_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
};

const EstimatesPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [current, setCurrent] = useState<Estimate | null>(null);
  const [title, setTitle] = useState('');
  const [projectRef, setProjectRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<BOMLine[]>(() => [defaultLine()]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/suppliers');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setSuppliers(data);
            return;
          }
        }
      } catch (_) {}
      setSuppliers(loadSuppliersFromStorage());
    };
    load();
  }, []);

  useEffect(() => {
    setEstimates(loadEstimates());
  }, []);

  const productOptions: ProductOption[] = React.useMemo(() => {
    const list: ProductOption[] = [];
    suppliers.forEach((s) => {
      (s.products || []).forEach((p) => {
        list.push({ ...p, supplierName: s.name });
      });
    });
    return list;
  }, [suppliers]);

  const addLine = () => {
    setItems((prev) => [...prev, defaultLine()]);
  };

  const removeLine = (id: string) => {
    setItems((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<BOMLine>) => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const onSelectProduct = (lineId: string, option: ProductOption | null) => {
    if (!option) return;
    updateLine(lineId, {
      description: option.name || option.description || '',
      partNo: option.partNo || '',
      brand: option.brand || '',
      unit: option.unit || 'pcs',
      unitPrice: option.unitPrice != null ? option.unitPrice : null,
      supplierName: option.supplierName || '',
    });
  };

  const saveAsNew = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setMessage({ type: 'error', text: 'Enter an estimate title.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    const estimate: Estimate = {
      id: `est-${Date.now()}`,
      title: trimmedTitle,
      projectRef: projectRef.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      items: items.map((l) => ({ ...l })),
      createdAt: new Date().toISOString(),
    };
    const next = [estimate, ...loadEstimates()];
    saveEstimates(next);
    setEstimates(next);
    setMessage({ type: 'success', text: 'Estimate saved.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadEstimate = (est: Estimate) => {
    setCurrent(est);
    setTitle(est.title);
    setProjectRef(est.projectRef || '');
    setDate(est.date || '');
    setItems(est.items.length ? est.items.map((l) => ({ ...l, id: `line-${Date.now()}-${Math.random().toString(36).slice(2)}` })) : [defaultLine()]);
  };

  const newBOM = () => {
    setCurrent(null);
    setTitle('');
    setProjectRef('');
    setDate(new Date().toISOString().slice(0, 10));
    setItems([defaultLine()]);
  };

  const totalAmount = items.reduce((sum, l) => {
    const q = l.quantity || 0;
    const p = l.unitPrice != null ? l.unitPrice : 0;
    return sum + q * p;
  }, 0);

  const hasItems = items.length > 0;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#2c5aa0', mb: 2 }}>
        Estimates
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create a BOM (Bill of Materials) and pull products from the supplier database. Leave price blank to enter manually.
      </Typography>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField
          label="Estimate title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          size="small"
          sx={{ minWidth: 220 }}
        />
        <TextField
          label="Project ref"
          value={projectRef}
          onChange={(e) => setProjectRef(e.target.value)}
          size="small"
          placeholder="e.g. CMRP25010"
          sx={{ minWidth: 160 }}
        />
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <Button variant="outlined" onClick={newBOM} sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}>
          New BOM
        </Button>
        <Button variant="contained" onClick={saveAsNew} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
          Save estimate
        </Button>
      </Box>

      {estimates.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Saved estimates
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {estimates.slice(0, 10).map((est) => (
              <Button
                key={est.id}
                size="small"
                variant={current?.id === est.id ? 'contained' : 'outlined'}
                onClick={() => loadEstimate(est)}
                sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}
              >
                {est.title} {est.projectRef ? `(${est.projectRef})` : ''}
              </Button>
            ))}
          </Box>
        </Paper>
      )}

      <Paper sx={{ overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: 200 }}>Product / Search from suppliers</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>Part #</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: 80 }}>Brand</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 90 }}>Qty</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 90 }}>Unit</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 110 }}>Unit price (PHP)</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 110 }}>Subtotal</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: 120 }}>Supplier</TableCell>
                <TableCell sx={{ width: 56 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                    <Button startIcon={<AddIcon />} onClick={addLine} sx={{ color: '#2c5aa0' }}>
                      Add first line
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {items.map((line, index) => (
                <TableRow key={line.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={productOptions}
                      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : `${opt.name || opt.description || ''} ${opt.partNo ? `(${opt.partNo})` : ''} — ${opt.supplierName}`.trim() || '—')}
                      value={null}
                      onChange={(_, val) => {
                        if (typeof val === 'string') updateLine(line.id, { description: val });
                        else if (val) onSelectProduct(line.id, val);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Search supplier products or type description..."
                        />
                      )}
                      sx={{ minWidth: 260 }}
                    />
                    {line.description && (
                      <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
                        {line.description.slice(0, 80)}{line.description.length > 80 ? '…' : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={line.partNo}
                      onChange={(e) => updateLine(line.id, { partNo: e.target.value })}
                      fullWidth
                      placeholder="Part #"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={line.brand}
                      onChange={(e) => updateLine(line.id, { brand: e.target.value })}
                      fullWidth
                      placeholder="Brand"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 0.01 }}
                      value={line.quantity || ''}
                      onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      select
                      value={line.unit}
                      onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                      sx={{ minWidth: 90 }}
                    >
                      {units.map((u) => (
                        <MenuItem key={u} value={u}>
                          {u}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 0.01 }}
                      value={line.unitPrice != null ? line.unitPrice : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateLine(line.id, { unitPrice: v === '' ? null : parseFloat(v) || 0 });
                      }}
                      placeholder="Manual"
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell>
                    {line.unitPrice != null && line.quantity
                      ? (line.quantity * line.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {line.supplierName || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => removeLine(line.id)} title="Remove line">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {hasItems && (
          <>
            <Divider />
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
              <Button startIcon={<AddIcon />} onClick={addLine} sx={{ color: '#2c5aa0' }}>
                Add line
              </Button>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Total: PHP {totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default EstimatesPage;
