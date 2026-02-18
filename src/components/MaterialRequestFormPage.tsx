import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Send as SendIcon, Visibility as VisibilityIcon, FileDownload as FileDownloadIcon, PictureAsPdf as PictureAsPdfIcon, Upload as UploadIcon, Edit as EditIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { useAuth } from '../contexts/AuthContext';
import { ORDER_TRACKER_STORAGE_KEY, type OrderRecord, type OrderItem } from './OrderTrackerPage';
import OrderTrackerPage from './OrderTrackerPage';
import { SUPPLIERS_STORAGE_KEY, type Supplier } from './SuppliersPage';
import PdfPreviewDialog from './PdfPreviewDialog';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';
import { REPORT_COMPANIES, type ReportCompanyKey } from './ProjectDetails';

const STORAGE_KEY = 'materialRequests';
const PO_STORAGE_KEY = 'purchaseOrders';
const MRF_HEADER_BLUE = [44, 90, 160] as [number, number, number];

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
  projectPoNumber?: string;
  requestDate: string;
  dateNeeded?: string;
  requestedBy: string;
  deliveryLocation: string;
  items: MaterialRequestItem[];
  status: 'Draft' | 'Submitted';
  createdAt: string;
  reportCompany?: ReportCompanyKey;
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

/** Parse MRF number from requestNo "ProjectNo-MRF-#" */
const parseMRFNumber = (requestNo: string): number => {
  const match = requestNo.match(/-MRF-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

const MaterialRequestFormPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateNeeded, setDateNeeded] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>('IOCT');
  const [items, setItems] = useState<MaterialRequestItem[]>([
    { ...defaultItem, id: `item-${Date.now()}` },
  ]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewRequest, setViewRequest] = useState<MaterialRequest | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<POStub[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    const name = (user?.full_name?.trim() || user?.username || '').trim();
    if (name) setRequestedBy((prev) => (prev === '' ? name : prev));
  }, [user?.full_name, user?.username]);

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
    projectId && projectNo ? `${projectNo}-MRF-${nextMRFForProject}` : '';

  const editingRequest = editingRequestId ? requests.find((r) => r.id === editingRequestId) : null;
  const displayRequestNo = editingRequest ? editingRequest.requestNo : generatedRequestNo;

  const handleLoadForEdit = (r: MaterialRequest) => {
    setEditingRequestId(r.id);
    setProjectId(r.projectId ?? '');
    setRequestDate(r.requestDate);
    setDateNeeded(r.dateNeeded ?? '');
    setRequestedBy(r.requestedBy ?? '');
    setDeliveryLocation(r.deliveryLocation ?? '');
    setReportCompany(r.reportCompany ?? 'IOCT');
    setItems(
      r.items && r.items.length > 0
        ? r.items.map((i) => ({ ...i, id: i.id || `item-${Date.now()}-${Math.random()}` }))
        : [{ ...defaultItem, id: `item-${Date.now()}` }]
    );
    setMessage(null);
    setViewRequest(null);
  };

  const handleClearMRF = () => {
    setEditingRequestId(null);
    setProjectId('');
    setRequestDate(new Date().toISOString().slice(0, 10));
    setDateNeeded('');
    setRequestedBy('');
    setDeliveryLocation('');
    setReportCompany('IOCT');
    setItems([{ ...defaultItem, id: `item-${Date.now()}` }]);
    setMessage(null);
  };

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

  const exportToCSV = () => {
    const headers = ['Request No.', 'Project', 'Date', 'Requested By', 'Delivery Location', 'Status', 'No.', 'Item / Description', 'Part #', 'Brand', 'Qty', 'Unit', 'Notes'];
    const rows = requests.flatMap((r) =>
      (r.items && r.items.length > 0
        ? r.items.map((item, idx) => [
            r.requestNo,
            r.projectName,
            r.requestDate,
            r.requestedBy,
            r.deliveryLocation,
            r.status,
            idx + 1,
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.partNo || '',
            item.brand || '',
            item.quantity,
            item.unit || '',
            `"${(item.notes || '').replace(/"/g, '""')}"`,
          ])
        : [[r.requestNo, r.projectName, r.requestDate, r.requestedBy, r.deliveryLocation, r.status, '', '—', '', '', '', '', '']])
    );
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MaterialRequests_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportItemsTemplateCSV = () => {
    const headers = ['Item / Description', 'Part #', 'Brand', 'Qty', 'Unit', 'Notes'];
    const csv = headers.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = projectNo ? `${projectNo}-PR.csv` : 'Project-PR.csv';
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Parse full CSV text, handling multi-line quoted fields */
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let i = 0;
    let inQuotes = false;
    const flushField = () => {
      row.push(field);
      field = '';
    };
    const flushRow = () => {
      if (row.length > 0 || field) {
        if (field) flushField();
        rows.push(row);
        row = [];
      }
    };
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (c === '"') {
          inQuotes = false;
          i++;
        } else {
          field += c;
          i++;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
        } else if (c === ',' || c === '\n' || c === '\r') {
          if (c === ',') {
            flushField();
            i++;
          } else {
            flushRow();
            if (c === '\r' && text[i + 1] === '\n') i += 2;
            else i++;
          }
        } else {
          field += c;
          i++;
        }
      }
    }
    if (field || row.length > 0) {
      if (field) flushField();
      if (row.length > 0) rows.push(row);
    }
    return rows;
  };

  const importFromCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = (reader.result as string) || '';
        const rows = parseCSV(text);
        if (rows.length < 2) {
          setMessage({ type: 'error', text: 'CSV must have a header row and at least one data row.' });
          setTimeout(() => setMessage(null), 4000);
          return;
        }
        const headerRow = rows[0];
        const headers = headerRow.map((h) => String(h).replace(/^"|"$/g, '').trim().toLowerCase());
        const col = (name: string[]) => {
          const idx = headers.findIndex((h) => name.some((n) => h.includes(n)));
          return idx >= 0 ? idx : -1;
        };
        // Template order: Item/Description, Part #, Brand, Qty, Unit, Notes
        const isTemplateOrder =
          headers.length >= 6 &&
          (headers[0].includes('item') || headers[0].includes('description')) &&
          (headers[1].includes('part') || headers[1] === 'part #') &&
          (headers[2].includes('brand') || headers[2] === 'brand');
        const descCol = isTemplateOrder ? 0 : col(['description', 'item', 'item/description', 'item / description']);
        const partCol = isTemplateOrder ? 1 : headers.findIndex((h) => {
          const partTerms = ['part #', 'part no', 'partno', 'part number', 'p/n', 'part'];
          const hasPart = partTerms.some((t) => h.includes(t));
          const isBrandOnly = /^brand\s*$/i.test(h) || /^brand\s+name$/i.test(h);
          return hasPart && !isBrandOnly;
        });
        const brandCol = isTemplateOrder ? 2 : headers.findIndex((h) => {
          const hasBrand = h.includes('brand') || h.includes('manufacturer') || h.includes('maker');
          const hasPart = h.includes('part') || h.includes('part#') || h.includes('part no');
          return hasBrand && !hasPart;
        });
        const qtyCol = isTemplateOrder ? 3 : col(['qty', 'quantity', 'qty.', 'amount']);
        const unitCol = isTemplateOrder ? 4 : col(['unit', 'uom']);
        const notesCol = isTemplateOrder ? 5 : col(['notes', 'remarks']);

        if (descCol < 0 && partCol < 0) {
          setMessage({ type: 'error', text: 'CSV must have "Item/Description" or "Part #" column.' });
          setTimeout(() => setMessage(null), 4000);
          return;
        }

        const newItems: MaterialRequestItem[] = [];
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i];
          const get = (c: number) => (c >= 0 && cells[c] !== undefined ? String(cells[c]).replace(/^"|"$/g, '').trim() : '');
          const desc = descCol >= 0 ? get(descCol) : '';
          const part = partCol >= 0 ? get(partCol) : '';
          const brand = brandCol >= 0 ? get(brandCol) : '';
          const qtyVal = qtyCol >= 0 ? get(qtyCol) : '0';
          const qty = parseFloat(String(qtyVal).replace(/[^0-9.]/g, '')) || 0;
          const unit = unitCol >= 0 ? get(unitCol) : 'pcs';
          const notes = notesCol >= 0 ? get(notesCol) : '';
          if (!desc && !part) continue;
          newItems.push({
            id: `item-${Date.now()}-${i}`,
            description: desc,
            partNo: part,
            brand: brand,
            quantity: qty,
            unit: units.includes(unit) ? unit : 'pcs',
            notes,
          });
        }
        if (newItems.length === 0) {
          setMessage({ type: 'error', text: 'No valid rows found in CSV.' });
          setTimeout(() => setMessage(null), 4000);
          return;
        }
        setItems(newItems);
        setMessage({ type: 'success', text: `Imported ${newItems.length} items from CSV.` });
        setTimeout(() => setMessage(null), 3000);
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to parse CSV.' });
        setTimeout(() => setMessage(null), 4000);
      }
    };
    reader.readAsText(file);
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
    
    // Load ArialNarrow font (same as DR/PO)
    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');
    
    fontTitle();
    doc.setFontSize(14);
    doc.text('Material Request Form - Summary', 14, 15);
    fontBody();
    doc.setFontSize(10);
    autoTable(doc, {
      head: [['Request No.', 'Project', 'Date', 'Requested By', 'Delivery Location', 'Status']],
      body: requests.map((r) => [r.requestNo, r.projectName, r.requestDate, r.requestedBy, r.deliveryLocation, r.status]),
      startY: 22,
      margin: { left: 14 },
      styles: { fontSize: 10, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
      headStyles: { fillColor: MRF_HEADER_BLUE, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 10 },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    let finalY = docWithTable.lastAutoTable?.finalY ?? 22;
    if (finalY > 0) finalY += 6;
    fontTitle();
    doc.setFontSize(11);
    doc.text('Items (all requests)', 14, finalY + 4);
    fontBody();
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
      styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
      headStyles: { fillColor: MRF_HEADER_BLUE, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 8 },
    });
    doc.save(`MaterialRequests_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportViewRequestToPDF = async (r: MaterialRequest, preview = false): Promise<Blob | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 14;
    const rightX = pageWidth - margin;
    const poNumber = r.projectPoNumber ?? (r.projectId ? projects.find((p) => p.id === r.projectId)?.po_number : null) ?? '';
    const blank = (v: string) => (v || '').trim() || '';

    // Use reportCompany from request, default to IOCT
    const reportCompany: ReportCompanyKey = r.reportCompany ?? 'IOCT';

    // Load ArialNarrow font (same as DR/PO)
    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');

    // Load company logo (ACT or IOCT)
    let logoDataUrl: string | null = null;
    let logoW = 0;
    let logoH = 0;
    let y = 12;
    if (reportCompany === 'ACT') {
      try {
        const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
        logoDataUrl = await loadLogoTransparentBackground(logoUrl);
        logoW = ACT_LOGO_PDF_WIDTH;
        logoH = ACT_LOGO_PDF_HEIGHT;
      } catch (_) {}
    } else if (reportCompany === 'IOCT') {
      try {
        const { loadLogoTransparentBackground, IOCT_LOGO_PDF_WIDTH, IOCT_LOGO_PDF_HEIGHT } = await import('../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-ioct.png`;
        logoDataUrl = await loadLogoTransparentBackground(logoUrl);
        logoW = IOCT_LOGO_PDF_WIDTH;
        logoH = IOCT_LOGO_PDF_HEIGHT;
      } catch (_) {}
    }

    // Draw logo at top left if available
    if (logoDataUrl && logoW && logoH) {
      doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
      y += logoH + 4;
    }

    const leftTextY = logoDataUrl && logoW && logoH ? y : 15;
    fontTitle();
    doc.setFontSize(20);
    doc.text('Material Request', rightX, 15, { align: 'right' });
    fontBody();
    doc.setFontSize(10);
    doc.text(`Request No.: ${r.requestNo}`, rightX, 24, { align: 'right' });
    doc.text(`Date: ${r.requestDate}`, rightX, 30, { align: 'right' });

    doc.text(`Project: ${blank(r.projectName)}`, margin, leftTextY);
    doc.text(`PO No.: ${blank(poNumber)}`, margin, leftTextY + 7);
    doc.text(`Requested By: ${blank(r.requestedBy)}`, margin, leftTextY + 14);
    const body = (r.items && r.items.length > 0)
      ? r.items.map((item, idx) => [
          String(idx + 1),
          blank(item.description ?? ''),
          blank(item.partNo ?? ''),
          blank(item.brand ?? ''),
          String(item.quantity),
          blank(item.unit ?? ''),
          blank(item.notes ?? ''),
        ])
      : [['', 'No items', '', '', '', '', '']];
    const tableStartY = leftTextY + 21;
    autoTable(doc, {
      head: [['No.', 'Item / Description', 'Part #', 'Brand', 'Qty', 'Unit', 'Notes']],
      body,
      startY: tableStartY,
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      styles: { fontSize: 7, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
      headStyles: { fillColor: MRF_HEADER_BLUE, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 7 },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    const totalPages = doc.getNumberOfPages();
    const docNumber = `Doc. No.: ${r.requestNo}`;
    const footerY = pageHeight - 10;
    
    // Signature section at bottom of last page
    doc.setPage(totalPages);
    const sigY = footerY - 20;
    const preparedByName = (user?.full_name?.trim() || user?.username || user?.email || '').trim() || '—';
    const sigLineWidth = 50;
    const sigX = margin;
    
    fontBody();
    doc.setFontSize(9);
    doc.text('Prepared by:', sigX, sigY);
    doc.text(preparedByName, sigX, sigY + 6);
    doc.setDrawColor(180, 180, 180);
    doc.line(sigX, sigY + 8, sigX + sigLineWidth, sigY + 8);
    
    // Footer on all pages
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, rightX, footerY, { align: 'right' });
    }
    if (preview) return doc.output('blob') as Blob;
    doc.save(`${r.requestNo}.pdf`);
  };

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

  const handlePreviewMRF = async (r: MaterialRequest) => {
    const blob = await exportViewRequestToPDF(r, true);
    if (blob) {
      setPdfPreviewBlob(blob);
      setPdfPreviewTitle(`Material Request - ${r.requestNo}`);
      setPdfPreviewOpen(true);
    }
  };

  const handleClosePreview = () => {
    setPdfPreviewOpen(false);
    setPdfPreviewBlob(null);
    setPdfPreviewTitle('');
  };

  const handleSubmit = (asDraft: boolean) => {
    const pid = projectId === '' ? null : Number(projectId);
    if (pid == null || !projectNo) {
      setMessage({ type: 'error', text: 'Please select a project to generate Request No.' });
      return;
    }
    const isEditing = !!editingRequestId;
    const no = isEditing && editingRequest ? editingRequest.requestNo : generatedRequestNo;
    const req: MaterialRequest = {
      id: isEditing && editingRequest ? editingRequest.id : `req-${Date.now()}`,
      requestNo: no,
      projectId: pid,
      projectName: projectName || '',
      projectPoNumber: selectedProject?.po_number || undefined,
      requestDate: requestDate,
      dateNeeded: dateNeeded.trim() || undefined,
      requestedBy: requestedBy.trim() || '',
      deliveryLocation: deliveryLocation.trim() || '',
      items: items.map((i) => ({ ...i })),
      status: asDraft ? 'Draft' : 'Submitted',
      createdAt: isEditing && editingRequest ? editingRequest.createdAt : new Date().toISOString(),
      reportCompany: reportCompany,
    };
    const next = isEditing
      ? requests.map((r) => (r.id === editingRequestId ? req : r))
      : [req, ...requests];
    setRequests(next);
    saveStored(next);
    setEditingRequestId(null);

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
        const existingIdx = orders.findIndex((o) => o.materialRequestId === req.id);
        if (existingIdx >= 0) {
          orders[existingIdx] = order;
        } else {
          orders.unshift(order);
        }
        localStorage.setItem(ORDER_TRACKER_STORAGE_KEY, JSON.stringify(orders));
      } catch (_) {}
    }

    setMessage({ type: 'success', text: asDraft ? 'Saved as draft.' : isEditing ? 'Material request updated.' : 'Material request submitted and added to Order Tracker.' });
    setTimeout(() => setMessage(null), 3000);
    setProjectId('');
    setRequestDate(new Date().toISOString().slice(0, 10));
    setDateNeeded('');
    setRequestedBy('');
    setDeliveryLocation('');
    setItems([{ ...defaultItem, id: `item-${Date.now()}` }]);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'orders' ? 'orders' : 'requests';

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSearchParams(newValue === 1 ? { tab: 'orders' } : {});
  };

  if (tab === 'orders') {
    return (
      <Box>
        <Tabs value={1} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tab label="Requests" value={0} />
          <Tab label="Orders" value={1} />
        </Tabs>
        <OrderTrackerPage />
      </Box>
    );
  }

  return (
    <Box>
      <Tabs value={0} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tab label="Requests" value={0} />
        <Tab label="Orders" value={1} />
      </Tabs>
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
          {editingRequest ? 'Edit Request' : 'New Request'}
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Request No."
              value={displayRequestNo}
              InputProps={{ readOnly: true }}
              placeholder="Select a project to auto-generate"
              helperText="Format: ProjectNo-MRF-#"
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
          <Grid size={{ xs: 12, sm: 6 }}>
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
              type="date"
              label="Date need"
              value={dateNeeded}
              onChange={(e) => setDateNeeded(e.target.value)}
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

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 3, mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Items
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <input
              type="file"
              id="mrf-csv-import"
              accept=".csv"
              hidden
              onChange={importFromCSV}
            />
            <Button
              variant="outlined"
              size="small"
              component="label"
              htmlFor="mrf-csv-import"
              startIcon={<UploadIcon />}
            >
              Import from CSV
            </Button>
            <Button variant="outlined" size="small" startIcon={<FileDownloadIcon />} onClick={exportItemsTemplateCSV}>
              Download template
            </Button>
          </Box>
        </Box>
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
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => handleSubmit(true)}>
            Save as draft
          </Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={() => handleSubmit(false)} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
            Submit request
          </Button>
          <Button variant="outlined" onClick={handleClearMRF} sx={{ borderColor: '#666', color: '#666' }}>
            Clear (new request)
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Request history
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={exportToCSV}
              disabled={requests.length === 0}
            >
              Export to CSV
            </Button>
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
                        onClick={() => handleLoadForEdit(r)}
                        title="Load for edit"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => setViewRequest(r)}
                        title="View details"
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handlePreviewMRF(r)}
                        title="Preview PDF"
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => exportViewRequestToPDF(r).catch(console.error)}
                        title="Export to PDF"
                      >
                        <FileDownloadIcon fontSize="small" />
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
                  <Typography variant="body1" fontWeight={500}>{viewRequest.projectName || ''}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">PO No.</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.projectPoNumber ?? (viewRequest.projectId ? projects.find((p) => p.id === viewRequest.projectId)?.po_number : null) ?? ''}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.requestDate}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Date need</Typography>
                  <Typography variant="body1" fontWeight={500}>{viewRequest.dateNeeded || ''}</Typography>
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
            <>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => { handleLoadForEdit(viewRequest); setViewRequest(null); }}>
                Load for edit
              </Button>
              <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => handlePreviewMRF(viewRequest)} sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}>
                Preview PDF
              </Button>
              <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={() => exportViewRequestToPDF(viewRequest).catch(console.error)} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
                Export to PDF
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onClose={handleClosePreview}
        pdfBlob={pdfPreviewBlob}
        title={pdfPreviewTitle}
      />
    </Box>
  );
};

export default MaterialRequestFormPage;
