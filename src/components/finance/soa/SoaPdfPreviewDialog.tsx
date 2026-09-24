import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import type { StatementOfAccount } from '../../../types/StatementOfAccount';
import { downloadSoaPdf, generateSoaPdfBlob } from '../../../utils/soa/soaPdfExport';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

interface SoaPdfPreviewDialogProps {
  open: boolean;
  soa: StatementOfAccount | null;
  onClose: () => void;
}

export default function SoaPdfPreviewDialog({ open, soa, onClose }: SoaPdfPreviewDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let active = true;
    let url: string | null = null;

    if (open && soa) {
      setLoading(true);
      generateSoaPdfBlob(soa)
        .then((blob) => {
          if (!active) return;
          url = URL.createObjectURL(blob);
          setPdfUrl(url);
          setLoading(false);
        })
        .catch((err) => {
          console.error('[SoaPdfPreview] Error generating blob:', err);
          if (active) setLoading(false);
        });
    } else {
      setPdfUrl(null);
    }

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, soa]);

  if (!soa) return null;

  const handleDownload = () => {
    if (soa) void downloadSoaPdf(soa);
  };

  const handlePrint = () => {
    if (pdfUrl) {
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          {soa.soaNo} — Statement of Account Preview
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Download PDF
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
          >
            Print
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ height: '75vh', p: 0, bgcolor: '#525659' }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white' }}>
            <CircularProgress color="inherit" />
            <Typography sx={{ mt: 2 }}>Rendering Statement of Account...</Typography>
          </Box>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            title="Statement of Account PDF"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white' }}>
            <Typography>Failed to load PDF preview.</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
