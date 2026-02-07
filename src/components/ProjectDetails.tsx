import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Divider,
  Button,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon, Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import { Project } from '../types/Project';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import dataService from '../services/dataService';
import EditProjectDialog from './EditProjectDialog';
import { useAuth } from '../contexts/AuthContext';
import { getBudget, setBudget } from '../utils/projectBudgetStorage';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, Cell, Tooltip } from 'recharts';
import { ORDER_TRACKER_STORAGE_KEY } from './OrderTrackerPage';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';

const PROJECT_EXPENSES_KEY = 'projectExpenses';
const MATERIAL_REQUESTS_KEY = 'materialRequests';
const WBS_STORAGE_KEY = 'projectWBS';
const REPORT_COMPANY_KEY = 'reportCompany';
const PROJECT_PROGRESS_SNAPSHOTS_KEY = 'projectProgressSnapshots';

export const REPORT_COMPANIES = {
  IOCT: 'IO Control Technologie OPC',
  ACT: 'Advance Controle Technologie Inc.',
} as const;
export type ReportCompanyKey = keyof typeof REPORT_COMPANIES;

const REPORT_COMPANY_ADDRESS: Record<ReportCompanyKey, string> = {
  ACT: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
  IOCT: 'B63, L7 Dynamism Jubilation Enclave, Santo Niño, City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
};


function percentToWords(n: number): string {
  const v = Math.max(0, Math.min(100, Math.round(n)));
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (v === 0) return 'zero';
  if (v === 100) return 'one hundred';
  if (v < 20) return ones[v];
  const t = Math.floor(v / 10);
  const o = v % 10;
  return tens[t] + (o > 0 ? '-' + ones[o] : '');
}

export interface WBSItem {
  id: string;
  code: string;
  name: string;
  weight: number;
  progress: number;
}

function loadWBS(projectId: number): WBSItem[] {
  try {
    const raw = localStorage.getItem(WBS_STORAGE_KEY);
    if (raw) {
      const all: Record<string, WBSItem[]> = JSON.parse(raw);
      const items = all[String(projectId)] || [];
      return items.map((i) => ({
        ...i,
        weight: parseWBSNum(i.weight),
        progress: parseWBSNum(i.progress),
      }));
    }
  } catch (_) {}
  return [];
}

function saveWBS(projectId: number, items: WBSItem[]): void {
  try {
    const raw = localStorage.getItem(WBS_STORAGE_KEY);
    const all: Record<string, WBSItem[]> = raw ? JSON.parse(raw) : {};
    all[String(projectId)] = items;
    localStorage.setItem(WBS_STORAGE_KEY, JSON.stringify(all));
  } catch (_) {}
}

function parseWBSNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, Math.min(100, v));
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
    return Math.max(0, Math.min(100, n));
  }
  return 0;
}

export interface ProgressSnapshot {
  date: string;
  pbNumber: string;
  wbsItems: WBSItem[];
  overallProgress: number;
}

function getProgressSnapshots(projectId: number): ProgressSnapshot[] {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    if (!raw) return [];
    const o: Record<string, ProgressSnapshot[]> = JSON.parse(raw);
    const list = o[String(projectId)] || [];
    return list.map((s) => ({
      ...s,
      wbsItems: (s.wbsItems || []).map((i) => ({
        ...i,
        weight: parseWBSNum(i.weight),
        progress: parseWBSNum(i.progress),
      })),
    }));
  } catch (_) {
    return [];
  }
}

function saveProgressSnapshot(projectId: number, snapshot: ProgressSnapshot): void {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    const o: Record<string, ProgressSnapshot[]> = raw ? JSON.parse(raw) : {};
    const list = o[String(projectId)] || [];
    list.unshift(snapshot);
    o[String(projectId)] = list.slice(0, 100);
    localStorage.setItem(PROJECT_PROGRESS_SNAPSHOTS_KEY, JSON.stringify(o));
  } catch (_) {}
}

function updateProgressSnapshotAt(projectId: number, index: number, snapshot: ProgressSnapshot): void {
  try {
    const raw = localStorage.getItem(PROJECT_PROGRESS_SNAPSHOTS_KEY);
    const o: Record<string, ProgressSnapshot[]> = raw ? JSON.parse(raw) : {};
    const list = o[String(projectId)] || [];
    if (index >= 0 && index < list.length) {
      list[index] = { ...snapshot, date: list[index].date };
      o[String(projectId)] = list;
      localStorage.setItem(PROJECT_PROGRESS_SNAPSHOTS_KEY, JSON.stringify(o));
    }
  } catch (_) {}
}

interface ProjectExpenseRow {
  projectId: number;
  amount: number;
  category: string;
  date?: string;
  description?: string;
}

