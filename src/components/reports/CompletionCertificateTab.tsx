import React from 'react';
import { Box, Paper, Typography, Button } from '@mui/material';
import { PictureAsPdf as PictureAsPdfIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { Project } from '../../types/Project';
import jsPDF from 'jspdf';
import { REPORT_COMPANIES, type ReportCompanyKey } from '../ProjectDetails';
import { arialNarrowBase64 } from '../../fonts/arialNarrowBase64';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

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

export interface CompletionCertificateTabProps {
  project: Project;
  currentUser: { full_name?: string | null; username?: string; email?: string } | null;
  reportCompany: ReportCompanyKey;
  setReportCompany: (v: ReportCompanyKey) => void;
  preparedBy: { name: string; designation: string; company: string; date: string };
  setPreparedBy: React.Dispatch<React.SetStateAction<{ name: string; designation: string; company: string; date: string }>>;
  onPreview: (blob: Blob, title: string) => void;
}

const CompletionCertificateTab: React.FC<CompletionCertificateTabProps> = ({
  project,
  currentUser,
  reportCompany,
  preparedBy,
  onPreview,
}) => {

  const buildPdf = async (preview: boolean): Promise<Blob | void> => {
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
    const completionDate = project.completion_date
      ? new Date(typeof project.completion_date === 'number' ? project.completion_date * 1000 : project.completion_date).toLocaleDateString('en-US', { dateStyle: 'long' })
      : new Date().toLocaleDateString('en-US', { dateStyle: 'long' });

    // Optional company logo (e.g. ACT, IOCT)
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
        const { loadLogoTransparentBackground, IOCT_LOGO_PDF_WIDTH, IOCT_LOGO_PDF_HEIGHT } = await import('../../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-ioct.png`;
        const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
        doc.addImage(logoDataUrl, 'PNG', margin, y, IOCT_LOGO_PDF_WIDTH, IOCT_LOGO_PDF_HEIGHT);
        y += IOCT_LOGO_PDF_HEIGHT + 4;
      } catch (_) {}
    }

    // Main title – centered (certificate-style large)
    fontTitle();
    doc.setFontSize(20);
    doc.text('Certificate of Completion', pageWidth / 2, y, { align: 'center' });
    y += 7 + sectionGap;

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
    const approverParts = (project.client_approver || '').split(/\s*[–-]\s*/);
    const approverName = (approverParts[0] || '').trim() || '—';
    const approverDesignation = (approverParts[1] || '').trim() || '—';
    const approverCompany = (project.account_name || '').trim() || '—';
    doc.setDrawColor(180, 180, 180);
    doc.line(leftColX, rowY + 2, leftColX + lineWidth, rowY + 2);
    doc.text(approverName, leftColX, rowY);
    rowY += sigLineHeight;
    doc.line(leftColX, rowY + 2, leftColX + lineWidth, rowY + 2);
    doc.text(approverDesignation, leftColX, rowY);
    rowY += sigLineHeight;
    doc.line(leftColX, rowY + 2, leftColX + lineWidth, rowY + 2);
    doc.text(approverCompany, leftColX, rowY);
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
    doc.save(`Certificate_of_Completion_${(project.project_name || 'project').replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePreview = async () => {
    const blob = await buildPdf(true);
    if (blob) onPreview(blob, 'Certificate of Completion');
  };

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Certificate of Completion
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Generate the Final Project Completion Certificate. Preview or Export to PDF.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview PDF</Button>
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={() => buildPdf(false)} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Export Certificate of Completion</Button>
      </Box>
    </Paper>
  );
};

export default CompletionCertificateTab;
