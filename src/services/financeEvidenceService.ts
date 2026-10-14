import { API_BASE } from '../config/api';
export async function evidenceRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = localStorage.getItem('netpacific_token');
  const res = await fetch(`${API_BASE}/api/finance-evidence${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Evidence request failed');
  return result as T;
}
