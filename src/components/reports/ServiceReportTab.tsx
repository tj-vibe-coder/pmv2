import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
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
  Alert,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { Project } from '../../types/Project';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  REPORT_COMPANIES,
  type ReportCompanyKey,
  ServiceReport,
  getServiceReports,
  saveServiceReport,
  updateServiceReportAt,
  deleteServiceReportAt,
  clearServiceReports,
} from '../ProjectDetails';
import { arialNarrowBase64 } from '../../fonts/arialNarrowBase64';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import { resolveCorporateDriveId, uploadFileToFolderById } from '../../services/onedriveFolderService';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const DR_HEADER_BLUE = [44, 90, 160] as [number, number, number];

export interface ServiceReportTabProps {
  project: Project;
  currentUser: { full_name?: string | null; username?: string; email?: string } | null;
  reportCompany: ReportCompanyKey;
  setReportCompany: (v: ReportCompanyKey) => void;
  preparedBy: { name: string; designation: string; company: string; date: string };
  setPreparedBy: React.Dispatch<React.SetStateAction<{ name: string; designation: string; company: string; date: string }>>;
  onPreview: (blob: Blob, title: string) => void;
}

const ServiceReportTab: React.FC<ServiceReportTabProps> = ({
  project,
  currentUser,
  reportCompany,
  setReportCompany,
  preparedBy,
  setPreparedBy,
  onPreview,
}) => {
  const [serviceReportDate, setServiceReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceReportStartTime, setServiceReportStartTime] = useState('');
  const [serviceReportEndTime, setServiceReportEndTime] = useState('');
  const [serviceReportNo, setServiceReportNo] = useState('');
  const [serviceReportTitle, setServiceReportTitle] = useState('');
  const [serviceReportActivitiesTable, setServiceReportActivitiesTable] = useState<{ activity: string; findingOutcome: string }[]>([{ activity: '', findingOutcome: '' }]);
  const [serviceReportCustomerComments, setServiceReportCustomerComments] = useState('');
  const [serviceReportVersion, setServiceReportVersion] = useState(0);
  const [editingServiceReportIndex, setEditingServiceReportIndex] = useState<number | null>(null);
  const [serviceReportSaveFeedback, setServiceReportSaveFeedback] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const { isAuthenticated: oneDriveSignedIn, getAccessToken: getOneDriveToken } = useOneDriveAuth();

  const resetServiceReportForm = () => {
    setServiceReportDate(new Date().toISOString().slice(0, 10));
    setServiceReportStartTime('');
    setServiceReportEndTime('');
    setServiceReportNo('');
    setServiceReportTitle('');
    setServiceReportActivitiesTable([{ activity: '', findingOutcome: '' }]);
    setServiceReportCustomerComments('');
    setEditingServiceReportIndex(null);
    setExportFeedback(null);
  };

  useEffect(() => {
    resetServiceReportForm();
  }, [project.id]);

  // serviceReportVersion triggers refetch when user saves a report
  // eslint-disable-next-line react-hooks/exhaustive-deps -- serviceReportVersion is intentional
  const serviceReports = useMemo(() => getServiceReports(project.id), [project.id, serviceReportVersion]);

  const handleSaveServiceReport = () => {
    const projectNo = (project.project_no || String(project.item_no ?? project.id) || '').trim() || '—';
    const reportNo = editingServiceReportIndex !== null && serviceReports[editingServiceReportIndex]?.reportNo
      ? serviceReports[editingServiceReportIndex].reportNo
      : `${projectNo} - SR${serviceReports.length + 1}`;
    const table = serviceReportActivitiesTable.filter((r) => (r.activity || '').trim() || (r.findingOutcome || '').trim());
    const recs = (serviceReportCustomerComments || '').trim() ? [serviceReportCustomerComments.trim()] : [];
    const report = {
      date: serviceReportDate,
      reportNo,
      title: serviceReportTitle.trim() || 'Service Report',
      startTime: serviceReportStartTime.trim() || undefined,
      endTime: serviceReportEndTime.trim() || undefined,
      activitiesTable: table.length > 0 ? table : [{ activity: '', findingOutcome: '' }],
      recommendationsTable: recs,
    };
    if (editingServiceReportIndex !== null && serviceReports[editingServiceReportIndex] != null) {
      updateServiceReportAt(project.id, editingServiceReportIndex, report);
    } else {
      saveServiceReport(project.id, report);
    }
    setServiceReportNo(reportNo);
    setServiceReportVersion((v) => v + 1);
    setServiceReportSaveFeedback(true);
    setTimeout(() => setServiceReportSaveFeedback(false), 2000);
  };

  const handleLoadServiceReport = (report: ServiceReport, index: number) => {
    setServiceReportDate(report.date);
    setServiceReportStartTime(report.startTime || '');
    setServiceReportEndTime(report.endTime || '');
    setServiceReportNo(report.reportNo);
    setServiceReportTitle(report.title);
    if (report.activitiesTable && report.activitiesTable.length > 0) {
      setServiceReportActivitiesTable(report.activitiesTable);
    } else {
      setServiceReportActivitiesTable([
        { activity: (report as { activities?: string }).activities || '', findingOutcome: (report as { findings?: string }).findings || '' },
      ]);
    }
    if (report.recommendationsTable && report.recommendationsTable.length > 0) {
      setServiceReportCustomerComments(report.recommendationsTable.join('\n'));
    } else {
      const leg = (report as { recommendations?: string }).recommendations || '';
      setServiceReportCustomerComments(leg.trim());
    }
    setEditingServiceReportIndex(index);
    setExportFeedback(null);
  };

  const handleDeleteLoadedServiceReport = () => {
    if (editingServiceReportIndex === null || serviceReports[editingServiceReportIndex] == null) return;
    handleDeleteServiceReport(editingServiceReportIndex);
  };

  const handleDeleteServiceReport = (index: number) => {
    const report = serviceReports[index];
    if (!report) return;
    if (!window.confirm(`Delete saved service report "${report.reportNo}"? This cannot be undone.`)) return;
    deleteServiceReportAt(project.id, index);
    setServiceReportVersion((v) => v + 1);
    if (editingServiceReportIndex === index) {
      resetServiceReportForm();
    } else if (editingServiceReportIndex !== null && index < editingServiceReportIndex) {
      setEditingServiceReportIndex(editingServiceReportIndex - 1);
    }
  };

  const handleClearServiceReports = () => {
    if (window.confirm('Remove all saved service reports for this project? This cannot be undone.')) {
      clearServiceReports(project.id);
      setServiceReportVersion((v) => v + 1);
      resetServiceReportForm();
    }
  };

  const buildPdf = async (preview: boolean): Promise<{ blob: Blob; filename: string } | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    let y = 18;
    const lineHeight = 5.2;
    const sectionGap = 6;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');
    const companyName = REPORT_COMPANIES[reportCompany];
    const companyNameUpper = companyName.toUpperCase();
    const projectNo = (project.project_no || String(project.item_no ?? project.id) || '').trim() || '—';
    const reportNo = (serviceReportNo || '').trim() || `${projectNo} - SR${serviceReports.length + 1}`;
    const reportDateStr = serviceReportDate ? new Date(serviceReportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    if (reportCompany === 'ACT') {
      try {
        const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
        const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
        doc.addImage(logoDataUrl, 'PNG', margin, y, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT);
        y += ACT_LOGO_PDF_HEIGHT + 4;
      } catch (_) {}
    } else if (reportCompany === 'IOCT') {
      try {
        const { loadLogoTransparentBackground, IOCT_ICON_LOGO_PDF_SIZE } = await import('../../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-ioct-only.png`;
        const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
        doc.addImage(logoDataUrl, 'PNG', margin, y, IOCT_ICON_LOGO_PDF_SIZE, IOCT_ICON_LOGO_PDF_SIZE);
        y += IOCT_ICON_LOGO_PDF_SIZE + 4;
      } catch (_) {}
    }

    fontTitle();
    doc.setFontSize(11);
    doc.text(companyNameUpper, margin, y);
    
    // Daily Service Report title in upper right
    fontTitle();
    doc.setFontSize(14);
    const pageWidth = 210;
    doc.text('Daily Service Report', pageWidth - margin, y, { align: 'right' });
    
    y += lineHeight + sectionGap;
    fontBody();
    doc.setFontSize(9);
    doc.text(`Project Name: ${project.project_name || '—'}`, margin, y);
    doc.text(`Report No.: ${reportNo}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
    doc.text(`Project No.: ${projectNo}`, margin, y);
    doc.text(`Date: ${reportDateStr}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
    doc.text(`PO No.: ${project.po_number || '—'}`, margin, y);
    doc.text(`Start Time: ${serviceReportStartTime || '—'}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
    doc.text(`Client: ${project.account_name || '—'}`, margin, y);
    doc.text(`End Time: ${serviceReportEndTime || '—'}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight + sectionGap;

    // Fixed signature block position at bottom
    const signatureSpace = 2 * lineHeight;
    const signatureBlockHeight = 42 + signatureSpace;
    const signatureY = pageHeight - signatureBlockHeight - 10; // Fixed position near bottom
    
    // Activities table - always 10 rows max
    const maxActivityRows = 10;
    const tableRows = serviceReportActivitiesTable.filter((r) => (r.activity || '').trim() || (r.findingOutcome || '').trim());
    const headers = ['No.', 'Activity', 'Finding / Outcome'];
    const body: string[][] = [];
    let rowNumber = 1;
    for (let i = 0; i < maxActivityRows; i++) {
      if (i < tableRows.length) {
        body.push([String(rowNumber), (tableRows[i].activity || '').trim() || '—', (tableRows[i].findingOutcome || '').trim() || '—']);
        rowNumber++;
      } else {
        body.push(['', '', '']); // Empty rows without numbering
      }
    }
    
    // Check if we need a new page before Activities
    if (y > signatureY - 80) {
      doc.addPage();
      y = 20;
    }
    fontTitle();
    doc.setFontSize(11);
    doc.text('Activities', margin, y);
    fontBody();
    y += lineHeight + 2;
    doc.setFontSize(9);
    autoTable(doc, {
      head: [headers],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      theme: 'grid',
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: contentWidth * 0.5 - 5 }, 2: { cellWidth: contentWidth * 0.5 - 5 } },
      styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica', overflow: 'linebreak', cellPadding: 2 },
      headStyles: { fillColor: DR_HEADER_BLUE, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 8 },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? y) + sectionGap;

    // Recommendations and Remarks - ensure it doesn't overlap with signature block
    const boxHeight = 4 * lineHeight;
    if (y + boxHeight + sectionGap > signatureY - 5) {
      doc.addPage();
      y = 20;
    }
    fontTitle();
    doc.setFontSize(11);
    doc.text('Recommendations and Remarks', margin, y);
    y += lineHeight + 2;
    // Box for recommendations and remarks (~4 lines tall)
    doc.setDrawColor(180, 180, 180);
    doc.rect(margin, y, contentWidth, boxHeight);
    const commentsText = (serviceReportCustomerComments || '').trim();
    if (commentsText) {
      fontBody();
      doc.setFontSize(9);
      const commentLines = doc.splitTextToSize(commentsText, contentWidth - 4);
      doc.text(commentLines, margin + 2, y + 3);
    }
    y += boxHeight + sectionGap;

    // Signature block at fixed bottom position on last page
    const leftColX = margin;
    const rightColX = margin + 95;
    const lineWidth = 52;
    const sigLineHeight = 5;
    doc.setFontSize(10);
    const drawSignatureLine = (colX: number, label: string, rowY: number, value?: string) => {
      fontBody();
      doc.setFontSize(9);
      doc.text(label, colX, rowY);
      if (value) doc.text(value, colX + 28, rowY);
      doc.setDrawColor(180, 180, 180);
      doc.line(colX + 26, rowY + 2, colX + 26 + lineWidth, rowY + 2);
    };
    
    // Draw signature block on last page at fixed bottom position
    const totalPages = doc.getNumberOfPages();
    const lastPageSignatureY = pageHeight - signatureBlockHeight - 10;
    doc.setPage(totalPages);
    fontTitle();
    doc.setFontSize(10);
    doc.text('Prepared by:', leftColX, lastPageSignatureY);
    doc.text('Approved by:', rightColX, lastPageSignatureY);
    let rowY = lastPageSignatureY + signatureSpace;
    const preparedByName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim() || '—';
    drawSignatureLine(leftColX, 'Name', rowY, preparedByName);
    drawSignatureLine(rightColX, 'Name', rowY, undefined);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Designation', rowY, (preparedBy.designation || '').trim() || undefined);
    drawSignatureLine(rightColX, 'Designation', rowY, undefined);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Company', rowY, (preparedBy.company || '').trim() || undefined);
    drawSignatureLine(rightColX, 'Company', rowY, undefined);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Date', rowY, (preparedBy.date || '').trim() || undefined);
    drawSignatureLine(rightColX, 'Date', rowY, undefined);

    const docNumber = `Doc. No.: ${reportNo}`;
    const footerY = pageHeight - 10;
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, 210 - margin, footerY, { align: 'right' });
    }

    const filename = `${reportNo.replace(/\s/g, '_')}.pdf`;
    const blob = doc.output('blob') as Blob;
    if (!preview) doc.save(filename);
    return { blob, filename };
  };

  const handlePreview = async () => {
    const result = await buildPdf(true);
    if (result) onPreview(result.blob, 'Service Report');
  };

  const handleExport = async () => {
    setExporting(true);
    setExportFeedback(null);
    try {
      const result = await buildPdf(false);
      if (!result) return;
      if (!isCorporateOneDriveConfigured()) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. OneDrive is not configured.' });
        return;
      }
      if (!project.executionFolderId) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. Link an execution folder to upload to OneDrive.' });
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
      await uploadFileToFolderById(token, driveId, project.executionFolderId, result.filename, result.blob);
      setExportFeedback({ severity: 'success', message: `PDF exported and uploaded to OneDrive: ${result.filename}` });
    } catch (e) {
      setExportFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'PDF exported locally, but OneDrive upload failed.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Service Report
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create service reports. Save to store a snapshot; load a previous report; Preview or Export to PDF.
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={resetServiceReportForm}
          sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary, textTransform: 'none' }}
        >
          New report
        </Button>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" fullWidth label="Report Date" type="date" value={serviceReportDate} onChange={(e) => setServiceReportDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Report No.</Typography>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {serviceReportNo || `${(project.project_no || String(project.item_no ?? project.id) || '—').trim()} - SR${serviceReports.length + 1}`}
          </Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" fullWidth label="Start Time" type="time" value={serviceReportStartTime} onChange={(e) => setServiceReportStartTime(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" fullWidth label="End Time" type="time" value={serviceReportEndTime} onChange={(e) => setServiceReportEndTime(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField size="small" fullWidth label="Title" placeholder="e.g. Monthly Service Visit" value={serviceReportTitle} onChange={(e) => setServiceReportTitle(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Activities</Typography>
          <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}>
            <Table size="small" sx={{ minWidth: 560, '& td, & th': { border: '1px solid #e2e8f0' } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', width: 48, color: '#fff' }}>No.</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', color: '#fff' }}>Activity</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', color: '#fff' }}>Finding / Outcome</TableCell>
                  <TableCell sx={{ width: 56 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {serviceReportActivitiesTable.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell sx={{ verticalAlign: 'top', pt: 1.5 }}>{index + 1}</TableCell>
                    <TableCell sx={{ py: 0.5, px: 1 }}>
                      <TextField size="small" fullWidth multiline minRows={1} placeholder="Activity" value={row.activity} onChange={(e) => setServiceReportActivitiesTable((prev) => prev.map((r, i) => (i === index ? { ...r, activity: e.target.value } : r)))} />
                    </TableCell>
                    <TableCell sx={{ py: 0.5, px: 1 }}>
                      <TextField size="small" fullWidth multiline minRows={1} placeholder="Finding / Outcome" value={row.findingOutcome} onChange={(e) => setServiceReportActivitiesTable((prev) => prev.map((r, i) => (i === index ? { ...r, findingOutcome: e.target.value } : r)))} />
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top', pt: 1 }}>
                      <IconButton size="small" onClick={() => setServiceReportActivitiesTable((prev) => prev.filter((_, i) => i !== index))} color="error" title="Remove row"><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setServiceReportActivitiesTable((prev) => [...prev, { activity: '', findingOutcome: '' }])} sx={{ mt: 1, textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}>Add row</Button>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Recommendations and Remarks</Typography>
          <TextField size="small" fullWidth multiline minRows={4} placeholder="Enter recommendations and remarks..." value={serviceReportCustomerComments} onChange={(e) => setServiceReportCustomerComments(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }} />
        </Grid>
      </Grid>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={resetServiceReportForm} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>New report</Button>
        <Button variant="contained" size="small" onClick={handleSaveServiceReport} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>{serviceReportSaveFeedback ? 'Saved' : editingServiceReportIndex !== null ? 'Update report' : 'Save report'}</Button>
        <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview PDF</Button>
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExport} disabled={exporting} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>{exporting ? 'Exporting...' : 'Export to PDF'}</Button>
        {serviceReports.length > 0 && (
          <>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="load-service-report-label">Load previous report</InputLabel>
              <Select labelId="load-service-report-label" value="" label="Load previous report" onChange={(e) => {
                const idx = Number(e.target.value);
                if (!Number.isNaN(idx) && serviceReports[idx] != null) handleLoadServiceReport(serviceReports[idx], idx);
                (e.target as HTMLSelectElement).value = '';
              }}>
                <MenuItem value=""><em>— Select to load —</em></MenuItem>
                {serviceReports.map((r, idx) => (
                  <MenuItem key={r.id} value={idx}>{new Date(r.date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · {r.reportNo}{r.title ? ` · ${r.title.slice(0, 30)}${r.title.length > 30 ? '…' : ''}` : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" color="error" onClick={handleClearServiceReports}>Clear all saved reports</Button>
          </>
        )}
      </Box>
      {serviceReports.length > 0 && (
        <TableContainer sx={{ mt: 2, border: '1px solid #e2e8f0', borderRadius: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 600 }}>Saved service reports</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {serviceReports.map((r, idx) => (
                <TableRow key={r.id} hover selected={editingServiceReportIndex === idx}>
                  <TableCell>{r.reportNo}</TableCell>
                  <TableCell>{new Date(r.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</TableCell>
                  <TableCell>{r.title || 'Service Report'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleLoadServiceReport(r, idx)} sx={{ color: NET_PACIFIC_COLORS.primary }}>Load</Button>
                    <IconButton size="small" color="error" onClick={() => handleDeleteServiceReport(idx)} title="Delete report" aria-label="Delete report">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {editingServiceReportIndex !== null && serviceReports[editingServiceReportIndex] != null && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'info.main', fontSize: '0.8125rem' }}>
            Editing: {serviceReports[editingServiceReportIndex].reportNo}. Click &quot;Update report&quot; to save changes.
          </Typography>
          <Button size="small" variant="outlined" onClick={resetServiceReportForm}>Cancel edit</Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDeleteLoadedServiceReport}>Delete report</Button>
        </Box>
      )}
      {exportFeedback && (
        <Alert severity={exportFeedback.severity} sx={{ mt: 2 }} onClose={() => setExportFeedback(null)}>
          {exportFeedback.message}
        </Alert>
      )}
    </Paper>
  );
};

export default ServiceReportTab;
