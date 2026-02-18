import React, { useState, useEffect, useMemo } from 'react';
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
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Collapse,
  Grid,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, Visibility as VisibilityIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { MaterialRequest, MaterialRequestItem } from './MaterialRequestFormPage';
import { SUPPLIERS_STORAGE_KEY, normalizeSupplierName, type Supplier, type SupplierProduct } from './SuppliersPage';
import { ORDER_TRACKER_STORAGE_KEY, type OrderRecord, type OrderItem } from './OrderTrackerPage';
import dataService from '../services/dataService';
import type { Project } from '../types/Project';
import { REPORT_COMPANIES, type ReportCompanyKey } from './ProjectDetails';
import { useAuth } from '../contexts/AuthContext';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';

export const PURCHASE_ORDERS_STORAGE_KEY = 'purchaseOrders';

const MRF_STORAGE_KEY = 'materialRequests';

const REPORT_COMPANY_ADDRESS: Record<ReportCompanyKey, string> = {
  ACT: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
  IOCT: 'B63, L7 Dynamism Jubilation Enclave, Santo Niño, City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
};

const REPORT_COMPANY_CONTACT: Record<ReportCompanyKey, { attn?: string; email?: string; phone?: string }> = {
  ACT: { attn: 'Mark Chesner A. Cantuba', email: 'markchesner.actech@gmail.com', phone: '09958194250; 09947827005' },
  IOCT: { attn: 'Reuel Rivera', email: 'rj.rivera@iocontroltech.com', phone: '+63 977 015 2940' },
};

export interface PurchaseOrderItem {
  id: string;
  description: string;
  partNo: string;
  brand: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierAddress: string;
  supplierAttentionTo?: string;
  mrfId: string;
  mrfRequestNo: string;
  /** When PO is built from multiple MRFs, all source MRF ids and request numbers */
  mrfIds?: string[];
  mrfRequestNos?: string[];
  projectId: number | null;
  projectName: string;
  orderDate: string;
  expectedDelivery: string;
  requestedBy: string;
  projectNo?: string;
  quotationReference?: string;
  paymentTerms?: string;
  leadTime?: string;
  noVat?: boolean;
  discount?: number;
  approvedBy?: string;
  receivedByVendor?: string;
  reportCompany?: ReportCompanyKey;
  items: PurchaseOrderItem[];
  status: 'Draft' | 'Sent' | 'Confirmed';
  createdAt: string;
}

