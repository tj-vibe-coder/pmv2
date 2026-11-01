import { API_BASE } from '../config/api';
import type { BillingStatement } from '../types/BillingStatement';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/bls${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export async function listBillingStatements(projectId?: string): Promise<BillingStatement[]> {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return (await call<{ data: BillingStatement[] }>(q)).data;
}

export async function nextBlsNo(projectNo: string): Promise<string> {
  return (await call<{ docNo: string }>(`/next-no?projectNo=${encodeURIComponent(projectNo)}`)).docNo;
}

export async function createBillingStatement(payload: Partial<BillingStatement>): Promise<BillingStatement> {
  return (await call<{ data: BillingStatement }>('', { method: 'POST', body: JSON.stringify(payload) })).data;
}

export async function updateBillingStatement(id: string, payload: Partial<BillingStatement>): Promise<BillingStatement> {
  return (await call<{ data: BillingStatement }>(`/${id}`, { method: 'PUT', body: JSON.stringify(payload) })).data;
}

export async function deleteBillingStatement(id: string): Promise<void> {
  await call(`/${id}`, { method: 'DELETE' });
}
