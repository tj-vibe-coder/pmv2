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
  deliveryMethod: string;
  projectId: string | '';
  poNumber: string;
  shippingName: string;
  shippingAddress: string;
  shippingContactName: string;
  shippingContactPhone: string;
  shippingContactEmail: string;
  invoiceSameAsShipping: boolean;
  invoiceName: string;
  invoiceAddress: string;
  items: DeliveryLineItem[];
  dispatchedByName: string;
  dispatchedByDate: string;
  receivedByName: string;
  receivedByDate: string;
  receivedByPlace: string;
  orderId?: string; // link to Order Tracker
  materialRequestId?: string; // link to Material Request (via order)
}

const emptyItem = (): DeliveryLineItem => ({
  id: Math.random().toString(36).slice(2),
  itemNo: 0,
  description: '',
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

const DeliveryPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const clients = useQuotationStore((s) => s.clients);
  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>('ACT');
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [despatchDate, setDespatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryMethod, setDeliveryMethod] = useState('Physical');
  const [projectId, setProjectId] = useState<string | ''>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [poNumber, setPoNumber] = useState('');
  const [shippingName, setShippingName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingContactName, setShippingContactName] = useState('');
  const [shippingContactPhone, setShippingContactPhone] = useState('');
  const [shippingContactEmail, setShippingContactEmail] = useState('');
  const [invoiceSameAsShipping, setInvoiceSameAsShipping] = useState(true);
  const [invoiceName, setInvoiceName] = useState('');
  const [invoiceAddress, setInvoiceAddress] = useState('');
  const [items, setItems] = useState<DeliveryLineItem[]>(() => [emptyItem()]);
  // Portrait phones (< 600 px): item lines and saved receipts show as cards.
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [dispatchedByName, setDispatchedByName] = useState('');
  const [dispatchedByDate, setDispatchedByDate] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedByDate, setReceivedByDate] = useState('');
  const [receivedByPlace, setReceivedByPlace] = useState('');
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
      deliveryMethod,
      projectId,
      poNumber,
      shippingName,
      shippingAddress,
      shippingContactName,
      shippingContactPhone,
      shippingContactEmail,
      invoiceSameAsShipping,
      invoiceName,
      invoiceAddress,
      items: items.map((i) => ({ ...i })),
      dispatchedByName,
      dispatchedByDate,
      receivedByName,
      receivedByDate,
      receivedByPlace,
      orderId: linkedOrderId || undefined,
      materialRequestId: linkedOrder?.materialRequestId,
    };
    saveDRToList(dr);
    setSavedList(loadSavedDRs());
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
    setDeliveryMethod(dr.deliveryMethod);
    setProjectId(dr.projectId);
    setPoNumber(dr.poNumber);
    setShippingName(dr.shippingName);
    setShippingAddress(dr.shippingAddress);
    setShippingContactName(dr.shippingContactName ?? '');
    setShippingContactPhone(dr.shippingContactPhone ?? '');
    setShippingContactEmail(dr.shippingContactEmail ?? '');
    setInvoiceSameAsShipping(dr.invoiceSameAsShipping);
    setInvoiceName(dr.invoiceName);
    setInvoiceAddress(dr.invoiceAddress);
    setItems(dr.items.length ? dr.items.map((i) => ({ ...i, id: i.id || Math.random().toString(36).slice(2) })) : [emptyItem()]);
    setDispatchedByName(dr.dispatchedByName);
    setDispatchedByDate(dr.dispatchedByDate);
    setReceivedByName(dr.receivedByName);
    setReceivedByDate(dr.receivedByDate);
    setReceivedByPlace(dr.receivedByPlace);
    setLinkedOrderId(dr.orderId || '');
  };

  const filteredSavedList = projectId === ''
    ? savedList
    : savedList.filter((dr) => String(dr.projectId) === String(projectId));

  const handleClearDR = () => {
    setDeliveryNoteNo('');
    setDespatchDate(new Date().toISOString().slice(0, 10));
    setDeliveryMethod('Physical');
    setProjectId('');
    setPoNumber('');
    setShippingName('');
    setShippingAddress('');
    setShippingContactName('');
    setShippingContactPhone('');
    setShippingContactEmail('');
    setInvoiceSameAsShipping(true);
    setInvoiceName('');
    setInvoiceAddress('');
    setItems([emptyItem()]);
    setDispatchedByName('');
    setDispatchedByDate('');
    setReceivedByName('');
    setReceivedByDate('');
    setReceivedByPlace('');
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
  const invName = invoiceSameAsShipping ? shipName : (invoiceName.trim() || '—');
  const invAddr = invoiceSameAsShipping ? shipAddr : (invoiceAddress.trim() || '—');

  const exportToPDF = async () => {
    const { doc, filename } = buildDeliveryReceiptPdf({
      reportCompany,
      deliveryNoteNo,
      despatchDate,
      deliveryMethod,
      poNumber,
      shipTo: { name: shipName, address: shipAddr, contactName: shipContact, phone: shipPhone, email: shipEmail },
      invoiceTo: { name: invName, address: invAddr },
      items: items.map((it) => ({ itemNo: it.itemNo, description: it.description, delivered: it.delivered, unit: it.unit })),
      dispatchedBy: { name: dispatchedByName, date: dispatchedByDate },
      receivedBy: { name: receivedByName, date: receivedByDate, place: receivedByPlace },
    }, { logoDataUrl: await loadReportLogo(REPORT_ISSUERS[reportCompany]), bodyFontBase64: arialNarrowBase64 });
    doc.save(filename);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        Delivery Receipt
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
            <FormControl fullWidth size="small">
              <InputLabel>Report as company</InputLabel>
              <Select
                value={reportCompany}
                label="Report as company"
                onChange={(e) => {
                  const v = e.target.value as ReportCompanyKey;
                  setReportCompany(v);
                }}
              >
                <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
                <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
            <TextField
              fullWidth
              size="small"
              label="DR Number"
              value={deliveryNoteNo}
              onChange={(e) => setDeliveryNoteNo(e.target.value)}
              placeholder="e.g. IOCT2602002-DR-1"
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Dispatch Date"
              value={despatchDate}
              onChange={(e) => setDespatchDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
            <TextField
              fullWidth
              size="small"
              label="Delivery Method"
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
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
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
            <FormControl fullWidth size="small">
              <InputLabel>Link to Order (Material Request → Order → DR)</InputLabel>
              <Select
                value={linkedOrderId}
                label="Link to Order (Material Request → Order → DR)"
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
          </Box>
          <Box sx={{ width: '100%' }}>
            <TextField
              fullWidth
              size="small"
              label="PO Number"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
          </Box>

          <Box sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Shipping to
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Client / Company name"
              value={shippingName}
              onChange={(e) => setShippingName(e.target.value)}
              sx={{ mb: 1 }}
            />
            <TextField
              fullWidth
              size="small"
              label="ATTN (Contact person)"
              value={shippingContactName}
              onChange={(e) => setShippingContactName(e.target.value)}
              placeholder="ATTN:"
              sx={{ mb: 1 }}
            />
            <TextField
              fullWidth
              size="small"
              label="Address"
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              multiline
              rows={2}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Mobile No"
                value={shippingContactPhone}
                onChange={(e) => setShippingContactPhone(e.target.value)}
                placeholder="Mobile No"
                sx={{ flex: 1, minWidth: 120 }}
              />
              <TextField
                size="small"
                label="Email"
                value={shippingContactEmail}
                onChange={(e) => setShippingContactEmail(e.target.value)}
                placeholder="Email"
                type="email"
                sx={{ flex: 1, minWidth: 160 }}
              />
            </Box>
          </Box>
          <Box sx={{ width: '100%' }}>
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel>Invoice Address</InputLabel>
              <Select
                value={invoiceSameAsShipping ? 'same' : 'different'}
                label="Invoice Address"
                onChange={(e) => setInvoiceSameAsShipping(e.target.value === 'same')}
              >
                <MenuItem value="same">Same as Shipping Address</MenuItem>
                <MenuItem value="different">Different</MenuItem>
              </Select>
            </FormControl>
            {!invoiceSameAsShipping && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  label="Invoice Name"
                  value={invoiceName}
                  onChange={(e) => setInvoiceName(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Invoice Address"
                  value={invoiceAddress}
                  onChange={(e) => setInvoiceAddress(e.target.value)}
                  multiline
                  rows={2}
                />
              </>
            )}
          </Box>

          <Box sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Item Details
            </Typography>
            {isPhone ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                        size="small" type="number" label="QTY" value={it.delivered || ''}
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
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table
                size="small"
                sx={{
                  tableLayout: 'fixed',
                  minWidth: 640,
                  '& .MuiTableCell-root': { py: 0.75 },
                  '& .MuiInputBase-input': {
                    color: 'rgba(0, 0, 0, 0.87)',
                    WebkitTextFillColor: 'rgba(0, 0, 0, 0.87)',
                    fontSize: '0.875rem',
                  },
                  '& .MuiInputBase-input::placeholder': {
                    color: 'rgba(0, 0, 0, 0.4)',
                    opacity: 1,
                  },
                }}
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.main', color: 'white' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 600, width: 56 }}>Item #</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 600 }}>Description</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 600, width: 80 }} align="right">QTY</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 600, width: 72 }}>UOM</TableCell>
                    <TableCell sx={{ color: 'white', width: 48 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell sx={{ width: 56, verticalAlign: 'middle' }}>
                        <TextField
                          size="small"
                          type="number"
                          value={it.itemNo || ''}
                          onChange={(e) => updateItem(it.id, 'itemNo', parseInt(e.target.value, 10) || 0)}
                          inputProps={{ min: 0 }}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'middle' }}>
                        <TextField
                          size="small"
                          value={it.description}
                          onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                          placeholder="Description"
                          fullWidth
                        />
                      </TableCell>
                      <TableCell sx={{ width: 80, verticalAlign: 'middle' }} align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={it.delivered || ''}
                          onChange={(e) => updateItem(it.id, 'delivered', parseInt(e.target.value, 10) || 0)}
                          inputProps={{ min: 0 }}
                          sx={{ width: 56 }}
                        />
                      </TableCell>
                      <TableCell sx={{ width: 72, verticalAlign: 'middle' }}>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={it.unit || ''}
                            onChange={(e) => updateItem(it.id, 'unit', e.target.value)}
                            displayEmpty
                            sx={{
                              color: 'rgba(0, 0, 0, 0.87)',
                              fontSize: '0.875rem',
                              minHeight: 40,
                            }}
                          >
                            <MenuItem value="">—</MenuItem>
                            {UOM_OPTIONS.filter((u) => u !== '').map((u) => (
                              <MenuItem key={u} value={u}>
                                {u}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={{ width: 48, verticalAlign: 'middle' }}>
                        <IconButton size="small" onClick={() => removeItem(it.id)} color="error" disabled={items.length <= 1}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            )}
            <Button startIcon={<AddIcon />} onClick={addItem} size="small" sx={{ mt: 1 }}>
              Add item
            </Button>
          </Box>

          <Box sx={{ width: { xs: '100%', md: 'calc(33.333% - 16px)' } }}>
            <TextField
              fullWidth
              size="small"
              label="Dispatched By – Name"
              value={dispatchedByName}
              onChange={(e) => setDispatchedByName(e.target.value)}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(33.333% - 16px)' } }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Dispatched By – Date"
              value={dispatchedByDate}
              onChange={(e) => setDispatchedByDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(33.333% - 16px)' } }}>
            <TextField
              fullWidth
              size="small"
              label="Received By – Name"
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(33.333% - 16px)' } }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Received By – Date"
              value={receivedByDate}
              onChange={(e) => setReceivedByDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 'calc(33.333% - 16px)' } }}>
            <TextField
              fullWidth
              size="small"
              label="Received By – Place"
              value={receivedByPlace}
              onChange={(e) => setReceivedByPlace(e.target.value)}
            />
          </Box>
          <Box sx={{ width: '100%', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<PictureAsPdfIcon />}
              onClick={exportToPDF}
              sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}
            >
              Generate Delivery Receipt (PDF)
            </Button>
            <Button
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={handleSaveDR}
              sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}
            >
              Save DR
            </Button>
            <Button
              variant="outlined"
              onClick={handleClearDR}
              sx={{ borderColor: '#666', color: '#666' }}
            >
              Clear (new DR)
            </Button>
          </Box>

          {filteredSavedList.length > 0 && (
            <Box sx={{ width: '100%', mt: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryIcon /> Saved delivery receipts{projectId !== '' ? ' (this project)' : ' (all)'}
              </Typography>
              {isPhone ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell sx={{ fontWeight: 600 }}>DR Number</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>PO</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Dispatch Date</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Saved</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSavedList.map((dr) => (
                      <TableRow key={dr.id}>
                        <TableCell>{dr.deliveryNoteNo || '—'}</TableCell>
                        <TableCell>{dr.poNumber || '—'}</TableCell>
                        <TableCell>{dr.despatchDate || '—'}</TableCell>
                        <TableCell>{new Date(dr.savedAt).toLocaleString()}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="text" onClick={() => handleLoadDR(dr)}>
                            Load
                          </Button>
                          {isAdmin && (
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteSavedDR(dr)}
                              color="error"
                              title="Delete (admin only)"
                            >
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
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default DeliveryPage;
