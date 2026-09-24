'use strict';

const express = require('express');
const { exportFirestoreDatabase } = require('./firestoreExport');
const { uploadBackupToOneDrive } = require('./onedriveBackup');

const SYSTEM_BACKUPS_COLLECTION = 'system_backups';

function createBackupsRouter(opts) {
  const {
    db,
    admin,
    getCurrentUser,
    getGraphAppToken,
    resolveCorporateDriveId,
    ensureFolderByPath,
  } = opts;

  const router = express.Router();

  // Admin authorization middleware
  async function requireAdmin(req, res, next) {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      const role = String(user.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Admin role required to manage system backups' });
      }
      req.user = user;
      next();
    } catch (err) {
      console.error('[Backups] Auth error:', err);
      res.status(500).json({ success: false, error: 'Authentication failed' });
    }
  }

  // GET /api/backups/status - Health and configuration check
  router.get('/status', requireAdmin, async (req, res) => {
    try {
      let collectionsCount = 0;
      if (typeof db.listCollections === 'function') {
        const cols = await db.listCollections();
        collectionsCount = cols.length;
      }

      let oneDriveConfigured = false;
      let driveOwner = process.env.ONEDRIVE_DRIVE_OWNER || '';
      try {
        if (typeof getGraphAppToken === 'function') {
          const token = await getGraphAppToken();
          if (token) oneDriveConfigured = true;
        }
      } catch {
        oneDriveConfigured = false;
      }

      // Check last backup record
      let lastBackup = null;
      try {
        const snap = await db.collection(SYSTEM_BACKUPS_COLLECTION)
          .orderBy('exportedAt', 'desc')
          .limit(1)
          .get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          lastBackup = { id: doc.id, ...doc.data() };
        }
      } catch (err) {
        console.warn('[Backups] Could not query last backup record:', err.message);
      }

      res.json({
        success: true,
        firestore: {
          connected: true,
          topLevelCollections: collectionsCount,
        },
        oneDrive: {
          configured: oneDriveConfigured,
          driveOwner,
          defaultFolder: '00 System/Backups',
        },
        lastBackup,
      });
    } catch (err) {
      console.error('[Backups] Status error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/backups/history - List recent backup runs
  router.get('/history', requireAdmin, async (req, res) => {
    try {
      const snap = await db.collection(SYSTEM_BACKUPS_COLLECTION)
        .orderBy('exportedAt', 'desc')
        .limit(50)
        .get();

      const items = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ success: true, history: items });
    } catch (err) {
      console.error('[Backups] History fetch error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/backups/create - Perform Firestore backup (+ OneDrive upload)
  router.post('/create', requireAdmin, async (req, res) => {
    const startedAt = Date.now();
    const timestamp = new Date().toISOString();
    const stamp = timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const { uploadToOneDrive = true, targetFolder, downloadPayload = false } = req.body || {};

    try {
      // 1. Export Firestore database
      const exportResult = await exportFirestoreDatabase(db, admin, { timestamp });

      let oneDriveResult = null;
      if (uploadToOneDrive) {
        try {
          oneDriveResult = await uploadBackupToOneDrive({
            getGraphAppToken,
            resolveCorporateDriveId,
            ensureFolderByPath,
            folderPath: targetFolder || `00 System/Backups/${stamp}`,
            timestamp,
            snapshotJson: exportResult.snapshotJson,
            manifest: exportResult.manifest,
          });
        } catch (uploadErr) {
          console.error('[Backups] OneDrive upload failed:', uploadErr);
          oneDriveResult = {
            success: false,
            error: uploadErr.message,
          };
        }
      }

      // 2. Persist audit metadata to Firestore system_backups collection
      const user = req.user;
      const backupRecord = {
        id: stamp,
        exportedAt: timestamp,
        timestamp: Date.now(),
        durationMs: Date.now() - startedAt,
        totalDocuments: exportResult.totalDocs,
        topLevelCollections: exportResult.manifest.topLevelCollections,
        sizeBytes: exportResult.sizeBytes,
        sha256: exportResult.sha256,
        collectionsSummary: exportResult.manifest.collectionsSummary,
        snapshotFileName: exportResult.manifest.snapshotFileName,
        oneDrive: oneDriveResult && oneDriveResult.success ? {
          folderPath: oneDriveResult.folderPath,
          folderWebUrl: oneDriveResult.folderWebUrl,
          snapshotWebUrl: oneDriveResult.snapshotWebUrl,
          manifestWebUrl: oneDriveResult.manifestWebUrl,
          folderId: oneDriveResult.folderId,
        } : null,
        oneDriveError: oneDriveResult && !oneDriveResult.success ? oneDriveResult.error : null,
        triggeredBy: {
          id: String(user.id || ''),
          username: String(user.username || ''),
          fullName: String(user.full_name || user.username || 'Admin'),
        },
      };

      try {
        await db.collection(SYSTEM_BACKUPS_COLLECTION).doc(stamp).set(backupRecord);
      } catch (saveErr) {
        console.warn('[Backups] Could not save backup audit doc:', saveErr.message);
      }

      res.json({
        success: true,
        record: backupRecord,
        manifest: exportResult.manifest,
        oneDriveResult,
        snapshotJson: downloadPayload ? exportResult.snapshotJson : undefined,
      });
    } catch (err) {
      console.error('[Backups] Backup creation failed:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/backups/download-direct - Immediate browser download
  router.post('/download-direct', requireAdmin, async (req, res) => {
    try {
      const timestamp = new Date().toISOString();
      const stamp = timestamp.replace(/[:.]/g, '-').slice(0, 19);
      const exportResult = await exportFirestoreDatabase(db, admin, { timestamp });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="firestore-backup-${stamp}.json"`);
      res.send(exportResult.snapshotJson);
    } catch (err) {
      console.error('[Backups] Direct download error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createBackupsRouter,
  SYSTEM_BACKUPS_COLLECTION,
};
