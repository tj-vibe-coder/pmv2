import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface PdfPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  /** PDF as Blob - when set, shown in iframe. Clear when closing so we revoke the object URL. */
  pdfBlob: Blob | null;
  title?: string;
}

const PdfPreviewDialog: React.FC<PdfPreviewDialogProps> = ({ open, onClose, pdfBlob, title = 'PDF Preview' }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !pdfBlob) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- objectUrl omitted to avoid re-running when we set it
  }, [open, pdfBlob]);

  const handleClose = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '90vh',
          maxHeight: 900,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <span>{title}</span>
        <IconButton size="small" onClick={handleClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {objectUrl ? (
            <iframe
              title={title}
              src={objectUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                minHeight: 'calc(90vh - 64px)',
              }}
            />
          ) : (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              Loading preview…
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewDialog;
