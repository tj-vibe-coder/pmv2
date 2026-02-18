import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, FileDownload as ExportIcon, FileUpload as ImportIcon, Save as SaveIcon, Send as SendIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';

const LIQUIDATION_CATEGORIES = [
  'Tools / Direct',
  'Gas',
  'Materials',
  'Transportation',
  'Accommodation',
  '3rd Party Labor',
  'Others',
] as const;

interface LiquidationRow {
  id: string;
  date: string;
  category: string;
  projectId: number | '';
  projectName: string;
  projectNo: string;
  particulars: string;
  amount: number;
  remarks: string;
}

const newRow = (projectName = '', projectNo = ''): LiquidationRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  date: new Date().toISOString().slice(0, 10),
  category: '',
  projectId: '',
  projectName,
  projectNo,
  particulars: '',
  amount: 0,
  remarks: '',
});

const PROJECT_EXPENSES_KEY = 'projectExpenses';
function addLiquidationRowsToProjectExpenses(rows: LiquidationRow[]): void {
  try {
    const raw = localStorage.getItem(PROJECT_EXPENSES_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const toAdd = rows.filter((r) => {
      const pid = r.projectId;
      const amt = Number(r.amount);
      return pid !== '' && pid !== null && pid !== undefined && !isNaN(Number(pid)) && amt > 0;
    });
    const now = new Date().toISOString();
    toAdd.forEach((r) => {
      const pid = Number(r.projectId);
      if (isNaN(pid)) return;
      existing.unshift({
        id: `exp-liq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: pid,
        projectName: (r.projectName || '').trim() || '—',
        description: (r.particulars || '').trim() || 'Liquidation',
        amount: Number(r.amount),
        date: r.date || now.slice(0, 10),
        category: (r.category || '').trim() || 'Others',
        createdAt: now,
      });
    });
    if (toAdd.length > 0) {
      localStorage.setItem(PROJECT_EXPENSES_KEY, JSON.stringify(existing));
    }
  } catch (_) {}
}

export default function LiquidationFormPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [dateOfSubmission, setDateOfSubmission] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [formNo, setFormNo] = useState('');
  const [rows, setRows] = useState<LiquidationRow[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<{ id: number; form_no: string; date_of_submission: string; status: string; total_amount: number }[]>([]);
  const [submittedLiquidations, setSubmittedLiquidations] = useState<{ id: number; form_no: string; date_of_submission: string; status: string; total_amount: number }[]>([]);
  const [isViewingSubmitted, setIsViewingSubmitted] = useState(false);
  const [cashAdvances, setCashAdvances] = useState<{ id: number; amount: number; balance_remaining: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [caId, setCaId] = useState<number | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fullName = user?.full_name?.trim();
    const fallback = user?.username;
    if (fullName) setEmployeeName(fullName);
    else if (fallback && !employeeName) setEmployeeName(fallback);
  }, [user?.full_name, user?.username]);

  useEffect(() => {
    dataService.getProjects().then(setProjects);
  }, []);

  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;

  // Fetch next form number on mount (for new forms)
  useEffect(() => {
    if (!token || draftId !== null || formNo) return;
    fetch(`${API_BASE}/api/liquidations/next-form-no`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.form_no) {
          setFormNo(d.form_no);
        }
      })
      .catch(() => {});
  }, [token, draftId, formNo]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.liquidations) {
          setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
          setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { id: number }, b: { id: number }) => b.id - a.id));
        }
      })
      .catch(() => {});
  }, [token]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/cash-advances`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.cash_advances) {
          setCashAdvances(
            d.cash_advances.filter(
              (ca: { status: string; balance_remaining: number }) =>
                ca.status === 'approved' && Number(ca.balance_remaining) > 0
            )
          );
        }
      })
      .catch(() => {});
  }, [token]);

  const payload = () => ({
    form_no: formNo,
    date_of_submission: dateOfSubmission,
    employee_name: employeeName,
    employee_number: employeeNumber,
    rows_json: rows.map((r) => ({
      id: r.id,
      date: r.date,
      category: r.category,
      projectId: r.projectId,
      projectName: r.projectName,
      projectNo: r.projectNo,
      particulars: r.particulars,
      amount: r.amount,
      remarks: r.remarks,
    })),
    total_amount: totalAmount,
    ca_id: caId || null,
  });

  const saveDraft = async () => {
    if (!token) return;
    setSaving(true);
    setSubmitSuccess(null);
    try {
      const body = { ...payload(), status: 'draft' };
      const url = draftId ? `${API_BASE}/api/liquidations/${draftId}` : `${API_BASE}/api/liquidations`;
      const method = draftId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setDraftId(data.id || draftId);
        setSubmitSuccess('Draft saved.');
        fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.liquidations) {
              setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
              setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { id: number }, b: { id: number }) => b.id - a.id));
            }
          })
          .catch(() => {});
      } else {
        setSubmitSuccess(data.error || 'Save failed');
      }
    } catch (e) {
      setSubmitSuccess(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const loadDraft = async (id: number, isSubmitted = false) => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/liquidations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.liquidation) return;
    const l = data.liquidation;
    setIsViewingSubmitted(isSubmitted || l.status === 'submitted');
    setFormNo(l.form_no || '');
    setDateOfSubmission(l.date_of_submission || new Date().toISOString().slice(0, 10));
    setEmployeeName(l.employee_name || '');
    setEmployeeNumber(l.employee_number || '');
    setCaId(l.ca_id || '');
    let raw: Record<string, unknown>[] = [];
    try {
      raw = Array.isArray(l.rows_json)
        ? l.rows_json
        : typeof l.rows_json === 'string'
          ? JSON.parse(l.rows_json || '[]')
          : [];
    } catch {
      raw = [];
    }
    if (!Array.isArray(raw)) raw = [];
    const loadedRows: LiquidationRow[] =
      raw.length === 0
        ? [newRow('', '')]
        : raw.map((r: Record<string, unknown>) => {
            const base = newRow(String(r.projectName ?? ''), String(r.projectNo ?? ''));
            const pidValue = r.projectId;
            const projectId: number | '' = pidValue !== undefined && pidValue !== null && pidValue !== '' ? (typeof pidValue === 'number' ? pidValue : isNaN(Number(pidValue)) ? '' : Number(pidValue)) : '';
            return {
              id: typeof r.id === 'string' && r.id ? String(r.id) : base.id,
              date: String(r.date ?? new Date().toISOString().slice(0, 10)),
              category: String(r.category ?? ''),
              projectId,
              projectName: String(r.projectName ?? ''),
              projectNo: String(r.projectNo ?? ''),
              particulars: String(r.particulars ?? ''),
              amount: Number(r.amount) || 0,
              remarks: String(r.remarks ?? ''),
            };
          });
    setRows(loadedRows);
    setDraftId(l.id);
    setSubmitSuccess(null);
  };

  const submitLiquidation = async () => {
    if (!token) return;
    if (rows.length === 0) {
      setSubmitSuccess('Add at least one row.');
      return;
    }
    setSaving(true);
    setSubmitSuccess(null);
    try {
      // Get next form number if not set (for new submissions)
      let finalFormNo = formNo;
      if (!finalFormNo || finalFormNo.trim() === '') {
        const res = await fetch(`${API_BASE}/api/liquidations/next-form-no`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (data.success && data.form_no) {
          finalFormNo = data.form_no;
          setFormNo(finalFormNo);
        } else {
          finalFormNo = 'LQ-0001';
        }
      }
      const body = { ...payload(), form_no: finalFormNo, status: 'submitted' };
      const url = draftId ? `${API_BASE}/api/liquidations/${draftId}` : `${API_BASE}/api/liquidations`;
      const method = draftId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        addLiquidationRowsToProjectExpenses(rows);
        setDraftId(null);
        setIsViewingSubmitted(false);
        setRows([newRow('', '')]);
        setFormNo('');
        setSubmitSuccess('Liquidation submitted. Amount applied to CA has been deducted; expenses added to project expense.');
        // Fetch next form number for new form
        fetch(`${API_BASE}/api/liquidations/next-form-no`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.form_no) {
              setFormNo(d.form_no);
            }
          })
          .catch(() => {});
        fetch(`${API_BASE}/api/liquidations`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.liquidations) {
              setDrafts(d.liquidations.filter((l: { status: string }) => l.status === 'draft'));
              setSubmittedLiquidations(d.liquidations.filter((l: { status: string }) => l.status === 'submitted').sort((a: { id: number }, b: { id: number }) => b.id - a.id));
            }
          })
          .catch(() => {});
        fetch(`${API_BASE}/api/cash-advances`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => d.success && d.cash_advances && setCashAdvances(d.cash_advances.filter((ca: { status: string; balance_remaining: number }) => ca.status === 'approved' && Number(ca.balance_remaining) > 0)))
          .catch(() => {});
      } else {
        setSubmitSuccess(data.error || 'Submit failed');
      }
    } catch (e) {
      setSubmitSuccess(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    setRows((prev) => [...prev, newRow('', '')]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof LiquidationRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const setRowProject = (id: string, projectId: number | '') => {
    if (projectId === '') {
      updateRow(id, 'projectId', '');
      updateRow(id, 'projectName', '');
      updateRow(id, 'projectNo', '');
      return;
    }
    const p = projects.find((x) => x.id === projectId);
    if (!p) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              projectId,
              projectName: p.project_name || '',
              projectNo: p.po_number || p.project_no || '',
            }
          : r
      )
    );
  };

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const exportToPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageWidth = 210;
    const pageHeight = 297;
    const footerY = pageHeight - 10;
    const headerY = 14;
    let y = headerY;

    // Load Arial Narrow font
    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'bold');
    }
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');
    const fontBold = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'bold');

    // Load logo once for reuse on all pages
    let logoDataUrl: string | null = null;
    let logoWidth = 0;
    let logoHeight = 0;
    try {
      const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../utils/logoUtils');
      const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
      logoDataUrl = await loadLogoTransparentBackground(logoUrl);
      logoWidth = ACT_LOGO_PDF_WIDTH;
      logoHeight = ACT_LOGO_PDF_HEIGHT;
    } catch (_) {}

    const lineHeight = 5;
    // Draw header on first page (logo, company name, Liquidation Form + Date on right)
    const drawHeader = () => {
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', margin, headerY - 2, logoWidth, logoHeight);
        doc.setFontSize(9);
        fontBold();
        doc.text('Advance Controle Technologie Inc.', margin, headerY + logoHeight + 4);
      }
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold'); // Use Arial Bold (helvetica bold) for title
      doc.text('Liquidation Form', pageWidth - margin, headerY, { align: 'right' });
      fontBody();
      doc.setFontSize(10);
      doc.text(`Date: ${dateOfSubmission || '—'}`, pageWidth - margin, headerY + lineHeight, { align: 'right' });
    };

    drawHeader();
    y += logoHeight > 0 ? logoHeight + 10 : 6;
    fontBody();
    doc.setFontSize(10);
    doc.text(`Name: ${(employeeName || '—').trim()}`, margin, y);
    y += 10;
    const body = rows.length > 0
      ? rows.map((r, i) => [
          String(i + 1),
          r.date || '—',
          r.category || '—',
          (r.projectName || '—').slice(0, 25),
          r.projectNo || '—',
          (r.particulars || '—').slice(0, 30),
          Number(r.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 }),
          (r.remarks || '—').slice(0, 15),
        ])
      : [['—', '—', '—', '—', '—', '—', '0.00', '—']];
    
    autoTable(doc, {
      head: [['No.', 'Date', 'Category', 'Project', 'PO #', 'Particulars', 'Amount', 'Remarks']],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
      headStyles: { fillColor: [44, 90, 160], font: hasArialNarrow ? 'ArialNarrow' : 'helvetica', fontStyle: 'bold' },
      didDrawPage: () => {
        // Draw header on all pages (logo, company name, Liquidation Form + Date on right)
        if (logoDataUrl) {
          doc.addImage(logoDataUrl, 'PNG', margin, headerY - 2, logoWidth, logoHeight);
          doc.setFontSize(9);
          fontBold();
          doc.text('Advance Controle Technologie Inc.', margin, headerY + logoHeight + 4);
        }
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold'); // Use Arial Bold (helvetica bold) for title
        doc.text('Liquidation Form', pageWidth - margin, headerY, { align: 'right' });
        fontBody();
        doc.setFontSize(10);
        doc.text(`Date: ${dateOfSubmission || '—'}`, pageWidth - margin, headerY + lineHeight, { align: 'right' });
      },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? y) + 8;
    // Total on the right side - use Helvetica Bold
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, pageWidth - margin, y, { align: 'right' });
    if (caId) doc.text(`Applied to CA #${caId}`, margin, y);
    y += 14;
    fontBody();
    doc.setFontSize(9);
    const sigY = footerY - 28;
    doc.text('Prepared by:', margin, sigY);
    const preparedByName = (employeeName || user?.full_name || user?.username || user?.email || '—').trim() || '—';
    doc.text(preparedByName, margin, sigY + 6);
    
    // Add footer with page number and Doc No. on all pages (Doc No. is LIQ-001, not LIQ-LQ-001)
    const totalPages = doc.getNumberOfPages();
    const docNo = !formNo ? 'LIQ-001' : formNo.startsWith('LIQ-') ? formNo : formNo.startsWith('LQ-') ? 'LIQ-' + formNo.slice(3) : 'LIQ-' + formNo;
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      doc.text(`Doc No.: ${docNo}`, margin, footerY);
    }
    
    doc.save(`Liquidation_${formNo || 'form'}_${dateOfSubmission.replace(/-/g, '')}.pdf`);
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const headerRow1 = ['Employee Name', employeeName, 'Employee Number', employeeNumber];
    const headerRow2 = ['Date of Submission', dateOfSubmission, 'Form No.', formNo];
    const tableHeaders = ['No.', 'Date', 'Category', 'Project Name', 'PO #', 'Particulars', 'Amount', 'Remarks'];
    const dataRows = rows.map((r, i) => [
      i + 1,
      r.date,
      r.category,
      r.projectName,
      r.projectNo,
      r.particulars,
      r.amount,
      r.remarks,
    ]);
    const wsData = [headerRow1, headerRow2, [], tableHeaders, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // A4 print: paperSize 9 = A4, fitToPage so content fits one A4 sheet
    ws['!pageSetup'] = { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidation');
    const filename = `liquidation_${formNo}_${dateOfSubmission.replace(/-/g, '')}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (data == null) return;
        const wb =
          typeof data === 'string'
            ? XLSX.read(data, { type: 'string' })
            : XLSX.read(new Uint8Array(data as ArrayBuffer), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (raw.length < 4) return;
        const r0 = (raw[0] as unknown[]) || [];
        const r1 = (raw[1] as unknown[]) || [];
        if (r0[1] != null) setEmployeeName(String(r0[1]));
        if (r0[3] != null) setEmployeeNumber(String(r0[3]));
        if (r1[1] != null) setDateOfSubmission(String(r1[1]).slice(0, 10));
        if (r1[3] != null) setFormNo(String(r1[3]));
        const headerRow = raw[3] as unknown[];
        if (!headerRow || (headerRow[0] !== 'No.' && headerRow[0] !== 1)) return;
        const imported: LiquidationRow[] = [];
        for (let i = 4; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          if (!row || row.length < 6) continue;
          const date = row[1] != null ? String(row[1]).slice(0, 10) : new Date().toISOString().slice(0, 10);
          const amount = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6] || 0)) || 0;
          imported.push(newRow(String(row[3] ?? ''), String(row[4] ?? '')));
          const last = imported[imported.length - 1];
          last.projectId = '';
          last.date = date;
          last.category = String(row[2] ?? '');
          last.particulars = String(row[5] ?? '');
          last.amount = amount;
          last.remarks = String(row[7] ?? '');
        }
        if (imported.length > 0) setRows(imported);
      } catch (err) {
        console.error('Import error:', err);
      }
      e.target.value = '';
    };
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const theme = {
    primary: '#2c5aa0',
    primaryLight: '#4f7bc8',
    secondary: '#1e4a72',
    border: '#e0e0e0',
    paper: '#ffffff',
  };

  return (
    <Box sx={{ p: 3, width: '100%', minHeight: 'calc(100vh - 80px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: theme.primary }}>
          Liquidation Form
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SaveIcon />}
            onClick={saveDraft}
            disabled={saving || isViewingSubmitted}
            sx={{ borderColor: theme.primary, color: theme.primary }}
          >
            Save draft
          </Button>
          {(drafts.length > 0 || submittedLiquidations.length > 0) && (
            <Select<string>
              size="small"
              displayEmpty
              value=""
              onChange={(e) => {
                const raw = e.target.value as string;
                if (raw === '') {
                  setIsViewingSubmitted(false);
                  setDraftId(null);
                  setRows([newRow('', '')]);
                  setFormNo('');
                  setEmployeeName('');
                  setEmployeeNumber('');
                  setDateOfSubmission(new Date().toISOString().slice(0, 10));
                  setCaId('');
                  setSubmitSuccess(null);
                  return;
                }
                const parts = raw.split(':');
                const id = Number(parts[1]);
                const isSubmitted = parts[0] === 'submitted';
                if (id) loadDraft(id, isSubmitted);
              }}
              sx={{ minWidth: 200, '& .MuiSelect-select': { py: 0.75 } }}
              renderValue={(v: string) => (v === '' ? 'Load liquidation…' : v.includes(':') ? `#${v.split(':')[1]}` : '')}
            >
              <MenuItem value="">
                <em>Load liquidation…</em>
              </MenuItem>
              {drafts.length > 0 && [
                <MenuItem key="drafts-header" disabled sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>
                  Drafts
                </MenuItem>,
                ...drafts.map((d) => (
                  <MenuItem key={`draft-${d.id}`} value={`draft:${d.id}`}>
                    {d.form_no || `#${d.id}`} – {d.date_of_submission || 'no date'} (₱{Number(d.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                  </MenuItem>
                )),
              ]}
              {submittedLiquidations.length > 0 && [
                <MenuItem key="submitted-header" disabled sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary', mt: drafts.length > 0 ? 1 : 0 }}>
                  Submitted
                </MenuItem>,
                ...submittedLiquidations.map((d) => (
                  <MenuItem key={`submitted-${d.id}`} value={`submitted:${d.id}`}>
                    {d.form_no || `#${d.id}`} – {d.date_of_submission || 'no date'} (₱{Number(d.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                  </MenuItem>
                )),
              ]}
            </Select>
          )}
          <Button
            variant="outlined"
            startIcon={<ImportIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={{ borderColor: theme.primary, color: theme.primary, '&:hover': { borderColor: theme.secondary, color: theme.secondary } }}
          >
            Import
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={exportToPDF}
            sx={{ borderColor: theme.primary, color: theme.primary }}
          >
            Export to PDF (for signing)
          </Button>
          <Button
            variant="contained"
            startIcon={<ExportIcon />}
            onClick={handleExport}
            sx={{ bgcolor: theme.primary, '&:hover': { bgcolor: theme.secondary } }}
          >
            Export
          </Button>
        </Box>
      </Box>
      {submitSuccess && (
        <Typography variant="body2" sx={{ mb: 2, color: submitSuccess.startsWith('Liquidation submitted') ? 'success.main' : submitSuccess.startsWith('Draft saved') ? 'info.main' : 'error.main' }}>
          {submitSuccess}
        </Typography>
      )}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleImport}
      />

      <Paper
        elevation={0}
        sx={{
          p: 3,
          border: `1px solid ${theme.border}`,
          borderRadius: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          backgroundColor: theme.paper,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <Box sx={{ flex: '1 1 200px' }}>
            <TextField
              fullWidth
              size="small"
              label="Name"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          <Box sx={{ flex: '1 1 140px' }}>
            <TextField
              fullWidth
              size="small"
              label="Employee Number"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          <Box sx={{ flex: '1 1 160px' }}>
            <TextField
              fullWidth
              size="small"
              label="Date of Submission"
              type="date"
              value={dateOfSubmission}
              onChange={(e) => setDateOfSubmission(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          <Box sx={{ flex: '0 1 120px' }}>
            <TextField
              fullWidth
              size="small"
              label="Form No."
              value={formNo}
              onChange={(e) => setFormNo(e.target.value)}
              disabled={isViewingSubmitted}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Box>
          {cashAdvances.length > 0 && (
            <Box sx={{ flex: '1 1 220px' }}>
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={caId === '' ? '' : caId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (typeof v === 'string' && v === '') setCaId('');
                  else setCaId(Number(v));
                }}
                disabled={isViewingSubmitted}
                sx={{ bgcolor: 'background.paper', minHeight: 40 }}
                renderValue={(v) => ((v as unknown) === '' || v == null ? 'Apply to CA (optional)' : `CA #${v}`)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {cashAdvances.map((ca) => (
                  <MenuItem key={ca.id} value={ca.id}>
                    CA #{ca.id} – Balance ₱{Number(ca.balance_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          )}
        </Box>

        {isViewingSubmitted && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
            <Typography variant="body2" sx={{ color: 'info.dark', fontWeight: 500 }}>
              Viewing submitted liquidation (read-only). To create a new liquidation, select "Load liquidation…" and choose a draft or create a new form.
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addRow}
            disabled={isViewingSubmitted}
            sx={{
              bgcolor: theme.primary,
              '&:hover': { bgcolor: theme.secondary },
            }}
          >
            Add row
          </Button>
        </Box>

        <TableContainer sx={{ border: `1px solid ${theme.border}`, borderRadius: 1, flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: theme.primary + '12' }}>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, width: 48 }}>No.</TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 110 }}>
                  Date
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 120 }}>
                  Category
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 180 }}>
                  Project Name
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 120 }}>
                  PO #
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 160 }}>
                  Particulars
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 100 }}>
                  Amount
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: theme.primary, minWidth: 100 }}>
                  Remarks
                </TableCell>
                <TableCell sx={{ width: 56 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Click "Add row" to add expense lines. Select a project per row from the list.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.id} hover sx={{ '&:hover .delete-btn': { opacity: 1 } }}>
                    <TableCell sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                        disabled={isViewingSubmitted}
                        fullWidth
                        variant="outlined"
                        InputLabelProps={{ shrink: true }}
                        sx={{ maxWidth: 140, '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={row.category}
                        displayEmpty
                        onChange={(e) => updateRow(row.id, 'category', e.target.value)}
                        disabled={isViewingSubmitted}
                        sx={{ minWidth: 130, '& .MuiSelect-select': { py: 0.75 } }}
                      >
                        <MenuItem value="">
                          <em>Select</em>
                        </MenuItem>
                        {LIQUIDATION_CATEGORIES.map((c) => (
                          <MenuItem key={c} value={c}>
                            {c}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select<number | ''>
                        size="small"
                        value={row.projectId === '' ? '' : row.projectId}
                        displayEmpty
                        onChange={(e) => {
                          const val = e.target.value;
                          setRowProject(row.id, val === '' ? '' : Number(val));
                        }}
                        disabled={isViewingSubmitted}
                        sx={{ minWidth: 200, width: '100%', '& .MuiSelect-select': { py: 0.75 } }}
                        renderValue={(v: number | '') => {
                          if (v === '' || v === undefined) return <em>Select project</em>;
                          const p = projects.find((x) => x.id === v);
                          return p?.project_name || row.projectName || '—';
                        }}
                      >
                        <MenuItem value="">
                          <em>Select project</em>
                        </MenuItem>
                        {projects.map((p) => (
                          <MenuItem key={p.id} value={p.id}>
                            {p.project_name || `Project ${p.id}`}
                            {(p.po_number || p.project_no) ? ` (${p.po_number || p.project_no})` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.projectNo}
                        onChange={(e) => updateRow(row.id, 'projectNo', e.target.value)}
                        placeholder="PO #"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.particulars}
                        onChange={(e) => updateRow(row.id, 'particulars', e.target.value)}
                        placeholder="Particulars"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        inputProps={{ min: 0, step: 0.01 }}
                        value={row.amount || ''}
                        onChange={(e) =>
                          updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)
                        }
                        fullWidth
                        sx={{ maxWidth: 110, '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.remarks}
                        onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                        placeholder="Remarks"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => removeRow(row.id)}
                        className="delete-btn"
                        sx={{ opacity: { xs: 1, md: 0.5 }, color: 'error.main' }}
                        aria-label="Delete row"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {rows.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.primary }}>
              TOTAL AMOUNT: ± {totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} 
            </Typography>
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={submitLiquidation}
              disabled={saving || isViewingSubmitted}
              sx={{ bgcolor: theme.secondary, '&:hover': { bgcolor: theme.primary } }}
            >
              Submit liquidation
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
