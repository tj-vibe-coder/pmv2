import React, { useState, useEffect, useMemo } from 'react';
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
} from '../ProjectDetails';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const DR_HEADER_BLUE = [44, 90, 160] as [number, number, number];

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

const wbsInputSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.9375rem', backgroundColor: '#fff', '& fieldset': { borderColor: '#e2e8f0' }, '&:hover fieldset': { borderColor: '#cbd5e1' }, '&.Mui-focused fieldset': { borderWidth: '1px', borderColor: NET_PACIFIC_COLORS.primary } },
  '& .MuiInputBase-input': { py: 1, px: 1.25, fontSize: '0.9375rem', color: '#1e293b' },
};
const wbsNumInputSx = {
  ...wbsInputSx,
  '& .MuiInputBase-input': { ...wbsInputSx['& .MuiInputBase-input'], textAlign: 'right', fontWeight: 600 },
  '& .MuiInputBase-input[type=number]': { MozAppearance: 'textfield' },
};

export interface ProgressReportTabProps {
  project: Project;
  currentUser: { full_name?: string | null; username?: string; email?: string } | null;
  reportCompany: ReportCompanyKey;
  setReportCompany: (v: ReportCompanyKey) => void;
  preparedBy: { name: string; designation: string; company: string; date: string };
  setPreparedBy: React.Dispatch<React.SetStateAction<{ name: string; designation: string; company: string; date: string }>>;
  onPreview: (blob: Blob, title: string) => void;
}

