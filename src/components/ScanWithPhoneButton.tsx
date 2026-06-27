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
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE } from '../config/api';

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem('netpacific_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const ScanWithPhoneButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPairing = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPaired(false);
    setPairingToken(null);
    setScanUrl(null);
    stopPolling();
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
  }, [stopPolling]);

  // Re-fetch a fresh pairing token each time the dialog opens.
  useEffect(() => {
    if (open) void startPairing();
    return () => { stopPolling(); };
  }, [open, startPairing, stopPolling]);

  // Poll pairing status while the dialog is open and a token is live.
  useEffect(() => {
    if (!open || !pairingToken || paired) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/qr/status?pairingToken=${pairingToken}`, {
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({ ok: false }));
        if (res.ok && data.ok && data.paired) {
          setPaired(true);
          stopPolling();
        }
      } catch { /* transient — keep polling */ }
    }, 3000);
    return () => { stopPolling(); };
  }, [open, pairingToken, paired, stopPolling]);

  const handleClose = () => {
    stopPolling();
    setOpen(false);
  };

  // A QR encoding a localhost origin is unreachable from a phone — warn and block.
  const onLocalhost = typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  return (
    <>
      <Button variant="outlined" startIcon={<QrCode2Icon />} onClick={() => setOpen(true)}>
        Scan with phone
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>Scan with phone</DialogTitle>
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
                action={<Button color="inherit" size="small" onClick={() => void startPairing()}>Retry</Button>}
              >
                {error}
              </Alert>
            ) : paired ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 72, color: 'success.main' }} />
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Phone connected — check your phone.
                </Typography>
              </>
            ) : scanUrl ? (
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
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ScanWithPhoneButton;
