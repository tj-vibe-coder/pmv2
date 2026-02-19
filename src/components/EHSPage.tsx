import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  IconButton,
  Button,
  TextField,
  Grid,
  Divider,
  Checkbox,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Visibility as VisibilityIcon, PictureAsPdf as PictureAsPdfIcon, FolderOpen as FolderOpenIcon, Delete as DeleteIcon, Download as DownloadIcon } from '@mui/icons-material';
import jsPDF from 'jspdf';
import PdfPreviewDialog from './PdfPreviewDialog';
import { buildOshProgramPdf, ACTI_OSH_PROFILE } from '../utils/oshProgramPdf';

const EHS_COLORS = { primary: '#2c5aa0' };

/** Default values for the editable Safety Certificate (Certificate of Completion template) */
const DEFAULT_SAFETY_CERTIFICATE = {
  companyName: 'Advance Controle Technologie Inc',
  companyAddress: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
  recipientName: '',
  trainingTitle: 'Mandatory Eight-Hour Safety and Health Training for Workers',
  legalText: 'Pursuant to the provision of Republic Act 11058 otherwise known as "An act strengthening compliance with Occupational Safety and Health Standards and providing penalties for violations thereof" and Department Order 198-18.',
  awardLocation: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite',
  awardDate: '',
  signatory1Name: 'Arnel Bautista Jr.',
  signatory1Title: 'Safety Officer II',
  signatory1Accreditation: '',
  signatory2Name: 'Renzel Punongbayan',
  signatory2Title: 'Engineering Supervisor',
  docNo: '',
};

const DOC_NO_COUNTER_KEY = 'safetyCertificateDocNoCounter';

/** Generate sequential Doc No. per year, sequence in hex (e.g. ACT-SC-2026-0001). */
function generateCertificateDocNo(): string {
  const y = new Date().getFullYear();
  let data: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(DOC_NO_COUNTER_KEY);
    if (raw) data = JSON.parse(raw);
  } catch {}
  const next = (data[String(y)] ?? 0) + 1;
  data[String(y)] = next;
  localStorage.setItem(DOC_NO_COUNTER_KEY, JSON.stringify(data));
  const hex = next.toString(16).toUpperCase().padStart(4, '0');
  return `ACT-SC-${y}-${hex}`;
}

export type SafetyCertificateData = typeof DEFAULT_SAFETY_CERTIFICATE;

export interface SavedCertificate extends SafetyCertificateData {
  id: string;
  savedAt: string;
}

const SAFETY_CERTIFICATES_STORAGE_KEY = 'safetyCertificates';

