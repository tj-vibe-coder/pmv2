import React, { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  useMediaQuery,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { API_BASE } from '../config/api';

export const MIN_NEW_PASSWORD_LENGTH = 8;

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Self-service password change from the user menu. Other devices are signed out on success. */
const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ open, onClose }) => {
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
    setError(null);
    setDone(null);
    setSaving(false);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const validate = (): string | null => {
    if (!currentPassword || !newPassword || !confirmPassword) return 'Fill in all three fields.';
    if (newPassword.length < MIN_NEW_PASSWORD_LENGTH) return `New password must be at least ${MIN_NEW_PASSWORD_LENGTH} characters.`;
    if (newPassword === currentPassword) return 'New password must be different from the current one.';
    if (newPassword !== confirmPassword) return 'New password and confirmation do not match.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not change password. Please try again.');
        return;
      }
      setDone(data.message || 'Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const eye = (
    <InputAdornment position="end">
      <IconButton
        aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
        onClick={() => setShowPasswords((v) => !v)}
        edge="end"
        size="small"
      >
        {showPasswords ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );
  const type = showPasswords ? 'text' : 'password';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      fullScreen={isPhone}
      PaperProps={{ sx: { borderRadius: isPhone ? 0 : 2 }, component: 'form', onSubmit: handleSubmit }}
    >
      <DialogTitle sx={{ fontWeight: 600 }}>Change password</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {done ? (
          <Alert severity="success">{done}</Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Current password"
              type={type}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              fullWidth
              disabled={saving}
            />
            <TextField
              label="New password"
              type={type}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              helperText={`At least ${MIN_NEW_PASSWORD_LENGTH} characters`}
              fullWidth
              disabled={saving}
              InputProps={{ endAdornment: eye }}
            />
            <TextField
              label="Confirm new password"
              type={type}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              fullWidth
              disabled={saving}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {done ? (
          <Button onClick={handleClose} variant="contained">Done</Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : 'Change password'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ChangePasswordDialog;