function loadProjectExpenses(): ProjectExpenseRow[] {
  try {
    const raw = localStorage.getItem(PROJECT_EXPENSES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function loadOrders(): { id: string; orderNo: string; projectId: number | null; orderDate: string; expectedDelivery?: string }[] {
  try {
    const raw = localStorage.getItem(ORDER_TRACKER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function loadMaterialRequests(): { id: string; requestNo: string; projectId: number | null; requestDate: string }[] {
  try {
    const raw = localStorage.getItem(MATERIAL_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
  accent2: '#3c6ba5',
  success: '#00b894',
  warning: '#fdcb6e',
  error: '#e84393',
  info: '#74b9ff',
};

const wbsInputSx = {
  '& .MuiOutlinedInput-root': {
    fontSize: '0.9375rem',
    backgroundColor: '#fff',
    '& fieldset': { borderColor: '#e2e8f0' },
    '&:hover fieldset': { borderColor: '#cbd5e1' },
    '&.Mui-focused fieldset': { borderWidth: '1px', borderColor: NET_PACIFIC_COLORS.primary },
  },
  '& .MuiInputBase-input': {
    py: 1,
    px: 1.25,
    fontSize: '0.9375rem',
    color: '#1e293b',
  },
};

const wbsNumInputSx = {
  '& .MuiOutlinedInput-root': {
    fontSize: '0.9375rem',
    backgroundColor: '#fff',
    '& fieldset': { borderColor: '#e2e8f0' },
    '&:hover fieldset': { borderColor: '#cbd5e1' },
    '&.Mui-focused fieldset': { borderWidth: '1px', borderColor: NET_PACIFIC_COLORS.primary },
  },
  '& .MuiInputBase-input': {
    py: 1,
    px: 1.25,
    fontSize: '0.9375rem',
    color: '#1e293b',
    textAlign: 'right',
    fontWeight: 600,
  },
  '& .MuiInputBase-input[type=number]': { MozAppearance: 'textfield' },
  '& .MuiInputBase-input[type=number]::-webkit-outer-spin-button, & .MuiInputBase-input[type=number]::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
};

interface ProjectDetailsProps {
  project: Project;
  onBack: () => void;
  onProjectUpdated?: (project: Project) => void;
}

const ProjectDetails: React.FC<ProjectDetailsProps> = ({ project, onBack, onProjectUpdated }) => {
  const { user: currentUser } = useAuth();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState(0);
  const [wbsItems, setWbsItems] = useState<WBSItem[]>([]);
  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>(() => {
    try {
      const s = localStorage.getItem(REPORT_COMPANY_KEY);
      if (s === 'ACT' || s === 'IOCT') return s;
    } catch (_) {}
    return 'IOCT';
  });
  const [pbInput, setPbInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [editingSnapshotIndex, setEditingSnapshotIndex] = useState<number | null>(null);
  const projectNoDisplay = project.project_no || String(project.item_no ?? project.id) || '—';
  const progressSnapshots = useMemo(() => getProgressSnapshots(project.id), [project.id, snapshotVersion]);

  useEffect(() => {
    setBudgetAmount(getBudget(project.id));
  }, [project.id]);

  useEffect(() => {
    setWbsItems(loadWBS(project.id));
  }, [project.id]);

  useEffect(() => {
    try {
      localStorage.setItem(REPORT_COMPANY_KEY, reportCompany);
    } catch (_) {}
  }, [reportCompany]);

  const handleBudgetChange = (value: number) => {
    setBudgetAmount(value);
    setBudget(project.id, value);
  };

  const billingPercentage = ((project.contract_billed || 0) / (project.updated_contract_amount || 1)) * 100;
  const backlogsAmount = dataService.getUnbilled(project);

  const expenseBreakdownData = useMemo(() => {
    const expenses = loadProjectExpenses().filter((e) => e.projectId === project.id);
    const byCategory: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.category?.trim() || 'Others';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    });
    return Object.entries(byCategory).map(([name, value]) => ({ name, value }));
  }, [project.id]);

  const projectHealthColor = useMemo(() => {
    const budget = getBudget(project.id);
    const expenses = loadProjectExpenses().filter((e) => e.projectId === project.id);
    const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = budget - spent;
    const remainingPct = budget > 0 ? (remaining / budget) * 100 : 100;
    if (budget <= 0) return '#9e9e9e';
    if (remaining < 0) return '#f44336';
    if (remainingPct <= 20) return '#ff9800';
    return '#4caf50';
  }, [project.id, budgetAmount]);

  const wbsOverallProgress = useMemo(() => {
    if (wbsItems.length === 0) return 0;
    const totalWeight = wbsItems.reduce((s, i) => s + parseWBSNum(i.weight), 0);
    const weightedSum = wbsItems.reduce(
      (s, i) => s + (parseWBSNum(i.weight) * parseWBSNum(i.progress)) / 100,
      0
    );
    if (totalWeight > 0) return (weightedSum / totalWeight) * 100;
    const simpleAvg = wbsItems.reduce((s, i) => s + parseWBSNum(i.progress), 0) / wbsItems.length;
    return simpleAvg;
  }, [wbsItems]);

  const syncProjectStatusFromWBS = (items: WBSItem[]) => {
    if (items.length === 0) return;
    const totalWeight = items.reduce((s, i) => s + parseWBSNum(i.weight), 0);
    const weighted = items.reduce(
      (s, i) => s + (parseWBSNum(i.weight) * parseWBSNum(i.progress)) / 100,
      0
    );
    const pct = totalWeight > 0 ? (weighted / totalWeight) * 100 : items.reduce((s, i) => s + parseWBSNum(i.progress), 0) / items.length;
    const rounded = Math.round(pct);
    dataService.updateProject(project.id, { actual_site_progress_percent: rounded }).then((res) => {
      if (res.success) onProjectUpdated?.({ ...project, actual_site_progress_percent: rounded });
    });
  };

  const handleAddWBSItem = () => {
    const newItem: WBSItem = {
      id: `wbs-${Date.now()}`,
      code: '',
      name: '',
      weight: 0,
      progress: 0,
    };
    const next = [...wbsItems, newItem];
    setWbsItems(next);
    saveWBS(project.id, next);
  };

  const handleUpdateWBSItem = (id: string, field: keyof WBSItem, value: string | number) => {
    const next = wbsItems.map((i) => (i.id === id ? { ...i, [field]: value } : i));
    setWbsItems(next);
    saveWBS(project.id, next);
    if (field === 'progress' || field === 'weight') syncProjectStatusFromWBS(next);
  };

  const handleDeleteWBSItem = (id: string) => {
    const next = wbsItems.filter((i) => i.id !== id);
    setWbsItems(next);
    saveWBS(project.id, next);
    syncProjectStatusFromWBS(next);
  };

  const handleSaveProgress = () => {
    const snapshot: ProgressSnapshot = {
      date: new Date().toISOString(),
      pbNumber: pbInput.trim() || '—',
      wbsItems: JSON.parse(JSON.stringify(wbsItems)),
      overallProgress: wbsOverallProgress,
    };
    if (editingSnapshotIndex !== null && progressSnapshots[editingSnapshotIndex] != null) {
      updateProgressSnapshotAt(project.id, editingSnapshotIndex, snapshot);
      setEditingSnapshotIndex(null);
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2000);
    } else {
      saveProgressSnapshot(project.id, snapshot);
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2000);
    }
    setSnapshotVersion((v) => v + 1);
  };

  const handleLoadSnapshot = (snapshot: ProgressSnapshot, index: number) => {
    setWbsItems(snapshot.wbsItems);
    setPbInput(snapshot.pbNumber === '—' ? '' : snapshot.pbNumber);
    saveWBS(project.id, snapshot.wbsItems);
    syncProjectStatusFromWBS(snapshot.wbsItems);
    setEditingSnapshotIndex(index);
  };

  const handleCancelEditSnapshot = () => {
    setEditingSnapshotIndex(null);
  };

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

  const exportWBSToPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    let y = 18;
    const lineHeight = 5.2;
    const sectionGap = 6;
    const afterHeading = 4;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }

    const fontTitle = () => { doc.setFont('helvetica', 'bold'); };
    const fontBody = () => { doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal'); };

    const companyName = REPORT_COMPANIES[reportCompany];
    const companyNameUpper = companyName.toUpperCase();
    const companyAddress = REPORT_COMPANY_ADDRESS[reportCompany];
    const completionPct = Math.round(wbsOverallProgress * 100) / 100;
    const poNum = project.po_number || '—';

    if (reportCompany === 'ACT') {
      try {
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-advance-controle.png`;
        const logoDataUrl = await loadImageAsDataUrl(logoUrl);
        const logoHeight = 10;
        const logoWidth = 12;
        doc.addImage(logoDataUrl, 'PNG', margin, y, logoWidth, logoHeight);
        y += logoHeight + 4;
      } catch (_) {
        // fallback to text header if logo fails to load
      }
    }

    fontTitle();
    doc.setFontSize(11);
    doc.text(companyNameUpper, margin, y);
    y += lineHeight;
    fontBody();
    doc.setFontSize(9);
    const addrLines = doc.splitTextToSize(companyAddress, contentWidth);
    doc.text(addrLines, margin, y);
    y += addrLines.length * lineHeight + sectionGap;

    fontTitle();
    doc.setFontSize(12);
    doc.text('Project Details', margin, y);
    fontBody();
    y += lineHeight + afterHeading;
    doc.setFontSize(9);
    doc.text(`Project Name: ${project.project_name || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Project No.: ${project.project_no || String(project.item_no ?? project.id) || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Purchase Order No.: ${project.po_number || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Client: ${project.account_name || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Project Location: ${project.project_location || '—'}`, margin, y);
    y += lineHeight + sectionGap;

    fontTitle();
    doc.setFontSize(11);
    doc.text('Project Status', margin, y);
    fontBody();
    y += lineHeight + afterHeading - 1;
    doc.setFontSize(9);
    const certSegments: { text: string; bold: boolean }[] = [
      { text: companyName, bold: true },
      { text: ' hereby certifies that ', bold: false },
      { text: `(${completionPct}%)`, bold: true },
      { text: ' of the total scope of work under Purchase Order No. ', bold: false },
      { text: poNum, bold: true },
      { text: ' has been completed as of the date of this report. The completed works were executed in full compliance with the approved project scope, technical specifications, and contractual obligations. All deliverables corresponding to the stated progress have been properly performed and documented.', bold: false },
    ];
    const certWords: { word: string; bold: boolean }[] = [];
    certSegments.forEach((seg) => {
      seg.text.split(/(\s+)/).forEach((part) => {
        if (part.length > 0) certWords.push({ word: part, bold: seg.bold });
      });
    });
    const bodyFont = hasArialNarrow ? 'ArialNarrow' : 'helvetica';
    let certX = margin;
    certWords.forEach(({ word, bold }) => {
      doc.setFont(bodyFont, bold ? 'bold' : 'normal');
      const w = doc.getTextWidth(word);
      if (certX + w > margin + contentWidth && certX > margin) {
        y += lineHeight;
        certX = margin;
      }
      doc.text(word, certX, y);
      certX += w;
    });
    y += lineHeight + sectionGap;

    fontTitle();
    doc.setFontSize(11);
    doc.text('Certification Statement', margin, y);
    fontBody();
    y += lineHeight + afterHeading - 1;
    doc.setFontSize(9);
    doc.text('This certification is issued for documentation, verification, and progress billing purposes.', margin, y);
    y += lineHeight + 4;

    const tableStartY = y;
    const headers = ['Code', 'Deliverables', 'Weight %', 'Progress %'];
    const wbsRows = wbsItems.map((i) => [
      i.code || '—',
      (i.name || '—').slice(0, 50),
      Number(parseWBSNum(i.weight)).toFixed(2),
      Number(parseWBSNum(i.progress)).toFixed(2),
    ]);
    const totalPct = wbsOverallProgress.toFixed(2);
    const rows = wbsRows.length ? [...wbsRows, ['', 'Total', '', `${totalPct}%`]] : [['—', 'No WBS items', '—', '—']];
    fontBody();
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: tableStartY,
      margin: { left: margin, right: margin },
      tableWidth: 'auto',
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
      },
      styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
      headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold', font: 'helvetica', fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    let finalY = docWithTable.lastAutoTable?.finalY ?? tableStartY;
    const signatureBlockHeight = 42;
    if (finalY > pageHeight - signatureBlockHeight) {
      doc.addPage();
      finalY = 20;
    }
    y = finalY + 8;
    const leftColX = margin;
    const rightColX = margin + 95;
    const lineWidth = 52;
    const sigLineHeight = 5;
    doc.setFontSize(10);
    fontBody();
    const drawSignatureLine = (colX: number, label: string, rowY: number, value?: string) => {
      fontBody();
      doc.setFontSize(9);
      doc.text(label, colX, rowY);
      if (value) doc.text(value, colX + 28, rowY);
      doc.setDrawColor(180, 180, 180);
      doc.line(colX + 26, rowY + 2, colX + 26 + lineWidth, rowY + 2);
    };
    fontTitle();
    doc.setFontSize(10);
    doc.text('Prepared by:', leftColX, y);
    doc.text('Approved by:', rightColX, y);
    let rowY = y + sigLineHeight;
    const approverParts = (project.client_approver || '').split(/\s*[–-]\s*/);
    const approverName = (approverParts[0] || '').trim() || '—';
    const approverDesignation = (approverParts[1] || '').trim() || '—';
    const approverCompany = (project.account_name || '').trim() || '—';
    drawSignatureLine(leftColX, 'Name', rowY, currentUser?.username || currentUser?.email || '—');
    drawSignatureLine(rightColX, 'Name', rowY, approverName);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Designation', rowY, undefined);
    drawSignatureLine(rightColX, 'Designation', rowY, approverDesignation);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Company', rowY, undefined);
    drawSignatureLine(rightColX, 'Company', rowY, approverCompany);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Date', rowY, undefined);
    drawSignatureLine(rightColX, 'Date', rowY, undefined);

    const projectNo = project.project_no || String(project.item_no ?? project.id) || '—';
    const pbNum = pbInput.trim() || '—';
    const docNumber = `Doc. No.: ${projectNo}-PB${pbNum}`;

    const totalPages = doc.getNumberOfPages();
    const footerY = pageHeight - 10;
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, 210 - margin, footerY, { align: 'right' });
    }

    doc.save(`Project_Progress_Certification_${project.project_name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportCompletionCertificateToPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    let y = 18;
    const lineHeight = 5.2;
    const sectionGap = 6;
    const afterHeading = 4;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }

    const fontTitle = () => { doc.setFont('helvetica', 'bold'); };
    const fontBody = () => { doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal'); };

    const companyName = REPORT_COMPANIES[reportCompany];
    const companyNameUpper = companyName.toUpperCase();
    const companyAddress = REPORT_COMPANY_ADDRESS[reportCompany];
    const completionDate = project.completion_date
      ? new Date(typeof project.completion_date === 'number' ? project.completion_date * 1000 : project.completion_date).toLocaleDateString('en-US', { dateStyle: 'long' })
      : new Date().toLocaleDateString('en-US', { dateStyle: 'long' });

    if (reportCompany === 'ACT') {
      try {
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-advance-controle.png`;
        const logoDataUrl = await loadImageAsDataUrl(logoUrl);
        doc.addImage(logoDataUrl, 'PNG', margin, y, 12, 10);
        y += 14;
      } catch (_) {}
    }

    fontTitle();
    doc.setFontSize(11);
    doc.text(companyNameUpper, margin, y);
    y += lineHeight;
    fontBody();
    doc.setFontSize(9);
    const addrLines = doc.splitTextToSize(companyAddress, contentWidth);
    doc.text(addrLines, margin, y);
    y += addrLines.length * lineHeight + sectionGap;

    fontTitle();
    doc.setFontSize(12);
    doc.text('Certificate of Completion', margin, y);
    fontBody();
    y += lineHeight + afterHeading;
    doc.setFontSize(9);
    doc.text(`Project Name: ${project.project_name || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Project No.: ${project.project_no || String(project.item_no ?? project.id) || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Purchase Order No.: ${project.po_number || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Client: ${project.account_name || '—'}`, margin, y);
    y += lineHeight;
    doc.text(`Project Location: ${project.project_location || '—'}`, margin, y);
    y += lineHeight + sectionGap;

    const contractorName = companyName;
    const projectName = project.project_name || '—';
    const projectAddress = project.project_location || '—';

    doc.setFontSize(9);
    const bodyFont = hasArialNarrow ? 'ArialNarrow' : 'helvetica';
    const para1 = `This Final Project Completion Certificate is issued on ${completionDate} to confirm that ${contractorName} has fully executed all work required under the contract for ${projectName}, located at ${projectAddress}, in accordance with all specified terms and conditions.`;
    const para1Lines = doc.splitTextToSize(para1, contentWidth);
    doc.text(para1Lines, margin, y);
    y += para1Lines.length * lineHeight + sectionGap;

    const para2 = 'This certificate serves as official documentation confirming that the project is entirely complete and that all contractual obligations have been fulfilled.';
    const para2Lines = doc.splitTextToSize(para2, contentWidth);
    doc.text(para2Lines, margin, y);
    y += para2Lines.length * lineHeight + sectionGap;

    const para3 = "Issued as evidence of the project's completion.";
    doc.text(para3, margin, y);
    y += lineHeight + 8;

    const signatureBlockHeight = 42;
    if (y > pageHeight - signatureBlockHeight) {
      doc.addPage();
      y = 20;
    } else {
      y += 8;
    }
    const leftColX = margin;
    const rightColX = margin + 95;
    const lineWidth = 52;
    const sigLineHeight = 5;
    doc.setFontSize(10);
    fontBody();
    const drawSignatureLine = (colX: number, label: string, rowY: number, value?: string) => {
      fontBody();
      doc.setFontSize(9);
      doc.text(label, colX, rowY);
      if (value) doc.text(value, colX + 28, rowY);
      doc.setDrawColor(180, 180, 180);
      doc.line(colX + 26, rowY + 2, colX + 26 + lineWidth, rowY + 2);
    };
    fontTitle();
    doc.setFontSize(10);
    doc.text('Prepared by:', leftColX, y);
    doc.text('Approved by:', rightColX, y);
    let rowY = y + sigLineHeight;
    const approverParts = (project.client_approver || '').split(/\s*[–-]\s*/);
    const approverName = (approverParts[0] || '').trim() || '—';
    const approverDesignation = (approverParts[1] || '').trim() || '—';
    const approverCompany = (project.account_name || '').trim() || '—';
    drawSignatureLine(leftColX, 'Name', rowY, currentUser?.username || currentUser?.email || '—');
    drawSignatureLine(rightColX, 'Name', rowY, approverName);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Designation', rowY, undefined);
    drawSignatureLine(rightColX, 'Designation', rowY, approverDesignation);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Company', rowY, undefined);
    drawSignatureLine(rightColX, 'Company', rowY, approverCompany);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Date', rowY, undefined);
    drawSignatureLine(rightColX, 'Date', rowY, undefined);

    const projectNo = project.project_no || String(project.item_no ?? project.id) || '—';
    const cocNum = ccInput.trim() || '—';
    const docNumber = `Doc. No.: ${projectNo}-COC${cocNum}`;
    const totalPages = doc.getNumberOfPages();
    const footerY = pageHeight - 10;
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, 210 - margin, footerY, { align: 'right' });
    }

    doc.save(`Certificate_of_Completion_${project.project_name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const timelineEvents = useMemo(() => {
    const events: { date: string; sortKey: string; type: 'order' | 'mrf' | 'expense' | 'milestone'; label: string; detail?: string; color: string }[] = [];
    const poDate = project.po_date || project.start_date;
    if (poDate) {
      const d = typeof poDate === 'number' ? new Date(poDate * 1000).toISOString().slice(0, 10) : String(poDate).slice(0, 10);
      events.push({ date: d, sortKey: d + 'S', type: 'milestone', label: 'PO Date / Project Start', color: 'success.main' });
    }
    const orders = loadOrders().filter((o) => o.projectId === project.id);
    orders.forEach((o) => {
      events.push({ date: o.orderDate, sortKey: o.orderDate + 'O', type: 'order', label: `Order: ${o.orderNo}`, color: 'info.main' });
    });
    const mrfs = loadMaterialRequests().filter((m) => m.projectId === project.id);
    mrfs.forEach((m) => {
      events.push({ date: m.requestDate, sortKey: m.requestDate + 'M', type: 'mrf', label: `MRF: ${m.requestNo}`, color: 'warning.main' });
    });
    const expenses = loadProjectExpenses().filter((e) => e.projectId === project.id && e.date);
    expenses.forEach((e) => {
      const desc = (e.description || 'Expense').slice(0, 40);
      const amt = dataService.formatCurrency(e.amount);
      events.push({ date: e.date!, sortKey: e.date! + 'E', type: 'expense', label: `Expense: ${desc}`, detail: amt, color: 'primary.main' });
    });
    if (project.completion_date) {
      const d = typeof project.completion_date === 'number' ? new Date(project.completion_date * 1000).toISOString().slice(0, 10) : String(project.completion_date).slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (d <= today) {
        events.push({ date: d, sortKey: d + 'C', type: 'milestone', label: 'Project Completion', color: 'primary.main' });
      }
    }
    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return events;
  }, [project.id, project.po_date, project.start_date, project.completion_date]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1, color: '#2c5aa0' }}>
          {project.project_name}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          sx={{ ml: 2 }}
          onClick={() => setEditDialogOpen(true)}
        >
          Edit Project
        </Button>
      </Box>

      <EditProjectDialog
        open={editDialogOpen}
        project={project}
        onClose={() => setEditDialogOpen(false)}
        onSaved={(updated) => {
          onProjectUpdated?.(updated);
          setEditDialogOpen(false);
        }}
      />

      <Grid container spacing={3}>
        {/* Project Overview Card */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Project Overview
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Project No.
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_no || (project.item_no ?? project.id)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Project Name
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_name}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Client
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.account_name}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Status
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.actual_site_progress_percent ?? 0}%
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  PO Number
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.po_number || '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  PO Date (Project Start)
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.po_date ? dataService.formatDate(project.po_date) : '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Category
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_category}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  QTN Number
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.qtn_no}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Client Approver
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.client_approver}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Year
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.year}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Scope of Work
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.scope_of_work}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Location / Address
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.project_location || '—'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Created Date
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.created_at ? new Date(project.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                </Typography>
              </Grid>
              {project.completion_date && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Completion Date
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {dataService.formatDate(project.completion_date)}
                  </Typography>
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Last Updated
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {project.updated_at ? new Date(project.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                </Typography>
              </Grid>
              {project.remarks && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Remarks
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {project.remarks}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>

        {/* Financial Summary and Billing Progress Cards - Beside Overview */}
        <Grid size={{ xs: 12, md: 4 }}>
          {/* Financial Summary Card */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Financial Summary
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Contract Amount
              </Typography>
              <Typography variant="h5" color="primary.main">
                {dataService.formatCurrency(project.updated_contract_amount || 0)}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Project Budget
              </Typography>
              <TextField
                type="number"
                size="small"
                value={budgetAmount || ''}
                onChange={(e) => handleBudgetChange(Number(e.target.value) || 0)}
                placeholder="Set budget"
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ width: 200 }}
                helperText="Budget for this project (used in Expense Monitoring)"
              />
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Backlogs
              </Typography>
              <Typography variant="h6">
                {dataService.formatCurrency(backlogsAmount)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {project.updated_contract_amount
                  ? `${((backlogsAmount / project.updated_contract_amount) * 100).toFixed(1)}% of contract unbilled`
                  : '—'}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Remaining Balance
              </Typography>
              <Typography variant="h6" color="warning.main">
                {dataService.formatCurrency(project.updated_contract_balance_net || 0)}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Retention
              </Typography>
              <Typography variant="h6">
                {dataService.formatCurrency(project.amount_for_retention_billing || 0)}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box display="flex" alignItems="center">
              <Typography variant="subtitle2" color="textSecondary" sx={{ mr: 2 }}>
                Project Health
              </Typography>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: projectHealthColor,
                }}
                title={projectHealthColor === '#4caf50' ? 'Healthy' : projectHealthColor === '#ff9800' ? 'At risk' : projectHealthColor === '#f44336' ? 'Over budget' : 'No budget set'}
              />
            </Box>
          </Paper>

          {/* Billing Progress Card */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Billing Progress
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Box
                  sx={{
                    width: '100%',
                    height: 8,
                    backgroundColor: 'grey.300',
                    borderRadius: 4,
                    mr: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: `${billingPercentage}%`,
                      height: '100%',
                      backgroundColor: billingPercentage > 90 ? 'success.main' : 
                                     billingPercentage > 70 ? 'warning.main' : 'error.main',
                      borderRadius: 4,
                    }}
                  />
                </Box>
                <Typography variant="body2" color="textSecondary">
                  {billingPercentage.toFixed(1)}%
                </Typography>
              </Box>
              <Typography variant="body2" color="textSecondary">
                Duration: {project.duration_days} days
              </Typography>
            </CardContent>
          </Card>

          {/* Additional Details - Below Billing Progress */}
          <Paper sx={{ p: 3, mb: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Additional Details
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Payment Terms: {project.payment_terms || 'N/A'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Bonds Requirement: {project.bonds_requirement || 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Project Expense Chart - Full Width Below Overview */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ 
            p: 2, 
            mb: 3,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Project Expense Breakdown
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Expenses from Expense Monitoring for this project, by category.
            </Typography>
            {expenseBreakdownData.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                No expenses recorded for this project yet. Add expenses in Expense Monitoring.
              </Typography>
            ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={expenseBreakdownData}
                margin={{ top: 20, right: 20, left: 20, bottom: 80 }}
              >
                <defs>
                  {['#1a365d', '#2c5aa0', '#3182ce', '#4299e1', '#63b3ed', '#90cdf4', '#bee3f8', '#e6f3ff', '#2d3748', '#4a5568'].map((color, index) => (
                    <linearGradient key={`expenseGradient-${index}`} id={`expenseGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.3}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <Tooltip 
                  formatter={(value: number) => [dataService.formatCurrency(value), 'Amount']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {expenseBreakdownData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#expenseGradient${index % 10})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
            {expenseBreakdownData.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">
                Total expenses (this project): {dataService.formatCurrency(expenseBreakdownData.reduce((sum, row) => sum + row.value, 0))}
              </Typography>
            </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* WBS - Work Breakdown Structure */}
      <Grid container spacing={3} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              bgcolor: '#fff',
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              WBS – Work Breakdown Structure
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Define work packages and track progress. Overall progress is weighted by each item&apos;s weight. Project status is updated from this WBS.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
              {wbsItems.length > 0 && (
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Total progress: {wbsOverallProgress.toFixed(2)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, wbsOverallProgress)}
                    sx={{
                      height: 12,
                      borderRadius: 6,
                      bgcolor: 'grey.200',
                      '& .MuiLinearProgress-bar': { borderRadius: 6, bgcolor: NET_PACIFIC_COLORS.primary },
                    }}
                  />
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="PB #"
                  placeholder="e.g. 1"
                  value={pbInput}
                  onChange={(e) => setPbInput(e.target.value)}
                  sx={{ width: 80 }}
                  inputProps={{ inputMode: 'numeric' }}
                />
                <FormControl size="small" sx={{ minWidth: 280 }}>
                  <InputLabel id="report-company-label">Report as company</InputLabel>
                  <Select
                    labelId="report-company-label"
                    value={reportCompany}
                    label="Report as company"
                    onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}
                  >
                    <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
                    <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveProgress}
                  disabled={wbsItems.length === 0}
                  sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
                >
                  {saveFeedback ? 'Saved' : editingSnapshotIndex !== null ? 'Update snapshot' : 'Save'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={exportWBSToPDF}
                  disabled={wbsItems.length === 0}
                  sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                >
                  Export to PDF
                </Button>
                {progressSnapshots.length > 0 && (
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="load-snapshot-label">Load previous progress</InputLabel>
                    <Select
                      labelId="load-snapshot-label"
                      value=""
                      label="Load previous progress"
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        if (!Number.isNaN(idx) && progressSnapshots[idx] != null) handleLoadSnapshot(progressSnapshots[idx], idx);
                        (e.target as HTMLSelectElement).value = '';
                      }}
                    >
                      <MenuItem value="">
                        <em>— Select to load —</em>
                      </MenuItem>
                      {progressSnapshots.map((s, idx) => (
                        <MenuItem key={s.date + s.pbNumber} value={idx}>
                          {new Date(s.date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · PB{s.pbNumber}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>
              {editingSnapshotIndex !== null && progressSnapshots[editingSnapshotIndex] != null && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ color: 'info.main', fontSize: '0.8125rem' }}>
                    Editing: {new Date(progressSnapshots[editingSnapshotIndex].date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · PB{progressSnapshots[editingSnapshotIndex].pbNumber}. Click &quot;Update snapshot&quot; to save changes.
                  </Typography>
                  <Button size="small" variant="outlined" onClick={handleCancelEditSnapshot} sx={{ ml: 1 }}>
                    Cancel edit
                  </Button>
                </Box>
              )}
            </Box>
            <TableContainer sx={{ maxHeight: 460, border: '1px solid #e2e8f0', borderRadius: 1 }}>
              <Table stickyHeader size="medium" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        bgcolor: '#f8fafc',
                        color: '#475569',
                        borderBottom: '2px solid #e2e8f0',
                        py: 2,
                        px: 1.5,
                        width: 100,
                      }}
                    >
                      Code
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        bgcolor: '#f8fafc',
                        color: '#475569',
                        borderBottom: '2px solid #e2e8f0',
                        py: 2,
                        px: 1.5,
                        minWidth: 200,
                      }}
                    >
                      Name
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        bgcolor: '#f8fafc',
                        color: '#475569',
                        borderBottom: '2px solid #e2e8f0',
                        py: 2,
                        px: 1.5,
                        width: 100,
                      }}
                    >
                      Weight %
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        bgcolor: '#f8fafc',
                        color: '#475569',
                        borderBottom: '2px solid #e2e8f0',
                        py: 2,
                        px: 1.5,
                        width: 100,
                      }}
                    >
                      Progress %
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        bgcolor: '#f8fafc',
                        color: '#475569',
                        borderBottom: '2px solid #e2e8f0',
                        py: 2,
                        px: 1.5,
                        width: 72,
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wbsItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 5, px: 2, color: 'text.secondary', fontSize: '0.9375rem' }}>
                        No WBS items. Click &quot;Add WBS item&quot; to add work packages.
                      </TableCell>
                    </TableRow>
                  ) : (
                    wbsItems.map((item, index) => (
                      <TableRow
                        key={item.id}
                        hover
                        sx={{
                          bgcolor: index % 2 === 0 ? '#fff' : 'grey.50',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={item.code}
                            onChange={(e) => handleUpdateWBSItem(item.id, 'code', e.target.value)}
                            placeholder="1.1"
                            variant="outlined"
                            sx={wbsInputSx}
                            inputProps={{ maxLength: 20 }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={item.name}
                            onChange={(e) => handleUpdateWBSItem(item.id, 'name', e.target.value)}
                            placeholder="Work package name"
                            variant="outlined"
                            sx={wbsInputSx}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                          <TextField
                            size="small"
                            type="number"
                            fullWidth
                            value={parseWBSNum(item.weight).toFixed(2)}
                            onChange={(e) => {
                              const num = parseWBSNum(e.target.value);
                              handleUpdateWBSItem(item.id, 'weight', num);
                            }}
                            inputProps={{ min: 0, max: 100, step: 0.01, inputMode: 'decimal' }}
                            variant="outlined"
                            sx={wbsNumInputSx}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                          <TextField
                            size="small"
                            type="number"
                            fullWidth
                            value={parseWBSNum(item.progress).toFixed(2)}
                            onChange={(e) => {
                              const num = parseWBSNum(e.target.value);
                              handleUpdateWBSItem(item.id, 'progress', num);
                            }}
                            inputProps={{ min: 0, max: 100, step: 0.01, inputMode: 'decimal' }}
                            variant="outlined"
                            sx={wbsNumInputSx}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                          <IconButton size="small" onClick={() => handleDeleteWBSItem(item.id)} title="Delete" color="error" sx={{ color: 'error.main' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {wbsItems.length > 0 && (
                  <TableFooter>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell colSpan={2} sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>
                        Total progress
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>
                        {wbsItems.reduce((s, i) => s + parseWBSNum(i.weight), 0).toFixed(2)}%
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>
                        {wbsOverallProgress.toFixed(2)}%
                      </TableCell>
                      <TableCell sx={{ borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TableContainer>
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddWBSItem}
              sx={{ mt: 2, textTransform: 'none', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}
            >
              Add WBS item
            </Button>
          </Paper>
        </Grid>
      </Grid>

      {/* Certificate of Completion – separate report generator */}
      <Grid size={{ xs: 12 }} sx={{ mt: 3 }}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            bgcolor: '#fff',
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            Certificate of Completion
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Generate the Final Project Completion Certificate. Uses the same company (Report as company) as the progress report above.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="COC"
              placeholder="e.g. 1"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              sx={{ width: 80 }}
              inputProps={{ inputMode: 'numeric' }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdfIcon />}
              onClick={exportCompletionCertificateToPDF}
              sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
            >
              Export Certificate of Completion
            </Button>
          </Box>
        </Paper>
      </Grid>

      {/* Timeline/Activity Section */}
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Project Timeline & Activity
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Milestones, orders (Order Tracker), MRF (Material Request), and expenses (Expense Monitoring) by date.
          </Typography>
          
          <Box sx={{ pl: 2, borderLeft: '2px solid #e0e0e0' }}>
            {timelineEvents.length === 0 && !project.po_date && !project.start_date && !project.completion_date ? (
              <Typography variant="body2" color="text.secondary">No timeline events yet. Add orders, MRFs, or expenses to see activity by date.</Typography>
            ) : (
              <>
                {timelineEvents.map((evt, idx) => (
                  <Box key={`${evt.sortKey}-${idx}`} sx={{ mb: 2, position: 'relative' }}>
                    <Box sx={{ position: 'absolute', left: -8, top: 4, width: 12, height: 12, borderRadius: '50%', bgcolor: evt.color }} />
                    <Typography variant="subtitle2" sx={{ ml: 2 }}>
                      {evt.date}: {evt.label}
                      {evt.detail != null && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                          {evt.detail}
                        </Typography>
                      )}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </Box>

          {/* Project Details Summary */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Project Details
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Payment Terms: {project.payment_terms || 'N/A'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="textSecondary">
                  Bonds Requirement: {project.bonds_requirement || 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Grid>
    </Container>
  );
};

export default ProjectDetails;