function loadSavedCertificates(): SavedCertificate[] {
  try {
    const raw = localStorage.getItem(SAFETY_CERTIFICATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedCertificates(list: SavedCertificate[]) {
  localStorage.setItem(SAFETY_CERTIFICATES_STORAGE_KEY, JSON.stringify(list));
}

/** Dark blue for headings, black for body (document style like ACTI IMS Manual) */
const IMS_HEADING_COLOR = [26, 63, 114] as [number, number, number]; // #1a3f72

const COMPANY_NAME_IMS = 'ADVANCE CONTROLE TECHNOLOGIE INC';
const IMS_TITLE_LINE1 = 'INTEGRATED MANAGEMENT SYSTEM (IMS)';
const IMS_TITLE_LINE2 = 'MANUAL';
const IMS_SUBTITLE = 'Aligned with Philippine DOLE OSH Law (RA 11058)';

/** Advance Controle / app branding blue (#2c5aa0) */
const BRAND_BLUE = [44, 90, 160] as [number, number, number];
/** Light blue for certificate decorative areas */
const LIGHT_BLUE = [220, 232, 248] as [number, number, number];

/** Certificate spacing (mm) – maximized for readability; bottom reserved to avoid overlap with signatures */
const CERT = {
  logoGap: 10,
  companyToTitle: 14,
  titleToRecipient: 12,
  afterRecipient: 14,
  afterForHaving: 12,
  afterTrainingTitle: 14,
  legalLineHeight: 6.5,
  afterLegal: 14,
  sigBlockTop: 48,
  gapAboveSigs: 22,
} as const;

function formatCertificateDate(isoOrEmpty: string): string {
  if (!isoOrEmpty || !isoOrEmpty.trim()) return '';
  const d = new Date(isoOrEmpty.trim());
  if (isNaN(d.getTime())) return isoOrEmpty;
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  return `${day}${suffix} day of ${month} ${year}`;
}

/** Draw one certificate on the current page of doc (landscape A4). */
async function drawCertificatePage(doc: jsPDF, c: SafetyCertificateData): Promise<void> {
  const w = 297;
  const h = 210;
  const margin = 22;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, h, 'F');

  doc.setFillColor(LIGHT_BLUE[0], LIGHT_BLUE[1], LIGHT_BLUE[2]);
  doc.rect(0, 0, 85, 70, 'F');
  doc.rect(0, h - 55, 75, 55, 'F');

  const docNo = c.docNo?.trim() || generateCertificateDocNo();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Doc No.: ${docNo}`, w - margin, 9, { align: 'right' });

  let contentTop = 28;
  try {
    const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../utils/logoUtils');
    const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
    const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
    const logoW = ACT_LOGO_PDF_WIDTH * 1.2;
    const logoH = ACT_LOGO_PDF_HEIGHT * 1.2;
    doc.addImage(logoDataUrl, 'PNG', w / 2 - logoW / 2, 10, logoW, logoH);
    contentTop = 10 + logoH + CERT.logoGap;
  } catch (_) {}

  try {
    const { loadLogoTransparentBackground } = await import('../utils/logoUtils');
    const safetyLogoUrl = `${process.env.PUBLIC_URL || ''}/logo-safety-first.png`;
    const safetyDataUrl = await loadLogoTransparentBackground(safetyLogoUrl);
    const safetyW = 28;
    const safetyH = 20;
    doc.addImage(safetyDataUrl, 'PNG', w - margin - safetyW, 12, safetyW, safetyH);
  } catch (_) {}

  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(c.companyName.toUpperCase(), w / 2, contentTop, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(c.companyAddress, w / 2, contentTop + 7, { align: 'center' });

  const titleY = contentTop + 7 + CERT.companyToTitle;
  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE OF COMPLETION', w / 2, titleY, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('This certificate is hereby awarded to', w / 2, titleY + CERT.titleToRecipient, { align: 'center' });
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const recipient = (c.recipientName || 'Recipient Name').toUpperCase();
  doc.text(recipient, w / 2, titleY + CERT.titleToRecipient + CERT.afterRecipient, { align: 'center' });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  const rw = doc.getTextWidth(recipient);
  const recipientLineY = titleY + CERT.titleToRecipient + CERT.afterRecipient + 2;
  doc.line(w / 2 - rw / 2, recipientLineY, w / 2 + rw / 2, recipientLineY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('For having successfully completed the safety training in:', w / 2, recipientLineY + CERT.afterRecipient, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(c.trainingTitle || 'Safety Training', w / 2, recipientLineY + CERT.afterRecipient + CERT.afterForHaving, { align: 'center' });
  const sigY = h - CERT.sigBlockTop;
  const locationDateY = sigY - CERT.gapAboveSigs;
  const maxLegalEndY = locationDateY - CERT.afterLegal;

  doc.setFont('helvetica', 'normal');
  const legalStartY = recipientLineY + CERT.afterRecipient + CERT.afterForHaving + CERT.afterTrainingTitle;
  const legalSpace = maxLegalEndY - legalStartY;
  const legalStr = c.legalText || '';
  const width = w - margin * 2;
  let legalFontSize = 11;
  let legalLineHeight: number = CERT.legalLineHeight;
  let legalLines = doc.splitTextToSize(legalStr, width);
  while (legalLines.length * legalLineHeight > legalSpace && legalFontSize >= 9) {
    legalFontSize -= 1;
    legalLineHeight = legalFontSize === 10 ? 6 : 5.5;
    doc.setFontSize(legalFontSize);
    legalLines = doc.splitTextToSize(legalStr, width);
  }
  doc.setFontSize(legalFontSize);
  let y = legalStartY;
  legalLines.forEach((line: string) => {
    doc.text(line, w / 2, y, { align: 'center' });
    y += legalLineHeight;
  });
  const dateStr = c.awardDate ? formatCertificateDate(c.awardDate) : '';
  const locationDate = `Held at ${c.awardLocation || '—'} and awarded on this ${dateStr || '—'}`;
  doc.text(locationDate, w / 2, locationDateY, { align: 'center' });

  const sigLineW = 45;
  doc.setFont('helvetica', 'bold');
  doc.text(c.signatory1Name || '_________________', margin + sigLineW / 2, sigY, { align: 'center' });
  doc.line(margin, sigY + 2, margin + sigLineW, sigY + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(c.signatory1Title + (c.signatory1Accreditation ? ` Accreditation No. ${c.signatory1Accreditation}` : ''), margin + sigLineW / 2, sigY + 8, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(c.signatory2Name || '_________________', w - margin - sigLineW / 2, sigY, { align: 'center' });
  doc.line(w - margin - sigLineW, sigY + 2, w - margin, sigY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(c.signatory2Title || '', w - margin - sigLineW / 2, sigY + 8, { align: 'center' });
}

const EHSPage: React.FC = () => {
  const navigate = useNavigate();
  const { tab: tabParam = 'safety-certificate' } = useParams<{ tab?: string }>();
  const [localTab, setLocalTab] = useState(tabParam);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');
  const [certificate, setCertificate] = useState(DEFAULT_SAFETY_CERTIFICATE);
  const [savedCertificates, setSavedCertificates] = useState<SavedCertificate[]>(() => loadSavedCertificates());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = ['safety-manual', 'osh-program'].includes(tabParam) ? tabParam : 'safety-certificate';
    setLocalTab(t);
  }, [tabParam]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setLocalTab(newValue);
    navigate(`/ehs/${newValue}`);
  };

  const buildSafetyManualPdf = useCallback(async (preview: boolean): Promise<Blob | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;

    // White background (standard document style like ACTI IMS Manual)
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Company name – dark blue, normal
    doc.setTextColor(IMS_HEADING_COLOR[0], IMS_HEADING_COLOR[1], IMS_HEADING_COLOR[2]);
    let y = 45;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_NAME_IMS, margin, y);
    y += 28;

    // Title – dark blue, bold
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(IMS_TITLE_LINE1, margin, y);
    y += 12;
    doc.text(IMS_TITLE_LINE2, margin, y);
    y += 20;

    // Subtitle – black body text
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(IMS_SUBTITLE, margin, y);

    if (preview) return doc.output('blob') as Blob;
    doc.save(`IMS_Manual_${new Date().toISOString().slice(0, 10)}.pdf`);
  }, []);

  const handlePreviewSafetyManual = async () => {
    const blob = await buildSafetyManualPdf(true);
    if (blob) {
      setPdfPreviewBlob(blob);
      setPdfPreviewTitle('Integrated Management System (IMS) Manual');
      setPdfPreviewOpen(true);
    }
  };

  const handleClosePreview = () => {
    setPdfPreviewOpen(false);
    setPdfPreviewBlob(null);
  };

  const buildSafetyCertificatePdf = useCallback(
    async (preview: boolean, certOverride?: SafetyCertificateData): Promise<Blob | void> => {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const c = certOverride ?? certificate;
      await drawCertificatePage(doc, c);
      if (preview) return doc.output('blob') as Blob;
      doc.save(`Safety_Certificate_${(c.recipientName || 'Certificate').replace(/\s+/g, '_')}.pdf`);
    },
    [certificate]
  );

  const handleGenerateAndSave = () => {
    const name = (certificate.recipientName || '').trim();
    if (!name) return;
    const docNo = certificate.docNo?.trim() || generateCertificateDocNo();
    const saved: SavedCertificate = {
      ...certificate,
      docNo,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      savedAt: new Date().toISOString(),
    };
    setCertificate((prev) => ({ ...prev, docNo }));
    setSavedCertificates((prev) => {
      const next = [saved, ...prev];
      persistSavedCertificates(next);
      return next;
    });
  };

  const handleExportCertificate = async () => {
    await buildSafetyCertificatePdf(false);
  };

  const handleLoadSaved = (saved: SavedCertificate) => {
    const { id, savedAt, ...data } = saved;
    setCertificate(data as SafetyCertificateData);
  };

  const handleRemoveSaved = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSavedCertificates((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persistSavedCertificates(next);
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === savedCertificates.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(savedCertificates.map((s) => s.id)));
  };

  const handleExportSelected = async () => {
    const selected = savedCertificates.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    await drawCertificatePage(doc, selected[0]);
    for (let i = 1; i < selected.length; i++) {
      doc.addPage([297, 210], 'l');
      await drawCertificatePage(doc, selected[i]);
    }
    doc.save('Safety_Certificates.pdf');
  };

  const handlePreviewCertificate = async () => {
    const blob = await buildSafetyCertificatePdf(true);
    if (blob) {
      setPdfPreviewBlob(blob);
      setPdfPreviewTitle('Certificate of Completion');
      setPdfPreviewOpen(true);
    }
  };

  const buildOshProgramPdfDoc = useCallback(async (preview: boolean): Promise<Blob | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');
    await buildOshProgramPdf(doc, ACTI_OSH_PROFILE);
    if (preview) return doc.output('blob') as Blob;
    doc.save(`OSH_Program_${ACTI_OSH_PROFILE.companyName.replace(/\s+/g, '_')}.pdf`);
  }, []);

  const handlePreviewOshProgram = async () => {
    const blob = await buildOshProgramPdfDoc(true);
    if (blob) {
      setPdfPreviewBlob(blob);
      setPdfPreviewTitle('OSH Program (Advance Controle Technologie Inc.)');
      setPdfPreviewOpen(true);
    }
  };

  const updateCertificate = (field: keyof typeof DEFAULT_SAFETY_CERTIFICATE, value: string) => {
    setCertificate((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Box
      sx={{
        height: 'calc(100vh - 80px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        margin: -2,
        backgroundColor: '#f5f5f5',
      }}
    >
      <Box sx={{ flexShrink: 0, p: 2, borderBottom: '1px solid #e0e0e0', bgcolor: '#fff' }}>
        <Box display="flex" alignItems="center" mb={2}>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ flexGrow: 1, color: EHS_COLORS.primary }}>
            EHS
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Safety Compliance and documents
        </Typography>
      </Box>

      <Box sx={{ flexShrink: 0, px: 2, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}>
        <Tabs value={localTab} onChange={handleTabChange}>
          <Tab label="Safety Certificate" value="safety-certificate" />
          <Tab label="Safety Manual" value="safety-manual" />
          <Tab label="OSH Program" value="osh-program" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {localTab === 'safety-certificate' && (
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: EHS_COLORS.primary }}>
              Certificate of Completion
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Editable safety training certificate. Fill in the fields below, then preview or export to PDF.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Company name" value={certificate.companyName} onChange={(e) => updateCertificate('companyName', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Company address" value={certificate.companyAddress} onChange={(e) => updateCertificate('companyAddress', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Recipient name" value={certificate.recipientName} onChange={(e) => updateCertificate('recipientName', e.target.value)} placeholder="e.g. Ryan G. Fernandez" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" type="date" InputLabelProps={{ shrink: true }} label="Award date" value={certificate.awardDate} onChange={(e) => updateCertificate('awardDate', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Training title" value={certificate.trainingTitle} onChange={(e) => updateCertificate('trainingTitle', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" multiline minRows={2} label="Legal text (RA 11058, Dept Order 198-18)" value={certificate.legalText} onChange={(e) => updateCertificate('legalText', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Award location" value={certificate.awardLocation} onChange={(e) => updateCertificate('awardLocation', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /><Typography variant="subtitle2" color="text.secondary">Signatories</Typography></Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Signatory 1 name" value={certificate.signatory1Name} onChange={(e) => updateCertificate('signatory1Name', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Signatory 1 title" value={certificate.signatory1Title} onChange={(e) => updateCertificate('signatory1Title', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Signatory 1 accreditation no." value={certificate.signatory1Accreditation} onChange={(e) => updateCertificate('signatory1Accreditation', e.target.value)} placeholder="e.g. 1033-180227-N-0229" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }} />
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Signatory 2 name" value={certificate.signatory2Name} onChange={(e) => updateCertificate('signatory2Name', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Signatory 2 title" value={certificate.signatory2Title} onChange={(e) => updateCertificate('signatory2Title', e.target.value)} />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
              <Button variant="contained" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleGenerateAndSave} disabled={!(certificate.recipientName || '').trim()} sx={{ bgcolor: EHS_COLORS.primary }}>Generate & Save</Button>
              <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreviewCertificate} sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}>Preview PDF</Button>
              <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExportCertificate} sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}>Export Certificate</Button>
            </Box>

            <Divider sx={{ my: 3 }} />
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: EHS_COLORS.primary }}>
              Generated certificates
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Click &quot;Generate & Save&quot; to add the current form to the list. Select names below, then export as one PDF (one certificate per page).
            </Typography>
            {savedCertificates.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={handleExportSelected} disabled={selectedIds.size === 0} sx={{ bgcolor: EHS_COLORS.primary }}>Export selected ({selectedIds.size})</Button>
                <Button variant="outlined" size="small" onClick={handleSelectAll} sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}>
                  {selectedIds.size === savedCertificates.length ? 'Clear selection' : 'Select all'}
                </Button>
              </Box>
            )}
            {savedCertificates.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No certificates yet. Fill in the form and click &quot;Generate & Save&quot; to add one.</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 2.5, listStyle: 'none' }}>
                {savedCertificates.map((saved) => (
                  <Box
                    component="li"
                    key={saved.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      py: 0.75,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <Checkbox size="small" checked={selectedIds.has(saved.id)} onChange={() => handleToggleSelect(saved.id)} sx={{ p: 0.5 }} />
                    <Typography variant="body2" sx={{ flex: 1 }}>{saved.recipientName || 'Unnamed'}</Typography>
                    {saved.awardDate && (
                      <Typography variant="caption" color="text.secondary">
                        {new Date(saved.awardDate).toLocaleDateString()}
                      </Typography>
                    )}
                    <Button size="small" startIcon={<FolderOpenIcon />} onClick={() => handleLoadSaved(saved)} sx={{ color: EHS_COLORS.primary }}>Load</Button>
                    <IconButton size="small" onClick={() => handleRemoveSaved(saved.id)} color="error" aria-label="Remove"><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        )}
        {localTab === 'osh-program' && (
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: EHS_COLORS.primary }}>
              OSH Program (Company Policy)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Generate the Occupational Safety and Health Program aligned to Advance Controle Technologie Inc. and DOLE Department Order 198-18 (RA 11058). Preview or export to PDF.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreviewOshProgram} sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}>Preview PDF</Button>
              <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={() => buildOshProgramPdfDoc(false)} sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}>Export OSH Program</Button>
            </Box>
          </Paper>
        )}
        {localTab === 'safety-manual' && (
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: EHS_COLORS.primary }}>
              Safety Manual
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Generate the Integrated Management System (IMS) Manual cover report aligned with Philippine DOLE OSH Law (RA 11058). Preview or export to PDF.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<VisibilityIcon />}
                onClick={handlePreviewSafetyManual}
                sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}
              >
                Preview PDF
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => buildSafetyManualPdf(false)}
                sx={{ borderColor: EHS_COLORS.primary, color: EHS_COLORS.primary }}
              >
                Export IMS Manual
              </Button>
            </Box>
          </Paper>
        )}
      </Box>

      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onClose={handleClosePreview}
        pdfBlob={pdfPreviewBlob}
        title={pdfPreviewTitle}
      />
    </Box>
  );
};

export default EHSPage;
