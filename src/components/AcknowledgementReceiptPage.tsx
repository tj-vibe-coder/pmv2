import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import jsPDF from 'jspdf';
import PdfPreviewDialog from './PdfPreviewDialog';
import { arialNarrowBase64 } from '../fonts/arialNarrowBase64';

const BRAND_BLUE = [44, 90, 160] as [number, number, number];

type CompanyKey = 'ACTI' | 'IOCT';
const COMPANY_PRESETS: Record<CompanyKey, { name: string; address: string; tin: string; logo: string }> = {
  ACTI: {
    name: 'Advance Controle Technologie Inc',
    address: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
    tin: '008-133-926-000',
    logo: '/logo-acti.png',
  },
  IOCT: {
    name: 'IO Control Technologie OPC',
    address: 'B63, L7 Dynamism Jubilation Enclave, Santo Niño, City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
    tin: '697-029-976-00000',
    logo: '/logo-ioct.png',
  },
};

const DEFAULT_RECEIPT = {
  company: 'ACTI' as CompanyKey,
  companyName: COMPANY_PRESETS.ACTI.name,
  companyAddress: COMPANY_PRESETS.ACTI.address,
  companyTin: COMPANY_PRESETS.ACTI.tin,
  service: '',
  amount: '',
  receiverName: '',
  date: new Date().toISOString().slice(0, 10),
};

function formatAmount(val: string): string {
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return val || '0.00';
  return num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateForPdf(value: string): string {
  if (!value || !value.trim()) return '—';
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { dateStyle: 'long' });
}

async function buildReceiptPdf(data: typeof DEFAULT_RECEIPT): Promise<jsPDF> {
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

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Logo (top left)
  const companyKey = data.company || 'ACTI';
  const preset = COMPANY_PRESETS[companyKey] || COMPANY_PRESETS.ACTI;
  try {
    const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT, IOCT_LOGO_PDF_WIDTH, IOCT_LOGO_PDF_HEIGHT } = await import('../utils/logoUtils');
    const logoUrl = `${process.env.PUBLIC_URL || ''}${preset.logo}`;
    const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
    const logoW = companyKey === 'IOCT' ? IOCT_LOGO_PDF_WIDTH : ACT_LOGO_PDF_WIDTH;
    const logoH = companyKey === 'IOCT' ? IOCT_LOGO_PDF_HEIGHT : ACT_LOGO_PDF_HEIGHT;
    doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
    y += logoH + 4;
  } catch (_) {}

  // Main title – centered (COC-style)
  fontTitle();
  doc.setFontSize(20);
  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
  doc.text('Acknowledgement Receipt', pageWidth / 2, y, { align: 'center' });
  doc.setFontSize(12);
  doc.text('For 3rd Party Services with No Receipt', pageWidth / 2, y + 7, { align: 'center' });
  y += 7 + sectionGap;

  doc.setTextColor(0, 0, 0);

  // Information block (left-aligned, COC-style)
  fontBody();
  doc.setFontSize(11);
  doc.text(`Company: ${data.companyName || '—'}`, margin, y);
  y += lineHeight;
  const addrLines = doc.splitTextToSize(`Address: ${data.companyAddress || '—'}`, contentWidth);
  addrLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += lineHeight;
  });
  doc.text(`TIN: ${data.companyTin || '—'}`, margin, y);
  y += lineHeight;
  doc.text(`Date: ${formatDateForPdf(data.date)}`, margin, y);
  y += lineHeight;
  const serviceLabel = (data.service || '—').trim() || '—';
  const serviceInfoLines = doc.splitTextToSize(`Service / Description: ${serviceLabel}`, contentWidth);
  serviceInfoLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += lineHeight;
  });
  const amountText = data.amount ? `₱ ${formatAmount(data.amount)}` : '—';
  doc.text(`Amount: ${amountText}`, margin, y);
  y += lineHeight + sectionGap;

  // Acknowledgement statement (COC-style sub-heading + paragraph)
  fontTitle();
  doc.setFontSize(12);
  doc.text('Acknowledgement:', margin, y);
  fontBody();
  y += lineHeight + afterHeading;
  doc.setFontSize(10);
  const serviceText = (data.service || '—').trim() || '—';
  const ackText = `This is to acknowledge receipt of payment for the following 3rd party service: ${serviceText}, in the amount of ${amountText}. This receipt is issued in lieu of an official receipt from the service provider.`;
  const ackLines = doc.splitTextToSize(ackText, contentWidth);
  doc.text(ackLines, margin, y);
  y += ackLines.length * lineHeight + sectionGap;

  // Received by (signature block, COC-style)
  fontTitle();
  doc.setFontSize(12);
  doc.text('Received by:', margin, y);
  y += lineHeight + 4;

  const receiver = (data.receiverName || '—').trim() || '—';

  fontBody();
  doc.setFontSize(10);
  doc.text(receiver, margin, y);
  y += 5.5;
  doc.text('Name of Receiver', margin, y);

  // Footer – Doc. No. (COC-style)
  const docNo = `Doc. No.: AR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`;
  const footerY = pageHeight - 10;
  fontBody();
  doc.setFontSize(9);
  doc.text(docNo, margin, footerY);
  doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' });

  return doc;
}

const AcknowledgementReceiptPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(DEFAULT_RECEIPT);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const update = (k: keyof typeof DEFAULT_RECEIPT, v: string | CompanyKey) => {
    setForm((prev) => {
      const next = { ...prev, [k]: v };
      if (k === 'company') {
        const preset = COMPANY_PRESETS[v as CompanyKey];
        if (preset) {
          next.companyName = preset.name;
          next.companyAddress = preset.address;
          next.companyTin = preset.tin;
        }
      }
      return next;
    });
  };

  const handlePreview = async () => {
    const doc = await buildReceiptPdf(form);
    setPreviewBlob(doc.output('blob') as Blob);
    setPreviewOpen(true);
  };

  const handleExport = async () => {
    const doc = await buildReceiptPdf(form);
    const name = (form.receiverName || 'Receipt').replace(/\s+/g, '_');
    doc.save(`Acknowledgement_Receipt_${name}.pdf`);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/utilities')} size="small">
          Back
        </Button>
        <Typography variant="h6" fontWeight={600}>
          Acknowledgement Receipt (3rd Party Services, No Receipt)
        </Typography>
      </Box>

      <Paper sx={{ p: 3, maxWidth: 560 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Company & Receipt Details
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Company</InputLabel>
              <Select
                value={form.company}
                label="Company"
                onChange={(e) => update('company', e.target.value as CompanyKey)}
              >
                <MenuItem value="ACTI">{COMPANY_PRESETS.ACTI.name}</MenuItem>
                <MenuItem value="IOCT">{COMPANY_PRESETS.IOCT.name}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="TIN"
              value={form.companyTin}
              onChange={(e) => update('companyTin', e.target.value)}
              placeholder="e.g. 000-000-000-000"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Company Address"
              value={form.companyAddress}
              onChange={(e) => update('companyAddress', e.target.value)}
              placeholder="Full address"
              multiline
              minRows={2}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
              Receipt Details
            </Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Service / Description"
              value={form.service}
              onChange={(e) => update('service', e.target.value)}
              placeholder="e.g. Equipment rental, Consulting services"
              multiline
              minRows={2}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Amount (PHP)"
              type="number"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              placeholder="e.g. 5000"
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Name of Receiver"
              value={form.receiverName}
              onChange={(e) => update('receiverName', e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
            />
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={handlePreview}
          >
            Preview PDF
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleExport}
            sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1a3f72' } }}
          >
            Export to PDF
          </Button>
        </Box>
      </Paper>

      <PdfPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        pdfBlob={previewBlob}
        title="Acknowledgement Receipt Preview"
      />
    </Box>
  );
};

export default AcknowledgementReceiptPage;
