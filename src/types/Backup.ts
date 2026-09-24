export interface BackupOneDriveDetails {
  folderPath: string;
  folderWebUrl: string;
  snapshotWebUrl: string;
  manifestWebUrl: string;
  folderId?: string;
}

export interface BackupRecord {
  id: string;
  exportedAt: string;
  timestamp: number;
  durationMs: number;
  totalDocuments: number;
  topLevelCollections: number;
  sizeBytes: number;
  sha256: string;
  collectionsSummary: Record<string, number>;
  snapshotFileName: string;
  oneDrive: BackupOneDriveDetails | null;
  oneDriveError?: string | null;
  triggeredBy: {
    id: string;
    username: string;
    fullName: string;
  };
}

export interface BackupStatusResponse {
  success: boolean;
  firestore: {
    connected: boolean;
    topLevelCollections: number;
  };
  oneDrive: {
    configured: boolean;
    driveOwner: string;
    defaultFolder: string;
  };
  lastBackup: BackupRecord | null;
}

export interface BackupHistoryResponse {
  success: boolean;
  history: BackupRecord[];
}

export interface CreateBackupOptions {
  uploadToOneDrive?: boolean;
  targetFolder?: string;
  downloadPayload?: boolean;
}

export interface CreateBackupResponse {
  success: boolean;
  record: BackupRecord;
  manifest: {
    format: string;
    projectId: string;
    exportedAt: string;
    topLevelCollections: number;
    totalDocumentsIncludingSubcollections: number;
    sizeBytes: number;
    sha256: string;
    collectionsSummary: Record<string, number>;
    snapshotFileName: string;
  };
  oneDriveResult?: {
    success: boolean;
    folderPath: string;
    folderWebUrl: string;
    snapshotWebUrl: string;
    manifestWebUrl: string;
    error?: string;
  } | null;
  snapshotJson?: string;
}
