import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, Paper, CircularProgress, Button, Divider } from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  AccessTime as ClockIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const API_BASE = '';

type ClockStatus = 'idle' | 'loading' | 'clocked_in' | 'clocked_out' | 'already_done' | 'error';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLocation(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

const ClockPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const autoScan = searchParams.get('scan') === '1';
  const employeeId = user?.id != null ? String(user.id) : '';

  const [status, setStatus] = useState<ClockStatus>(autoScan ? 'loading' : 'idle');
  const [resultTime, setResultTime] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const clockUrl = `${window.location.origin}/employee/clock?scan=1`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(clockUrl)}`;

  const doClock = useCallback(async () => {
    if (!employeeId) {
      setStatus('error');
      setResultMessage('Not logged in. Please log in and try again.');
      return;
    }

    setStatus('loading');
    const token = localStorage.getItem('netpacific_token');
    const today = todayStr();
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const loc = await getLocation();
    if (loc) setLocation(loc);

    try {
      const res = await fetch(
        `${API_BASE}/api/dtr?employeeId=${encodeURIComponent(employeeId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to fetch DTR');
      const entries = await res.json();
      const todayEntry = entries.find((e: { entryDate: string }) => e.entryDate === today);

      if (!todayEntry) {
        // Clock In
        const body: Record<string, unknown> = {
          employeeId, entryDate: today, timeIn: currentTime, timeOut: '',
          dayType: 'REGULAR', regularHours: 0, overtimeHours: 0, nightDiffHours: 0,
          isAbsent: false, tardinessMinutes: 0, remarks: '',
        };
        if (loc) body.clockInLocation = loc;
        const postRes = await fetch(`${API_BASE}/api/dtr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || 'Failed to clock in');
        }
        setStatus('clocked_in');
        setResultTime(formatTime(now));
      } else if (!todayEntry.timeOut) {
        // Clock Out
        const [inH, inM] = (todayEntry.timeIn || '08:00').split(':').map(Number);
        const [outH, outM] = currentTime.split(':').map(Number);
        let diffMin = (outH * 60 + outM) - (inH * 60 + inM);
        if (diffMin < 0) diffMin += 24 * 60;
        const hours = Math.round(diffMin / 30) * 0.5;
        const putBody: Record<string, unknown> = { timeOut: currentTime, regularHours: Math.max(0, hours) };
        if (loc) putBody.clockOutLocation = loc;
        const putRes = await fetch(`${API_BASE}/api/dtr/${todayEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(putBody),
        });
        if (!putRes.ok) throw new Error('Failed to clock out');
        setStatus('clocked_out');
        setResultTime(formatTime(now));
      } else {
        setStatus('already_done');
        setResultMessage(`Clocked in at ${todayEntry.timeIn}, out at ${todayEntry.timeOut}`);
      }
    } catch (e) {
      setStatus('error');
      setResultMessage(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [employeeId]);

  // Auto-clock when scanned via QR (?scan=1)
  useEffect(() => {
    if (autoScan) doClock();
  }, [autoScan, doClock]);

  // --- Result screen (after clock action) ---
  if (status !== 'idle') {
    const configs: Record<Exclude<ClockStatus, 'idle'>, { icon: React.ReactNode; color: string; bg: string; title: string }> = {
      loading: { icon: <CircularProgress size={64} />, color: NET_PACIFIC_COLORS.primary, bg: '#e8f0fe', title: 'Processing...' },
      clocked_in: { icon: <LoginIcon sx={{ fontSize: 80, color: '#00b894' }} />, color: '#00b894', bg: '#e6f9f3', title: 'Clocked In' },
      clocked_out: { icon: <LogoutIcon sx={{ fontSize: 80, color: NET_PACIFIC_COLORS.primary }} />, color: NET_PACIFIC_COLORS.primary, bg: '#e8f0fe', title: 'Clocked Out' },
      already_done: { icon: <CheckIcon sx={{ fontSize: 80, color: '#fdcb6e' }} />, color: '#f39c12', bg: '#fef9e7', title: 'Already Recorded' },
      error: { icon: <ErrorIcon sx={{ fontSize: 80, color: '#e74c3c' }} />, color: '#e74c3c', bg: '#fce4ec', title: 'Error' },
    };
    const cfg = configs[status];
    const subtitle = status === 'clocked_in' ? `Time In: ${resultTime}`
      : status === 'clocked_out' ? `Time Out: ${resultTime}`
      : resultMessage;

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', p: 2 }}>
        <Paper sx={{ p: 5, textAlign: 'center', maxWidth: 400, width: '100%', borderRadius: 3, bgcolor: cfg.bg, border: `2px solid ${cfg.color}` }}>
          <Box sx={{ mb: 3 }}>{cfg.icon}</Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: cfg.color, mb: 1 }}>{cfg.title}</Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>{subtitle}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
          {user && (
            <Typography variant="body1" sx={{ fontWeight: 500, color: NET_PACIFIC_COLORS.primary }}>
              {user.full_name || user.username}
            </Typography>
          )}
          {location && status !== 'loading' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)} ({'\u00B1'}{Math.round(location.accuracy)}m)
            </Typography>
          )}
          {(status === 'error' || status === 'already_done') && (
            <Button variant="outlined" onClick={() => setStatus('idle')} sx={{ mt: 2, borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
              Back to QR
            </Button>
          )}
        </Paper>
      </Box>
    );
  }

  // --- Default view: QR code display + manual clock button ---
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', p: 2 }}>
      <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 420, width: '100%', borderRadius: 3, border: `1px solid #e2e8f0` }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 0.5 }}>
          Clock In / Out
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Scan this QR code with your phone to record attendance
        </Typography>

        {/* QR Code */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box
            sx={{
              p: 2,
              bgcolor: '#fff',
              borderRadius: 2,
              border: '2px solid #e2e8f0',
              display: 'inline-block',
            }}
          >
            <img
              src={qrImageUrl}
              alt="Clock In/Out QR Code"
              width={280}
              height={280}
              style={{ display: 'block' }}
            />
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3, wordBreak: 'break-all' }}>
          {clockUrl}
        </Typography>

        <Divider sx={{ my: 2 }}>or</Divider>

        {/* Manual clock button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<ClockIcon />}
          onClick={doClock}
          sx={{ bgcolor: NET_PACIFIC_COLORS.primary, px: 4, py: 1.5, fontSize: '1rem' }}
          fullWidth
        >
          Clock In / Out Now
        </Button>

        {user && (
          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
            Logged in as <strong>{user.full_name || user.username}</strong>
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default ClockPage;
