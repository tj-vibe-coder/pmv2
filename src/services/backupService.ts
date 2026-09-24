import { API_BASE } from '../config/api';
import type {
  BackupStatusResponse,
  BackupHistoryResponse,
  CreateBackupOptions,
  CreateBackupResponse,
} from '../types/Backup';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getBackupStatus(): Promise<BackupStatusResponse> {
  const res = await fetch(`${API_BASE}/api/backups/status`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch backup status (${res.status})`);
  }

  return res.json();
}

export async function getBackupHistory(): Promise<BackupHistoryResponse> {
  const res = await fetch(`${API_BASE}/api/backups/history`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch backup history (${res.status})`);
  }

  return res.json();
}

export async function createBackup(options: CreateBackupOptions = {}): Promise<CreateBackupResponse> {
  const res = await fetch(`${API_BASE}/api/backups/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to create backup (${res.status})`);
  }

  return res.json();
}

export async function downloadDirectBackup(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/backups/download-direct`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to download backup (${res.status})`);
  }

  return res.blob();
}
