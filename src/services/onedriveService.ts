/**
 * Upload file to OneDrive via Microsoft Graph API.
 * Files are stored under: OneDrive root / Projects / {projectId} / {filename}
 */

export interface OneDriveUploadResult {
  id: string;
  webUrl: string;
  size: number;
}

export async function uploadToOneDrive(
  accessToken: string,
  projectId: number,
  filename: string,
  file: File
): Promise<OneDriveUploadResult> {
  const folderPath = `Projects/${projectId}`;
  const itemPath = `${folderPath}/${filename}`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${itemPath}:/content`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: file,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Upload failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    webUrl: data.webUrl || '',
    size: data.size || file.size,
  };
}
