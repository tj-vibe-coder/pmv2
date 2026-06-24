import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Alert, Box, Chip, CircularProgress, Paper, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from '@mui/material';
import { PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon, CloudUpload as CloudUploadIcon, CheckCircle as CheckCircleIcon, Save as SaveIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Project } from '../../types/Project';
import jsPDF from 'jspdf';
import {
  REPORT_COMPANIES,
  type ReportCompanyKey,
  CompletionCertificate,
  getCompletionCertificates,
  saveCompletionCertificate,
  updateCompletionCertificate,
  deleteCompletionCertificate,
} from '../ProjectDetails';
import { arialNarrowBase64 } from '../../fonts/arialNarrowBase64';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import { resolveCorporateDriveId, uploadFileToFolderById, ensureExecutionFolder } from '../../services/onedriveFolderService';
import dataService from '../../services/dataService';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

// Mirror of ISSUER_INFO from pdfExport.tsx — same branding data for report headers.
const COC_ISSUER = {
  IOCT: {
    addressLines: [
      'B63, L7 Dynamism Jubilation Enclave,',
      'Santo Niño, City of Biñan, Laguna,',
      'Region IV-A (Calabarzon), 4024',
    ],
    tin: 'TIN: 697-029-976-00000',
    logoFile: '/logo-ioct-only.png',
    logoW: 20,
    logoH: 20,
    useDirectLoad: true as const,
  },
  ACT: {
    addressLines: ['Block 13, Mindanao Ave., Cavite, Philippines'],
    tin: '',
    logoFile: '/logo-acti.png',
    logoW: 22,
    logoH: 13.6,
    useDirectLoad: false as const,
  },
};

export interface CompletionCertificateTabProps {
  project: Project;
  currentUser: { full_name?: string | null; username?: string; email?: string } | null;
  reportCompany: ReportCompanyKey;
  setReportCompany: (v: ReportCompanyKey) => void;
  preparedBy: { name: string; designation: string; company: string; date: string };
  onPreview: (blob: Blob, title: string) => void;
  /** Resolved client contact to use as the "Approved by" signatory */
  clientApprover?: { name: string; designation: string; company: string };
}

const formatCompletionDateForPdf = (value: string | number | Date | null | undefined): string => {
  if (!value) return new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value.trim());
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { dateStyle: 'long' });
  }
  if (typeof value === 'number') return new Date(value * 1000).toLocaleDateString('en-US', { dateStyle: 'long' });
  return new Date(value).toLocaleDateString('en-US', { dateStyle: 'long' });
};

