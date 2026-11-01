import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Grid,
  Snackbar,
  useMediaQuery,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon, Save as SaveIcon, History as HistoryIcon } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import dataService from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { Project } from '../types/Project';
import { resolveContact } from '../types/Client';
import { useQuotationStore } from '../store/quotationStore';
import { REPORT_COMPANIES, type ReportCompanyKey } from './ProjectDetails';
import { ORDER_TRACKER_STORAGE_KEY, type OrderRecord } from './OrderTrackerPage';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';
import { buildDeliveryReceiptPdf } from '../utils/reports/deliveryReceiptPdf';
import { REPORT_ISSUERS } from '../utils/reports/reportPdfKit';
import { loadReportLogo } from '../utils/reports/reportLogo';

const UOM_OPTIONS = ['', 'pc', 'pcs', 'set', 'box', 'boxes', 'ea', 'unit', 'lot', 'kg', 'm', 'meters', 'liters', 'm²', 'roll', 'rolls', 'pair', 'dozen', 'carton', 'pack', 'bundle', 'other'];

export interface DeliveryLineItem {
  id: string;
  itemNo: number;
  description: string;
  /** Optional; printed under the description on the DR. */
  partNo?: string;
  delivered: number;
  unit: string;
}

const DELIVERY_RECEIPTS_STORAGE_KEY = 'savedDeliveryReceipts';

export interface SavedDeliveryReceipt {
  id: string;
  savedAt: string; // ISO date
  reportCompany: ReportCompanyKey;
  deliveryNoteNo: string;
  despatchDate: string;
  projectId: string | '';
  poNumber: string;
  shippingName: string;
  shippingAddress: string;
  shippingContactName: string;
  shippingContactPhone: string;
  shippingContactEmail: string;
  items: DeliveryLineItem[];
  dispatchedByName: string;
  dispatchedByDate: string;
  receivedByName: string;
  receivedByDate: string;
  orderId?: string; // link to Order Tracker
  materialRequestId?: string; // link to Material Request (via order)
}

const emptyItem = (): DeliveryLineItem => ({
  id: Math.random().toString(36).slice(2),
  itemNo: 0,
  description: '',
  partNo: '',
  delivered: 0,
  unit: '',
});

