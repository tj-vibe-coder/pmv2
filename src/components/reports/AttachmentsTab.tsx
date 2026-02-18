import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  OpenInNew as OpenInNewIcon,
  Delete as DeleteIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import { Project } from '../../types/Project';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { uploadToOneDrive } from '../../services/onedriveService';
import {
  getAttachments,
  saveAttachment,
  deleteAttachment,
  type ProjectAttachment,
} from '../../services/attachmentsService';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

export interface AttachmentsTabProps {
  project: Project;
  currentUser: { username?: string; email?: string } | null;
}

const AttachmentsTab: React.FC<AttachmentsTabProps> = ({ project, currentUser }) => {
  const { isConfigured, isAuthenticated, isLoading: authLoading, error: authError, login, getAccessToken } = useOneDriveAuth();
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      const list = await getAttachments(project.id);
      setAttachments(list);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!isAuthenticated) {
      setUploadError('Please sign in to OneDrive first.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setUploadError('Could not get access token. Please sign in again.');
        return;
      }

      const result = await uploadToOneDrive(token, project.id, file.name, file);

      await saveAttachment(project.id, {
        filename: file.name,
        onedrive_item_id: result.id,
        onedrive_web_url: result.webUrl || undefined,
        file_size: result.size,
        uploaded_by: currentUser?.username || currentUser?.email || undefined,
      });

      await fetchAttachments();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleOpen = (att: ProjectAttachment) => {
    if (att.onedrive_web_url) {
      window.open(att.onedrive_web_url, '_blank');
    }
  };

  const handleDelete = async (att: ProjectAttachment) => {
    if (!window.confirm(`Remove "${att.filename}" from this project? (File remains in your OneDrive)`)) return;
    try {
      await deleteAttachment(project.id, att.id);
      await fetchAttachments();
    } catch {
      // ignore
    }
  };

  const formatSize = (bytes: number | null) => {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isConfigured) {
    return (
      <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          Project Attachments (OneDrive)
        </Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          OneDrive is not configured. Add <code>REACT_APP_ONEDRIVE_CLIENT_ID</code> to your .env file.
          See README for Azure app setup.
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Project Attachments (OneDrive)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Attach files to this project. Files are stored in your OneDrive under Projects/{project.id}/
      </Typography>

      {authError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => {}}>
          {authError}
        </Alert>
      )}
      {uploadError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {!isAuthenticated ? (
          <Button
            variant="contained"
            startIcon={<CloudIcon />}
            onClick={login}
            disabled={authLoading}
            sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
          >
            Sign in to OneDrive
          </Button>
        ) : (
          <>
            <input
              type="file"
              id="onedrive-file-input"
              hidden
              onChange={handleFileSelect}
              disabled={uploading}
            />
            <Button
              variant="contained"
              component="label"
              htmlFor="onedrive-file-input"
              startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
              disabled={uploading}
              sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
            >
              {uploading ? 'Uploading...' : 'Attach file'}
            </Button>
          </>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : attachments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
          No attachments yet. Sign in to OneDrive and attach files.
        </Typography>
      ) : (
        <List dense>
          {attachments.map((att) => (
            <ListItem key={att.id} divider>
              <ListItemText
                primary={att.filename}
                secondary={`${formatSize(att.file_size)} · ${att.uploaded_by || '—'} · ${new Date(att.created_at).toLocaleDateString()}`}
              />
              <ListItemSecondaryAction>
                {att.onedrive_web_url && (
                  <IconButton edge="end" onClick={() => handleOpen(att)} title="Open in OneDrive" size="small">
                    <OpenInNewIcon />
                  </IconButton>
                )}
                <IconButton edge="end" onClick={() => handleDelete(att)} title="Remove from project" color="error" size="small">
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
};

export default AttachmentsTab;
