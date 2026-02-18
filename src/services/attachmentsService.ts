const API_BASE = '/api';

export interface ProjectAttachment {
  id: number;
  project_id: number;
  filename: string;
  onedrive_item_id: string;
  onedrive_web_url: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export async function getAttachments(projectId: number): Promise<ProjectAttachment[]> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/attachments`);
  if (!res.ok) throw new Error('Failed to fetch attachments');
  return res.json();
}

export async function saveAttachment(
  projectId: number,
  data: {
    filename: string;
    onedrive_item_id: string;
    onedrive_web_url?: string;
    file_size?: number;
    uploaded_by?: string;
  }
): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save attachment');
  }
  return res.json();
}

export async function deleteAttachment(projectId: number, attachmentId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete attachment');
}
