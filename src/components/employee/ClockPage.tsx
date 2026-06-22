import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, CircularProgress, Button } from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const API_BASE = '';

type ClockStatus = 'loading' | 'clocked_in' | 'clocked_out' | 'already_done' | 'error';

interface ClockResult {
  status: ClockStatus;
  time?: string;
  message?: string;
}

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
  const employeeId = user?.id != null ? String(user.id) : '';
  const [result, setResult] = useState<ClockResult>({ status: 'loading' });
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const doClock = useCallback(async () => {
    if (!employeeId) {
      setResult({ status: 'error', message: 'Not logged in. Please log in and scan again.' });
      return;
    }

    const token = localStorage.getItem('netpacific_token');
    const today = todayStr();
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Capture GPS location
    const loc = await getLocation();
    if (loc) setLocation(loc);

    try {
      // Fetch today's entries
      const res = await fetch(
        `${API_BASE}/api/dtr?employeeId=${encodeURIComponent(employeeId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to fetch DTR');
      const entries = await res.json();
      const todayEntry = entries.find((e: { entryDate: string }) => e.entryDate === today);

      if (!todayEntry) {
        // No entry yet → Clock In (create entry with timeIn)
        const body: Record<string, unknown> = {
          employeeId,
          entryDate: today,
          timeIn: currentTime,
          timeOut: '',
          dayType: 'REGULAR',
          regularHours: 0,
          overtimeHours: 0,
          nightDiffHours: 0,
          isAbsent: false,
          tardinessMinutes: 0,
          remarks: '',
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
        setResult({ status: 'clocked_in', time: formatTime(now) });
      } else if (!todayEntry.timeOut) {
        // Has timeIn but no timeOut → Clock Out (update with timeOut + compute hours)
        const [inH, inM] = (todayEntry.timeIn || '08:00').split(':').map(Number);
        const [outH, outM] = currentTime.split(':').map(Number);
        let diffMin = (outH * 60 + outM) - (inH * 60 + inM);
        if (diffMin < 0) diffMin += 24 * 60;
        const hours = Math.round(diffMin / 30) * 0.5;

        const putBody: Record<string, unknown> = {
          timeOut: currentTime,
          regularHours: Math.max(0, hours),
        };
        if (loc) putBody.clockOutLocation = loc;
        const putRes = await fetch(`${API_BASE}/api/dtr/${todayEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(putBody),
        });
        if (!putRes.ok) throw new Error('Failed to clock out');
        setResult({ status: 'clocked_out', time: formatTime(now) });
      } else {
        // Already has both timeIn and timeOut
        setResult({
          status: 'already_done',
          message: `Clocked in at ${todayEntry.timeIn}, out at ${todayEntry.timeOut}`,
        });
      }
    } catch (e) {
      setResult({
        status: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
    }
  }, [employeeId]);

  useEffect(() => { doClock(); }, [doClock]);

  const statusConfig = {
    loading: { icon: <CircularProgress size={64} />, color: NET_PACIFIC_COLORS.primary, bg: '#e8f0fe' },
    clocked_in: { icon: <LoginIcon sx={{ fontSize: 80, color: '#00b894' }} />, color: '#00b894', bg: '#e6f9f3' },
    clocked_out: { icon: <LogoutIcon sx={{ fontSize: 80, color: NET_PACIFIC_COLORS.primary }} />, color: NET_PACIFIC_COLORS.primary, bg: '#e8f0fe' },
    already_done: { icon: <CheckIcon sx={{ fontSize: 80, color: '#fdcb6e' }} />, color: '#f39c12', bg: '#fef9e7' },
    error: { icon: <ErrorIcon sx={{ fontSize: 80, color: '#e74c3c' }} />, color: '#e74c3c', bg: '#fce4ec' },
  };

  const config = statusConfig[result.status];

  const titles: Record<ClockStatus, string> = {
    loading: 'Processing...',
    clocked_in: 'Clocked In',
    clocked_out: 'Clocked Out',
    already_done: 'Already Recorded',
    error: 'Error',
  };

  const subtitles: Record<ClockStatus, string> = {
    loading: 'Recording your attendance...',
    clocked_in: `Time In: ${result.time || ''}`,
    clocked_out: `Time Out: ${result.time || ''}`,
    already_done: result.message || '',
    error: result.message || 'Please try again.',
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', p: 2 }}>
      <Paper
        sx={{
          p: 5,
          textAlign: 'center',
          maxWidth: 400,
          width: '100%',
          borderRadius: 3,
          bgcolor: config.bg,
          border: `2px solid ${config.color}`,
        }}
      >
        <Box sx={{ mb: 3 }}>{config.icon}</Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: config.color, mb: 1 }}>
          {titles[result.status]}
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
          {subtitles[result.status]}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
        {user && (
          <Typography variant="body1" sx={{ fontWeight: 500, color: NET_PACIFIC_COLORS.primary }}>
            {user.full_name || user.username}
          </Typography>
        )}
        {location && result.status !== 'loading' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)} (±{Math.round(location.accuracy)}m)
          </Typography>
        )}
        {result.status === 'error' && (
          <Button
            variant="contained"
            onClick={() => { setResult({ status: 'loading' }); doClock(); }}
            sx={{ mt: 2, bgcolor: NET_PACIFIC_COLORS.primary }}
          >
            Retry
          </Button>
        )}
      </Paper>
    </Box>
  );
};

export default ClockPage;