const completionDateToInputValue = (completionDate: Project['completion_date']): string => {
  const d = completionDate;
  if (!d) return '';
  const date = typeof d === 'number' ? new Date(d * 1000) : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const CompletionCertificateTab: React.FC<CompletionCertificateTabProps> = ({
  project,
  currentUser,
  reportCompany,
  setReportCompany,
  preparedBy,
  onPreview,
  clientApprover,
}) => {
  const {
    isConfigured: oneDriveConfigured,
    isAuthenticated: oneDriveSignedIn,
    isLoading: oneDriveAuthLoading,
    login: oneDriveLogin,
    getAccessToken: getOneDriveToken,
  } = useOneDriveAuth();
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);
  // Local copy of execution folder id — updated if we auto-create the folder on first export
  const [localExecutionFolderId, setLocalExecutionFolderId] = useState(project.executionFolderId);
  useEffect(() => { setLocalExecutionFolderId(project.executionFolderId); }, [project.id, project.executionFolderId]);
  // Resolved via project_no — ensures uploads land in the IOCT ops folder, not a PCS subfolder
  const [resolvedExecFolderId, setResolvedExecFolderId] = useState<string | null>(null);
  useEffect(() => { setResolvedExecFolderId(null); }, [project.id]);
  const [completionDateOverride, setCompletionDateOverride] = useState<string>(() => completionDateToInputValue(project.completion_date));
  useEffect(() => {
    setCompletionDateOverride(completionDateToInputValue(project.completion_date));
  }, [project.id, project.completion_date]);

  // Editable approver — seeded from clientApprover, overridable
  const [approverName, setApproverName] = useState(clientApprover?.name || '');
  const [approverDesignation, setApproverDesignation] = useState(clientApprover?.designation || '');
  const [approverCompany, setApproverCompany] = useState(clientApprover?.company || '');
  useEffect(() => {
    if (clientApprover?.name || clientApprover?.designation) {
      setApproverName(prev => prev || clientApprover.name || '');
      setApproverDesignation(prev => prev || clientApprover.designation || '');
      setApproverCompany(prev => prev || clientApprover.company || '');
    }
  }, [clientApprover?.name, clientApprover?.designation, clientApprover?.company]);
  const completionDateDisplay = useMemo(
    () => formatCompletionDateForPdf(completionDateOverride.trim() || undefined),
    [completionDateOverride]
  );

  // Saved certificates (Firestore-backed history for backtracking)
  const [savedCerts, setSavedCerts] = useState<CompletionCertificate[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSavedCerts = useCallback(async () => {
    setCertsLoading(true);
    try {
      setSavedCerts(await getCompletionCertificates(project.id));
    } catch {
      // Keep stale list on transient error.
    } finally {
      setCertsLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    setEditingCertId(null);
    loadSavedCerts();
  }, [project.id, loadSavedCerts]);

  const handleSaveCertificate = async () => {
    setSaving(true);
    setExportFeedback(null);
    const cert: Omit<CompletionCertificate, 'id' | 'createdAt'> = {
      projectName: project.project_name || '—',
      poNumber: project.po_number || '—',
      client: project.account_name || '—',
      completionDate: completionDateOverride.trim() || completionDateToInputValue(project.completion_date),
      approverName: approverName.trim() || undefined,
      approverDesignation: approverDesignation.trim() || undefined,
      approverCompany: approverCompany.trim() || undefined,
      preparedByName: (preparedBy.name || currentUser?.full_name || currentUser?.username || '').trim() || undefined,
      preparedByDesignation: (preparedBy.designation || '').trim() || undefined,
      reportCompany,
      companyName: REPORT_COMPANIES[reportCompany],
    };
    try {
      if (editingCertId) {
        await updateCompletionCertificate(editingCertId, cert);
      } else {
        const created = await saveCompletionCertificate(project.id, cert);
        setEditingCertId(created.id);
      }
      setExportFeedback({ severity: 'success', message: 'Certificate saved.' });
      await loadSavedCerts();
    } catch (e) {
      setExportFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to save certificate.' });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadCertificate = (cert: CompletionCertificate) => {
    setCompletionDateOverride(cert.completionDate ? cert.completionDate.slice(0, 10) : '');
    setApproverName(cert.approverName || '');
    setApproverDesignation(cert.approverDesignation || '');
    setApproverCompany(cert.approverCompany || '');
    if (cert.reportCompany === 'IOCT' || cert.reportCompany === 'ACT') {
      setReportCompany(cert.reportCompany as ReportCompanyKey);
    }
    setEditingCertId(cert.id);
  };

  const handleDeleteCertificate = async (cert: CompletionCertificate) => {
    if (!window.confirm('Delete this saved certificate? This cannot be undone.')) return;
    try {
      await deleteCompletionCertificate(cert.id);
      if (editingCertId === cert.id) setEditingCertId(null);
      await loadSavedCerts();
    } catch (e) {
      setExportFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to delete certificate.' });
    }
  };

  const buildPdf = async (preview: boolean): Promise<Blob | { blob: Blob; filename: string } | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const pageWidth = 210;
    const contentWidth = pageWidth - margin * 2;
    const pageHeight = 297;
    let y = 18;
    const lineHeight = 5.8;
    const sectionGap = 7;
    const afterHeading = 5;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');

    // Our company (contractor) – from report company selection
    const companyName = REPORT_COMPANIES[reportCompany];
    const projectTitle = project.project_name || '—';
    const poNumber = project.po_number || '—';
    const clientName = project.account_name || '—';
    const completionDate = completionDateDisplay;

    // ── Header: logo + company info (left) | document title (right) ───────────
    const issuerInfo = COC_ISSUER[reportCompany];
    const rightX = pageWidth - margin;
    const headerStartY = y;

    // Logo (top-left)
    let logoBottomY = headerStartY;
    try {
      const logoUrl = `${process.env.PUBLIC_URL || ''}${issuerInfo.logoFile}`;
      let logoDataUrl: string;
      if (issuerInfo.useDirectLoad) {
        const { loadImageDataUrl } = await import('../../utils/logoUtils');
        logoDataUrl = await loadImageDataUrl(logoUrl);
      } else {
        const { loadLogoTransparentBackground } = await import('../../utils/logoUtils');
        logoDataUrl = await loadLogoTransparentBackground(logoUrl);
      }
      doc.addImage(logoDataUrl, 'PNG', margin, headerStartY, issuerInfo.logoW, issuerInfo.logoH);
      logoBottomY = headerStartY + issuerInfo.logoH;
    } catch (_) {}

    // Document title (right column, large, blue)
    doc.setTextColor(44, 90, 160);
    fontTitle();
    doc.setFontSize(20);
    doc.text('Certificate of', rightX, headerStartY + 7, { align: 'right' });
    doc.text('Completion', rightX, headerStartY + 15, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Company name (below logo, left column)
    let infoY = logoBottomY + 2;
    doc.setTextColor(44, 90, 160);
    fontTitle();
    doc.setFontSize(10);
    doc.text(companyName, margin, infoY);
    infoY += 4.5;
    doc.setTextColor(0, 0, 0);

    // Horizontal divider below header
    y = Math.max(infoY, headerStartY + 22) + 3;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);
    doc.line(margin, y, rightX, y);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    y += 8;

    // Project information block (left-aligned)
    fontBody();
    doc.setFontSize(11);
    doc.text(`Project Title: ${projectTitle}`, margin, y);
    y += lineHeight;
    doc.text(`PO Number: ${poNumber}`, margin, y);
    y += lineHeight;
    doc.text(`Client: ${clientName}`, margin, y);
    y += lineHeight;
    doc.text(`Contractor: ${companyName}`, margin, y);
    y += lineHeight;
    doc.text(`Date of Completion: ${completionDate}`, margin, y);
    y += lineHeight + sectionGap;

    // Certification statement (sub-heading + paragraph)
    fontTitle();
    doc.setFontSize(12);
    doc.text('Certificate of Completion', margin, y);
    fontBody();
    y += lineHeight + afterHeading;
    doc.setFontSize(10);
    let certX = margin;
    const certParts: { text: string }[] = [
      { text: `This is to certify that ${companyName} has completed the services for the project: ` },
      { text: projectTitle },
      { text: ` under PO number: ` },
      { text: poNumber },
      { text: ' in accordance with the project requirement.' },
    ];
    certParts.forEach(({ text }) => {
      fontBody();
      const words = text.split(/(\s+)/);
      words.forEach((word) => {
        const w = doc.getTextWidth(word);
        if (certX + w > margin + contentWidth && certX > margin) {
          y += lineHeight;
          certX = margin;
        }
        doc.text(word, certX, y);
        certX += w;
      });
    });
    y += lineHeight + sectionGap;

    // Quality Assurance
    fontTitle();
    doc.setFontSize(12);
    doc.text('Quality Assurance:', margin, y);
    fontBody();
    y += lineHeight + 2;
    doc.setFontSize(10);
    const qaText = 'All work has been completed to the highest standards of quality and in compliance with all relevant codes, regulations, and standards. Inspections and tests have been conducted to verify that all systems are functioning correctly and efficiently.';
    const qaLines = doc.splitTextToSize(qaText, contentWidth);
    doc.text(qaLines, margin, y);
    y += qaLines.length * lineHeight + sectionGap;

    // Client Acceptance
    fontTitle();
    doc.setFontSize(12);
    doc.text('Client Acceptance:', margin, y);
    fontBody();
    y += lineHeight + 2;
    doc.setFontSize(10);
    const acceptText = 'By signing below, the client acknowledges that the project has been completed to their satisfaction and that all deliverables have been received and accepted.';
    const acceptLines = doc.splitTextToSize(acceptText, contentWidth);
    doc.text(acceptLines, margin, y);
    y += acceptLines.length * lineHeight + sectionGap;

    // Signatures
    fontTitle();
    doc.setFontSize(12);
    doc.text('Signatures:', margin, y);
    y += lineHeight + 4;

    const signatureSpace = 2 * lineHeight; // 2-line space for signature below each label
    const sigBlockHeight = 34 + signatureSpace;
    if (y > pageHeight - sigBlockHeight - 12) {
      doc.addPage();
      y = 20;
    }
    const leftColX = margin;
    const rightColX = margin + 95;
    const lineWidth = 55;
    const sigLineHeight = 5.5;
    // Left: Approved by (client)
    fontTitle();
    doc.setFontSize(11);
    doc.text('Approved by:', leftColX, y);
    let rowY = y + signatureSpace; // 2-line space for signature
    fontBody();
    doc.setFontSize(10);
    // Use editable state (pre-filled from client DB, overridable by user)
    const approverNamePdf = approverName.trim() || (project.account_name || '—');
    const approverDesignationPdf = approverDesignation.trim() || '—';
    const approverCompanyPdf = approverCompany.trim() || project.account_name || '—';
    doc.setDrawColor(180, 180, 180);
    doc.line(leftColX, rowY + 2, leftColX + lineWidth, rowY + 2);
    doc.text(approverNamePdf, leftColX, rowY);
    rowY += sigLineHeight;
    doc.line(leftColX, rowY + 2, leftColX + lineWidth, rowY + 2);
    doc.text(approverDesignationPdf, leftColX, rowY);
    rowY += sigLineHeight;
    doc.line(leftColX, rowY + 2, leftColX + lineWidth, rowY + 2);
    doc.text(approverCompanyPdf, leftColX, rowY);
    // Right: Contractor Representative (our company)
    rowY = y + signatureSpace; // 2-line space for signature
    fontTitle();
    doc.setFontSize(11);
    doc.text('Contractor Representative:', rightColX, y);
    fontBody();
    doc.setFontSize(10);
    const repName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim() || '—';
    const repDesignation = (preparedBy.designation || '').trim() || '—';
    doc.line(rightColX, rowY + 2, rightColX + lineWidth, rowY + 2);
    doc.text(repName, rightColX, rowY);
    rowY += sigLineHeight;
    doc.line(rightColX, rowY + 2, rightColX + lineWidth, rowY + 2);
    doc.text(repDesignation, rightColX, rowY);
    rowY += sigLineHeight;
    doc.line(rightColX, rowY + 2, rightColX + lineWidth, rowY + 2);
    doc.text(companyName, rightColX, rowY);

    // Footer – Doc. No. (one COC per project, no number)
    const projectNo = project.project_no || String(project.item_no ?? project.id) || '—';
    const docNumber = `Doc. No.: ${projectNo}-COC`;
    const totalPages = doc.getNumberOfPages();
    const footerY = pageHeight - 10;
    fontBody();
    doc.setFontSize(9);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
    }

    if (preview) return doc.output('blob') as Blob;
    const docNoFilename = `${(projectNo === '—' ? 'COC' : String(projectNo).replace(/[/\\?%*:|"<>]/g, '-'))}-COC.pdf`;
    doc.save(docNoFilename);
    return { blob: doc.output('blob') as Blob, filename: docNoFilename };
  };

  const handlePreview = async () => {
    const blob = await buildPdf(true);
    if (blob instanceof Blob) onPreview(blob, 'Certificate of Completion');
  };

  const handleExport = async () => {
    setExporting(true);
    setExportFeedback(null);
    try {
      const result = await buildPdf(false);
      if (!result || result instanceof Blob) return;
      const { blob, filename } = result;

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
      // Always resolve by project_no so uploads land in the IOCT ops folder,
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
    <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Certificate of Completion
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Generate the Final Project Completion Certificate. Preview or Export to PDF.
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 'auto' }}>
          <TextField
            label="Completion Date"
            type="date"
            value={completionDateOverride}
            onChange={(e) => setCompletionDateOverride(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Approved by (PDF)</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField size="small" label="Name" value={approverName} onChange={(e) => setApproverName(e.target.value)} sx={{ width: 220 }} placeholder={clientApprover?.name || 'Client approver name'} />
            <TextField size="small" label="Designation" value={approverDesignation} onChange={(e) => setApproverDesignation(e.target.value)} sx={{ width: 180 }} placeholder={clientApprover?.designation || 'Position'} />
            <TextField size="small" label="Company" value={approverCompany} onChange={(e) => setApproverCompany(e.target.value)} sx={{ width: 220 }} placeholder={clientApprover?.company || 'Company'} />
          </Box>
        </Grid>
      </Grid>
      {exportFeedback && (
        <Alert severity={exportFeedback.severity} onClose={() => setExportFeedback(null)} sx={{ mb: 2 }}>
          {exportFeedback.message}
        </Alert>
      )}
      {oneDriveConfigured && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {oneDriveSignedIn ? (
            <Chip
              size="small"
              icon={<CheckCircleIcon />}
              label="OneDrive connected — PDF will upload on export"
              color="success"
              variant="outlined"
            />
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={oneDriveAuthLoading ? <CircularProgress size={14} /> : <CloudUploadIcon />}
              disabled={oneDriveAuthLoading}
              onClick={oneDriveLogin}
              sx={{ textTransform: 'none', borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
            >
              Sign in to OneDrive to enable upload
            </Button>
          )}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel id="coc-report-company-label">Report as company</InputLabel>
          <Select labelId="coc-report-company-label" value={reportCompany} label="Report as company" onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}>
            <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
            <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
          </Select>
        </FormControl>
        {editingCertId && (
          <Chip label="Editing saved certificate" size="small" color="info" variant="outlined" />
        )}
        <Button variant="contained" size="small" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} onClick={handleSaveCertificate} disabled={saving} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>{editingCertId ? 'Update Saved' : 'Save Certificate'}</Button>
        <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview PDF</Button>
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExport} disabled={exporting} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>{exporting ? 'Uploading…' : 'Export Certificate of Completion'}</Button>
      </Box>

      {/* Saved certificates — Firestore history for backtracking */}
      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
            Saved Certificates
          </Typography>
          {savedCerts.length > 0 && <Chip label={String(savedCerts.length)} size="small" variant="outlined" />}
          {certsLoading && <CircularProgress size={16} sx={{ color: NET_PACIFIC_COLORS.primary }} />}
        </Box>
        {savedCerts.length > 0 ? (
          <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1, maxHeight: 280 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Saved</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Completion Date</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Company</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Approved By</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {savedCerts.map((c) => (
                  <TableRow key={c.id} hover selected={editingCertId === c.id}>
                    <TableCell>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}</TableCell>
                    <TableCell>{c.completionDate ? formatCompletionDateForPdf(c.completionDate) : '—'}</TableCell>
                    <TableCell>{c.companyName || c.reportCompany}</TableCell>
                    <TableCell>{c.approverName || '—'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => handleLoadCertificate(c)} sx={{ color: NET_PACIFIC_COLORS.primary }}>Load</Button>
                      <IconButton size="small" color="error" onClick={() => handleDeleteCertificate(c)} title="Delete certificate" aria-label="Delete certificate">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No saved certificates yet. Use <strong>Save Certificate</strong> to keep a record for backtracking.
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default CompletionCertificateTab;
