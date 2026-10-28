import { API_BASE } from '../../config/api';
import { blobToBase64, compressForUpload } from './imageCompress';
import { convertHeicToJpeg } from './imageUtils';

export interface ProofRef { oneDriveId: string; webUrl: string; filename: string }

export const PROOF_ACCEPT = 'image/*,.pdf,.heic,.heif';

// Upload a proof-of-payment file (screenshot/PDF) to OneDrive and return its reference.
// `folder` is the top-level OneDrive folder (e.g. 'Reimbursement Proofs', 'Cash Advance Proofs');
// `docNo` (form/CA number) names the per-document subfolder under the current year.
export async function uploadPaymentProof(
  file: File, docNo: string | null, authToken: string | null, folder = 'Reimbursement Proofs',
): Promise<ProofRef> {
  const safe = await convertHeicToJpeg(file);
  const compressed = await compressForUpload(safe);
  const contentBase64 = await blobToBase64(compressed);
  const extMatch = safe.name.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0] : (safe.type === 'application/pdf' ? '.pdf' : '.jpg');
  const filename = `PROOF-${Date.now()}${ext}`;
  const folderPath = `${folder}/${new Date().getFullYear()}/${(docNo || 'unassigned').replace(/[\\/:*?"<>|]/g, '-')}`;
  const res = await fetch(`${API_BASE}/api/onedrive/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ folderPath, filename, contentBase64 }),
  });
  const data = await res.json().catch(() => ({ ok: false })) as { ok: boolean; id?: string; webUrl?: string };
  if (!data.ok || !data.id || !data.webUrl) throw new Error('Proof upload to OneDrive failed. Try again.');
  return { oneDriveId: data.id, webUrl: data.webUrl, filename };
}
