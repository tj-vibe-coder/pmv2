import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SystemBackupsPage from './SystemBackupsPage';
import * as backupService from '../services/backupService';
import { BrowserRouter } from 'react-router-dom';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'rjr', full_name: 'Reuel Rivera', role: 'admin' },
    isAuthenticated: true,
  }),
}));

jest.mock('../services/backupService');

describe('SystemBackupsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders backup status cards and history table for admin users', async () => {
    (backupService.getBackupStatus as jest.Mock).mockResolvedValue({
      success: true,
      firestore: { connected: true, topLevelCollections: 18 },
      oneDrive: { configured: true, driveOwner: 'admin@iocontroltech.com', defaultFolder: '00 System/Backups' },
      lastBackup: {
        id: '2026-08-18T10-00-00',
        exportedAt: '2026-08-18T10:00:00.000Z',
        timestamp: 1787047200000,
        totalDocuments: 850,
        topLevelCollections: 18,
        sizeBytes: 1048576,
        sha256: 'abc123def456',
        collectionsSummary: { projects: 120, clients: 45 },
        snapshotFileName: 'firestore-backup-2026-08-18T10-00-00.json',
        oneDrive: {
          folderPath: '00 System/Backups/2026-08-18T10-00-00',
          folderWebUrl: 'https://onedrive.live.com/test',
          snapshotWebUrl: 'https://onedrive.live.com/test/file',
          manifestWebUrl: 'https://onedrive.live.com/test/manifest',
        },
        triggeredBy: { id: 'u1', username: 'rjr', fullName: 'Reuel Rivera' },
      },
    });

    (backupService.getBackupHistory as jest.Mock).mockResolvedValue({
      success: true,
      history: [
        {
          id: '2026-08-18T10-00-00',
          exportedAt: '2026-08-18T10:00:00.000Z',
          timestamp: 1787047200000,
          durationMs: 2500,
          totalDocuments: 850,
          topLevelCollections: 18,
          sizeBytes: 1048576,
          sha256: 'abc123def456',
          collectionsSummary: { projects: 120, clients: 45 },
          snapshotFileName: 'firestore-backup-2026-08-18T10-00-00.json',
          oneDrive: {
            folderPath: '00 System/Backups/2026-08-18T10-00-00',
            folderWebUrl: 'https://onedrive.live.com/test',
            snapshotWebUrl: 'https://onedrive.live.com/test/file',
            manifestWebUrl: 'https://onedrive.live.com/test/manifest',
          },
          triggeredBy: { id: 'u1', username: 'rjr', fullName: 'Reuel Rivera' },
        },
      ],
    });

    render(
      <BrowserRouter>
        <SystemBackupsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('System Backups')).toBeInTheDocument();
    expect(screen.getByText('Create On-Demand Backup')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('18 Collections')).toBeInTheDocument();
      expect(screen.getByText('Active & Synced')).toBeInTheDocument();
      expect(screen.getByText('Reuel Rivera')).toBeInTheDocument();
    });
  });

  it('triggers a backup when Start Backup button is clicked', async () => {
    (backupService.getBackupStatus as jest.Mock).mockResolvedValue({
      success: true,
      firestore: { connected: true, topLevelCollections: 5 },
      oneDrive: { configured: true, driveOwner: 'admin@iocontroltech.com', defaultFolder: '00 System/Backups' },
      lastBackup: null,
    });
    (backupService.getBackupHistory as jest.Mock).mockResolvedValue({
      success: true,
      history: [],
    });
    (backupService.createBackup as jest.Mock).mockResolvedValue({
      success: true,
      record: {
        id: '2026-08-18T12-00-00',
        exportedAt: '2026-08-18T12:00:00.000Z',
        timestamp: 1787054400000,
        durationMs: 1200,
        totalDocuments: 300,
        topLevelCollections: 5,
        sizeBytes: 50000,
        sha256: '999888777666',
        collectionsSummary: { projects: 10 },
        snapshotFileName: 'firestore-backup-2026-08-18T12-00-00.json',
        oneDrive: {
          folderPath: '00 System/Backups/2026-08-18T12-00-00',
          folderWebUrl: 'https://onedrive.live.com/new',
          snapshotWebUrl: 'https://onedrive.live.com/new/file',
          manifestWebUrl: 'https://onedrive.live.com/new/manifest',
        },
        triggeredBy: { id: 'u1', username: 'rjr', fullName: 'Reuel Rivera' },
      },
      manifest: {
        format: 'ioct-firestore-recursive-v1',
        projectId: 'pmv2-851ae',
        exportedAt: '2026-08-18T12:00:00.000Z',
        topLevelCollections: 5,
        totalDocumentsIncludingSubcollections: 300,
        sizeBytes: 50000,
        sha256: '999888777666',
        collectionsSummary: { projects: 10 },
        snapshotFileName: 'firestore-backup-2026-08-18T12-00-00.json',
      },
      oneDriveResult: {
        success: true,
        folderPath: '00 System/Backups/2026-08-18T12-00-00',
        folderWebUrl: 'https://onedrive.live.com/new',
        snapshotWebUrl: 'https://onedrive.live.com/new/file',
        manifestWebUrl: 'https://onedrive.live.com/new/manifest',
      },
    });

    render(
      <BrowserRouter>
        <SystemBackupsPage />
      </BrowserRouter>
    );

    const startBtn = await screen.findByText('Start Backup');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(backupService.createBackup).toHaveBeenCalledWith({
        uploadToOneDrive: true,
        downloadPayload: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Backup created successfully/)).toBeInTheDocument();
    });
  });
});
