import { API_BASE } from '../config/api';

export interface OverheadReceiptRef {
  oneDriveId?: string;
  webUrl?: string;
  filename?: string;
}

export interface OverheadExpense {
  id?: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  sourceType?: string;
  receiptRef?: OverheadReceiptRef;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function fetchOverheadExpenses(filters?: { year?: string | number; category?: string }): Promise<OverheadExpense[]> {
  const params = new URLSearchParams();
  if (filters?.year) params.set('year', String(filters.year));
  if (filters?.category) params.set('category', filters.category);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/overhead-expenses${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load overhead expenses');
  return data.expenses as OverheadExpense[];
}

export async function fetchOverheadSummary(year?: string | number): Promise<{ total: number; count: number }> {
  const qs = year ? `?year=${year}` : '';
  const res = await fetch(`${API_BASE}/api/overhead-expenses/summary${qs}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load summary');
  return { total: Number(data.total) || 0, count: Number(data.count) || 0 };
}

export async function createOverheadExpense(expense: Omit<OverheadExpense, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>): Promise<OverheadExpense> {
  const res = await fetch(`${API_BASE}/api/overhead-expenses`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(expense) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.expense) throw new Error(data.error || 'Failed to create overhead expense');
  return data.expense as OverheadExpense;
}

export async function updateOverheadExpense(id: string, patch: Partial<OverheadExpense>): Promise<OverheadExpense> {
  const res = await fetch(`${API_BASE}/api/overhead-expenses/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.expense) throw new Error(data.error || 'Failed to update overhead expense');
  return data.expense as OverheadExpense;
}

export async function deleteOverheadExpense(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/overhead-expenses/${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete overhead expense');
}
