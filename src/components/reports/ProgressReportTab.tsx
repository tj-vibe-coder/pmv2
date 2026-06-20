import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
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
  TableFooter,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { Project } from '../../types/Project';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import { resolveCorporateDriveId, uploadFileToFolderById, ensureExecutionFolder } from '../../services/onedriveFolderService';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import dataService from '../../services/dataService';
import {
  REPORT_COMPANIES,
  type ReportCompanyKey,
  WBSItem,
  loadWBS,
  saveWBS,
  parseWBSNum,
  ProgressSnapshot,
  getProgressSnapshots,
  saveProgressSnapshot,
  updateProgressSnapshotAt,
  deleteProgressSnapshotAt,
} from '../ProjectDetails';
import { arialNarrowBase64 } from '../../fonts/arialNarrowBase64';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const DR_HEADER_BLUE = [44, 90, 160] as [number, number, number];

const wbsInputSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.9375rem', backgroundColor: '#fff', '& fieldset': { borderColor: '#e2e8f0' }, '&:hover fieldset': { borderColor: '#cbd5e1' }, '&.Mui-focused fieldset': { borderWidth: '1px', borderColor: NET_PACIFIC_COLORS.primary } },
  '& .MuiInputBase-input': { py: 1, px: 1.25, fontSize: '0.9375rem', color: '#1e293b' },
};
const wbsNumInputSx = {
  ...wbsInputSx,
  '& .MuiInputBase-input': { ...wbsInputSx['& .MuiInputBase-input'], textAlign: 'right', fontWeight: 600 },
  '& .MuiInputBase-input[type=number]': { MozAppearance: 'textfield' },
};

export interface Approver {
  name: string;
  designation: string;
  company: string;
}

export interface ProgressReportTabProps {
  project: Project;
  currentUser: { full_name?: string | null; username?: string; email?: string } | null;
  reportCompany: ReportCompanyKey;
  setReportCompany: (v: ReportCompanyKey) => void;
  preparedBy: { name: string; designation: string; company: string; date: string };
  setPreparedBy: React.Dispatch<React.SetStateAction<{ name: string; designation: string; company: string; date: string }>>;
  onPreview: (blob: Blob, title: string) => void;
  /** Pre-fill the PB # field (passed from ProjectDetails milestone row link) */
  initialPb?: string;
  /** Resolved client contact to use as the "Approved by" signatory */
  clientApprover?: { name: string; designation: string; company: string };
  /** All contacts from the project's client — powers the approver name autocomplete */
  clientContacts?: { name: string; designation: string; company: string }[];
}

