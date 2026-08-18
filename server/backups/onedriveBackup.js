'use strict';

async function uploadFileToFolder(token, driveId, folderId, filename, contentBuffer, contentType = 'application/json') {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: contentBuffer,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`OneDrive upload failed (${res.status}) for "${filename}": ${errorText.slice(0, 300)}`);
  }

  return res.json();
}

async function uploadBackupToOneDrive({
  getGraphAppToken,
  resolveCorporateDriveId,
  ensureFolderByPath,
  folderPath,
  timestamp,
  snapshotJson,
  manifest,
}) {
  const token = await getGraphAppToken();
  const driveId = await resolveCorporateDriveId(token);

  const stamp = (timestamp || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19);
  const targetFolder = folderPath || `00 System/Backups/${stamp}`;

  // Ensure target folder exists
  const folder = await ensureFolderByPath(token, driveId, targetFolder);

  // Upload snapshot JSON
  const snapshotBuffer = Buffer.from(snapshotJson, 'utf8');
  const snapshotFilename = manifest.snapshotFileName || `firestore-backup-${stamp}.json`;
  const snapshotItem = await uploadFileToFolder(
    token,
    driveId,
    folder.id,
    snapshotFilename,
    snapshotBuffer,
    'application/json'
  );

  // Upload manifest JSON
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  const manifestItem = await uploadFileToFolder(
    token,
    driveId,
    folder.id,
    'manifest.json',
    manifestBuffer,
    'application/json'
  );

  return {
    success: true,
    folderId: folder.id,
    folderPath: targetFolder,
    folderWebUrl: folder.webUrl || '',
    snapshotId: snapshotItem.id,
    snapshotWebUrl: snapshotItem.webUrl || folder.webUrl || '',
    manifestId: manifestItem.id,
    manifestWebUrl: manifestItem.webUrl || folder.webUrl || '',
  };
}

module.exports = {
  uploadBackupToOneDrive,
  uploadFileToFolder,
};
