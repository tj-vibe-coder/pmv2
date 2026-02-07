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
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon, Save as SaveIcon, History as HistoryIcon } from '@mui/icons-material';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { useSearchParams } from 'react-router-dom';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { REPORT_COMPANIES, type ReportCompanyKey } from './ProjectDetails';
import { ORDER_TRACKER_STORAGE_KEY, type OrderRecord } from './OrderTrackerPage';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';

const REPORT_COMPANY_ADDRESS: Record<ReportCompanyKey, string> = {
  ACT: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
  IOCT: 'B63, L7 Dynamism Jubilation Enclave, Santo Niño, City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
};

const DR_HEADER_BLUE = [44, 90, 160] as [number, number, number];

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
  projectId: number | '';
  poNumber: string;
  shippingName: string;
  shippingAddress: string;
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

function loadOrdersFromTracker(): OrderRecord[] {
  try {
    const raw = localStorage.getItem(ORDER_TRACKER_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const loadImageAsDataUrl = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

/** Load logo and crop left edge to remove the vertical line in the image. */
const loadLogoCroppedLeft = (url: string, cropPx: number = 14): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const crop = Math.min(cropPx, Math.floor(w * 0.15));
      const outW = w - crop;
      if (outW <= 0) {
        resolve(img.src);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, crop, 0, outW, h, 0, 0, outW, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

const DeliveryPage: React.FC = () => {
  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>('ACT');
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [despatchDate, setDespatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryMethod, setDeliveryMethod] = useState('Physical');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [poNumber, setPoNumber] = useState('');
  const [shippingName, setShippingName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [invoiceSameAsShipping, setInvoiceSameAsShipping] = useState(true);
  const [invoiceName, setInvoiceName] = useState('');
  const [invoiceAddress, setInvoiceAddress] = useState('');
  const [items, setItems] = useState<DeliveryLineItem[]>(() => [emptyItem()]);
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

  // Prefill from Order when "Link to Order" is selected or URL has ?orderId= (optional ?itemIds=id1,id2 for selected items only)
  const applyOrderPrefill = (order: OrderRecord, projectList: Project[], selectedItemIds?: string[]) => {
    const pid = order.projectId ?? '';
    setProjectId(pid);
    const p = projectList.find((x) => x.id === Number(pid));
    const orderOrProjectPo = order.poNumber || (p?.po_number ?? '');
    const firstItemPo = order.items?.[0]?.poNumber;
    setPoNumber(orderOrProjectPo || (firstItemPo ?? ''));
    if (p) {
      setDeliveryNoteNo((prev) => (prev ? prev : `${p.project_no || p.item_no || p.id}-DR-001`));
      setShippingName(p.account_name || '');
      setShippingAddress(p.project_location || '');
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

  useEffect(() => {
    if (projectId === '' || linkedOrderId) return;
    const p = projects.find((x) => x.id === Number(projectId));
    if (p) {
      setDeliveryNoteNo((prev) => (prev ? prev : `${p.project_no || p.item_no || p.id}-DR-001`));
      if (!poNumber) setPoNumber(p.po_number || '');
      if (!shippingName) setShippingName(p.account_name || '');
      if (!shippingAddress) setShippingAddress(p.project_location || '');
    }
  }, [projectId, projects, poNumber, shippingName, shippingAddress, linkedOrderId]);

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

  const handleLoadDR = (dr: SavedDeliveryReceipt) => {
    setReportCompany(dr.reportCompany);
    setDeliveryNoteNo(dr.deliveryNoteNo);
    setDespatchDate(dr.despatchDate);
    setDeliveryMethod(dr.deliveryMethod);
    setProjectId(dr.projectId);
    setPoNumber(dr.poNumber);
    setShippingName(dr.shippingName);
    setShippingAddress(dr.shippingAddress);
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

  const handleLinkOrder = (orderId: string) => {
    setLinkedOrderId(orderId);
    if (orderId) {
      const order = orders.find((o) => o.id === orderId);
      if (order) applyOrderPrefill(order, projects);
    }
  };

  const shipName = shippingName.trim() || '—';
  const shipAddr = shippingAddress.trim() || '—';
  const invName = invoiceSameAsShipping ? shipName : (invoiceName.trim() || '—');
  const invAddr = invoiceSameAsShipping ? shipAddr : (invoiceAddress.trim() || '—');

  const exportToPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    let y = 14;
    const lineHeight = 5;
    const sectionGap = 5;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');

    const companyName = REPORT_COMPANIES[reportCompany];
    const companyAddress = REPORT_COMPANY_ADDRESS[reportCompany];

    // Header: logo + company left (logo first, then company below it), "Delivery Receipt" + details right
    const headerY = y;
    let leftY = headerY;
    if (reportCompany === 'ACT') {
      try {
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-advance-controle.png`;
        const logoDataUrl = await loadLogoCroppedLeft(logoUrl);
        const logoW = 12;
        const logoH = 10;
        doc.addImage(logoDataUrl, 'PNG', margin, headerY, logoW, logoH);
        leftY = headerY + logoH + 4;
      } catch (_) {}
    }
    fontTitle();
    doc.setFontSize(11);
    doc.text(companyName, margin, leftY + 4);
    fontBody();
    doc.setFontSize(8);
    const addrLines = doc.splitTextToSize(companyAddress, 75);
    doc.text(addrLines, margin, leftY + 4 + lineHeight);
    const leftHeaderBottom = leftY + 4 + lineHeight + addrLines.length * lineHeight;

    const rightX = 110;
    fontTitle();
    doc.setFontSize(14);
    doc.text('Delivery Receipt', rightX, y + 6);
    fontBody();
    doc.setFontSize(8);
    const detailLabels = ['DR Number', 'Dispatch Date', 'Delivery Method'];
    const detailValues = [
      deliveryNoteNo.trim() || '—',
      despatchDate || '—',
      deliveryMethod.trim() || 'Physical',
    ];
    let detailY = y + 12;
    for (let i = 0; i < detailLabels.length; i++) {
      doc.text(detailLabels[i], rightX, detailY + 0.5);
      doc.text(detailValues[i], rightX + 38, detailY + 0.5);
      detailY += 6;
    }
    y = Math.max(leftHeaderBottom, detailY) + sectionGap;

    // Address blocks: Shipping (left), Invoice (right)
    const blockWidth = (contentWidth - 8) / 2;
    const blockHeight = 26;
    doc.setFillColor(...DR_HEADER_BLUE);
    doc.rect(margin, y, blockWidth, 7, 'F');
    doc.rect(margin + blockWidth + 8, y, blockWidth, 7, 'F');
    doc.setTextColor(255, 255, 255);
    fontTitle();
    doc.setFontSize(9);
    doc.text('Shipping Address', margin + 3, y + 4.8);
    doc.text('Invoice Address', margin + blockWidth + 11, y + 4.8);
    doc.setTextColor(0, 0, 0);
    fontBody();
    doc.setFontSize(8);
    y += 7;
    const shipAddrLines = doc.splitTextToSize(`${shipName}\n${shipAddr}`, blockWidth - 6);
    doc.text(shipAddrLines, margin + 3, y + 4);
    const invAddrLines = doc.splitTextToSize(`${invName}\n${invAddr}`, blockWidth - 6);
    doc.text(invAddrLines, margin + blockWidth + 11, y + 4);
    y += blockHeight;

    // PO
    fontTitle();
    doc.setFontSize(10);
    doc.text(`PO: ${poNumber.trim() || '—'}`, margin, y + 4);
    fontBody();
    y += 10;

    // Items table (column widths sum to contentWidth 182): Item #, Description, QTY, UOM
    const tableCols = [12, 110, 28, 32];
    const headers = ['Item #', 'Description', 'QTY', 'UOM'];
    const bodyRows = items.map((it) => [
      String(it.itemNo),
      it.description.trim() || '—',
      String(Number(it.delivered) || 0),
      it.unit.trim() || '—',
    ]);
    autoTable(doc, {
      head: [headers],
      body: bodyRows,
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      columnStyles: {
        0: { cellWidth: tableCols[0] },
        1: { cellWidth: tableCols[1] },
        2: { cellWidth: tableCols[2] },
        3: { cellWidth: tableCols[3] },
      },
      styles: { fontSize: 6, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
      headStyles: { fillColor: DR_HEADER_BLUE, textColor: [255, 255, 255], fontStyle: 'bold', font: 'helvetica', fontSize: 6 },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    const tableEndY = docWithTable.lastAutoTable?.finalY ?? y;

    // Dispatched By / Received By always in lower position (fixed at bottom so table can have up to 20+ items)
    const sigBlockHeight = 50;
    const footerMargin = 12;
    if (tableEndY + sigBlockHeight > pageHeight - footerMargin) {
      doc.addPage();
    }
    y = pageHeight - sigBlockHeight - footerMargin;

    const sigLeftX = margin;
    const sigRightX = margin + 95;
    const sigLineW = 52;
    fontTitle();
    doc.setFontSize(10);
    doc.text('Dispatched By', sigLeftX, y + 4);
    doc.text('Received By', sigRightX, y + 4);
    fontBody();
    doc.setFontSize(8);
    y += 7;
    doc.text('Name:', sigLeftX, y + 4);
    if (dispatchedByName) doc.text(dispatchedByName, sigLeftX + 22, y + 4);
    doc.setDrawColor(180, 180, 180);
    doc.line(sigLeftX + 20, y + 6, sigLeftX + 20 + sigLineW, y + 6);
    doc.text('Name:', sigRightX, y + 4);
    if (receivedByName) doc.text(receivedByName, sigRightX + 22, y + 4);
    doc.line(sigRightX + 20, y + 6, sigRightX + 20 + sigLineW, y + 6);
    y += lineHeight + 2;
    doc.text('Date:', sigLeftX, y + 4);
    if (dispatchedByDate) doc.text(dispatchedByDate, sigLeftX + 22, y + 4);
    doc.line(sigLeftX + 20, y + 6, sigLeftX + 20 + sigLineW, y + 6);
    doc.text('Date:', sigRightX, y + 4);
    if (receivedByDate) doc.text(receivedByDate, sigRightX + 22, y + 4);
    doc.line(sigRightX + 20, y + 6, sigRightX + 20 + sigLineW, y + 6);
    y += lineHeight + 2;
    doc.text('Place:', sigRightX, y + 4);
    if (receivedByPlace) doc.text(receivedByPlace, sigRightX + 22, y + 4);
    doc.line(sigRightX + 20, y + 6, sigRightX + 20 + sigLineW, y + 6);

    // Footer on all pages
    const docNumber = `Doc. No.: ${(deliveryNoteNo || 'DR').trim().replace(/\s/g, '-')}`;
    const totalPages = doc.getNumberOfPages();
    const footerY = pageHeight - 10;
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, 210 - margin, footerY, { align: 'right' });
    }

    const filename = `Delivery_Receipt_${(deliveryNoteNo || 'DR').replace(/\s/g, '_')}.pdf`;
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
                onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}
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
              placeholder="e.g. IOCT2602002-DR-001"
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
                onChange={(e) => setProjectId(String(e.target.value) === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">— None —</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
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
              Shipping Address
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Name"
              value={shippingName}
              onChange={(e) => setShippingName(e.target.value)}
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
            />
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
          </Box>

          {savedList.length > 0 && (
            <Box sx={{ width: '100%', mt: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryIcon /> Saved delivery receipts
              </Typography>
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
                    {savedList.map((dr) => (
                      <TableRow key={dr.id}>
                        <TableCell>{dr.deliveryNoteNo || '—'}</TableCell>
                        <TableCell>{dr.poNumber || '—'}</TableCell>
                        <TableCell>{dr.despatchDate || '—'}</TableCell>
                        <TableCell>{new Date(dr.savedAt).toLocaleString()}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="text" onClick={() => handleLoadDR(dr)}>
                            Load
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default DeliveryPage;