const loadMRFs = (): MaterialRequest[] => {
  try {
    const raw = localStorage.getItem(MRF_STORAGE_KEY);
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

const saveSuppliers = (list: Supplier[]) => {
  try {
    localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
};

/** Add PO items to supplier's products; update price if product exists (by partNo), else add new.
 * Prefer matching supplier by normalized name so items go to the correct supplier (e.g. not always ECA). */
function addPOItemsToSupplierProducts(supplierId: string, supplierName: string, items: PurchaseOrderItem[], orderDate?: string) {
  let suppliers = loadSuppliers();
  const poNameNorm = normalizeSupplierName(supplierName || '');
  let supplier = suppliers.find((s) => normalizeSupplierName(s.name) === poNameNorm);
  if (!supplier) {
    supplier = suppliers.find((s) => s.id === supplierId && normalizeSupplierName(s.name) === poNameNorm);
  }
  if (!supplier) {
    const newSupplier: Supplier = {
      id: `supplier-${Date.now()}`,
      name: supplierName.trim() || 'Unknown',
      contactName: '',
      email: '',
      phone: '',
      address: '',
      products: [],
      createdAt: new Date().toISOString(),
    };
    supplier = newSupplier;
    suppliers = [newSupplier, ...suppliers];
  }

  let updated = false;
  for (const item of items) {
    const up = Number(item.unitPrice ?? 0) || 0;
    if (up <= 0) continue;

    const partNo = (item.partNo || '').trim();
    const name = (item.description || item.partNo || '—').trim().slice(0, 80);
    const desc = (item.description || '').trim();
    const unit = (item.unit || 'pcs').trim();

    const priceDate = orderDate || new Date().toISOString().slice(0, 10);
    const brand = (item.brand || '').trim();
    const existing = partNo ? supplier.products.find((p) => (p.partNo || '').trim() === partNo) : undefined;
    if (existing) {
      existing.unitPrice = up;
      existing.priceDate = priceDate;
      existing.brand = brand || existing.brand;
      updated = true;
    } else {
      const newProduct: SupplierProduct = {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: name || '—',
        partNo: partNo || '',
        description: desc || '',
        brand: brand || '',
        unit: unit || 'pcs',
        unitPrice: up,
        priceDate,
      };
      supplier.products = [...(supplier.products || []), newProduct];
      updated = true;
    }
  }
  if (updated && supplier) {
    const sup = supplier;
    const updatedSupplier: Supplier = { ...sup, products: sup.products ?? [] };
    const next: Supplier[] = suppliers.map((s) => (s.id === sup.id ? updatedSupplier : s));
    saveSuppliers(next);
  }
}

/** Sync all POs to supplier products (for backfilling existing POs) */
export function syncAllPOsToSuppliers(): number {
  const pos = loadPOs();
  let totalAdded = 0;
  for (const po of pos) {
    const suppliersBefore = loadSuppliers();
    const countBefore = suppliersBefore.reduce((n, s) => n + (s.products?.length ?? 0), 0);
    addPOItemsToSupplierProducts(po.supplierId, po.supplierName, po.items || [], po.orderDate);
    const suppliersAfter = loadSuppliers();
    const countAfter = suppliersAfter.reduce((n, s) => n + (s.products?.length ?? 0), 0);
    totalAdded += Math.max(0, countAfter - countBefore);
  }
  return totalAdded;
}

const loadPOs = (): PurchaseOrder[] => {
  try {
    const raw = localStorage.getItem(PURCHASE_ORDERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const savePOs = (list: PurchaseOrder[]) => {
  try {
    localStorage.setItem(PURCHASE_ORDERS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
};

/** Get project number identifier (project_no, or item_no/id fallback) */
function getProjectNo(project: Project | undefined): string {
  if (!project) return 'GEN';
  return (project.project_no || String(project.item_no ?? project.id)).trim() || 'GEN';
}

/** Strip IOCT (or similar) prefix from project number for PO display (e.g. IOCT2602002 -> 2602002). */
function projectNoWithoutPrefix(projectNo: string): string {
  return (projectNo || '').replace(/^IOCT/i, '').trim() || projectNo || '';
}

/** Next sequential PO number: "{number}-{seq}" e.g. 2602002-001 (no IOCT, no PO). */
function getNextPONumber(projectId: number | null, existingPOs: PurchaseOrder[], projects: Project[]): string {
  const project = projectId != null ? projects.find((p) => p.id === projectId) : undefined;
  const projectNo = getProjectNo(project);
  const baseNo = projectNoWithoutPrefix(projectNo) || projectNo || 'GEN';
  // Global sequence: support "2602002-001", "IOCT2602002-PO-001", legacy formats
  const regex = /-(\d+)\s*$|-PO-(\d+)\s*$| - PO - (\d+)\s*$|(?: - PO-No\.\s*)(\d+)\s*$/;
  let maxSeq = 0;
  for (const po of existingPOs) {
    const m = po.poNumber.match(regex);
    if (m) {
      const seq = parseInt(m[1] || m[2] || m[3] || m[4], 10);
      if (!isNaN(seq)) maxSeq = Math.max(maxSeq, seq);
    }
  }
  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(3, '0');
  return `${baseNo}-${seqStr}`;
}

/** Optional mrfId prefixes item id so items from multiple MRFs stay unique (e.g. "mrf1-itemId"). */
const mrfItemToPOItem = (i: MaterialRequestItem, mrfId?: string): PurchaseOrderItem => {
  const rawId = i.id || Math.random().toString(36).slice(2);
  const id = mrfId ? `${mrfId}-${rawId}` : rawId;
  return {
    id,
    description: i.description || '',
    partNo: i.partNo || '',
    brand: i.brand || '',
    quantity: i.quantity ?? 0,
    unit: i.unit || '',
    unitPrice: 0,
    notes: i.notes || '',
  };
};

/** Find a supplier product that matches PO item by Part No. or Description; returns the product if found (for price lookup). */
function findSupplierProductMatch(supplier: Supplier | undefined, item: PurchaseOrderItem): SupplierProduct | undefined {
  if (!supplier?.products?.length) return undefined;
  const partNo = (item.partNo || '').trim().toLowerCase();
  const desc = (item.description || '').trim().toLowerCase();
  if (!partNo && !desc) return undefined;
  const byPart = partNo
    ? supplier.products.find((p) => (p.partNo || '').trim().toLowerCase() === partNo)
    : undefined;
  if (byPart) return byPart;
  const byDesc = desc
    ? supplier.products.find(
        (p) =>
          (p.name || '').toLowerCase().includes(desc) ||
          (p.description || '').toLowerCase().includes(desc) ||
          desc.includes((p.name || '').toLowerCase()) ||
          desc.includes((p.description || '').toLowerCase().slice(0, 80))
      )
    : undefined;
  return byDesc;
}

function lineTotal(item: PurchaseOrderItem): number {
  return (Number(item.quantity) || 0) * (Number(item.unitPrice ?? 0) || 0);
}

function poSubtotal(items: PurchaseOrderItem[]): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

/** Subtotal, discount, amount (VAT ex), VAT, grand total for a PO */
function poAmounts(po: { items: PurchaseOrderItem[]; noVat?: boolean; discount?: number }) {
  const subtotal = poSubtotal(po.items);
  const discount = po.discount ?? 0;
  const amountVatEx = Math.max(0, subtotal - discount);
  const vatRate = 0.12;
  const vatAmount = po.noVat ? 0 : amountVatEx * vatRate;
  const grandTotal = amountVatEx + vatAmount;
  return { subtotal, discount, amountVatEx, vatAmount, grandTotal };
}

const statusColor: Record<PurchaseOrder['status'], 'default' | 'primary' | 'success'> = {
  Draft: 'default',
  Sent: 'primary',
  Confirmed: 'success',
};

const PO_PDF_HEADER_BLUE = [44, 90, 160] as [number, number, number];

/** Parse sequence number from PO number (e.g. "2602002-001" -> "001", "IOCT2602002-PO-001" -> "001") */
function parsePOSeqNo(poNumber: string): string {
  const m =
    poNumber.match(/-(\d+)\s*$/) ||
    poNumber.match(/-PO-(\d+)\s*$/) ||
    poNumber.match(/ - PO - (\d+)\s*$/) ||
    poNumber.match(/PO-No\.\s*(\d+)/i);
  return m ? m[1] : poNumber;
}

/** Format amount in Philippine Peso (e.g. 28,928.57) */
function formatPhp(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format date as MM/DD/YYYY from YYYY-MM-DD */
function formatPoDate(isoDate: string): string {
  if (!isoDate || isoDate === '—') return '—';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Export Purchase Order as a formal, professional PDF suitable for corporate submission and audit.
 * Structure: Company header (with logo) → PO details → Supplier → Itemized table → Pricing summary → Terms → Approval section → Footer.
 */
async function exportPOToPDF(po: PurchaseOrder) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const contentWidth = 210 - margin * 2;
  const halfWidth = contentWidth / 2;
  const pageHeight = 297;
  let y = 12;
  const lineHeight = 5;
  const sectionGap = 5;
  const baseFontSize = 9;
  const titleFontSize = 12;
  const sectionFontSize = 10;
  const smallFontSize = 8;

  const reportCompany: ReportCompanyKey = po.reportCompany ?? 'IOCT';
  const companyName = REPORT_COMPANIES[reportCompany];
  const companyAddress = REPORT_COMPANY_ADDRESS[reportCompany];
  const noVatFlag = po.noVat === true;
  const { subtotal, discount, amountVatEx, vatAmount, grandTotal } = poAmounts(po);

  // Load ArialNarrow font (same as DR)
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

  // ─── 1. Our Company with logo (left) | PURCHASE ORDER block (right) ───
  if (logoDataUrl && logoW && logoH) {
    doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
    y += logoH + 4;
  }
  const companyContact = REPORT_COMPANY_CONTACT[reportCompany];
  fontTitle();
  doc.setFontSize(titleFontSize);
  doc.text(companyName, margin, y);
  fontBody();
  doc.setFontSize(baseFontSize);
  y += 5;
  const buyerAddrLines = doc.splitTextToSize(companyAddress, halfWidth - 4);
  doc.text(buyerAddrLines, margin, y);
  const leftBlockY = y + buyerAddrLines.length * lineHeight;

  // Display PO as "2602002-001" (number only, no IOCT, no PO)
  const seqNo = parsePOSeqNo(po.poNumber);
  const yy =
    po.orderDate && String(po.orderDate).length >= 4
      ? String(po.orderDate).slice(2, 4)
      : String(new Date().getFullYear()).slice(-2);
  const seqDisplay = `${yy}-${seqNo}`;
  const projectNoForDisplay =
    po.projectNo && po.projectNo.trim() && po.projectNo !== '—' ? po.projectNo.trim() : null;
  const baseNo = projectNoForDisplay ? projectNoWithoutPrefix(projectNoForDisplay) : null;
  const displayPoNumber =
    baseNo ? `${baseNo}-${seqNo}` : po.poNumber.replace(/\s*-\s*/g, '-').replace(/^IOCT/i, '').replace(/-PO-/i, '-');

  const rightX = 210 - margin;
  const bannerHeight = 6;
  const bannerTextSize = 9;
  const headerBlue = PO_PDF_HEADER_BLUE;

  // PO block: right side, all lines right-aligned (rightX already defined above)
  const poTitleY = 14;
  doc.setTextColor(headerBlue[0], headerBlue[1], headerBlue[2]);
  fontTitle();
  doc.setFontSize(14);
  doc.text('PURCHASE ORDER', rightX, poTitleY, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  fontBody();
  doc.setFontSize(baseFontSize);
  let rowY = poTitleY + 10;
  doc.text(`Date:${formatPoDate(po.orderDate || '')}`, rightX, rowY, { align: 'right' });
  rowY += 6;
  fontTitle();
  doc.setFontSize(11);
  doc.text(`P.O No.:${displayPoNumber}`, rightX, rowY, { align: 'right' });
  doc.setFontSize(baseFontSize);
  fontBody();
  y = Math.max(leftBlockY, rowY + 4) + sectionGap;

  // ─── 2. VENDOR (left) | SHIP TO (right) with blue banners ─────────────────
  doc.setFillColor(headerBlue[0], headerBlue[1], headerBlue[2]);
  doc.rect(margin, y, halfWidth - 2, bannerHeight, 'F');
  doc.rect(margin + halfWidth + 2, y, halfWidth - 2, bannerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  fontTitle();
  doc.setFontSize(bannerTextSize);
  doc.text('VENDOR', margin + 2, y + 4);
  doc.text('SHIP TO', margin + halfWidth + 4, y + 4);
  doc.setTextColor(0, 0, 0);
  fontBody();
  doc.setFontSize(baseFontSize);
  y += bannerHeight + 3;

  // Single-line spacing between each item (tight spacing, no extra gaps)
  const blockLineHeight = 4;
  const vendorX = margin + 2;
  const shipToX = margin + halfWidth + 4;
  const vendorContentY = y;

  // VENDOR: Attention, Company, Address, Email, Phone (one line each, single-line spacing)
  fontBody();
  doc.text(po.supplierAttentionTo ? `Attention: ${po.supplierAttentionTo}` : 'Attention: —', vendorX, y);
  y += blockLineHeight;
  fontTitle();
  doc.text(po.supplierName, vendorX, y);
  fontBody();
  y += blockLineHeight;
  if (po.supplierAddress) {
    const supLines = doc.splitTextToSize(po.supplierAddress, halfWidth - 8);
    supLines.forEach((line: string) => {
      doc.text(line, vendorX, y);
      y += blockLineHeight;
    });
  }
  if (po.supplierEmail) {
    doc.text(`Email: ${po.supplierEmail}`, vendorX, y);
    y += blockLineHeight;
  }
  if (po.supplierPhone) {
    doc.text(`Contact No.: ${po.supplierPhone}`, vendorX, y);
    y += blockLineHeight;
  }
  const vendorBlockBottom = y;

  // SHIP TO: Attention, Company, Address, Email, Phone (same spacing)
  y = vendorContentY;
  fontBody();
  if (companyContact.attn) {
    doc.text(`Attention: ${companyContact.attn}`, shipToX, y);
    y += blockLineHeight;
  }
  fontTitle();
  doc.text(companyName, shipToX, y);
  fontBody();
  y += blockLineHeight;
  const shipToAddrLines = doc.splitTextToSize(companyAddress, halfWidth - 8);
  shipToAddrLines.forEach((line: string) => {
    doc.text(line, shipToX, y);
    y += blockLineHeight;
  });
  if (companyContact.email) {
    doc.text(`Email: ${companyContact.email}`, shipToX, y);
    y += blockLineHeight;
  }
  if (companyContact.phone) {
    doc.text(`Contact No.: ${companyContact.phone}`, shipToX, y);
    y += blockLineHeight;
  }
  y = Math.max(vendorBlockBottom, y) + sectionGap;

  // Quotation Ref.
  fontBody();
  doc.setFontSize(smallFontSize);
  doc.text(`Quotation Ref.: ${po.quotationReference ?? '—'}`, margin, y);
  y += lineHeight + 2;

  // ─── 3. ITEMIZED ORDER TABLE ───────────────────────────────────────────
  // Order: No., Description, Part #, Brand, Qty, UOM, Unit Price, Amount. Qty/UOM wide enough so headers don't wrap. Total 182
  const tableCols = [14, 40, 37, 19, 10, 12, 24, 26];
  const totalColRight = margin + tableCols.reduce((a, b) => a + b, 0);
  const headers = ['No.', 'Description', 'Part #', 'Brand', 'Qty', 'UOM', 'Unit Price', 'Amount'];
  const bodyRows = po.items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const up = Number(it.unitPrice ?? 0) || 0;
    const amount = qty * up;
    return [
      String(idx + 1),
      (it.description || '—').slice(0, 58),
      (it.partNo || '—').slice(0, 38),
      (it.brand || '—').slice(0, 20),
      String(qty).slice(0, 4),
      (it.unit || '—').slice(0, 6),
      formatPhp(up),
      formatPhp(amount),
    ];
  });
  const tableFontSize = 6;
  autoTable(doc, {
    head: [headers],
    body: bodyRows,
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    columnStyles: {
      0: { cellWidth: tableCols[0], halign: 'center', overflow: 'linebreak' },
      1: { cellWidth: tableCols[1], halign: 'left', overflow: 'linebreak' },
      2: { cellWidth: tableCols[2], halign: 'left', overflow: 'linebreak' },
      3: { cellWidth: tableCols[3], halign: 'right', overflow: 'ellipsize' },
      4: { cellWidth: tableCols[4], halign: 'right', overflow: 'ellipsize' },
      5: { cellWidth: tableCols[5], halign: 'right', overflow: 'ellipsize' },
      6: { cellWidth: tableCols[6], halign: 'right', overflow: 'linebreak' },
      7: { cellWidth: tableCols[7], halign: 'right', overflow: 'linebreak' },
    },
    styles: { fontSize: tableFontSize, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
    headStyles: {
      fillColor: PO_PDF_HEADER_BLUE,
      textColor: [255, 255, 255],
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: tableFontSize,
      halign: 'left',
      cellPadding: 2.5,
      minCellHeight: 8,
      overflow: 'linebreak',
    },
    bodyStyles: { cellPadding: 2, minCellHeight: 5 },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const rightAlignCols = [0, 3, 4, 5, 6, 7];
        data.cell.styles.halign = rightAlignCols.includes(data.column.index)
          ? (data.column.index === 0 ? 'center' : 'right')
          : 'left';
      }
    },
  });
  const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  y = (docWithTable.lastAutoTable?.finalY ?? y) + 4;

  // ─── 5. PRICING SUMMARY (labels beside amounts, all caps bold) ───────────
  const amountColWidth = 42;
  const labelColRight = totalColRight - amountColWidth;
  fontTitle();
  doc.setFontSize(baseFontSize);
  doc.text('SUBTOTAL (VAT EXCLUSIVE)', labelColRight, y, { align: 'right' });
  doc.text(`PHP ${formatPhp(subtotal)}`, totalColRight, y, { align: 'right' });
  y += lineHeight;
  if (discount > 0) {
    doc.text('DISCOUNT', labelColRight, y, { align: 'right' });
    doc.text(`PHP ${formatPhp(discount)}`, totalColRight, y, { align: 'right' });
    y += lineHeight;
    doc.text('AMOUNT (VAT EXCLUSIVE)', labelColRight, y, { align: 'right' });
    doc.text(`PHP ${formatPhp(amountVatEx)}`, totalColRight, y, { align: 'right' });
    y += lineHeight;
  }
  if (!noVatFlag) {
    doc.text('12% VAT', labelColRight, y, { align: 'right' });
    doc.text(`PHP ${formatPhp(vatAmount)}`, totalColRight, y, { align: 'right' });
    y += lineHeight;
  }
  doc.text(noVatFlag ? 'GRAND TOTAL' : 'GRAND TOTAL (VAT INCLUSIVE)', labelColRight, y, { align: 'right' });
  doc.text(`PHP ${formatPhp(grandTotal)}`, totalColRight, y, { align: 'right' });
  fontBody();
  y += sectionGap + 4;

  // Footer on page 1
  const footerY = pageHeight - 12;
  const totalPages = 2;
  const footerBase = `${companyName}  |  PO: ${displayPoNumber}  |  Seq: ${seqDisplay}`;
  fontBody();
  doc.setFontSize(smallFontSize);
  doc.text(`${footerBase}  |  Page 1 of ${totalPages}`, margin, footerY);

  // ─── 6. TERMS AND CONDITIONS (page 2) ───────────────────────────────────
  doc.addPage();
  y = 12;
  fontTitle();
  doc.setFontSize(sectionFontSize);
  doc.text('Terms and Conditions', margin, y);
  fontBody();
  doc.setFontSize(baseFontSize);
  y += 5;
  fontBody();
  doc.text(`Payment Terms: ${po.paymentTerms ?? 'One hundred (100) days, PDC'}`, margin, y);
  y += lineHeight;
  doc.text(`Delivery / Lead Time: ${po.leadTime ?? 'Three (3) days'}`, margin, y);
  y += lineHeight * 2;
  const termsSections: { title: string; text: string }[] = [
    {
      title: 'Scope',
      text: 'The Supplier shall supply the goods and/or services in accordance with the specifications, quantities, prices, and delivery requirements stated in this Purchase Order ("PO").',
    },
    {
      title: 'Price and Taxes',
      text: 'Prices are firm and inclusive of all applicable taxes, duties, and charges, unless otherwise stated in writing. The Supplier shall issue official receipts and tax invoices in compliance with Philippine tax regulations.',
    },
    {
      title: 'Payment Terms',
      text: 'Payment shall be made in accordance with the payment terms stated in this PO, subject to receipt and acceptance of the goods and/or services and complete submission of required documents.',
    },
    {
      title: 'Delivery',
      text: "The Supplier shall deliver the goods and/or complete the services within the delivery lead time specified in the Supplier's offer and this PO. Any delay must be reported in writing and approved by the Buyer.",
    },
    {
      title: 'Inspection and Acceptance',
      text: 'All deliveries are subject to inspection and acceptance by the Buyer. The Buyer reserves the right to reject non-conforming goods or services without prejudice to other remedies.',
    },
    {
      title: 'Documentation',
      text: "The PO number must appear on all invoices, delivery receipts, and related documents. Original documents shall be submitted to the Buyer's Procurement Department for payment processing.",
    },
    {
      title: 'Warranty and Compliance',
      text: 'The Supplier warrants that the goods and/or services comply with agreed specifications and applicable Philippine laws and regulations.',
    },
    {
      title: 'Termination',
      text: 'The Buyer may cancel or terminate this PO, in whole or in part, for Supplier default, non-compliance, or failure to meet delivery requirements.',
    },
    {
      title: 'Acceptance of Terms',
      text: 'Acceptance of this PO constitutes agreement to all terms and conditions herein. Any Supplier terms inconsistent with this PO shall not apply unless expressly agreed in writing by the Buyer.',
    },
  ];
  termsSections.forEach(({ title, text }) => {
    fontTitle();
    doc.text(title, margin, y);
    y += lineHeight;
    fontBody();
    const textLines = doc.splitTextToSize(text, contentWidth);
    doc.text(textLines, margin, y);
    y += textLines.length * lineHeight + lineHeight;
  });
  y += sectionGap;

  // ─── 7. IMPORTANT NOTES ───────────────────────────────────────────────
  fontTitle();
  doc.setFontSize(sectionFontSize);
  doc.text('Important Notes', margin, y);
  fontBody();
  doc.setFontSize(baseFontSize);
  y += 5;
  const importantNotes = [
    "The Purchase Order (P.O.) number shall appear on all documents pertaining to this Purchase Order.",
    "Original invoices and supporting documents, including Delivery Receipts or Completion Reports (if applicable), shall be submitted to the Procurement Department for payment processing.",
    "The Seller agrees to sell and deliver the goods and/or services strictly in accordance with the terms and conditions of this Purchase Order.",
  ];
  const importantLines: string[] = [];
  importantNotes.forEach((text, i) => {
    importantLines.push(...doc.splitTextToSize(`${i + 1}. ${text}`, contentWidth));
  });
  doc.text(importantLines, margin, y);
  y += importantLines.length * lineHeight + sectionGap;

  // ─── 8. APPROVAL AND ACKNOWLEDGMENT (no underline) ───────────────────
  y += 4;
  const sigY = y + 6;
  fontTitle();
  doc.setFontSize(baseFontSize);
  doc.text('Authorised by (Buyer):', margin, y);
  doc.text('Acknowledged by (Supplier):', margin + 95, y);
  fontBody();
  fontBody();
  doc.text(po.approvedBy?.trim() || '', margin, sigY);
  doc.text(po.receivedByVendor?.trim() || '', margin + 95, sigY);
  y = sigY + sectionGap + 6;

  // Footer on page 2
  fontBody();
  doc.setFontSize(smallFontSize);
  doc.text(`${footerBase}  |  Page 2 of ${totalPages}`, margin, footerY);

  doc.save(`PO_${po.poNumber.replace(/\s/g, '_')}.pdf`);
}

const PurchaseOrderPage: React.FC = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [mrfs, setMrfs] = useState<MaterialRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form state
  const [selectedMrfIds, setSelectedMrfIds] = useState<string[]>([]);
  const [addMrfId, setAddMrfId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [poNumber, setPoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [poStatus, setPoStatus] = useState<PurchaseOrder['status']>('Sent');
  const [quotationReference, setQuotationReference] = useState('');
  const [supplierAttentionTo, setSupplierAttentionTo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [leadTime, setLeadTime] = useState('');
  const [noVat, setNoVat] = useState(false);
  const [createDiscount, setCreateDiscount] = useState(0);
  const [approvedBy, setApprovedBy] = useState('');
  const [receivedByVendor, setReceivedByVendor] = useState('');
  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>('IOCT');
  const [createDialogItems, setCreateDialogItems] = useState<PurchaseOrderItem[]>([]);
  const { user: currentUser } = useAuth();

  /** Composite ids of items already in any existing PO (to avoid double-order in new PO) */
  const alreadyInPoIds = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((po) => po.items.forEach((item) => set.add(item.id)));
    return set;
  }, [orders]);

  const toggleCreateDialogItem = (mrfItem: MaterialRequestItem, mrfId: string) => {
    const compositeId = `${mrfId}-${mrfItem.id || ''}`;
    const exists = createDialogItems.some((i) => i.id === compositeId);
    if (exists) {
      setCreateDialogItems((prev) => prev.filter((i) => i.id !== compositeId));
    } else {
      setCreateDialogItems((prev) => [...prev, mrfItemToPOItem(mrfItem, mrfId)]);
    }
  };

  const handleAddMRF = () => {
    if (!addMrfId || selectedMrfIds.includes(addMrfId)) return;
    const mrf = mrfs.find((m) => m.id === addMrfId);
    if (!mrf) return;
    setSelectedMrfIds((prev) => [...prev, addMrfId]);
    setCreateDialogItems((prev) => {
      const toAdd = mrf.items
        .filter((mrfItem) => !alreadyInPoIds.has(`${mrf.id}-${mrfItem.id || ''}`))
        .map((mrfItem) => mrfItemToPOItem(mrfItem, mrf.id));
      return [...prev, ...toAdd];
    });
    setAddMrfId('');
  };

  const handleRemoveMRF = (mrfId: string) => {
    setSelectedMrfIds((prev) => prev.filter((id) => id !== mrfId));
    setCreateDialogItems((prev) => prev.filter((i) => !i.id.startsWith(`${mrfId}-`)));
  };

  useEffect(() => {
    setOrders(loadPOs());
    setMrfs(loadMRFs());
    setSuppliers(loadSuppliers());
    dataService.getProjects().then(setProjects);
  }, []);

  // When MRFs are selected, suggest next PO number from first MRF's project
  useEffect(() => {
    if (!createOpen || selectedMrfIds.length === 0) return;
    const firstMrf = mrfs.find((m) => m.id === selectedMrfIds[0]);
    if (firstMrf) setPoNumber(getNextPONumber(firstMrf.projectId, orders, projects));
  }, [createOpen, selectedMrfIds, orders, mrfs, projects]);

  // When supplier or MRF list changes, keep only included items that still belong to current supplier filter
  useEffect(() => {
    if (!createOpen) return;
    const allowedIds = new Set<string>();
    selectedMrfIds.forEach((mrfId) => {
      const mrf = mrfs.find((m) => m.id === mrfId);
      if (!mrf) return;
      mrf.items.forEach((mrfItem) => {
        if (
          !selectedSupplierId ||
          !mrfItem.supplierId ||
          mrfItem.supplierId === selectedSupplierId
        ) {
          allowedIds.add(`${mrfId}-${mrfItem.id || ''}`);
        }
      });
    });
    setCreateDialogItems((prev) => prev.filter((i) => allowedIds.has(i.id)));
  }, [createOpen, selectedSupplierId, selectedMrfIds, mrfs]);

  // When supplier is selected, prefill Attention to and Payment Terms from supplier
  useEffect(() => {
    if (!createOpen || !selectedSupplierId) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    if (sup) {
      setSupplierAttentionTo(sup.contactName || '');
      setPaymentTerms(sup.paymentTerms || '');
    }
  }, [createOpen, selectedSupplierId, suppliers]);

  // When supplier or items change: if a PO item matches a product in supplier data (Part No. or Description), fetch price (user can still modify)
  useEffect(() => {
    if (!createOpen || !selectedSupplierId || createDialogItems.length === 0) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    if (!sup) return;
    setCreateDialogItems((prev) => {
      const next = prev.map((item) => {
        const match = findSupplierProductMatch(sup, item);
        const newPrice = match?.unitPrice != null ? match.unitPrice : item.unitPrice;
        if (newPrice === item.unitPrice) return item;
        return { ...item, unitPrice: newPrice ?? 0 };
      });
      const changed = next.some((it, i) => it.unitPrice !== prev[i].unitPrice);
      return changed ? next : prev;
    });
  }, [createOpen, selectedSupplierId, suppliers, createDialogItems.length]);

  const submittedMRFs = mrfs.filter((m) => m.status === 'Submitted');
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const firstMRF = selectedMrfIds.length > 0 ? mrfs.find((m) => m.id === selectedMrfIds[0]) : undefined;
  const combinedItemsAll: { mrfId: string; mrfRequestNo: string; mrfItem: MaterialRequestItem; compositeId: string }[] = selectedMrfIds.flatMap((mrfId) => {
    const mrf = mrfs.find((m) => m.id === mrfId);
    if (!mrf) return [];
    return mrf.items.map((mrfItem) => ({
      mrfId,
      mrfRequestNo: mrf.requestNo,
      mrfItem,
      compositeId: `${mrfId}-${mrfItem.id || ''}`,
    }));
  });
  // When a supplier is selected, show only items assigned to that supplier or unassigned (no supplier on item)
  const combinedItems =
    selectedSupplierId && selectedSupplier
      ? combinedItemsAll.filter(
          (row) => !row.mrfItem.supplierId || row.mrfItem.supplierId === selectedSupplierId
        )
      : combinedItemsAll;

  const persist = (next: PurchaseOrder[]) => {
    setOrders(next);
    savePOs(next);
  };

  const handleOpenCreate = () => {
    setSelectedMrfIds([]);
    setAddMrfId('');
    setSelectedSupplierId('');
    setPoNumber('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery('');
    setPoStatus('Sent');
    setQuotationReference('');
    setSupplierAttentionTo('');
    setPaymentTerms('');
    setLeadTime('');
    setNoVat(false);
    setCreateDiscount(0);
    setApprovedBy('');
    setReceivedByVendor('');
    setReportCompany('IOCT');
    setCreateDialogItems([]);
    setCreateOpen(true);
  };

  const updateCreateItemUnitPrice = (itemId: string, unitPrice: number) => {
    setCreateDialogItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, unitPrice } : i))
    );
  };

  const handleCreatePO = () => {
    if (!firstMRF || !selectedSupplier || selectedMrfIds.length === 0) return;
    const finalPoNumber = poNumber.trim() || getNextPONumber(firstMRF.projectId, orders, projects);
    const project = firstMRF.projectId != null ? projects.find((p) => p.id === firstMRF.projectId) : undefined;
    const projectNo = getProjectNo(project);
    const po: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: finalPoNumber,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplierEmail: selectedSupplier.email || '',
      supplierPhone: selectedSupplier.phone || '',
      supplierAddress: selectedSupplier.address || '',
      supplierAttentionTo: supplierAttentionTo.trim() || undefined,
      mrfId: firstMRF.id,
      mrfRequestNo: firstMRF.requestNo,
      mrfIds: selectedMrfIds.length > 1 ? selectedMrfIds : undefined,
      mrfRequestNos: selectedMrfIds.length > 1 ? selectedMrfIds.map((id) => mrfs.find((m) => m.id === id)?.requestNo ?? '') : undefined,
      projectId: firstMRF.projectId,
      projectNo,
      projectName: firstMRF.projectName || '—',
      orderDate,
      expectedDelivery: expectedDelivery.trim() || '—',
      requestedBy: selectedMrfIds.length === 1
        ? (firstMRF.requestedBy?.trim() || (currentUser?.full_name?.trim() || currentUser?.username || '') || '—')
        : 'Multiple',
      quotationReference: quotationReference.trim(),
      paymentTerms: paymentTerms.trim() || undefined,
      leadTime: leadTime.trim() || undefined,
      noVat,
      discount: createDiscount > 0 ? createDiscount : undefined,
      approvedBy: approvedBy.trim(),
      receivedByVendor: receivedByVendor.trim(),
      reportCompany,
      items: createDialogItems,
      status: poStatus,
      createdAt: new Date().toISOString(),
    };
    persist([po, ...orders]);
    addPOItemsToSupplierProducts(po.supplierId, po.supplierName, createDialogItems, po.orderDate);
    setCreateOpen(false);
  };

  const handleDeletePO = (id: string) => {
    if (!window.confirm('Delete this Purchase Order?')) return;
    persist(orders.filter((o) => o.id !== id));
    if (viewPO?.id === id) setViewPO(null);
    if (editingPO?.id === id) setEditingPO(null);
    if (expandedId === id) setExpandedId(null);
  };

  const handleOpenEdit = (po: PurchaseOrder) => {
    const copy = JSON.parse(JSON.stringify(po)) as PurchaseOrder;
    const fullName = (currentUser?.full_name?.trim() || currentUser?.username || '').trim();
    if (fullName && (!copy.requestedBy || copy.requestedBy === '—')) copy.requestedBy = fullName;
    setEditingPO(copy);
  };

  const handleSaveEdit = () => {
    if (!editingPO) return;
    persist(orders.map((o) => (o.id === editingPO.id ? editingPO : o)));
    if (viewPO?.id === editingPO.id) setViewPO(editingPO);
    setEditingPO(null);
  };

  const updateEditPO = (patch: Partial<PurchaseOrder>) => {
    setEditingPO((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const updateEditItem = (itemId: string, patch: Partial<PurchaseOrderItem>) => {
    setEditingPO((prev) => {
      if (!prev) return null;
      return { ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) };
    });
  };

  const addEditItem = () => {
    setEditingPO((prev) => {
      if (!prev) return null;
      const newItem: PurchaseOrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: '',
        partNo: '',
        brand: '',
        quantity: 0,
        unit: 'pcs',
        unitPrice: 0,
        notes: '',
      };
      return { ...prev, items: [...prev.items, newItem] };
    });
  };

  const removeEditItem = (itemId: string) => {
    setEditingPO((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      return { ...prev, items: prev.items.filter((i) => i.id !== itemId) };
    });
  };

  const handleStatusChange = (id: string, status: PurchaseOrder['status']) => {
    persist(orders.map((o) => (o.id === id ? { ...o, status } : o)));
    setViewPO((prev) => (prev?.id === id ? { ...prev, status } : prev));
  };

  /** Add this PO as an order in Order Tracker (linked to MRF) */
  const handleAddToOrderTracker = (po: PurchaseOrder) => {
    const orderItems: OrderItem[] = po.items.map((i) => ({
      id: i.id,
      description: i.description,
      partNo: i.partNo,
      quantity: i.quantity,
      unit: i.unit,
      notes: i.notes,
      status: 'Submitted',
    }));
    const itemsSummary = po.items
      .map((i) => `${i.description || ''} ${i.quantity} ${i.unit}`.trim())
      .join('; ') || '—';
    const order: OrderRecord = {
      id: `order-${po.id}`,
      orderNo: po.mrfRequestNo,
      poNumber: po.poNumber,
      supplier: po.supplierName,
      projectId: po.projectId,
      projectName: po.projectName,
      orderDate: po.orderDate,
      expectedDelivery: po.expectedDelivery,
      status: 'Submitted',
      itemsSummary,
      items: orderItems,
      materialRequestId: po.mrfId,
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(ORDER_TRACKER_STORAGE_KEY);
      const list: OrderRecord[] = raw ? JSON.parse(raw) : [];
      if (list.some((o) => o.id === order.id)) {
        window.alert('An order from this PO already exists in Order Tracker.');
        return;
      }
      list.unshift(order);
      localStorage.setItem(ORDER_TRACKER_STORAGE_KEY, JSON.stringify(list));
      window.alert('Added to Order Tracker.');
    } catch (_) {
      window.alert('Failed to add to Order Tracker.');
    }
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#2c5aa0', mb: 2 }}>
        Purchase Order
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create purchase orders to suppliers based on Material Requests (MRF).
      </Typography>

      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={handleOpenCreate}
        sx={{ mb: 2, bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}
      >
        Create PO from MRF
      </Button>

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ width: 48, color: 'white' }} />
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>PO Number</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Supplier</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>MRF Ref</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Project</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Order Date</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Status</TableCell>
                <TableCell align="center" sx={{ color: 'white', fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No purchase orders yet. Click &quot;Create PO from MRF&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((po) => (
                  <React.Fragment key={po.id}>
                    <TableRow hover>
                      <TableCell sx={{ width: 48, py: 0.5 }}>
                        <IconButton size="small" onClick={() => toggleExpand(po.id)} aria-label={expandedId === po.id ? 'Collapse' : 'Expand'}>
                          {expandedId === po.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{po.poNumber}</TableCell>
                      <TableCell>{po.supplierName}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {po.mrfRequestNos && po.mrfRequestNos.length > 1 ? po.mrfRequestNos.join(', ') : po.mrfRequestNo}
                      </TableCell>
                      <TableCell>{po.projectName}</TableCell>
                      <TableCell>{po.orderDate}</TableCell>
                      <TableCell>
                        <Chip label={po.status} size="small" color={statusColor[po.status]} variant="outlined" />
                      </TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={() => setViewPO(po)} title="View details">
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleOpenEdit(po)} title="Edit PO">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => exportPOToPDF(po)} title="Export to PDF" sx={{ color: '#c62828' }}>
                          <PictureAsPdfIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeletePO(po.id)} color="error" title="Delete PO">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={8} sx={{ py: 0, borderBottom: expandedId === po.id ? '1px solid #e2e8f0' : 'none' }}>
                        <Collapse in={expandedId === po.id} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 2, bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                              MRF Ref: {po.mrfRequestNos && po.mrfRequestNos.length > 1 ? po.mrfRequestNos.join(', ') : po.mrfRequestNo}
                            </Typography>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                              Line items ({po.items.length})
                            </Typography>
                            <TableContainer>
                              <Table size="small" sx={{ '& .MuiTableCell-root': { borderColor: 'divider', fontSize: '0.75rem' } }}>
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Description</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Part #</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Qty</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Unit</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Unit Price</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Total</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {po.items.map((i) => (
                                    <TableRow key={i.id}>
                                      <TableCell>{i.description || '—'}</TableCell>
                                      <TableCell>{i.partNo || '—'}</TableCell>
                                      <TableCell align="right">{i.quantity}</TableCell>
                                      <TableCell>{i.unit || '—'}</TableCell>
                                      <TableCell align="right">{Number(i.unitPrice ?? 0).toFixed(2)}</TableCell>
                                      <TableCell align="right">{lineTotal(i).toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => exportPOToPDF(po)} sx={{ color: '#c62828', borderColor: '#c62828' }}>
                                Export to PDF
                              </Button>
                              <Button size="small" variant="outlined" onClick={() => handleAddToOrderTracker(po)}>
                                Add to Order Tracker
                              </Button>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create PO Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Create Purchase Order from MRF</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Supplier (PO to)</InputLabel>
              <Select
                value={selectedSupplierId}
                label="Supplier (PO to)"
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <MenuItem value="">— Select supplier —</MenuItem>
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
                {suppliers.length === 0 && (
                  <MenuItem value="" disabled>No suppliers. Add suppliers first.</MenuItem>
                )}
              </Select>
            </FormControl>
            <Typography variant="subtitle2" color="text.secondary">Source MRFs — add one or more; items for the selected supplier (or unassigned) will appear below</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel>Add MRF</InputLabel>
                <Select
                  value={addMrfId}
                  label="Add MRF"
                  onChange={(e) => setAddMrfId(e.target.value)}
                >
                  <MenuItem value="">— Select MRF to add —</MenuItem>
                  {submittedMRFs
                    .filter((m) => !selectedMrfIds.includes(m.id))
                    .map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.requestNo} — {m.projectName} ({m.requestDate})
                      </MenuItem>
                    ))}
                  {submittedMRFs.length === 0 && (
                    <MenuItem value="" disabled>No submitted MRFs. Submit an MRF first.</MenuItem>
                  )}
                </Select>
              </FormControl>
              <Button variant="outlined" size="small" onClick={handleAddMRF} disabled={!addMrfId}>
                Add MRF
              </Button>
            </Box>
            {selectedMrfIds.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedMrfIds.map((mrfId) => {
                  const mrf = mrfs.find((m) => m.id === mrfId);
                  return (
                    <Chip
                      key={mrfId}
                      label={mrf ? `${mrf.requestNo} — ${mrf.projectName}` : mrfId}
                      onDelete={() => handleRemoveMRF(mrfId)}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  );
                })}
              </Box>
            )}
            <TextField fullWidth size="small" label="Attention to (contact person)" value={supplierAttentionTo} onChange={(e) => setSupplierAttentionTo(e.target.value)} placeholder="Supplier contact person" />
            <TextField fullWidth size="small" label="Payment Terms (from supplier)" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 50% DP, 50% upon delivery" />
            <TextField fullWidth size="small" label="Lead time" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="e.g. 2-3 weeks" />
            <TextField fullWidth size="small" label="PO Number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. 2602002-001" helperText="Format: {number}-{seq} — number from project (no IOCT), seq is overall PO trace (001, 002, …)" />
            <TextField fullWidth size="small" label="Quotation Reference" value={quotationReference} onChange={(e) => setQuotationReference(e.target.value)} placeholder="e.g. Q-2024-001" />
            <TextField fullWidth size="small" type="date" label="Order Date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth size="small" type="date" label="Expected Delivery" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} InputLabelProps={{ shrink: true }} />
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={poStatus} label="Status" onChange={(e) => setPoStatus(e.target.value as PurchaseOrder['status'])}>
                <MenuItem value="Sent">Sent</MenuItem>
                <MenuItem value="Confirmed">Confirmed</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Issuing company (for PDF)</InputLabel>
              <Select value={reportCompany} label="Issuing company (for PDF)" onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}>
                <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
                <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel control={<Checkbox checked={noVat} onChange={(e) => setNoVat(e.target.checked)} />} label="No VAT" />
            <TextField fullWidth size="small" type="number" label="Discount (PHP)" value={createDiscount || ''} onChange={(e) => setCreateDiscount(parseFloat(e.target.value) || 0)} inputProps={{ min: 0, step: 0.01 }} placeholder="0" />
            <TextField fullWidth size="small" label="Approved by" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Name" />
            <TextField fullWidth size="small" label="Received by vendor" value={receivedByVendor} onChange={(e) => setReceivedByVendor(e.target.value)} placeholder="Vendor acknowledgment" />
            {combinedItems.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  {selectedSupplierId
                    ? `Items for ${selectedSupplier?.name ?? 'this supplier'} (and unassigned) — select which to include, then enter unit price`
                    : 'Items from MRF(s) — select a supplier above to see only items for that supplier, then include and enter unit price'}
                </Typography>
                <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.75rem' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Include</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Source MRF</TableCell>
                        <TableCell sx={{ minWidth: 120, fontWeight: 600, fontSize: '0.75rem' }}>For supplier</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Description</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Qty</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Unit</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Unit Price</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {combinedItems.map(({ mrfId, mrfRequestNo, mrfItem, compositeId }) => {
                        const poItem = createDialogItems.find((i) => i.id === compositeId);
                        const included = !!poItem;
                        return (
                          <TableRow key={compositeId}>
                            <TableCell padding="checkbox">
                              <Checkbox checked={included} onChange={() => toggleCreateDialogItem(mrfItem, mrfId)} size="small" />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{mrfRequestNo}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{mrfItem.supplierName || 'Any'}</TableCell>
                            <TableCell>{mrfItem.description || mrfItem.partNo || '—'}</TableCell>
                            <TableCell align="right">{mrfItem.quantity}</TableCell>
                            <TableCell>{mrfItem.unit || '—'}</TableCell>
                            <TableCell align="right">
                              {included ? (
                                <TextField type="number" size="small" value={poItem?.unitPrice ?? ''} onChange={(e) => updateCreateItemUnitPrice(compositeId, parseFloat(e.target.value) || 0)} inputProps={{ min: 0, step: 0.01 }} sx={{ width: 90 }} />
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell align="right">{included && poItem ? lineTotal(poItem).toFixed(2) : '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                {createDialogItems.length > 0 && (
                  <Box sx={{ mt: 0.5 }}>
                    {(() => {
                      const { subtotal, amountVatEx, vatAmount, grandTotal } = poAmounts({ items: createDialogItems, noVat, discount: createDiscount });
                      return (
                        <Typography variant="caption" color="text.secondary">
                          Subtotal: {subtotal.toFixed(2)}
                          {createDiscount > 0 && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              {` · Discount: ${createDiscount.toFixed(2)} · Amount (VAT EX): ${amountVatEx.toFixed(2)}`}
                            </Typography>
                          )}
                          {!noVat && ` · 12% VAT: ${vatAmount.toFixed(2)} · Total: ${grandTotal.toFixed(2)}`}
                          {noVat && ` · Total: ${grandTotal.toFixed(2)}`}
                        </Typography>
                      );
                    })()}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreatePO}
            disabled={selectedMrfIds.length === 0 || !selectedSupplierId || createDialogItems.length === 0}
            sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}
          >
            Create PO
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit PO Dialog */}
      <Dialog open={!!editingPO} onClose={() => setEditingPO(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        {editingPO && (
          <>
            <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0' }}>Edit Purchase Order — {editingPO.poNumber}</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="PO Number" value={editingPO.poNumber} onChange={(e) => updateEditPO({ poNumber: e.target.value })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Supplier</InputLabel>
                    <Select
                      value={editingPO.supplierId}
                      label="Supplier"
                      onChange={(e) => {
                        const sup = suppliers.find((s) => s.id === e.target.value);
                        if (sup) updateEditPO({ supplierId: sup.id, supplierName: sup.name, supplierEmail: sup.email || '', supplierPhone: sup.phone || '', supplierAddress: sup.address || '' });
                      }}
                    >
                      {suppliers.map((s) => (
                        <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Order date" type="date" value={editingPO.orderDate} onChange={(e) => updateEditPO({ orderDate: e.target.value })} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Expected delivery" type="date" value={editingPO.expectedDelivery} onChange={(e) => updateEditPO({ expectedDelivery: e.target.value })} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Requested by" value={editingPO.requestedBy} onChange={(e) => updateEditPO({ requestedBy: e.target.value })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Quotation reference" value={editingPO.quotationReference ?? ''} onChange={(e) => updateEditPO({ quotationReference: e.target.value || undefined })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Payment terms" value={editingPO.paymentTerms ?? ''} onChange={(e) => updateEditPO({ paymentTerms: e.target.value || undefined })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Lead time" value={editingPO.leadTime ?? ''} onChange={(e) => updateEditPO({ leadTime: e.target.value || undefined })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControlLabel control={<Checkbox checked={!!editingPO.noVat} onChange={(e) => updateEditPO({ noVat: e.target.checked })} />} label="No VAT" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" type="number" label="Discount" value={editingPO.discount ?? 0} onChange={(e) => updateEditPO({ discount: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.01 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Supplier attention to" value={editingPO.supplierAttentionTo ?? ''} onChange={(e) => updateEditPO({ supplierAttentionTo: e.target.value || undefined })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Approved by" value={editingPO.approvedBy ?? ''} onChange={(e) => updateEditPO({ approvedBy: e.target.value || undefined })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" label="Received by vendor" value={editingPO.receivedByVendor ?? ''} onChange={(e) => updateEditPO({ receivedByVendor: e.target.value || undefined })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Report company</InputLabel>
                    <Select value={editingPO.reportCompany ?? 'IOCT'} label="Report company" onChange={(e) => updateEditPO({ reportCompany: e.target.value as ReportCompanyKey })}>
                      <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
                      <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select value={editingPO.status} label="Status" onChange={(e) => updateEditPO({ status: e.target.value as PurchaseOrder['status'] })}>
                      <MenuItem value="Draft">Draft</MenuItem>
                      <MenuItem value="Sent">Sent</MenuItem>
                      <MenuItem value="Confirmed">Confirmed</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Line items</Typography>
              <TableContainer>
                <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.75rem' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Part #</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Brand</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Unit price</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
                      <TableCell width={48} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {editingPO.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell><TextField size="small" fullWidth value={i.description} onChange={(e) => updateEditItem(i.id, { description: e.target.value })} placeholder="Description" sx={{ '& .MuiInput-root': { fontSize: '0.75rem' } }} /></TableCell>
                        <TableCell><TextField size="small" fullWidth value={i.partNo} onChange={(e) => updateEditItem(i.id, { partNo: e.target.value })} placeholder="Part #" sx={{ '& .MuiInput-root': { fontSize: '0.75rem' } }} /></TableCell>
                        <TableCell><TextField size="small" fullWidth value={i.brand} onChange={(e) => updateEditItem(i.id, { brand: e.target.value })} placeholder="Brand" sx={{ '& .MuiInput-root': { fontSize: '0.75rem' } }} /></TableCell>
                        <TableCell><TextField size="small" type="number" value={i.quantity} onChange={(e) => updateEditItem(i.id, { quantity: parseInt(e.target.value, 10) || 0 })} inputProps={{ min: 0 }} sx={{ width: 70 }} /></TableCell>
                        <TableCell><TextField size="small" fullWidth value={i.unit} onChange={(e) => updateEditItem(i.id, { unit: e.target.value })} placeholder="pcs" sx={{ width: 64, '& .MuiInput-root': { fontSize: '0.75rem' } }} /></TableCell>
                        <TableCell><TextField size="small" type="number" value={i.unitPrice ?? ''} onChange={(e) => updateEditItem(i.id, { unitPrice: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.01 }} sx={{ width: 90 }} /></TableCell>
                        <TableCell><TextField size="small" fullWidth value={i.notes} onChange={(e) => updateEditItem(i.id, { notes: e.target.value })} placeholder="Notes" sx={{ '& .MuiInput-root': { fontSize: '0.75rem' } }} /></TableCell>
                        <TableCell><IconButton size="small" onClick={() => removeEditItem(i.id)} color="error" title="Remove line"><DeleteIcon fontSize="small" /></IconButton></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Button size="small" startIcon={<AddIcon />} onClick={addEditItem} sx={{ mt: 1 }}>Add line</Button>
              <Box sx={{ textAlign: 'right', mt: 1 }}>
                {(() => { const { grandTotal } = poAmounts(editingPO); return <Typography variant="body2" fontWeight={600}>Total: {grandTotal.toFixed(2)}</Typography>; })()}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #e2e8f0', p: 2 }}>
              <Button onClick={() => setEditingPO(null)}>Cancel</Button>
              <Button variant="contained" onClick={handleSaveEdit} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>Save</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* View PO Dialog */}
      <Dialog open={!!viewPO} onClose={() => setViewPO(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        {viewPO && (
          <>
            <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0' }}>
              Purchase Order — {viewPO.poNumber}
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Chip label={viewPO.status} size="small" color={statusColor[viewPO.status]} />
                <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => { setViewPO(null); handleOpenEdit(viewPO); }}>
                  Edit
                </Button>
                <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => exportPOToPDF(viewPO)} sx={{ color: '#c62828', borderColor: '#c62828' }}>
                  Export to PDF
                </Button>
                <Button size="small" variant="outlined" onClick={() => handleAddToOrderTracker(viewPO)}>
                  Add to Order Tracker
                </Button>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Supplier</Typography>
                  <Typography variant="body2">{viewPO.supplierName}</Typography>
                  {viewPO.supplierAttentionTo && <Typography variant="body2">ATTN: {viewPO.supplierAttentionTo}</Typography>}
                  {viewPO.supplierEmail && <Typography variant="body2">{viewPO.supplierEmail}</Typography>}
                  {viewPO.supplierPhone && <Typography variant="body2">{viewPO.supplierPhone}</Typography>}
                  {viewPO.supplierAddress && <Typography variant="body2">{viewPO.supplierAddress}</Typography>}
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    {viewPO.mrfRequestNos && viewPO.mrfRequestNos.length > 1 ? 'MRF Refs' : 'MRF Ref'}
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {viewPO.mrfRequestNos && viewPO.mrfRequestNos.length > 1 ? viewPO.mrfRequestNos.join(', ') : viewPO.mrfRequestNo}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Requested by</Typography>
                  <Typography variant="body2">{viewPO.requestedBy}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Quotation Reference</Typography>
                  <Typography variant="body2">{viewPO.quotationReference ?? '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Payment Terms</Typography>
                  <Typography variant="body2">{viewPO.paymentTerms ?? '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Lead time</Typography>
                  <Typography variant="body2">{viewPO.leadTime ?? '—'}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>Order date: {viewPO.orderDate} · Expected: {viewPO.expectedDelivery}</Typography>
                </Grid>
              </Grid>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Line items</Typography>
              <TableContainer>
                <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.75rem' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Part #</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Brand</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Unit</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Unit Price</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Total</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {viewPO.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{i.description || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{i.partNo || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{i.brand || '—'}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{i.quantity}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{i.unit || '—'}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{Number(i.unitPrice ?? 0).toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{lineTotal(i).toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{i.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ textAlign: 'right', mt: 1 }}>
                {(() => {
                  const { subtotal, discount, amountVatEx, vatAmount, grandTotal } = poAmounts(viewPO);
                  return (
                    <>
                      <Typography variant="body2">Subtotal: {subtotal.toFixed(2)}</Typography>
                      {discount > 0 && <Typography variant="body2" sx={{ fontStyle: 'italic' }}>Discount: {discount.toFixed(2)} · Amount (VAT EX): {amountVatEx.toFixed(2)}</Typography>}
                      {!viewPO.noVat && <Typography variant="body2">12% VAT: {vatAmount.toFixed(2)}</Typography>}
                      <Typography variant="body2" fontWeight={600}>{viewPO.noVat ? 'Total' : 'Total (incl. VAT)'}: {grandTotal.toFixed(2)}</Typography>
                    </>
                  );
                })()}
              </Box>
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Approved by</Typography>
                  <Typography variant="body2">{viewPO.approvedBy ?? '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Received by vendor</Typography>
                  <Typography variant="body2">{viewPO.receivedByVendor ?? '—'}</Typography>
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Select
                  size="small"
                  value={viewPO.status}
                  onChange={(e) => handleStatusChange(viewPO.id, e.target.value as PurchaseOrder['status'])}
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value="Sent">Sent</MenuItem>
                  <MenuItem value="Confirmed">Confirmed</MenuItem>
                </Select>
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #e2e8f0', p: 2 }}>
              <Button startIcon={<PictureAsPdfIcon />} onClick={() => viewPO && exportPOToPDF(viewPO)} sx={{ color: '#c62828' }}>
                Export to PDF
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={() => setViewPO(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default PurchaseOrderPage;
