import { API_BASE } from '../config/api';

const API = `${API_BASE}/api`;

export const PROJECT_UPDATE_TYPES = ['Progress', 'Submittal', 'Site work', 'Delivery', 'Meeting', 'Client', 'Billing', 'Issue', 'Other'] as const;
export type ProjectUpdateType = (typeof PROJECT_UPDATE_TYPES)[number];

export const PROJECT_UPDATE_STATUSES = ['NOT STARTED', 'IN PROGRESS', 'ON HOLD', 'SUSPENDED', 'COMPLETED'] as const;

export interface ProjectUpdate {
  id: string;
  date: string;
  type: ProjectUpdateType;
  note: string;
  status?: string;
  progress?: number;
  next_step?: string;
  next_date?: string;
  risk?: 'low' | 'medium' | 'high';
  link?: string;
  source?: string;
  previous_status?: string;
  previous_progress?: number;
  posted_by: string;
  posted_by_id: string;
  /** 'app' = typed by a person in pmv2; 'agent' = posted by Claude through an agent key. */
  posted_via: 'app' | 'agent';
  created_at: string;
}

export interface NewProjectUpdate {
  note: string;
  type?: ProjectUpdateType;
  date?: string;
  status?: string;
  progress?: number;
  next_step?: string;
  next_date?: string;
  link?: string;
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export async function listProjectUpdates(projectId: string | number): Promise<ProjectUpdate[]> {
  const body = await readJson(await fetch(`${API}/projects/${encodeURIComponent(String(projectId))}/updates`));
  return Array.isArray(body.updates) ? body.updates : [];
}

export async function postProjectUpdate(projectId: string | number, update: NewProjectUpdate): Promise<ProjectUpdate> {
  const body = await readJson(await fetch(`${API}/projects/${encodeURIComponent(String(projectId))}/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  }));
  return body.update;
}

export async function deleteProjectUpdate(projectId: string | number, updateId: string): Promise<void> {
  await readJson(await fetch(`${API}/projects/${encodeURIComponent(String(projectId))}/updates/${encodeURIComponent(updateId)}`, {
    method: 'DELETE',
  }));
}
