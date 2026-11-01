import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Alert, Box, Chip, CircularProgress, Paper, Typography, Button, TextField, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from '@mui/material';
import { PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon, CloudUpload as CloudUploadIcon, CheckCircle as CheckCircleIcon, Save as SaveIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Project } from '../../types/Project';
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
import { buildCompletionCertificatePdf } from '../../utils/reports/completionCertificatePdf';
import { REPORT_ISSUERS } from '../../utils/reports/reportPdfKit';
import { loadReportLogo } from '../../utils/reports/reportLogo';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0', secondary: '#1e4a72' };

/** Titled content paper (DESIGN_PHILOSOPHY §8); `flush` drops the body padding for tables, `fill` stretches to the grid row. */
const Section: React.FC<{ title: React.ReactNode; flush?: boolean; fill?: boolean; children: React.ReactNode }> = ({ title, flush, fill, children }) => (
  <Paper
    elevation={0}
    sx={{
      borderRadius: 2,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      border: '1px solid #e2e8f0',
      height: fill ? '100%' : undefined,
    }}
  >
    <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
      <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        {title}
      </Typography>
    </Box>
    <Box sx={{ p: flush ? 0 : 1.5 }}>{children}</Box>
  </Paper>
);

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
    const issuer = REPORT_ISSUERS[reportCompany];
    const { doc, filename } = buildCompletionCertificatePdf({
      reportCompany,
      projectName: project.project_name || '—',
      projectNo: project.project_no || String(project.item_no ?? project.id) || '—',
      client: project.account_name || '—',
      location: project.project_location || undefined,
      poNumber: project.po_number || '—',
      startDate: completionDateToInputValue(project.start_date) || undefined,
      completionDate: completionDateDisplay,
      approver: {
        name: approverName.trim(),
        designation: approverDesignation.trim() || undefined,
        company: approverCompany.trim() || project.account_name || undefined,
      },
      contractorRep: {
        name: (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim(),
        designation: (preparedBy.designation || '').trim() || undefined,
      },
    }, { logoDataUrl: await loadReportLogo(issuer), bodyFontBase64: arialNarrowBase64 });

    if (preview) return doc.output('blob') as Blob;
    doc.save(filename);
    return { blob: doc.output('blob') as Blob, filename };
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

  const contractorName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim();
  const headCell = { fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' as const };
  const fact = (label: string, value?: string | null) => (
    <Box sx={{ display: 'flex', gap: 1, py: 0.5, borderBottom: '1px dashed #e2e8f0', '&:last-of-type': { borderBottom: 0 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{value || '—'}</Typography>
    </Box>
  );

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Section title="Certificate Details" fill>
            <TextField
              label="Completion Date"
              type="date"
              value={completionDateOverride}
              onChange={(e) => setCompletionDateOverride(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText={`Printed as ${completionDateDisplay}`}
              sx={{ mb: 1.5 }}
            />
            {fact('Project', project.project_name)}
            {fact('Project No.', project.project_no)}
            {fact('Client', project.account_name)}
            {fact('PO No.', project.po_number)}
          </Section>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Section title="Signatories" fill>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Contractor</Typography>
            <Box sx={{ p: 1.25, mb: 2, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.03)', border: '1px dashed #cbd5e1' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{contractorName || 'Prepared by (set in Progress Report)'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[preparedBy.designation?.trim(), REPORT_COMPANIES[reportCompany]].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Accepted by (Client)</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Name" value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder={clientApprover?.name || 'Client approver name'} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Designation" value={approverDesignation} onChange={(e) => setApproverDesignation(e.target.value)} placeholder={clientApprover?.designation || 'Position'} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth size="small" label="Company" value={approverCompany} onChange={(e) => setApproverCompany(e.target.value)} placeholder={clientApprover?.company || project.account_name || 'Company'} />
              </Grid>
            </Grid>
          </Section>
        </Grid>
      </Grid>

      {exportFeedback && (
        <Alert severity={exportFeedback.severity} onClose={() => setExportFeedback(null)} sx={{ mb: 1.5 }}>
          {exportFeedback.message}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{ mb: 1.5, p: 1.5, borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {editingCertId && <Chip label="Editing saved certificate" size="small" color="info" variant="outlined" />}
          {oneDriveConfigured && (oneDriveSignedIn ? (
            <Chip size="small" icon={<CheckCircleIcon />} label="Uploads to OneDrive on export" color="success" variant="outlined" />
          ) : (
            <Button
              size="small"
              variant="text"
              startIcon={oneDriveAuthLoading ? <CircularProgress size={14} /> : <CloudUploadIcon />}
              disabled={oneDriveAuthLoading}
              onClick={oneDriveLogin}
              sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}
            >
              Sign in to OneDrive to upload
            </Button>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} onClick={handleSaveCertificate} disabled={saving} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
            {editingCertId ? 'Update Saved' : 'Save'}
          </Button>
          <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
            Preview
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfIcon />}
            onClick={handleExport}
            disabled={exporting}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            {exporting ? 'Uploading…' : 'Export PDF'}
          </Button>
        </Box>
      </Paper>

      {/* Saved certificates — Firestore history for backtracking */}
      <Section
        flush
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            Saved Certificates ({savedCerts.length})
            {certsLoading && <CircularProgress size={14} sx={{ color: NET_PACIFIC_COLORS.primary }} />}
          </Box>
        }
      >
        {savedCerts.length > 0 ? (
          <TableContainer sx={{ maxHeight: 320 }}>
            <Table size="small" stickyHeader sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={headCell}>Saved</TableCell>
                  <TableCell sx={headCell}>Completion Date</TableCell>
                  <TableCell sx={headCell}>Company</TableCell>
                  <TableCell sx={headCell}>Accepted By</TableCell>
                  <TableCell align="right" sx={headCell}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {savedCerts.map((c) => (
                  <TableRow key={c.id} hover selected={editingCertId === c.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' }, '& td': { fontSize: '0.8rem' } }}>
                    <TableCell>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}</TableCell>
                    <TableCell>{c.completionDate ? formatCompletionDateForPdf(c.completionDate) : '—'}</TableCell>
                    <TableCell>{c.companyName || c.reportCompany}</TableCell>
                    <TableCell>{c.approverName || '—'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
            No saved certificates yet. Use <strong>Save</strong> to keep a record of this certificate.
          </Typography>
        )}
      </Section>
    </Box>
  );
};

export default CompletionCertificateTab;
