import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BackupIcon from '@mui/icons-material/Backup';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SecurityIcon from '@mui/icons-material/Security';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getBackupStatus,
  getBackupHistory,
  createBackup,
  downloadDirectBackup,
} from '../services/backupService';
import type {
  BackupStatusResponse,
  BackupRecord,
  CreateBackupResponse,
} from '../types/Backup';

const NET_PACIFIC_PRIMARY = '#2c5aa0';
const NET_PACIFIC_SECONDARY = '#1e4a72';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(isoString: string | number): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(isoString);
  }
}

export default function SystemBackupsPage(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Backup trigger form state
  const [uploadToOneDrive, setUploadToOneDrive] = useState<boolean>(true);
  const [downloadLocal, setDownloadLocal] = useState<boolean>(false);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupStage, setBackupStage] = useState<string>('');

  // Details dialog
  const [selectedRecord, setSelectedRecord] = useState<BackupRecord | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  // Search filter for history
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [statusRes, historyRes] = await Promise.all([
        getBackupStatus().catch((e) => {
          console.warn('[Backups] Status error:', e);
          return null;
        }),
        getBackupHistory().catch((e) => {
          console.warn('[Backups] History error:', e);
          return { success: true, history: [] };
        }),
      ]);

      if (statusRes) setStatus(statusRes);
      if (historyRes && historyRes.history) setHistory(historyRes.history);
    } catch (err: any) {
      setError(err.message || 'Failed to load backup status');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleStartBackup = async () => {
    setIsBackingUp(true);
    setActionError(null);
    setActionSuccess(null);
    setBackupStage('Exporting Firestore database & nested collections...');

    try {
      if (uploadToOneDrive) {
        setBackupStage('Exporting Firestore records & preparing OneDrive package...');
      }

      const res: CreateBackupResponse = await createBackup({
        uploadToOneDrive,
        downloadPayload: downloadLocal,
      });

      setBackupStage('Finalizing backup record...');

      // If user also requested direct download
      if (downloadLocal && res.snapshotJson) {
        const blob = new Blob([res.snapshotJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.manifest.snapshotFileName || `firestore-backup-${res.record.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      const oneDriveMsg = res.oneDriveResult?.success
        ? ' and uploaded to OneDrive'
        : res.oneDriveResult?.error
        ? ' (OneDrive upload failed: ' + res.oneDriveResult.error + ')'
        : '';

      setActionSuccess(
        `Backup created successfully! Captured ${res.record.totalDocuments.toLocaleString()} documents across ${res.record.topLevelCollections} collections${oneDriveMsg}.`
      );

      setSelectedRecord(res.record);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Backup failed. Please check server logs.');
    } finally {
      setIsBackingUp(false);
      setBackupStage('');
    }
  };

  const handleDirectDownloadTrigger = async () => {
    setIsBackingUp(true);
    setActionError(null);
    setBackupStage('Exporting Firestore database for direct download...');
    try {
      const blob = await downloadDirectBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `firestore-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionSuccess('Direct backup download initiated.');
    } catch (err: any) {
      setActionError(err.message || 'Direct download failed.');
    } finally {
      setIsBackingUp(false);
      setBackupStage('');
    }
  };

  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 4, maxWidth: 800, mx: 'auto', textAlign: 'center' }}>
        <Paper sx={{ p: 4, borderRadius: 3, border: '1px solid #e2e8f0' }}>
          <SecurityIcon sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Administrator Access Required
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            System and Firestore backups contain confidential company, financial, and user records.
            Access to this pane is restricted to system administrators.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/utilities')} startIcon={<ArrowBackIcon />}>
            Back to Utilities
          </Button>
        </Paper>
      </Box>
    );
  }

  const filteredHistory = history.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.id.toLowerCase().includes(q) ||
      item.exportedAt.toLowerCase().includes(q) ||
      item.triggeredBy?.fullName?.toLowerCase().includes(q) ||
      item.triggeredBy?.username?.toLowerCase().includes(q) ||
      item.sha256.toLowerCase().includes(q)
    );
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/utilities')}
            size="small"
            sx={{ color: 'text.secondary', mr: 1 }}
          >
            Utilities
          </Button>
          <Typography variant="h4" component="h1" fontWeight={700} sx={{ color: NET_PACIFIC_PRIMARY, fontSize: { xs: '1.5rem', md: '2rem' } }}>
            System Backups
          </Typography>
          <Chip label="Admin" size="small" color="primary" sx={{ fontWeight: 600 }} />
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => void loadData()}
            disabled={loading || isBackingUp}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      {/* Alerts */}
      {actionError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {actionSuccess && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Status KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Paper
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
              <StorageIcon sx={{ color: NET_PACIFIC_PRIMARY }} />
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                Firestore Database Status
              </Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} sx={{ color: NET_PACIFIC_SECONDARY, mb: 0.5 }}>
              {loading ? '...' : `${status?.firestore?.topLevelCollections || 0} Collections`}
            </Typography>
            <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
              <CheckCircleIcon sx={{ fontSize: 14 }} /> Connected & Ready
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Paper
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
              <CloudDoneIcon sx={{ color: NET_PACIFIC_PRIMARY }} />
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                Corporate OneDrive
              </Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} sx={{ color: NET_PACIFIC_SECONDARY, mb: 0.5 }}>
              {loading ? '...' : status?.oneDrive?.configured ? 'Active & Synced' : 'Configured'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              Target: {status?.oneDrive?.defaultFolder || '00 System/Backups'}
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 4 }}>
          <Paper
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
              <BackupIcon sx={{ color: NET_PACIFIC_PRIMARY }} />
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                Most Recent Backup
              </Typography>
            </Stack>
            <Typography variant="h6" fontWeight={700} sx={{ color: NET_PACIFIC_SECONDARY, mb: 0.5 }}>
              {loading ? '...' : status?.lastBackup ? formatDate(status.lastBackup.exportedAt) : 'No recent backup'}
            </Typography>
            {status?.lastBackup && (
              <Typography variant="caption" color="text.secondary">
                {status.lastBackup.totalDocuments.toLocaleString()} docs ({formatBytes(status.lastBackup.sizeBytes)})
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Action Card: Trigger Backup */}
      <Card sx={{ mb: 4, borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <CardHeader
          title={
            <Typography variant="h6" fontWeight={700} sx={{ color: NET_PACIFIC_PRIMARY }}>
              Create On-Demand Backup
            </Typography>
          }
          subheader="Generates a full recursive JSON snapshot of all Firestore collections and subcollections with SHA-256 integrity hash."
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent sx={{ pt: 2.5 }}>
          {isBackingUp ? (
            <Box sx={{ py: 2 }}>
              <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 500, mx: 'auto', textAlign: 'center' }}>
                <CircularProgress size={36} sx={{ color: NET_PACIFIC_PRIMARY }} />
                <Typography variant="body1" fontWeight={600} sx={{ color: NET_PACIFIC_SECONDARY }}>
                  {backupStage || 'Processing database backup...'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Please keep this window open while Firestore records are serialized and exported.
                </Typography>
                <LinearProgress sx={{ width: '100%', mt: 1, borderRadius: 1 }} />
              </Stack>
            </Box>
          ) : (
            <Grid container spacing={3} alignItems="center">
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={1.5}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={uploadToOneDrive}
                        onChange={(e) => setUploadToOneDrive(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          Save directly to Corporate OneDrive (Recommended)
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Uploads snapshot and manifest to <code>00 System/Backups/YYYY-MM-DD_HH-MM-SS/</code>
                        </Typography>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={downloadLocal}
                        onChange={(e) => setDownloadLocal(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          Also download a local copy to your computer (.json)
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Saves the exported JSON file directly to your browser's Downloads folder
                        </Typography>
                      </Box>
                    }
                  />
                </Stack>
              </Grid>

              <Grid size={{ xs: 12, md: 5 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<CloudUploadIcon />}
                    onClick={handleStartBackup}
                    disabled={!uploadToOneDrive && !downloadLocal}
                    sx={{
                      bgcolor: NET_PACIFIC_PRIMARY,
                      '&:hover': { bgcolor: NET_PACIFIC_SECONDARY },
                      px: 3,
                      py: 1.2,
                      fontWeight: 600,
                    }}
                  >
                    Start Backup
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<DownloadIcon />}
                    onClick={handleDirectDownloadTrigger}
                    sx={{ px: 2.5, py: 1.2 }}
                  >
                    Quick Export
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* History Section */}
      <Paper sx={{ borderRadius: 2.5, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" fontWeight={700} sx={{ color: NET_PACIFIC_PRIMARY }}>
              Backup History & Log
            </Typography>
            <Chip label={`${history.length} runs`} size="small" />
          </Stack>

          <TextField
            size="small"
            placeholder="Search by date, user, or hash..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />
        </Box>

        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', color: NET_PACIFIC_SECONDARY } }}>
                <TableCell>Date & Time</TableCell>
                <TableCell>Total Records</TableCell>
                <TableCell>File Size</TableCell>
                <TableCell>Triggered By</TableCell>
                <TableCell>OneDrive Destination</TableCell>
                <TableCell>SHA-256 Hash</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={30} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading backup log...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      {searchQuery ? 'No backup logs matching your search.' : 'No backup records found. Click "Start Backup" above to create your first backup.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredHistory.map((row) => (
                  <TableRow key={row.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {formatDate(row.exportedAt)}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        ID: {row.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Click to view breakdown" arrow>
                        <Chip
                          label={`${row.totalDocuments.toLocaleString()} docs (${row.topLevelCollections} cols)`}
                          size="small"
                          onClick={() => setSelectedRecord(row)}
                          sx={{ cursor: 'pointer', fontWeight: 600 }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatBytes(row.sizeBytes)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.triggeredBy?.fullName || row.triggeredBy?.username || 'Admin'}</Typography>
                    </TableCell>
                    <TableCell>
                      {row.oneDrive ? (
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                          href={row.oneDrive.folderWebUrl || row.oneDrive.snapshotWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ textTransform: 'none', color: NET_PACIFIC_PRIMARY, fontWeight: 600 }}
                        >
                          Open in OneDrive
                        </Button>
                      ) : row.oneDriveError ? (
                        <Tooltip title={row.oneDriveError}>
                          <Chip label="Upload Failed" size="small" color="error" variant="outlined" />
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">Local Only</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', maxWidth: 100 }} noWrap>
                          {row.sha256}
                        </Typography>
                        <IconButton size="small" onClick={() => handleCopySha(row.sha256)}>
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setSelectedRecord(row)}
                        sx={{ textTransform: 'none' }}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Details & Manifest Dialog */}
      <Dialog
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700} sx={{ color: NET_PACIFIC_PRIMARY }}>
              Backup Details & Collection Breakdown
            </Typography>
            {selectedRecord?.oneDrive && (
              <Button
                size="small"
                variant="contained"
                startIcon={<OpenInNewIcon />}
                href={selectedRecord.oneDrive.folderWebUrl || selectedRecord.oneDrive.snapshotWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ bgcolor: NET_PACIFIC_PRIMARY }}
              >
                Open in OneDrive
              </Button>
            )}
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          {selectedRecord && (
            <Stack spacing={2.5}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Exported At</Typography>
                  <Typography variant="body1" fontWeight={600}>{formatDate(selectedRecord.exportedAt)}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Total Documents</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedRecord.totalDocuments.toLocaleString()} across {selectedRecord.topLevelCollections} collections
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">File Size</Typography>
                  <Typography variant="body1" fontWeight={600}>{formatBytes(selectedRecord.sizeBytes)}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Triggered By</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedRecord.triggeredBy?.fullName} ({selectedRecord.triggeredBy?.username})</Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="text.secondary">SHA-256 Checksum</Typography>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                    <Paper sx={{ p: 1, bgcolor: '#f1f5f9', width: '100%', overflowX: 'auto' }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {selectedRecord.sha256}
                      </Typography>
                    </Paper>
                    <IconButton onClick={() => handleCopySha(selectedRecord.sha256)} size="small">
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  {copyFeedback && <Typography variant="caption" color="success.main">Copied hash to clipboard!</Typography>}
                </Grid>
              </Grid>

              <Divider />

              <Typography variant="subtitle2" fontWeight={700} sx={{ color: NET_PACIFIC_SECONDARY }}>
                Collection-by-Collection Document Counts:
              </Typography>

              <Grid container spacing={1}>
                {Object.entries(selectedRecord.collectionsSummary || {}).map(([col, count]) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={col}>
                    <Paper sx={{ p: 1.2, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{col}</Typography>
                      <Chip label={count.toLocaleString()} size="small" variant="outlined" />
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Divider />

              <Box sx={{ bgcolor: '#f8fafc', p: 2, borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <InfoOutlinedIcon sx={{ color: NET_PACIFIC_PRIMARY, mt: 0.2 }} />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Disaster Recovery / Restoration Note:
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      This JSON snapshot is fully compatible with the server's disaster recovery utility.
                      To restore a collection or full state to a test/sandbox environment, use:
                      <code> node scripts/restore-firestore.js &lt;snapshot-path&gt;</code>.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setSelectedRecord(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
