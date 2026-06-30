import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE } from '../config/api';

export type ScanContext = {
  kind: 'liquidation';
  formNo: string;
  year: string;
  folderPath: string;
  rowId: string;
  label?: string;
};

export type DeliveredReceipt = {
  oneDriveId: string;
  webUrl: string;
  filename: string;
  thumbnailDataUrl?: string;
  parsed?: {
    amount?: number | null;
    date?: string | null;
    category?: string | null;
    particulars?: string | null;
    vendor?: string | null;
    invoiceNo?: string | null;
    deductible?: boolean | null;
    deductibleReason?: string | null;
    customerInfoIssues?: string[];
    confidence?: number | null;
  };
};

interface Props {
  open: boolean;
  onClose: () => void;
  context: ScanContext | null;
  onPaired: (pairingToken: string) => void;
}

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem('netpacific_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export default function ScanToPhoneDialog({ open, onClose, context, onPaired }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevOpenRef = useRef(false);
  const onPairedRef = useRef(onPaired);
  const onPairedFiredRef = useRef(false);

  useEffect(() => { onPairedRef.current = onPaired; }, [onPaired]);

  const stopAllPolling = useCallback(() => {
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
  }, []);

  const startPairing = useCallback(async (ctx: ScanContext) => {
    setLoading(true);
    setError(null);
    setPaired(false);
    setPairingToken(null);
    setScanUrl(null);
    onPairedFiredRef.current = false;
    stopAllPolling();
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ context: ctx }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (res.ok && data.ok && data.pairingToken) {
        setPairingToken(data.pairingToken);
        setScanUrl(`${window.location.origin}/scan?token=${data.pairingToken}`);
      } else {
        setError('Could not start a phone session. Please retry.');
      }
    } catch {
      setError('Could not start a phone session. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [stopAllPolling]);

  // Start fresh pairing each time the dialog opens; reset on close.
  useEffect(() => {
    if (open && !prevOpenRef.current && context) {
      void startPairing(context);
    }
    if (!open && prevOpenRef.current) {
      stopAllPolling();
      setPairingToken(null);
      setScanUrl(null);
      setPaired(false);
      onPairedFiredRef.current = false;
      setError(null);
    }
    prevOpenRef.current = open;
  }, [open, context, startPairing, stopAllPolling]);

  // Clean up on unmount.
  useEffect(() => () => { stopAllPolling(); }, [stopAllPolling]);

  // Poll pairing status every 3 s until the phone connects. Once paired, fire
  // onPaired(token) exactly once so the PAGE can start receiving scan results.
  useEffect(() => {
    if (!open || !pairingToken || paired) return;
    statusPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/qr/status?pairingToken=${pairingToken}`, {
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({ ok: false }));
        if (res.ok && data.ok && data.paired) {
          setPaired(true);
          if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
          if (!onPairedFiredRef.current) {
            onPairedFiredRef.current = true;
            onPairedRef.current(pairingToken);
          }
        }
      } catch { /* transient — keep polling */ }
    }, 3000);
    return () => {
      if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
    };
  }, [open, pairingToken, paired]);

  const handleClose = () => {
    stopAllPolling();
    onClose();
  };

  const onLocalhost = typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Scan receipt with phone
        {context?.label && (
          <Typography variant="caption" display="block" color="text.secondary">
            {context.label}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 1, textAlign: 'center' }}>
          {onLocalhost ? (
            <Alert severity="warning" sx={{ width: '100%', textAlign: 'left' }}>
              You opened this app at <b>localhost</b>, which a phone can't reach. Reopen the
              desktop app using this computer's network address (for example
              {' '}<b>http://192.168.x.x:3000</b> or your Tailscale IP), then try again.
            </Alert>
          ) : loading ? (
            <CircularProgress />
          ) : error ? (
            <Alert
              severity="error"
              sx={{ width: '100%' }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => { if (context) void startPairing(context); }}
                >
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          ) : (
            <>
              {scanUrl && !paired && (
                <>
                  <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <QRCodeSVG value={scanUrl} size={232} />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Scan this with your phone camera. Code expires in ~2 minutes.
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ wordBreak: 'break-all', color: 'text.secondary', userSelect: 'all' }}
                  >
                    {scanUrl}
                  </Typography>
                </>
              )}
              {paired && (
                <>
                  <CheckCircleIcon sx={{ fontSize: 72, color: 'success.main' }} />
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    Phone connected — receipts will appear in the form. Keep scanning on your phone; you can close this window.
                  </Typography>
                </>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