function loadSavedDRs(): SavedDeliveryReceipt[] {
  try {
    const raw = localStorage.getItem(DELIVERY_RECEIPTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveDRToList(dr: SavedDeliveryReceipt): void {
  const list = loadSavedDRs();
  list.unshift(dr);
  localStorage.setItem(DELIVERY_RECEIPTS_STORAGE_KEY, JSON.stringify(list.slice(0, 500)));
}

function deleteSavedDR(id: string): void {
  const list = loadSavedDRs().filter((dr) => dr.id !== id);
  localStorage.setItem(DELIVERY_RECEIPTS_STORAGE_KEY, JSON.stringify(list));
}

/** Parse DR sequence number from deliveryNoteNo "ProjectNo-DR-N" */
function parseDRNumber(deliveryNoteNo: string): number {
  const match = deliveryNoteNo.match(/-DR-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function getNextDRNumber(projectId: string | '', savedDRs: SavedDeliveryReceipt[]): number {
  const drsForProject = savedDRs.filter((dr) => String(dr.projectId) === String(projectId));
  const max = Math.max(0, ...drsForProject.map((dr) => parseDRNumber(dr.deliveryNoteNo || '')));
  return max + 1;
}

function loadOrdersFromTracker(): OrderRecord[] {
  try {
    const raw = localStorage.getItem(ORDER_TRACKER_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

/** Titled content paper (DESIGN_PHILOSOPHY §8); `flush` drops the body padding for tables, `fill` stretches to the grid row. */
const Section: React.FC<{ title: React.ReactNode; action?: React.ReactNode; flush?: boolean; fill?: boolean; children: React.ReactNode }> = ({ title, action, flush, fill, children }) => (
  <Paper
    elevation={0}
    sx={{
      borderRadius: 2,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      border: '1px solid #e2e8f0',
      mb: fill ? 0 : 1.5,
      height: fill ? '100%' : undefined,
    }}
  >
    <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
      <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        {title}
      </Typography>
      {action}
    </Box>
    <Box sx={{ p: flush ? 0 : 1.5 }}>{children}</Box>
  </Paper>
);

const DeliveryPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const clients = useQuotationStore((s) => s.clients);
  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>('ACT');
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [despatchDate, setDespatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState<string | ''>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [poNumber, setPoNumber] = useState('');
  const [shippingName, setShippingName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingContactName, setShippingContactName] = useState('');
  const [shippingContactPhone, setShippingContactPhone] = useState('');
  const [shippingContactEmail, setShippingContactEmail] = useState('');
  const [items, setItems] = useState<DeliveryLineItem[]>(() => [emptyItem()]);
  // Portrait phones (< 600 px): item lines and saved receipts show as cards.
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [dispatchedByName, setDispatchedByName] = useState('');
  const [dispatchedByDate, setDispatchedByDate] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedByDate, setReceivedByDate] = useState('');
  const [savedList, setSavedList] = useState<SavedDeliveryReceipt[]>(() => loadSavedDRs());
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [linkedOrderId, setLinkedOrderId] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get('orderId');
  const itemIdsFromUrl = searchParams.get('itemIds'); // comma-separated item ids when creating DR with selected items only
  const appliedUrlOrderId = useRef<string | null>(null);

  useEffect(() => {
    dataService.getProjects().then(setProjects);
    setOrders(loadOrdersFromTracker());
  }, []);


  // Recipient ATTN / email / phone come from the project's linked client contact (Clients record);
  // free-text client_approver is only a fallback when no client contact is linked.
  const applyClientContact = (p: Project) => {
    const client = p.client_id ? clients.find((c) => c.id === p.client_id) : undefined;
    const contact = client ? resolveContact(client, p.client_contact_id) : null;
    setShippingContactName(contact?.name || p.client_approver || '');
    setShippingContactEmail(contact?.email || '');
    setShippingContactPhone(contact?.phone || '');
  };

  // Prefill from Order when "Link to Order" is selected or URL has ?orderId= (optional ?itemIds=id1,id2 for selected items only)
  const applyOrderPrefill = (order: OrderRecord, projectList: Project[], selectedItemIds?: string[]) => {
    const pid = order.projectId != null ? String(order.projectId) : '';
    setProjectId(pid);
    const p = projectList.find((x) => String(x.id) === pid);
    const orderOrProjectPo = order.poNumber || (p?.po_number ?? '');
    const firstItemPo = order.items?.[0]?.poNumber;
    setPoNumber(orderOrProjectPo || (firstItemPo ?? ''));
    if (p) {
      const projNo = String(p.project_no || p.item_no || p.id);
      const nextNum = getNextDRNumber(pid, loadSavedDRs());
      setDeliveryNoteNo((prev) => (prev ? prev : `${projNo}-DR-${nextNum}`));
      setShippingName(p.account_name || '');
      setShippingAddress(p.project_location || '');
      applyClientContact(p);
    }
    if (order.items && order.items.length > 0) {
      const sourceItems = selectedItemIds && selectedItemIds.length > 0
        ? order.items.filter((it) => selectedItemIds.includes(it.id))
        : order.items;
      setItems(
        sourceItems.map((it, idx) => ({
          id: Math.random().toString(36).slice(2),
          itemNo: idx + 1,
          description: it.description || '',
          partNo: it.partNo || '',
          delivered: Number(it.quantity) || 0,
          unit: it.unit && UOM_OPTIONS.includes(it.unit) ? it.unit : (it.unit || ''),
        }))
      );
    }
    setLinkedOrderId(order.id);
  };

  useEffect(() => {
    if (!orderIdFromUrl || appliedUrlOrderId.current === orderIdFromUrl) return;
    const orderList = loadOrdersFromTracker();
    const order = orderList.find((o) => o.id === orderIdFromUrl);
    if (order && projects.length > 0) {
      appliedUrlOrderId.current = orderIdFromUrl;
      const ids = itemIdsFromUrl ? itemIdsFromUrl.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      applyOrderPrefill(order, projects, ids);
      setSearchParams({});
    }
  }, [orderIdFromUrl, itemIdsFromUrl, projects, setSearchParams]);

  // When project changes (user selects from dropdown), sync PO, shipping, DR number from the selected project
  const handleProjectChange = (newProjectId: string | '') => {
    setProjectId(newProjectId);
    setLinkedOrderId(''); // clear order link when switching project
    if (newProjectId === '') return;
    const p = projects.find((x) => String(x.id) === newProjectId);
    if (p) {
      const projNo = String(p.project_no || p.item_no || p.id);
      const nextNum = getNextDRNumber(newProjectId, savedList);
      setDeliveryNoteNo((prev) => (prev ? prev : `${projNo}-DR-${nextNum}`));
      setPoNumber(p.po_number || '');
      setShippingName(p.account_name || '');
      setShippingAddress(p.project_location || '');
      applyClientContact(p);
    }
  };

  const addItem = () => setItems((prev) => [...prev, { ...emptyItem(), itemNo: prev.length + 1 }]);
  const removeItem = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next.length ? next.map((i, idx) => ({ ...i, itemNo: idx + 1 })) : [emptyItem()];
    });
  };
  const updateItem = (id: string, field: keyof DeliveryLineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  const linkedOrder = orders.find((o) => o.id === linkedOrderId);

  const handleSaveDR = () => {
    const dr: SavedDeliveryReceipt = {
      id: Math.random().toString(36).slice(2),
      savedAt: new Date().toISOString(),
      reportCompany,
      deliveryNoteNo,
      despatchDate,
      projectId,
      poNumber,
      shippingName,
      shippingAddress,
      shippingContactName,
      shippingContactPhone,
      shippingContactEmail,
      items: items.map((i) => ({ ...i })),
      dispatchedByName,
      dispatchedByDate,
      receivedByName,
      receivedByDate,
      orderId: linkedOrderId || undefined,
      materialRequestId: linkedOrder?.materialRequestId,
    };
    saveDRToList(dr);
    setSavedList(loadSavedDRs());
  };

  const [snack, setSnack] = useState('');
  const handleSave = () => {
    handleSaveDR();
    setSnack(`Saved ${deliveryNoteNo.trim() || 'DR'}`);
  };

  const handleDeleteSavedDR = (dr: SavedDeliveryReceipt) => {
    if (!window.confirm(`Delete saved DR ${dr.deliveryNoteNo || dr.id}? This cannot be undone.`)) return;
    deleteSavedDR(dr.id);
    setSavedList(loadSavedDRs());
  };

  const handleLoadDR = (dr: SavedDeliveryReceipt) => {
    setReportCompany(dr.reportCompany);
    setDeliveryNoteNo(dr.deliveryNoteNo);
    setDespatchDate(dr.despatchDate);
    setProjectId(dr.projectId);
    setPoNumber(dr.poNumber);
    setShippingName(dr.shippingName);
    setShippingAddress(dr.shippingAddress);
    setShippingContactName(dr.shippingContactName ?? '');
    setShippingContactPhone(dr.shippingContactPhone ?? '');
    setShippingContactEmail(dr.shippingContactEmail ?? '');
    setItems(dr.items.length ? dr.items.map((i) => ({ ...i, id: i.id || Math.random().toString(36).slice(2) })) : [emptyItem()]);
    setDispatchedByName(dr.dispatchedByName);
    setDispatchedByDate(dr.dispatchedByDate);
    setReceivedByName(dr.receivedByName);
    setReceivedByDate(dr.receivedByDate);
    setLinkedOrderId(dr.orderId || '');
  };

  const filteredSavedList = projectId === ''
    ? savedList
    : savedList.filter((dr) => String(dr.projectId) === String(projectId));

  const handleClearDR = () => {
    setDeliveryNoteNo('');
    setDespatchDate(new Date().toISOString().slice(0, 10));
    setProjectId('');
    setPoNumber('');
    setShippingName('');
    setShippingAddress('');
    setShippingContactName('');
    setShippingContactPhone('');
    setShippingContactEmail('');
    setItems([emptyItem()]);
    setDispatchedByName('');
    setDispatchedByDate('');
    setReceivedByName('');
    setReceivedByDate('');
    setLinkedOrderId('');
  };

  const handleLinkOrder = (orderId: string) => {
    setLinkedOrderId(orderId);
    if (orderId) {
      const order = orders.find((o) => o.id === orderId);
      if (order) applyOrderPrefill(order, projects);
    }
  };

  const shipName = shippingName.trim() || '—';
  const shipAddr = shippingAddress.trim() || '—';
  const shipContact = shippingContactName.trim() || '';
  const shipPhone = shippingContactPhone.trim() || '';
  const shipEmail = shippingContactEmail.trim() || '';

  const exportToPDF = async () => {
    const { doc, filename } = buildDeliveryReceiptPdf({
      reportCompany,
      deliveryNoteNo,
      despatchDate,
      poNumber,
      shipTo: { name: shipName, address: shipAddr, contactName: shipContact, phone: shipPhone, email: shipEmail },
      items: items.map((it) => ({ itemNo: it.itemNo, description: it.description, partNo: it.partNo, delivered: it.delivered, unit: it.unit })),
      dispatchedBy: { name: dispatchedByName, date: dispatchedByDate },
      receivedBy: { name: receivedByName, date: receivedByDate },
    }, { logoDataUrl: await loadReportLogo(REPORT_ISSUERS[reportCompany]), bodyFontBase64: arialNarrowBase64 });
    doc.save(filename);
  };

  const actionButtons = (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <Button variant="text" size="small" onClick={handleClearDR}>New DR</Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<SaveIcon />}
        onClick={handleSave}
        sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
      >
        Save DR
      </Button>
      <Button
        variant="contained"
        size="small"
        startIcon={<PictureAsPdfIcon />}
        onClick={exportToPDF}
        sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
      >
        Generate PDF
      </Button>
    </Box>
  );

  const headCell = { fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' as const };

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Delivery Receipt
        </Typography>
      </Box>

      <Section title="Delivery Details">
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Project (optional)</InputLabel>
              <Select
                value={projectId === '' ? '' : projectId}
                label="Project (optional)"
                onChange={(e) => handleProjectChange(String(e.target.value) === '' ? '' : String(e.target.value))}
              >
                <MenuItem value="">— None —</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {p.project_name || p.account_name || `Project ${p.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Link to Order (optional)</InputLabel>
              <Select
                value={linkedOrderId}
                label="Link to Order (optional)"
                onChange={(e) => handleLinkOrder(e.target.value)}
              >
                <MenuItem value="">— None —</MenuItem>
                {orders.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.orderNo} {o.poNumber ? ` · PO ${o.poNumber}` : ''} · {o.projectName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Issued by</InputLabel>
              <Select value={reportCompany} label="Issued by" onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}>
                <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
                <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="DR Number"
              value={deliveryNoteNo}
              onChange={(e) => setDeliveryNoteNo(e.target.value)}
              placeholder="e.g. IOCT2602002-DR-1"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="PO Number"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Dispatch Date"
              value={despatchDate}
              onChange={(e) => setDespatchDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
      </Section>

      <Section title="Ship To">
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth size="small" label="Client / Company name" value={shippingName} onChange={(e) => setShippingName(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth size="small" label="Attention (contact person)" value={shippingContactName} onChange={(e) => setShippingContactName(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth size="small" label="Address" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} multiline minRows={1} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" label="Mobile No." value={shippingContactPhone} onChange={(e) => setShippingContactPhone(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" label="Email" type="email" value={shippingContactEmail} onChange={(e) => setShippingContactEmail(e.target.value)} />
          </Grid>
        </Grid>
      </Section>

      <Section
        title={`Items Delivered (${items.length})`}
        flush
        action={
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={addItem}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add Item
          </Button>
        }
      >
        {isPhone ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5 }}>
            {items.map((it, idx) => (
              <Paper key={it.id} variant="outlined" sx={{ p: 1.25 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
                  <TextField
                    size="small" type="number" label="Item #" value={it.itemNo || ''}
                    onChange={(e) => updateItem(it.id, 'itemNo', parseInt(e.target.value, 10) || 0)}
                    inputProps={{ min: 0, inputMode: 'numeric' }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>Line {idx + 1}</Typography>
                    <IconButton onClick={() => removeItem(it.id)} color="error" disabled={items.length <= 1} aria-label="Remove item">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <TextField
                    size="small" label="Description" value={it.description} multiline minRows={1} sx={{ gridColumn: '1 / -1' }}
                    onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                  />
                  <TextField
                    size="small" label="Part No. (optional)" value={it.partNo || ''} sx={{ gridColumn: '1 / -1' }}
                    onChange={(e) => updateItem(it.id, 'partNo', e.target.value)}
                  />
                  <TextField
                    size="small" type="number" label="Qty" value={it.delivered || ''}
                    onChange={(e) => updateItem(it.id, 'delivered', parseInt(e.target.value, 10) || 0)}
                    inputProps={{ min: 0, inputMode: 'numeric' }}
                  />
                  <TextField
                    select size="small" label="UOM" value={it.unit || ''}
                    onChange={(e) => updateItem(it.id, 'unit', e.target.value)}
                    SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value="">—</MenuItem>
                    {UOM_OPTIONS.filter((u) => u !== '').map((u) => (
                      <MenuItem key={u} value={u}>{u}</MenuItem>
                    ))}
                  </TextField>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headCell, width: 76 }}>Item #</TableCell>
                  <TableCell sx={headCell}>Description</TableCell>
                  <TableCell sx={{ ...headCell, width: 180 }}>Part No.</TableCell>
                  <TableCell sx={{ ...headCell, width: 90 }} align="right">Qty</TableCell>
                  <TableCell sx={{ ...headCell, width: 100 }}>UOM</TableCell>
                  <TableCell sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' }, '& td': { py: 0.75 } }}>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={it.itemNo || ''}
                        onChange={(e) => updateItem(it.id, 'itemNo', parseInt(e.target.value, 10) || 0)}
                        inputProps={{ min: 0, 'aria-label': 'Item number' }}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={it.description}
                        onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                        placeholder="Description"
                        inputProps={{ 'aria-label': 'Description' }}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={it.partNo || ''}
                        onChange={(e) => updateItem(it.id, 'partNo', e.target.value)}
                        placeholder="Optional"
                        inputProps={{ 'aria-label': 'Part number' }}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={it.delivered || ''}
                        onChange={(e) => updateItem(it.id, 'delivered', parseInt(e.target.value, 10) || 0)}
                        inputProps={{ min: 0, 'aria-label': 'Quantity', style: { textAlign: 'right' } }}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        fullWidth
                        value={it.unit || ''}
                        onChange={(e) => updateItem(it.id, 'unit', e.target.value)}
                        displayEmpty
                        inputProps={{ 'aria-label': 'Unit of measure' }}
                      >
                        <MenuItem value="">—</MenuItem>
                        {UOM_OPTIONS.filter((u) => u !== '').map((u) => (
                          <MenuItem key={u} value={u}>{u}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => removeItem(it.id)} color="error" disabled={items.length <= 1} aria-label="Remove item">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>

      <Section title="Signatures">
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" label="Dispatched by" value={dispatchedByName} onChange={(e) => setDispatchedByName(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" type="date" label="Dispatch sign date" value={dispatchedByDate} onChange={(e) => setDispatchedByDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" label="Received by" value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} placeholder="Leave blank to sign by hand" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" type="date" label="Received date" value={receivedByDate} onChange={(e) => setReceivedByDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>
      </Section>

      {filteredSavedList.length > 0 && (
        <Section
          flush
          title={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon fontSize="small" /> Saved DRs ({filteredSavedList.length}){projectId !== '' ? ' · this project' : ''}
            </Box>
          }
        >
          {isPhone ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5 }}>
              {filteredSavedList.map((dr) => (
                <Paper key={dr.id} variant="outlined" sx={{ p: 1.25 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{dr.deliveryNoteNo || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {[dr.poNumber && `PO ${dr.poNumber}`, dr.despatchDate && `Dispatch ${dr.despatchDate}`].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Saved {new Date(dr.savedAt).toLocaleString()}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <Button size="small" variant="outlined" onClick={() => handleLoadDR(dr)}>Load</Button>
                    <Box sx={{ flex: 1 }} />
                    {isAdmin && (
                      <IconButton onClick={() => handleDeleteSavedDR(dr)} color="error" title="Delete (admin only)">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCell}>DR Number</TableCell>
                    <TableCell sx={headCell}>PO</TableCell>
                    <TableCell sx={headCell}>Dispatch Date</TableCell>
                    <TableCell sx={headCell}>Saved</TableCell>
                    <TableCell sx={headCell} align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSavedList.map((dr) => (
                    <TableRow key={dr.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' }, '& td': { fontSize: '0.8rem' } }}>
                      <TableCell>{dr.deliveryNoteNo || '—'}</TableCell>
                      <TableCell>{dr.poNumber || '—'}</TableCell>
                      <TableCell>{dr.despatchDate || '—'}</TableCell>
                      <TableCell>{new Date(dr.savedAt).toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="text" onClick={() => handleLoadDR(dr)} sx={{ color: NET_PACIFIC_COLORS.primary }}>
                          Load
                        </Button>
                        {isAdmin && (
                          <IconButton size="small" onClick={() => handleDeleteSavedDR(dr)} color="error" title="Delete (admin only)">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Section>
      )}

      {/* Actions stay in reach at the bottom of the screen while the form scrolls. */}
      <Paper
        elevation={3}
        sx={{ position: 'sticky', bottom: 0, zIndex: 10, borderTop: `2px solid ${NET_PACIFIC_COLORS.primary}`, pl: 1.5, pr: 9, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 160 }}>
          {deliveryNoteNo.trim() || 'New DR'} · {items.filter((i) => i.description.trim()).length} item(s)
        </Typography>
        {actionButtons}
      </Paper>

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack('')}
        message={snack}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Box>
  );
};

export default DeliveryPage;