const ProgressReportTab: React.FC<ProgressReportTabProps> = ({
  project,
  currentUser,
  reportCompany,
  setReportCompany,
  preparedBy,
  setPreparedBy,
  onPreview,
}) => {
  const [wbsItems, setWbsItems] = useState<WBSItem[]>([]);
  const [pbInput, setPbInput] = useState('');
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [editingSnapshotIndex, setEditingSnapshotIndex] = useState<number | null>(null);
  const [wbsDraft, setWbsDraft] = useState<Record<string, { progress?: string; weight?: string }>>({});

  useEffect(() => {
    setWbsItems(loadWBS(project.id));
  }, [project.id]);

  // snapshotVersion triggers refetch when user saves a snapshot
  // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshotVersion is intentional
  const progressSnapshots = useMemo(() => getProgressSnapshots(project.id), [project.id, snapshotVersion]);

  const wbsOverallProgress = useMemo(() => {
    if (wbsItems.length === 0) return 0;
    const totalWeight = wbsItems.reduce((s, i) => s + parseWBSNum(i.weight), 0);
    const weightedSum = wbsItems.reduce((s, i) => s + (parseWBSNum(i.weight) * parseWBSNum(i.progress)) / 100, 0);
    if (totalWeight > 0) return (weightedSum / totalWeight) * 100;
    return wbsItems.reduce((s, i) => s + parseWBSNum(i.progress), 0) / wbsItems.length;
  }, [wbsItems]);

  const syncProjectStatusFromWBS = (items: WBSItem[]) => {
    if (items.length === 0) return;
    const totalWeight = items.reduce((s, i) => s + parseWBSNum(i.weight), 0);
    const weighted = items.reduce((s, i) => s + (parseWBSNum(i.weight) * parseWBSNum(i.progress)) / 100, 0);
    const pct = totalWeight > 0 ? (weighted / totalWeight) * 100 : items.reduce((s, i) => s + parseWBSNum(i.progress), 0) / items.length;
    const rounded = Math.round(pct);
    dataService.updateProject(project.id, { actual_site_progress_percent: rounded });
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

  const buildPdf = async (preview: boolean): Promise<Blob | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    let y = 18;
    const lineHeight = 5.2;
    const sectionGap = 6;
    const afterHeading = 4;

    const fontTitle = () => { doc.setFont('helvetica', 'bold'); };
    const fontBody = () => { doc.setFont('helvetica', 'normal'); };

    const companyName = REPORT_COMPANIES[reportCompany];
    const companyNameUpper = companyName.toUpperCase();
    const completionPct = Math.round(wbsOverallProgress * 100) / 100;
    const poNum = project.po_number || '—';

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
    y += lineHeight + sectionGap;

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
    const certText = `${companyName} hereby certifies that (${completionPct}%) of the total scope of work under Purchase Order No. ${poNum} has been completed as of the date of this report. The completed works were executed in full compliance with the approved project scope, technical specifications, and contractual obligations. All deliverables corresponding to the stated progress have been properly performed and documented.`;
    const certLines = doc.splitTextToSize(certText, contentWidth);
    doc.text(certLines, margin, y);
    y += certLines.length * lineHeight + sectionGap;

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
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: tableStartY,
      margin: { left: margin, right: margin },
      tableWidth: 'auto',
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 } },
      styles: { fontSize: 8, font: 'helvetica' },
      headStyles: { fillColor: DR_HEADER_BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === rows.length - 1) data.cell.styles.fontStyle = 'bold';
      },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    let finalY = docWithTable.lastAutoTable?.finalY ?? tableStartY;
    if (finalY > pageHeight - 42) {
      doc.addPage();
      finalY = 20;
    }
    y = finalY + 8;
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
    fontTitle();
    doc.setFontSize(10);
    doc.text('Prepared by:', leftColX, y);
    doc.text('Approved by:', rightColX, y);
    let rowY = y + sigLineHeight;
    const approverParts = (project.client_approver || '').split(/\s*[–-]\s*/);
    const approverName = (approverParts[0] || '').trim() || '—';
    const approverDesignation = (approverParts[1] || '').trim() || '—';
    const approverCompany = (project.account_name || '').trim() || '—';
    const preparedByName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim() || '—';
    drawSignatureLine(leftColX, 'Name', rowY, preparedByName);
    drawSignatureLine(rightColX, 'Name', rowY, approverName);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Designation', rowY, (preparedBy.designation || '').trim() || undefined);
    drawSignatureLine(rightColX, 'Designation', rowY, approverDesignation);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Company', rowY, (preparedBy.company || '').trim() || undefined);
    drawSignatureLine(rightColX, 'Company', rowY, approverCompany);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Date', rowY, (preparedBy.date || '').trim() || undefined);
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

    if (preview) return doc.output('blob') as Blob;
    doc.save(`Project_Progress_Certification_${project.project_name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePreview = async () => {
    const blob = await buildPdf(true);
    if (blob) onPreview(blob, 'Progress Report');
  };

  const handleExport = () => buildPdf(false);

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Progress Report (WBS)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Define work packages and track progress. Save snapshots, then Preview or Export to PDF.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
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
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel id="report-company-label">Report as company</InputLabel>
          <Select labelId="report-company-label" value={reportCompany} label="Report as company" onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}>
            <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
            <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" size="small" onClick={handleSaveProgress} disabled={wbsItems.length === 0} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>{saveFeedback ? 'Saved' : editingSnapshotIndex !== null ? 'Update snapshot' : 'Save'}</Button>
        <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} disabled={wbsItems.length === 0} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview PDF</Button>
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExport} disabled={wbsItems.length === 0} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Export to PDF</Button>
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
      {editingSnapshotIndex !== null && progressSnapshots[editingSnapshotIndex] != null && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'info.main', fontSize: '0.8125rem' }}>
            Editing: {new Date(progressSnapshots[editingSnapshotIndex].date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · PB{progressSnapshots[editingSnapshotIndex].pbNumber}. Click &quot;Update snapshot&quot; to save.
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setEditingSnapshotIndex(null)}>Cancel edit</Button>
        </Box>
      )}
      <TableContainer sx={{ maxHeight: 460, border: '1px solid #e2e8f0', borderRadius: 1 }}>
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
              wbsItems.map((item, index) => (
                <TableRow key={item.id} hover sx={{ bgcolor: index % 2 === 0 ? '#fff' : 'grey.50' }}>
                  <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                    <TextField size="small" fullWidth value={item.code} onChange={(e) => handleUpdateWBSItem(item.id, 'code', e.target.value)} placeholder="1.1" variant="outlined" sx={wbsInputSx} inputProps={{ maxLength: 20 }} />
                  </TableCell>
                  <TableCell sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                    <TextField size="small" fullWidth value={item.name} onChange={(e) => handleUpdateWBSItem(item.id, 'name', e.target.value)} placeholder="Work package name" variant="outlined" sx={wbsInputSx} />
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                    <TextField size="small" type="number" fullWidth value={wbsDraft[item.id]?.weight ?? parseWBSNum(item.weight).toFixed(2)} onChange={(e) => setWbsDraft((prev) => ({ ...prev, [item.id]: { ...prev[item.id], weight: e.target.value } }))} onBlur={() => { const raw = wbsDraft[item.id]?.weight; if (raw !== undefined) { handleUpdateWBSItem(item.id, 'weight', parseWBSNum(raw)); setWbsDraft((prev) => { const next = { ...prev }; if (next[item.id]) { delete next[item.id].weight; if (Object.keys(next[item.id]).length === 0) delete next[item.id]; } return next; }); } }} inputProps={{ min: 0, max: 100, step: 0.01 }} variant="outlined" sx={wbsNumInputSx} />
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                    <TextField size="small" type="number" fullWidth value={wbsDraft[item.id]?.progress ?? parseWBSNum(item.progress).toFixed(2)} onChange={(e) => setWbsDraft((prev) => ({ ...prev, [item.id]: { ...prev[item.id], progress: e.target.value } }))} onBlur={() => { const raw = wbsDraft[item.id]?.progress; if (raw !== undefined) { handleUpdateWBSItem(item.id, 'progress', parseWBSNum(raw)); setWbsDraft((prev) => { const next = { ...prev }; if (next[item.id]) { delete next[item.id].progress; if (Object.keys(next[item.id]).length === 0) delete next[item.id]; } return next; }); } }} inputProps={{ min: 0, max: 100, step: 0.01 }} variant="outlined" sx={wbsNumInputSx} />
                  </TableCell>
                  <TableCell align="center" sx={{ py: 1.5, px: 1.5, verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }}>
                    <IconButton size="small" onClick={() => handleDeleteWBSItem(item.id)} title="Delete" color="error"><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {wbsItems.length > 0 && (
            <TableFooter>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell colSpan={2} sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>Total progress</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>{wbsItems.reduce((s, i) => s + parseWBSNum(i.weight), 0).toFixed(2)}%</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }}>{wbsOverallProgress.toFixed(2)}%</TableCell>
                <TableCell sx={{ borderTop: '2px solid #e2e8f0', py: 2, px: 1.5 }} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      <Button startIcon={<AddIcon />} onClick={handleAddWBSItem} sx={{ mt: 2, textTransform: 'none', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>Add WBS item</Button>
    </Paper>
  );
};

export default ProgressReportTab;
