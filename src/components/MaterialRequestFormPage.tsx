import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  IconButton,
  Divider,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Send as SendIcon, Visibility as VisibilityIcon, FileDownload as FileDownloadIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { ORDER_TRACKER_STORAGE_KEY, type OrderRecord, type OrderItem } from './OrderTrackerPage';
import { SUPPLIERS_STORAGE_KEY, type Supplier } from './SuppliersPage';

const STORAGE_KEY = 'materialRequests';
const PO_STORAGE_KEY = 'purchaseOrders';

/** Minimal PO shape to detect which MRF items are already in a PO (avoid circular import) */
interface POStub {
  items: { id: string }[];
  poNumber: string;
}

const loadPOs = (): POStub[] => {
  try {
    const raw = localStorage.getItem(PO_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

/** For a given MRF and its items, return map of item.id -> PO number if that item is in a PO */
const getItemPoStatus = (mrfId: string, mrfItems: MaterialRequestItem[], pos: POStub[]): Map<string, string> => {
  const map = new Map<string, string>();
  mrfItems.forEach((item) => {
    const compositeId = `${mrfId}-${item.id || ''}`;
    const po = pos.find((p) => p.items.some((i) => i.id === compositeId));
    if (po) map.set(item.id, po.poNumber);
  });
  return map;
};

export interface MaterialRequestItem {
  id: string;
  description: string;
  partNo: string;
  brand: string;
  quantity: number;
  unit: string;
  notes: string;
  /** Preferred supplier for this line (used when creating POs) */
  supplierId?: string;
  supplierName?: string;
}

export interface MaterialRequest {
  id: string;
  requestNo: string;
  projectId: number | null;
  projectName: string;
  requestDate: string;
  requestedBy: string;
  deliveryLocation: string;
  items: MaterialRequestItem[];
  status: 'Draft' | 'Submitted';
  createdAt: string;
}

const defaultItem: MaterialRequestItem = {
  id: '',
  description: '',
  partNo: '',
  brand: '',
  quantity: 0,
  unit: 'pcs',
  notes: '',
  supplierId: '',
  supplierName: '',
};

const units = ['pcs', 'meters', 'kg', 'liters', 'boxes', 'rolls', 'set', 'unit'];

const loadStored = (): MaterialRequest[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const loadSuppliers = (): Supplier[] => {
  try {
    const raw = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const saveStored = (list: MaterialRequest[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
};

/** Parse MRF number from requestNo "Project No - MRF-#" */
const parseMRFNumber = (requestNo: string): number => {
  const match = requestNo.match(/ - MRF-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

const MaterialRequestFormPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestedBy, setRequestedBy] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [items, setItems] = useState<MaterialRequestItem[]>([
    { ...defaultItem, id: `item-${Date.now()}` },
  ]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewRequest, setViewRequest] = useState<MaterialRequest | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<POStub[]>([]);

  useEffect(() => {
    dataService.getProjects().then(setProjects);
    setRequests(loadStored());
    setSuppliers(loadSuppliers());
    setPos(loadPOs());
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId);
  const projectName = selectedProject?.project_name ?? '';
  const projectNo = selectedProject
    ? (selectedProject.project_no || String(selectedProject.item_no ?? selectedProject.id))
    : '';

  const nextMRFForProject =
    projectId === ''
      ? 0
      : Math.max(
          0,
          ...requests
            .filter((r) => r.projectId === projectId)
            .map((r) => parseMRFNumber(r.requestNo))
        ) + 1;
  const generatedRequestNo =
    projectId && projectNo ? `${projectNo} - MRF-${nextMRFForProject}` : '';

  const addItem = () => {
    setItems((prev) => [...prev, { ...defaultItem, id: `item-${Date.now()}-${prev.length}` }]);
  };

  const updateItem = (id: string, field: keyof MaterialRequestItem, value: string | number) => {
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const setItemSupplier = (id: string, supplierId: string, supplierName: string) => {
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, supplierId: supplierId || undefined, supplierName: supplierName || undefined } : row))
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleDeleteRequest = (id: string) => {
    if (!window.confirm('Delete this material request? This cannot be undone.')) return;
    const next = requests.filter((r) => r.id !== id);
    setRequests(next);
    saveStored(next);
    if (viewRequest?.id === id) setViewRequest(null);
    setMessage({ type: 'success', text: 'Request deleted.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const exportToExcel = () => {
    const requestsSheet = [
      ['Request No.', 'Project', 'Date', 'Requested By', 'Delivery Location', 'Status'],
      ...requests.map((r) => [r.requestNo, r.projectName, r.requestDate, r.requestedBy, r.deliveryLocation, r.status]),
    ];
    const itemsSheet = [
      ['Request No.', 'No.', 'Item / Description', 'Part #', 'Brand', 'Qty', 'Unit', 'Notes'],
      ...requests.flatMap((r) =>
        (r.items || []).map((item, idx) => [
          r.requestNo,
          idx + 1,
          item.description || '',
          item.partNo || '',
          item.brand || '',
          item.quantity,
          item.unit || '',
          item.notes || '',
        ])
      ),
    ];
    const wb = XLSX.utils.book_new();
    wb.SheetNames.push('Requests', 'Items');
    wb.Sheets.Requests = XLSX.utils.aoa_to_sheet(requestsSheet);
    wb.Sheets.Items = XLSX.utils.aoa_to_sheet(itemsSheet);
    XLSX.writeFile(wb, `MaterialRequests_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Material Request Form - Summary', 14, 15);
    doc.setFontSize(10);
    autoTable(doc, {
      head: [['Request No.', 'Project', 'Date', 'Requested By', 'Delivery Location', 'Status']],
      body: requests.map((r) => [r.requestNo, r.projectName, r.requestDate, r.requestedBy, r.deliveryLocation, r.status]),
      startY: 22,
      margin: { left: 14 },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    let finalY = docWithTable.lastAutoTable?.finalY ?? 22;
    if (finalY > 0) finalY += 6;
    doc.setFontSize(11);
    doc.text('Items (all requests)', 14, finalY + 4);
    autoTable(doc, {
      head: [['Request No.', 'No.', 'Item / Description', 'Part #', 'Brand', 'Qty', 'Unit', 'Notes']],
      body: requests.flatMap((r) =>
        (r.items && r.items.length > 0
          ? r.items.map((item, idx) => [
              r.requestNo,
              String(idx + 1),
              item.description || '—',
              item.partNo || '—',
              item.brand || '—',
              String(item.quantity),
              item.unit || '—',
              item.notes || '—',
            ])
          : [[r.requestNo, '—', 'No items', '—', '—', '—', '—', '—']])
      ),
      startY: finalY + 8,
      margin: { left: 14 },
    });
    doc.save(`MaterialRequests_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportViewRequestToPDF = (r: MaterialRequest) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Material Request', 14, 15);
    doc.setFontSize(10);
    doc.text(`Request No.: ${r.requestNo}`, 14, 22);
    doc.text(`Project: ${r.projectName}`, 14, 28);
    doc.text(`Date: ${r.requestDate}`, 14, 34);
    doc.text(`Requested By: ${r.requestedBy}`, 14, 40);
    doc.text(`Delivery Location: ${r.deliveryLocation}`, 14, 46);
    doc.text(`Status: ${r.status}`, 14, 52);
    const body = (r.items && r.items.length > 0)
      ? r.items.map((item, idx) => [
          String(idx + 1),
          item.description || '—',
          item.partNo || '—',
          item.brand || '—',
          String(item.quantity),
          item.unit || '—',
          item.notes || '—',
        ])
      : [['—', 'No items', '—', '—', '—', '—', '—']];
    autoTable(doc, {
      head: [['No.', 'Item / Description', 'Part #', 'Brand', 'Qty', 'Unit', 'Notes']],
      body,
      startY: 58,
      margin: { left: 14 },
    });
    doc.save(`MRF_${r.requestNo.replace(/\s/g, '_')}.pdf`);
  };

  const handleSubmit = (asDraft: boolean) => {
    const pid = projectId === '' ? null : Number(projectId);
    if (pid == null || !projectNo) {
      setMessage({ type: 'error', text: 'Please select a project to generate Request No.' });
      return;
    }
    const no = generatedRequestNo;
    const req: MaterialRequest = {
      id: `req-${Date.now()}`,
      requestNo: no,
      projectId: pid,
      projectName: projectName || '—',
      requestDate: requestDate,
      requestedBy: requestedBy.trim() || '—',
      deliveryLocation: deliveryLocation.trim() || '—',
      items: items.map((i) => ({ ...i })),
      status: asDraft ? 'Draft' : 'Submitted',
      createdAt: new Date().toISOString(),
    };
    const next = [req, ...requests];
    setRequests(next);
    saveStored(next);

    if (!asDraft) {
      const itemsSummary = items
        .filter((i) => i.description || i.partNo)
        .map((i) => `${i.description || ''} ${i.partNo ? `(${i.partNo})` : ''} ${i.quantity} ${i.unit}`.trim())
        .join('; ') || '—';
      const orderItems: OrderItem[] = items.map((i) => ({
        id: i.id,
        description: i.description || '',
        partNo: i.partNo || '',
        quantity: i.quantity,
        unit: i.unit || '',
        notes: i.notes || '',
        status: 'Submitted' as const,
      }));
      const order: OrderRecord = {
        id: `order-${req.id}`,
        orderNo: no,
        poNumber: '',
        supplier: '',
        projectId: pid,
        projectName: projectName || '—',
        orderDate: requestDate,
        expectedDelivery: '',
        status: 'Submitted',
        itemsSummary,
        items: orderItems,
        materialRequestId: req.id,
        createdAt: new Date().toISOString(),
      };
      try {
        const raw = localStorage.getItem(ORDER_TRACKER_STORAGE_KEY);
        const orders: OrderRecord[] = raw ? JSON.parse(raw) : [];
        orders.unshift(order);
        localStorage.setItem(ORDER_TRACKER_STORAGE_KEY, JSON.stringify(orders));
      } catch (_) {}
    }

    setMessage({ type: 'success', text: asDraft ? 'Saved as draft.' : 'Material request submitted and added to Order Tracker.' });
    setTimeout(() => setMessage(null), 3000);
    setProjectId('');
    setRequestDate(new Date().toISOString().slice(0, 10));
    setRequestedBy('');
    setDeliveryLocation('');
    setItems([{ ...defaultItem, id: `item-${Date.now()}` }]);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#2c5aa0', mb: 2 }}>
        Material Request Form
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          New Request
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Request No."
              value={generatedRequestNo}
              InputProps={{ readOnly: true }}
              placeholder="Select a project to auto-generate"
              helperText="Format: Project No - MRF-#"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
              helperText="Required to generate Request No."
            >
              <MenuItem value="">— Select project —</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.project_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Request Date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              size="small"
              label="Requested By"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              size="small"
              label="Delivery Location"
              value={deliveryLocation}
              onChange={(e) => setDeliveryLocation(e.target.value)}
            />
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1, fontWeight: 600 }}>
          Items
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 48, fontWeight: 600 }}>No.</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Item / Description</TableCell>
                <TableCell sx={{ minWidth: 100, fontWeight: 600 }}>Part #</TableCell>
                <TableCell sx={{ minWidth: 100, fontWeight: 600 }}>Brand</TableCell>
                <TableCell align="right" sx={{ width: 90, fontWeight: 600 }}>Qty</TableCell>
                <TableCell sx={{ width: 100, fontWeight: 600 }}>Unit</TableCell>
                <TableCell sx={{ minWidth: 140, fontWeight: 600 }}>Supplier (for PO)</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
                <TableCell width={48} />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{index + 1}</TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      value={row.description}
                      onChange={(e) => updateItem(row.id, 'description', e.target.value)}
                      placeholder="Item / Description"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      value={row.partNo}
                      onChange={(e) => updateItem(row.id, 'partNo', e.target.value)}
                      placeholder="Part #"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      value={row.brand}
                      onChange={(e) => updateItem(row.id, 'brand', e.target.value)}
                      placeholder="Brand"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={row.quantity || ''}
                      onChange={(e) => updateItem(row.id, 'quantity', Number(e.target.value) || 0)}
                      inputProps={{ min: 0 }}
                      sx={{ width: 90 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={row.unit}
                      onChange={(e) => updateItem(row.id, 'unit', e.target.value)}
                      sx={{ minWidth: 90 }}
                    >
                      {units.map((u) => (
                        <MenuItem key={u} value={u}>{u}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={row.supplierId ?? ''}
                      onChange={(e) => {
                        const s = suppliers.find((x) => x.id === e.target.value);
                        setItemSupplier(row.id, e.target.value, s?.name ?? '');
                      }}
                      SelectProps={{ displayEmpty: true }}
                      sx={{ minWidth: 140 }}
                    >
                      <MenuItem value="">Any</MenuItem>
                      {suppliers.map((s) => (
                        <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      value={row.notes}
                      onChange={(e) => updateItem(row.id, 'notes', e.target.value)}
                      placeholder="Notes"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => removeItem(row.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Button startIcon={<AddIcon />} onClick={addItem} sx={{ mt: 1 }}>
          Add line
        </Button>

        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={() => handleSubmit(true)}>
            Save as draft
          </Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={() => handleSubmit(false)} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
            Submit request
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Request history
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={exportToExcel}
              disabled={requests.length === 0}
            >
              Export to Excel
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdfIcon />}
              onClick={exportToPDF}
              disabled={requests.length === 0}
            >
              Export to PDF
            </Button>
          </Box>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Request No.</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Requested By</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Delivery Location</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>PO'd</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No material requests yet. Submit one above.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r) => {
                  const items = r.items || [];
                  const inPoCount = items.filter((item) => {
                    const compositeId = `${r.id}-${item.id || ''}`;
                    return pos.some((p) => p.items.some((i) => i.id === compositeId));
                  }).length;
                  return (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.requestNo}</TableCell>
                    <TableCell>{r.projectName}</TableCell>
                    <TableCell>{r.requestDate}</TableCell>
                    <TableCell>{r.requestedBy}</TableCell>
                    <TableCell>{r.deliveryLocation}</TableCell>
                    <TableCell>
                      <Chip
                        label={r.status}
                        size="small"
                        color={r.status === 'Submitted' ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {items.length > 0 ? `${inPoCount}/${items.length}` : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => setViewRequest(r)}
                        title="View items"
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteRequest(r.id)}
                        title="Delete request"
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={!!viewRequest} onClose={() => setViewRequest(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0', pb: 1 }}>
          Request details
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {viewRequest && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Request No.</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.requestNo}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Project</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.projectName}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.requestDate}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Requested By</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.requestedBy}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Delivery Location</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.deliveryLocation}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip label={viewRequest.status} size="small" color={viewRequest.status === 'Submitted' ? 'success' : 'default'} variant="outlined" />
                  </Box>
                </Grid>
              </Grid>
              {viewRequest.items && viewRequest.items.length > 0 && (() => {
                const itemPoStatus = getItemPoStatus(viewRequest.id, viewRequest.items, pos);
                const inPoCount = viewRequest.items.filter((item) => itemPoStatus.has(item.id)).length;
                const remainingCount = viewRequest.items.length - inPoCount;
                return (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 0.5 }}>
                    {inPoCount} of {viewRequest.items.length} items in PO
                    {remainingCount > 0 && ` · ${remainingCount} remaining`}
                  </Typography>
                );
              })()}
              <Typography variant="subtitle2" sx={{ mt: 1, mb: 1, fontWeight: 600 }}>
                Items
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 48, fontWeight: 600 }}>No.</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Item / Description</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Part #</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Brand</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Supplier (for PO)</TableCell>
                      <TableCell sx={{ minWidth: 100, fontWeight: 600 }}>PO status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {viewRequest.items && viewRequest.items.length > 0 ? (
                      (() => {
                        const itemPoStatus = getItemPoStatus(viewRequest.id, viewRequest.items, pos);
                        return viewRequest.items.map((item, idx) => (
                          <TableRow key={item.id || idx}>
                            <TableCell sx={{ fontWeight: 500 }}>{idx + 1}</TableCell>
                            <TableCell>{item.description || '—'}</TableCell>
                            <TableCell>{item.partNo || '—'}</TableCell>
                            <TableCell>{item.brand || '—'}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell>{item.unit || '—'}</TableCell>
                            <TableCell>{item.supplierName || '—'}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {itemPoStatus.get(item.id) ? (
                                <Chip size="small" label={`In PO: ${itemPoStatus.get(item.id)}`} color="success" variant="outlined" />
                              ) : (
                                <Typography variant="body2" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell>{item.notes || '—'}</TableCell>
                          </TableRow>
                        ));
                      })()
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ color: 'text.secondary' }}>
                          No items
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #e2e8f0', p: 2 }}>
          <Button onClick={() => setViewRequest(null)}>Close</Button>
          {viewRequest && (
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={() => exportViewRequestToPDF(viewRequest)} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
              Export to PDF
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MaterialRequestFormPage;