const ProgressReportTab: React.FC<ProgressReportTabProps> = ({
  project,
  currentUser,
  reportCompany,
  setReportCompany,
  preparedBy,
  setPreparedBy,
  onPreview,
  initialPb,
  clientApprover,
  clientContacts = [],
}) => {
  const navigate = useNavigate();
  const { isAuthenticated: oneDriveSignedIn, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  // Local copy of execution folder id — updated if we auto-create the folder on first export
  const [localExecutionFolderId, setLocalExecutionFolderId] = useState(project.executionFolderId);
  useEffect(() => { setLocalExecutionFolderId(project.executionFolderId); }, [project.id, project.executionFolderId]);
  // Resolved via project_no — ensures PDFs land in the IOCT ops folder, not a PCS subfolder
  const [resolvedExecFolderId, setResolvedExecFolderId] = useState<string | null>(null);
  useEffect(() => { setResolvedExecFolderId(null); }, [project.id]);
  const [wbsItems, setWbsItems] = useState<WBSItem[]>([]);
  const [pbInput, setPbInput] = useState(initialPb ?? '');
  const [showBillingHint, setShowBillingHint] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [editingSnapshotIndex, setEditingSnapshotIndex] = useState<number | null>(null);
  const [wbsDraft, setWbsDraft] = useState<Record<string, { progress?: string; weight?: string }>>({});
  const [approvers, setApprovers] = useState<Approver[]>(() => {
    // Prefer client DB contact; fall back to parsing the legacy text field
    if (clientApprover?.name || clientApprover?.designation) {
      return [{ name: clientApprover.name, designation: clientApprover.designation, company: clientApprover.company }];
    }
    const approverParts = (project.client_approver || '').split(/\s*[–-]\s*/);
    const approverName = (approverParts[0] || '').trim();
    const approverDesignation = (approverParts[1] || '').trim();
    const approverCompany = (project.account_name || '').trim();
    if (approverName || approverDesignation || approverCompany) {
      return [{ name: approverName, designation: approverDesignation, company: approverCompany }];
    }
    return [];
  });

  useEffect(() => {
    setWbsItems(loadWBS(project.id));
  }, [project.id]);

  // Sync initialPb into the PB# field whenever it changes (e.g. user arrives via milestone row link)
  useEffect(() => {
    if (initialPb) setPbInput(initialPb);
  }, [initialPb]);

  // Update the approvers list when the resolved client contact arrives (async fetch in ReportsPage).
  // Only update slot 0 — preserve any extra approvers the user has manually added.
  useEffect(() => {
    if (clientApprover?.name || clientApprover?.designation) {
      const first = { name: clientApprover.name, designation: clientApprover.designation, company: clientApprover.company };
      setApprovers(prev => prev.length === 0 ? [first] : [first, ...prev.slice(1)]);
    }
  }, [clientApprover]);

  // snapshotVersion triggers refetch when user saves a snapshot
  // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshotVersion is intentional
  const progressSnapshots = useMemo(() => getProgressSnapshots(project.id), [project.id, snapshotVersion]);

  // Helper function to check if a code is a parent (has children)
  const isParentItem = useCallback((code: string, allItems: WBSItem[]): boolean => {
    if (!code || code.trim() === '') return false;
    const parentCode = code.trim();
    return allItems.some((item) => {
      const itemCode = (item.code || '').trim();
      return itemCode.startsWith(parentCode + '.') && itemCode !== parentCode;
    });
  }, []);

  // Helper function to get child items of a parent
  const getChildItems = useCallback((parentCode: string, allItems: WBSItem[]): WBSItem[] => {
    const code = (parentCode || '').trim();
    if (!code) return [];
    return allItems.filter((item) => {
      const itemCode = (item.code || '').trim();
      return itemCode.startsWith(code + '.') && itemCode !== code;
    });
  }, []);

  // Helper function to calculate totals for a parent item
  const calculateParentTotals = useCallback((parentCode: string, allItems: WBSItem[]): { weight: number; progress: number } => {
    const children = getChildItems(parentCode, allItems);
    if (children.length === 0) return { weight: 0, progress: 0 };
    
    const totalWeight = children.reduce((sum, item) => sum + parseWBSNum(item.weight), 0);
    const weightedSum = children.reduce((sum, item) => {
      const weight = parseWBSNum(item.weight);
      const progress = parseWBSNum(item.progress);
      return sum + (weight * progress) / 100;
    }, 0);
    
    const progress = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
    return { weight: totalWeight, progress };
  }, [getChildItems]);

  // Helper function to get indentation level (0 = parent, 1 = child, 2 = grandchild, etc.)
  const getIndentLevel = (code: string): number => {
    if (!code || code.trim() === '') return 0;
    const matches = code.match(/\./g);
    return matches ? matches.length : 0;
  };

  const wbsOverallProgress = useMemo(() => {
    if (wbsItems.length === 0) return 0;
    // Only count top-level items (items without a parent) for overall progress
    const topLevelItems = wbsItems.filter((item) => {
      const code = (item.code || '').trim();
      if (!code) return false;
      // Check if this is a top-level item (no parent exists)
      return !wbsItems.some((other) => {
        const otherCode = (other.code || '').trim();
        if (!otherCode || otherCode === code) return false;
        return code.startsWith(otherCode + '.');
      });
    });
    
    if (topLevelItems.length === 0) {
      // Fallback to all items if no hierarchy detected
      const totalWeight = wbsItems.reduce((s, i) => s + parseWBSNum(i.weight), 0);
      const weightedSum = wbsItems.reduce((s, i) => s + (parseWBSNum(i.weight) * parseWBSNum(i.progress)) / 100, 0);
      if (totalWeight > 0) return (weightedSum / totalWeight) * 100;
      return wbsItems.reduce((s, i) => s + parseWBSNum(i.progress), 0) / wbsItems.length;
    }
    
    const totalWeight = topLevelItems.reduce((s, i) => {
      const code = (i.code || '').trim();
      if (isParentItem(code, wbsItems)) {
        return s + calculateParentTotals(code, wbsItems).weight;
      }
      return s + parseWBSNum(i.weight);
    }, 0);
    
    const weightedSum = topLevelItems.reduce((s, i) => {
      const code = (i.code || '').trim();
      let weight: number;
      let progress: number;
      
      if (isParentItem(code, wbsItems)) {
        const totals = calculateParentTotals(code, wbsItems);
        weight = totals.weight;
        progress = totals.progress;
      } else {
        weight = parseWBSNum(i.weight);
        progress = parseWBSNum(i.progress);
      }
      return s + (weight * progress) / 100;
    }, 0);
    
    if (totalWeight > 0) return (weightedSum / totalWeight) * 100;
    return topLevelItems.reduce((s, i) => {
      const code = (i.code || '').trim();
      if (isParentItem(code, wbsItems)) {
        return s + calculateParentTotals(code, wbsItems).progress;
      }
      return s + parseWBSNum(i.progress);
    }, 0) / topLevelItems.length;
  }, [calculateParentTotals, isParentItem, wbsItems]);

  const syncProjectStatusFromWBS = (items: WBSItem[]) => {
    if (items.length === 0) return;
    const totalWeight = items.reduce((s, i) => s + parseWBSNum(i.weight), 0);
    const weighted = items.reduce((s, i) => s + (parseWBSNum(i.weight) * parseWBSNum(i.progress)) / 100, 0);
    const pct = totalWeight > 0 ? (weighted / totalWeight) * 100 : items.reduce((s, i) => s + parseWBSNum(i.progress), 0) / items.length;
    const rounded = Math.round(pct);
    dataService.updateProject(project.id, { actual_site_progress_percent: rounded }).catch(() => {});
  };

  const handleAddWBSItem = () => {
    const newItem: WBSItem = { id: `wbs-${Date.now()}`, code: '', name: '', weight: 0, progress: 0 };
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
    } else {
      saveProgressSnapshot(project.id, snapshot);
    }
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
    setSnapshotVersion((v) => v + 1);
  };

  const handleLoadSnapshot = (snapshot: ProgressSnapshot, index: number) => {
    setWbsItems(snapshot.wbsItems);
    setPbInput(snapshot.pbNumber === '—' ? '' : snapshot.pbNumber);
    saveWBS(project.id, snapshot.wbsItems);
    syncProjectStatusFromWBS(snapshot.wbsItems);
    setEditingSnapshotIndex(index);
  };

  const handleDeleteLoadedSnapshot = () => {
    if (editingSnapshotIndex === null || progressSnapshots[editingSnapshotIndex] == null) return;
    handleDeleteSnapshot(editingSnapshotIndex);
  };

  const handleDeleteSnapshot = (index: number) => {
    const snapshot = progressSnapshots[index];
    if (!snapshot) return;
    if (!window.confirm(`Delete saved progress report "PB${snapshot.pbNumber}"? This cannot be undone.`)) return;
    deleteProgressSnapshotAt(project.id, index);
    if (editingSnapshotIndex === index) {
      setEditingSnapshotIndex(null);
    } else if (editingSnapshotIndex !== null && index < editingSnapshotIndex) {
      setEditingSnapshotIndex(editingSnapshotIndex - 1);
    }
    setSnapshotVersion((v) => v + 1);
  };

  const buildPdf = async (preview: boolean): Promise<Blob | { blob: Blob; filename: string } | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    const signatureStartY = 220; // Position for Prepared by / Approved by (moved up to avoid footer overlap)
    const footerY = pageHeight - 10; // Doc. No. and Page X of Y at very bottom
    const lineHeight = 5.2;
    const sectionGap = 6;
    const afterHeading = 4;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'bold');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');

    const companyName = REPORT_COMPANIES[reportCompany];
    const completionPct = Math.round(wbsOverallProgress * 100) / 100;
    const poNum = project.po_number || '—';

    // Helper function to add header content (logo + project details) to a page
    const addPageHeader = async (pageY: number, isFirstPage: boolean = false): Promise<number> => {
      let currentY = pageY;
      
      // Add "Progress Report" title in upper right
      fontTitle();
      doc.setFontSize(14);
      doc.text('Progress Report', 210 - margin, currentY, { align: 'right' });
      
      // Add date below Progress Report (format: February 04, 2026)
      const formatReportDate = (input: string | undefined): string => {
        const d = input ? (() => {
          const parts = input.trim().split(/[/-]/);
          if (parts.length === 3) {
            const [a, b, c] = parts.map(Number);
            if (input.includes('/')) return new Date(c, a - 1, b); // MM/DD/YYYY
            return new Date(a, b - 1, c); // ISO-like YYYY-MM-DD
          }
          return new Date(input);
        })() : new Date();
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });
      };
      const reportDate = formatReportDate(preparedBy.date);
      fontBody();
      doc.setFontSize(9);
      doc.text(reportDate, 210 - margin, currentY + lineHeight, { align: 'right' });
      
      // Add logo - positioned higher to align with header
      const logoY = pageY - 6; // Move logo up by 6mm to make it look more like a header
      let logoHeight = 0;
      if (reportCompany === 'ACT') {
        try {
          const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../../utils/logoUtils');
          const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
          const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
          doc.addImage(logoDataUrl, 'PNG', margin, logoY, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT);
          logoHeight = ACT_LOGO_PDF_HEIGHT;
          currentY = Math.max(currentY, logoY + ACT_LOGO_PDF_HEIGHT + 4);
        } catch (_) {}
      } else if (reportCompany === 'IOCT') {
        try {
          const { loadImageDataUrl, IOCT_ICON_LOGO_PDF_SIZE } = await import('../../utils/logoUtils');
          const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-ioct-only.png`;
          const logoDataUrl = await loadImageDataUrl(logoUrl);
          doc.addImage(logoDataUrl, 'PNG', margin, logoY, IOCT_ICON_LOGO_PDF_SIZE, IOCT_ICON_LOGO_PDF_SIZE);
          logoHeight = IOCT_ICON_LOGO_PDF_SIZE;
          currentY = Math.max(currentY, logoY + IOCT_ICON_LOGO_PDF_SIZE + 4);
        } catch (_) {}
      }
      
      // Add company name in bold below logo
      if (logoHeight > 0) {
        fontTitle();
        doc.setFontSize(11);
        doc.text(companyName, margin, currentY);
        currentY += lineHeight + 2;
      }

      // Add Project Details
      fontTitle();
      doc.setFontSize(12);
      doc.text('Project Details', margin, currentY);
      fontBody();
      currentY += lineHeight + afterHeading;
      doc.setFontSize(9);
      doc.text(`Project Name: ${project.project_name || '—'}`, margin, currentY);
      currentY += lineHeight;
      doc.text(`Project No.: ${project.project_no || String(project.item_no ?? project.id) || '—'}`, margin, currentY);
      currentY += lineHeight;
      doc.text(`Purchase Order No.: ${project.po_number || '—'}`, margin, currentY);
      currentY += lineHeight;
      doc.text(`Client: ${project.account_name || '—'}`, margin, currentY);
      currentY += lineHeight;
      {
        const locationLabel = 'Project Location: ';
        const locationValue = project.project_location || '—';
        const labelWidth = doc.getTextWidth(locationLabel);
        // Wrap only the value part; indent continuation lines to align under the value
        const valueLines = doc.splitTextToSize(locationValue, contentWidth - labelWidth);
        doc.text(locationLabel + valueLines[0], margin, currentY);
        for (let li = 1; li < valueLines.length; li++) {
          currentY += lineHeight;
          doc.text(valueLines[li], margin + labelWidth, currentY);
        }
        currentY += lineHeight + sectionGap;
      }
      
      // Add Project Status and Certification Statement only on first page
      if (isFirstPage) {
        fontTitle();
        doc.setFontSize(11);
        doc.text('Project Status', margin, currentY);
        fontBody();
        currentY += lineHeight + afterHeading - 1;
        doc.setFontSize(9);
        
        // Build certification text with bold parts - draw segment by segment
        const certPart1 = `${companyName} hereby certifies that `;
        const certPart2 = `(${completionPct}%)`;
        const certPart3 = ` of the total scope of work under Purchase Order No. `;
        const certPart4 = `${poNum}`;
        const certPart5 = ` has been completed as of the date of this report. The completed works were executed in full compliance with the approved project scope, technical specifications, and contractual obligations. All deliverables corresponding to the stated progress have been properly performed and documented.`;
        
        let xPos = margin;
        let yPos = currentY;
        const maxWidth = margin + contentWidth;
        
        // Helper to draw text with wrapping
        const drawTextSegment = (text: string, isBold: boolean) => {
          if (isBold) {
            fontTitle();
          } else {
            fontBody();
          }
          
          const words = text.split(' ');
          for (let i = 0; i < words.length; i++) {
            const word = words[i] + (i < words.length - 1 ? ' ' : '');
            const wordWidth = doc.getTextWidth(word);
            
            // Check if word fits on current line
            if (xPos + wordWidth > maxWidth && xPos > margin) {
              // Move to next line
              yPos += lineHeight;
              xPos = margin;
            }
            
            doc.text(word, xPos, yPos);
            xPos += wordWidth;
          }
        };
        
        // Draw each part
        drawTextSegment(certPart1, false);
        drawTextSegment(certPart2, true); // Bold percentage
        drawTextSegment(certPart3, false);
        drawTextSegment(certPart4, true); // Bold PO number
        drawTextSegment(certPart5, false);
        
        currentY = yPos + lineHeight + sectionGap;

        fontTitle();
        doc.setFontSize(11);
        doc.text('Certification Statement', margin, currentY);
        fontBody();
        currentY += lineHeight + afterHeading - 1;
        doc.setFontSize(9);
        doc.text('This certification is issued for documentation, verification, and progress billing purposes.', margin, currentY);
        currentY += lineHeight + 4;
      }
      
      return currentY;
    };

    // Prepare WBS rows data
    const wbsRows = wbsItems.map((i) => {
      const code = (i.code || '').trim();
      const isParent = isParentItem(code, wbsItems);
      const indentLevel = getIndentLevel(code);
      const indentSpaces = '  '.repeat(indentLevel);
      const name = (i.name || '—').slice(0, 50);
      const indentedName = indentSpaces + name;
      
      let weight: string;
      let progress: string;
      
      if (isParent) {
        const totals = calculateParentTotals(code, wbsItems);
        weight = totals.weight.toFixed(2);
        progress = totals.progress.toFixed(2);
      } else {
        weight = Number(parseWBSNum(i.weight)).toFixed(2);
        progress = Number(parseWBSNum(i.progress)).toFixed(2);
      }
      
      return {
        code: code || '—',
        name: indentedName,
        weight,
        progress,
        isParent,
      };
    });

    const totalPct = wbsOverallProgress.toFixed(2);
    const rowsPerPage = 10;
    const dataRows = wbsRows.map((r) => [r.code, r.name, r.weight, r.progress]);
    const totalRow = ['', 'Total', '', `${totalPct}%`];
    
    // Parent-only summary for last page (code, name, weight, progress)
    const parentOnlyRows = wbsRows.filter((r) => r.isParent);
    const summaryTableRows = parentOnlyRows.length > 0
      ? [
          ...parentOnlyRows.map((r) => [r.code, r.name.trim(), r.weight, r.progress]),
          ['', 'Total', parentOnlyRows.reduce((s, r) => s + parseFloat(r.weight), 0).toFixed(2), totalPct],
        ]
      : [];
    
    // Split rows into pages
    const rowChunks: (string | number)[][][] = [];
    for (let i = 0; i < dataRows.length; i += rowsPerPage) {
      rowChunks.push(dataRows.slice(i, i + rowsPerPage));
    }
    
    // If no rows, add empty state
    if (rowChunks.length === 0) {
      rowChunks.push([['—', 'No WBS items', '—', '—']]);
    }

    // Add signature section helper
    const addSignatureSection = (startY: number): number => {
      const pageWidth = 210;
      const sigLineHeight = 5;
      let y = startY;
      
      const colSpacing = 8; // Spacing between columns in mm
      const preparedByWidth = 50;
      const originalRightColX = margin + 95; // Single approver: keep on the right
      
      const numApprovers = approvers.length > 0 ? Math.min(approvers.length, 3) : 1;
      const col0 = margin;
      let col1: number;
      
      if (numApprovers === 1) {
        col1 = originalRightColX;
      } else {
        col1 = col0 + preparedByWidth + colSpacing; // unused for 2/3; approvers go below
      }
      
      fontTitle();
      doc.setFontSize(10);
      doc.text('Prepared by:', col0, y);
      if (numApprovers === 1) {
        doc.text('Approved by:', col1, y);
      }
      
      let rowY = y + sigLineHeight;
      fontBody();
      doc.setFontSize(9);
      
      const preparedByName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim() || '—';
      const preparedByDesignation = (preparedBy.designation || '').trim() || '—';
      // Always use the selected report company — not the free-text field which may be stale
      const preparedByCompany = companyName;
      
      // One line before name for signature
      const preparedByNameY = rowY + sigLineHeight;
      doc.text(preparedByName, col0, preparedByNameY);
      let preparedByY = preparedByNameY + sigLineHeight;
      if (preparedByDesignation !== '—') {
        doc.text(preparedByDesignation, col0, preparedByY);
        preparedByY += sigLineHeight;
      }
      doc.text(preparedByCompany, col0, preparedByY);
      preparedByY += sigLineHeight;
      
      let maxApproverY = rowY;
      const rowGap = sigLineHeight + 4; // gap between Prepared by block and Approved by row
      
      if (approvers.length > 0) {
        if (numApprovers === 1) {
          const approver = approvers[0];
          const approverName = (approver.name || '').trim();
          const approverDesignation = (approver.designation || '').trim();
          const approverCompany = (approver.company || '').trim();
          // One line before name for signature
          let approverY = rowY + sigLineHeight;
          if (approverName) {
            doc.text(approverName, col1, approverY);
            approverY += sigLineHeight;
          }
          if (approverDesignation) {
            doc.text(approverDesignation, col1, approverY);
            approverY += sigLineHeight;
          }
          if (approverCompany) {
            doc.text(approverCompany, col1, approverY);
            approverY += sigLineHeight;
          }
          maxApproverY = Math.max(maxApproverY, approverY);
        } else {
          // 2 or 3 approvers: place below Prepared by, distributed across full page width
          const approvedByStartY = preparedByY + rowGap;
          const labelY = approvedByStartY;
          // One line before names for signature
          const approverContentY = approvedByStartY + sigLineHeight + sigLineHeight;
          
          fontTitle();
          doc.setFontSize(10);
          doc.text('Approved by:', col0, labelY);
          fontBody();
          doc.setFontSize(9);
          
          const availableWidth = pageWidth - margin * 2;
          const n = numApprovers;
          const totalSpacing = (n - 1) * colSpacing;
          const totalColWidth = availableWidth - totalSpacing;
          const colWidth = totalColWidth / n;
          const approverCols: number[] = [];
          for (let i = 0; i < n; i++) {
            approverCols.push(margin + i * (colWidth + colSpacing));
          }
          
          for (let i = 0; i < n; i++) {
            const approver = approvers[i];
            const approverName = (approver.name || '').trim();
            const approverDesignation = (approver.designation || '').trim();
            const approverCompany = (approver.company || '').trim();
            const colX = approverCols[i];
            let approverY = approverContentY;
            if (approverName) {
              doc.text(approverName, colX, approverY);
              approverY += sigLineHeight;
            }
            if (approverDesignation) {
              doc.text(approverDesignation, colX, approverY);
              approverY += sigLineHeight;
            }
            if (approverCompany) {
              doc.text(approverCompany, colX, approverY);
              approverY += sigLineHeight;
            }
            maxApproverY = Math.max(maxApproverY, approverY);
          }
        }
      } else {
        const approverParts = (project.client_approver || '').split(/\s*[–-]\s*/);
        const approverName = (approverParts[0] || '').trim();
        const approverDesignation = (approverParts[1] || '').trim();
        const approverCompany = (project.account_name || '').trim();
        // One line before name for signature
        let approverY = rowY + sigLineHeight;
        if (approverName) {
          doc.text(approverName, col1, approverY);
          approverY += sigLineHeight;
        }
        if (approverDesignation) {
          doc.text(approverDesignation, col1, approverY);
          approverY += sigLineHeight;
        }
        if (approverCompany) {
          doc.text(approverCompany, col1, approverY);
          approverY += sigLineHeight;
        }
        maxApproverY = Math.max(maxApproverY, approverY);
      }
      
      return Math.max(preparedByY, maxApproverY) + sigLineHeight;
    };

    // Generate pages
    const headers = ['Code', 'Deliverables', 'Weight %', 'Progress %'];
    let tableStartY = await addPageHeader(18, true); // First page includes Project Status and Certification
    const pageTableEndY: number[] = []; // Track table end position for each page
    
    for (let pageIndex = 0; pageIndex < rowChunks.length; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage();
        tableStartY = await addPageHeader(18, false); // Subsequent pages only have logo and Project Details
      }
      
      const pageRows = rowChunks[pageIndex];
      const isLastPage = pageIndex === rowChunks.length - 1;
      const bodyRows = isLastPage ? [...pageRows, totalRow] : pageRows;
      
      autoTable(doc, {
        head: [headers],
        body: bodyRows,
        startY: tableStartY,
        margin: { left: margin, right: margin },
        tableWidth: 'auto',
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 } },
        styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica' },
        headStyles: { 
          fillColor: DR_HEADER_BLUE, 
          textColor: [255, 255, 255], 
          fontStyle: 'bold', 
          fontSize: 8,
          font: 'helvetica'
        },
        didParseCell: (data) => {
          if (data.section === 'head') {
            // Make headers bold Arial Narrow
            data.cell.styles.font = 'helvetica';
            data.cell.styles.fontStyle = 'bold';
          } else if (data.section === 'body') {
            const rowIndex = data.row.index;
            const globalRowIndex = pageIndex * rowsPerPage + rowIndex;
            if (rowIndex === bodyRows.length - 1 && isLastPage) {
              // Total row
              data.cell.styles.fontStyle = 'bold';
            } else if (globalRowIndex < wbsRows.length) {
              const rowData = wbsRows[globalRowIndex];
              if (rowData.isParent) {
                // Parent items should be bold, yellow background, and use Arial Narrow
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [255, 250, 205]; // Light yellow (#fffacd)
                data.cell.styles.font = hasArialNarrow ? 'ArialNarrow' : 'helvetica';
              }
            }
          }
        },
      });
      
      const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
      let tableFinalY = docWithTable.lastAutoTable?.finalY ?? tableStartY;
      
      // On last page, add parent-only summary table above signature area
      if (isLastPage && summaryTableRows.length > 0) {
        const summaryGap = 6;
        let summaryStartY = tableFinalY + summaryGap;
        
        fontTitle();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold'); // Ensure Summary title is bold
        doc.text('Summary', margin, summaryStartY);
        fontBody();
        summaryStartY += lineHeight + 2;
        
        autoTable(doc, {
          head: [['Code', 'Deliverables', 'Weight %', 'Progress %']],
          body: summaryTableRows,
          startY: summaryStartY,
          margin: { left: margin, right: margin },
          tableWidth: 'auto',
          columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 } },
          styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica', fontStyle: 'bold' },
          headStyles: {
            fillColor: DR_HEADER_BLUE,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            font: 'helvetica',
          },
          didParseCell: (data) => {
            // All body cells are bold (no yellow background)
            if (data.section === 'body') {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.font = 'helvetica';
            }
          },
        });
        
        // Update tableFinalY to include summary table
        tableFinalY = docWithTable.lastAutoTable?.finalY ?? tableFinalY;
      }
      
      // Store the table end position for this page
      pageTableEndY.push(tableFinalY);
    }

    // Draw signature section (Prepared by / Approved by) at bottom of each page, then Doc. No. below it
    const projectNo = project.project_no || String(project.item_no ?? project.id) || '—';
    const pbNumRaw = pbInput.trim() || '0';
    // Format PB number with leading zeros (2 digits: 01, 02, etc.)
    const pbNum = pbNumRaw === '—' || pbNumRaw === '' ? '01' : String(Number(pbNumRaw) || 1).padStart(2, '0');
    const docNumber = `Doc. No.: ${projectNo}-PB-${pbNum}`;
    const totalPages = doc.getNumberOfPages();
    
    // Determine spacing needed based on number of approvers
    const numApprovers = approvers.length > 0 ? Math.min(approvers.length, 3) : 1;
    const signatureGap = numApprovers === 3 ? 10 : 8; // More spacing for 3 approvers
    
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      
      // Calculate signature start position dynamically based on table end position
      // Use the stored table end Y for this page, or fallback to fixed position
      const tableEndY = pageTableEndY[p - 1] ?? signatureStartY;
      const calculatedSignatureStartY = tableEndY + signatureGap;
      
      // Ensure signature doesn't go too low (use minimum position)
      const minSignatureY = signatureStartY;
      const adjustedSignatureStartY = Math.max(calculatedSignatureStartY, minSignatureY);
      
      const signatureEndY = addSignatureSection(adjustedSignatureStartY);
      // Ensure Doc. No. is below signature section with spacing
      const docNoY = Math.max(signatureEndY + 4, footerY - 5);
      doc.text(docNumber, margin, docNoY);
      doc.text(`Page ${p} of ${totalPages}`, 210 - margin, docNoY, { align: 'right' });
    }

    if (preview) return doc.output('blob') as Blob;
    // Use Doc. No. as filename (without "Doc. No.: " prefix)
    const fileName = `${projectNo}-PB-${pbNum}.pdf`;
    doc.save(fileName);
    return { blob: doc.output('blob') as Blob, filename: fileName };
  };

  const handlePreview = async () => {
    const result = await buildPdf(true);
    if (result instanceof Blob) onPreview(result, 'Progress Report');
  };

  const handleExport = async () => {
    setExporting(true);
    setExportFeedback(null);
    try {
      const result = await buildPdf(false);
      // result is { blob, filename } for preview=false
      if (!result || result instanceof Blob) return;
      const { blob, filename } = result;

      // Show billing hint if a PB# is set
      if (pbInput.trim()) setShowBillingHint(true);

      // Best-effort OneDrive upload — auto-creates the execution folder when it doesn't exist yet
      if (!isCorporateOneDriveConfigured()) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. OneDrive is not configured.' });
        return;
      }
      if (!oneDriveSignedIn) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. Sign in to OneDrive to upload it.' });
        return;
      }
      const token = await getOneDriveToken();
      if (!token) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. Could not get OneDrive access token.' });
        return;
      }
      const driveId = await resolveCorporateDriveId(token);
      // Always resolve by project_no so PDFs land in the IOCT ops folder,
      // not inside a PCS proposal subfolder pointed to by a stale executionFolderId.
      let folderId = resolvedExecFolderId;
      if (!folderId) {
        const projectCode = project.project_no || String(project.item_no ?? project.id);
        const folder = await ensureExecutionFolder(token, { code: projectCode, name: project.project_name });
        folderId = folder.id;
        setResolvedExecFolderId(folderId);
        if (!localExecutionFolderId) {
          setLocalExecutionFolderId(folderId);
          dataService.updateProject(project.id, { executionFolderId: folder.id, executionFolderUrl: folder.webUrl }).catch(() => {});
        }
      }
      await uploadFileToFolderById(token, driveId, folderId, filename, blob);
      setExportFeedback({ severity: 'success', message: `PDF exported and uploaded to OneDrive: ${filename}` });
    } catch (e) {
      setExportFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'PDF exported locally, but OneDrive upload failed.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          Progress Report (WBS)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Define work packages and track progress. Save snapshots, then Preview or Export to PDF.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1.5, flexShrink: 0 }}>
        {wbsItems.length > 0 && (
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="subtitle2" color="text.secondary">Total progress: {wbsOverallProgress.toFixed(2)}%</Typography>
            <LinearProgress variant="determinate" value={Math.min(100, wbsOverallProgress)} sx={{ height: 12, borderRadius: 6, bgcolor: 'grey.200', '& .MuiLinearProgress-bar': { borderRadius: 6, bgcolor: NET_PACIFIC_COLORS.primary } }} />
          </Box>
        )}
        <TextField size="small" label="PB #" placeholder="e.g. 1" value={pbInput} onChange={(e) => setPbInput(e.target.value)} sx={{ width: 80 }} />
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>Prepared by (PDF):</Typography>
        <TextField size="small" label="Name" value={preparedBy.name} onChange={(e) => setPreparedBy((p) => ({ ...p, name: e.target.value }))} sx={{ width: 140 }} placeholder={currentUser?.full_name || currentUser?.username || currentUser?.email || 'Name'} />
        <TextField size="small" label="Designation" value={preparedBy.designation} onChange={(e) => setPreparedBy((p) => ({ ...p, designation: e.target.value }))} sx={{ width: 120 }} />
        <TextField size="small" label="Company" value={preparedBy.company} onChange={(e) => setPreparedBy((p) => ({ ...p, company: e.target.value }))} sx={{ width: 120 }} />
        <TextField size="small" label="Date" value={preparedBy.date} onChange={(e) => setPreparedBy((p) => ({ ...p, date: e.target.value }))} sx={{ width: 110 }} placeholder="MM/DD/YYYY" />
      </Box>
      
      {/* Approvers section */}
      <Box sx={{ mb: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Approved by (PDF) - Maximum 3 approvers:</Typography>
          {approvers.length < 3 && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setApprovers((prev) => [...prev, { name: '', designation: '', company: '' }])}
              sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}
            >
              Add Approver
            </Button>
          )}
        </Box>
        {approvers.map((approver, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Autocomplete
              freeSolo
              size="small"
              options={clientContacts}
              getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name)}
              isOptionEqualToValue={(opt, val) => opt.name === (typeof val === 'string' ? val : val.name)}
              inputValue={approver.name}
              onInputChange={(_, newVal, reason) => {
                // Only track typed text; selection is handled in onChange
                if (reason === 'input' || reason === 'clear') {
                  const updated = [...approvers];
                  updated[index] = { ...updated[index], name: newVal };
                  setApprovers(updated);
                }
              }}
              onChange={(_, newVal) => {
                if (newVal && typeof newVal !== 'string') {
                  // Contact selected from list — auto-fill all three fields
                  const updated = [...approvers];
                  updated[index] = { name: newVal.name, designation: newVal.designation, company: newVal.company };
                  setApprovers(updated);
                }
              }}
              renderOption={(props, opt) => (
                <li {...props} key={opt.name + opt.designation}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{opt.name}</Typography>
                    {(opt.designation || opt.company) && (
                      <Typography variant="caption" color="text.secondary">
                        {[opt.designation, opt.company].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={`Approver ${index + 1} - Name`}
                  size="small"
                  sx={{ width: 220 }}
                  placeholder={clientContacts.length > 0 ? 'Search client contacts…' : 'Name'}
                />
              )}
              sx={{ width: 220 }}
              noOptionsText="No client contacts found"
            />
            <TextField
              size="small"
              label="Designation"
              value={approver.designation}
              onChange={(e) => {
                const updated = [...approvers];
                updated[index] = { ...updated[index], designation: e.target.value };
                setApprovers(updated);
              }}
              sx={{ width: 140 }}
            />
            <TextField
              size="small"
              label="Company"
              value={approver.company}
              onChange={(e) => {
                const updated = [...approvers];
                updated[index] = { ...updated[index], company: e.target.value };
                setApprovers(updated);
              }}
              sx={{ width: 180 }}
            />
            <IconButton
              size="small"
              onClick={() => setApprovers((prev) => prev.filter((_, i) => i !== index))}
              color="error"
              title="Remove approver"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {approvers.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', ml: 1 }}>
            No approvers added. Click "Add Approver" to add one.
          </Typography>
        )}
      </Box>
      
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1.5, flexShrink: 0 }}>
        <Button variant="contained" size="small" onClick={handleSaveProgress} disabled={wbsItems.length === 0} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>{saveFeedback ? 'Saved' : editingSnapshotIndex !== null ? 'Update snapshot' : 'Save'}</Button>
        <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} disabled={wbsItems.length === 0} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview PDF</Button>
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExport} disabled={wbsItems.length === 0 || exporting} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>{exporting ? 'Uploading…' : 'Export to PDF'}</Button>
        {progressSnapshots.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="load-snapshot-label">Load previous progress</InputLabel>
            <Select labelId="load-snapshot-label" value="" label="Load previous progress" onChange={(e) => {
              const idx = Number(e.target.value);
              if (!Number.isNaN(idx) && progressSnapshots[idx] != null) handleLoadSnapshot(progressSnapshots[idx], idx);
              (e.target as HTMLSelectElement).value = '';
            }}>
              <MenuItem value=""><em>— Select to load —</em></MenuItem>
              {progressSnapshots.map((s, idx) => (
                <MenuItem key={s.date + s.pbNumber} value={idx}>{new Date(s.date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · PB{s.pbNumber}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>
      {progressSnapshots.length > 0 && (
        <TableContainer sx={{ mb: 1.5, border: '1px solid #e2e8f0', borderRadius: 1, maxHeight: 180, flexShrink: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>Saved progress reports</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>Overall</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {progressSnapshots.map((s, idx) => (
                <TableRow key={`${s.date}-${s.pbNumber}-${idx}`} hover selected={editingSnapshotIndex === idx}>
                  <TableCell>PB{s.pbNumber}</TableCell>
                  <TableCell>{new Date(s.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</TableCell>
                  <TableCell align="right">{Math.round(s.overallProgress * 100) / 100}%</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleLoadSnapshot(s, idx)} sx={{ color: NET_PACIFIC_COLORS.primary }}>Load</Button>
                    <IconButton size="small" color="error" onClick={() => handleDeleteSnapshot(idx)} title="Delete snapshot" aria-label="Delete snapshot">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {editingSnapshotIndex !== null && progressSnapshots[editingSnapshotIndex] != null && (
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>
          <Typography variant="body2" sx={{ color: 'info.main', fontSize: '0.8125rem' }}>
            Editing: {new Date(progressSnapshots[editingSnapshotIndex].date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · PB{progressSnapshots[editingSnapshotIndex].pbNumber}. Click &quot;Update snapshot&quot; to save.
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setEditingSnapshotIndex(null)}>Cancel edit</Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDeleteLoadedSnapshot}>Delete snapshot</Button>
        </Box>
      )}
      {/* OneDrive upload feedback */}
      {exportFeedback && (
        <Alert severity={exportFeedback.severity} onClose={() => setExportFeedback(null)} sx={{ mb: 1.5, flexShrink: 0 }}>
          {exportFeedback.message}
        </Alert>
      )}

      {/* Billing hint: shown after PDF export when a PB# is set */}
      {showBillingHint && (
        <Alert
          severity="info"
          onClose={() => setShowBillingHint(false)}
          sx={{ mb: 1.5, flexShrink: 0 }}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                sessionStorage.setItem('selectedProjectId', String(project.id));
                navigate('/dashboard');
              }}
            >
              Go to Billing
            </Button>
          }
        >
          Progress report exported for <strong>{pbInput}</strong>. Ready to create the invoice? Go to the project's billing section.
        </Alert>
      )}
      <TableContainer sx={{ flex: 1, minHeight: 0, border: '1px solid #e2e8f0', borderRadius: 1, overflow: 'auto' }}>
        <Table stickyHeader size="medium" sx={{ minWidth: 560 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', borderBottom: '2px solid #e2e8f0', py: 2, px: 1.5, width: 100 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', borderBottom: '2px solid #e2e8f0', py: 2, px: 1.5, minWidth: 200 }}>Name</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', borderBottom: '2px solid #e2e8f0', py: 2, px: 1.5, width: 100 }}>Weight %</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', borderBottom: '2px solid #e2e8f0', py: 2, px: 1.5, width: 100 }}>Progress %</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: NET_PACIFIC_COLORS.primary, color: '#fff', borderBottom: '2px solid #e2e8f0', py: 2, px: 1.5, width: 72 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {wbsItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 5, px: 2, color: 'text.secondary', fontSize: '0.9375rem' }}>No WBS items. Click &quot;Add WBS item&quot; below.</TableCell>
              </TableRow>
            ) : (
              wbsItems.map((item, index) => {
                const code = (item.code || '').trim();
                const isParent = isParentItem(code, wbsItems);
                const indentLevel = getIndentLevel(code);
                const indentPx = indentLevel * 24; // 24px per level
                const parentTotals = isParent ? calculateParentTotals(code, wbsItems) : null;
                
                return (
                  <TableRow 
                    key={item.id} 
                    hover 
                    sx={{ 
                      bgcolor: isParent ? '#fffacd' : (index % 2 === 0 ? '#fff' : 'grey.50'),
                      '&:hover': {
                        bgcolor: isParent ? '#fff9c4' : undefined,
                      }
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
                        sx={{ 
                          ...wbsInputSx, 
                          '& .MuiInputBase-input': { 
                            ...wbsInputSx['& .MuiInputBase-input'], 
                            fontWeight: isParent ? 700 : 'normal',
                            fontFamily: isParent ? '"Arial Narrow", Arial, sans-serif' : undefined,
                          } 
                        }} 
                        inputProps={{ maxLength: 20 }} 
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                      <Box sx={{ pl: `${indentPx}px` }}>
                        <TextField 
                          size="small" 
                          fullWidth 
                          value={item.name} 
                          onChange={(e) => handleUpdateWBSItem(item.id, 'name', e.target.value)} 
                          placeholder="Work package name" 
                          variant="outlined" 
                          sx={{ 
                            ...wbsInputSx, 
                            '& .MuiInputBase-input': { 
                              ...wbsInputSx['& .MuiInputBase-input'], 
                              fontWeight: isParent ? 700 : 'normal',
                              fontFamily: isParent ? '"Arial Narrow", Arial, sans-serif' : undefined,
                            } 
                          }} 
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                      {isParent ? (
                        <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b', fontFamily: '"Arial Narrow", Arial, sans-serif' }}>
                          {parentTotals ? parentTotals.weight.toFixed(2) : '0.00'}
                        </Typography>
                      ) : (
                        <TextField 
                          size="small" 
                          type="number" 
                          fullWidth 
                          value={wbsDraft[item.id]?.weight ?? parseWBSNum(item.weight).toFixed(2)} 
                          onChange={(e) => setWbsDraft((prev) => ({ ...prev, [item.id]: { ...prev[item.id], weight: e.target.value } }))} 
                          onBlur={() => { const raw = wbsDraft[item.id]?.weight; if (raw !== undefined) { handleUpdateWBSItem(item.id, 'weight', parseWBSNum(raw)); setWbsDraft((prev) => { const next = { ...prev }; if (next[item.id]) { delete next[item.id].weight; if (Object.keys(next[item.id]).length === 0) delete next[item.id]; } return next; }); } }} 
                          inputProps={{ min: 0, max: 100, step: 0.01 }} 
                          variant="outlined" 
                          sx={wbsNumInputSx} 
                        />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                      {isParent ? (
                        <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b', fontFamily: '"Arial Narrow", Arial, sans-serif' }}>
                          {parentTotals ? parentTotals.progress.toFixed(2) : '0.00'}
                        </Typography>
                      ) : (
                        <TextField 
                          size="small" 
                          type="number" 
                          fullWidth 
                          value={wbsDraft[item.id]?.progress ?? parseWBSNum(item.progress).toFixed(2)} 
                          onChange={(e) => setWbsDraft((prev) => ({ ...prev, [item.id]: { ...prev[item.id], progress: e.target.value } }))} 
                          onBlur={() => { const raw = wbsDraft[item.id]?.progress; if (raw !== undefined) { handleUpdateWBSItem(item.id, 'progress', parseWBSNum(raw)); setWbsDraft((prev) => { const next = { ...prev }; if (next[item.id]) { delete next[item.id].progress; if (Object.keys(next[item.id]).length === 0) delete next[item.id]; } return next; }); } }} 
                          inputProps={{ min: 0, max: 100, step: 0.01 }} 
                          variant="outlined" 
                          sx={wbsNumInputSx} 
                        />
                      )}
                    </TableCell>
                    <TableCell align="center" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                      <IconButton size="small" onClick={() => handleDeleteWBSItem(item.id)} title="Delete" color="error"><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {wbsItems.length > 0 && (() => {
            // Calculate total weight from top-level items only
            const topLevelItems = wbsItems.filter((item) => {
              const code = (item.code || '').trim();
              if (!code) return false;
              // Check if this is a top-level item (no parent exists)
              return !wbsItems.some((other) => {
                const otherCode = (other.code || '').trim();
                if (!otherCode || otherCode === code) return false;
                return code.startsWith(otherCode + '.');
              });
            });
            
            const totalWeight = topLevelItems.reduce((sum, item) => {
              const code = (item.code || '').trim();
              if (isParentItem(code, wbsItems)) {
                return sum + calculateParentTotals(code, wbsItems).weight;
              }
              return sum + parseWBSNum(item.weight);
            }, 0);
            
            return (
              <TableFooter>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell colSpan={2} sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>Total progress</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>{totalWeight.toFixed(2)}%</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>{wbsOverallProgress.toFixed(2)}%</TableCell>
                  <TableCell sx={{ borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }} />
                </TableRow>
              </TableFooter>
            );
          })()}
        </Table>
      </TableContainer>
      <Box sx={{ flexShrink: 0, pt: 1.5 }}>
        <Button startIcon={<AddIcon />} onClick={handleAddWBSItem} sx={{ textTransform: 'none', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Add WBS item</Button>
      </Box>
    </Paper>
  );
};

export default ProgressReportTab;
