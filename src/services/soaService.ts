import { API_BASE } from '../config/api';
import type { StatementOfAccount, SoaStatus, SoaItem } from '../types/StatementOfAccount';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ListSoaFilters {
  status?: string;
  recipientCode?: string;
  search?: string;
}

export async function listSoas(filters?: ListSoaFilters): Promise<StatementOfAccount[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.recipientCode) params.set('recipientCode', filters.recipientCode);
  if (filters?.search) params.set('search', filters.search);

  const url = `${API_BASE}/api/soa${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch SOAs (${res.status})`);
  }

  const json = await res.json();
  return json.data || [];
}

export async function getSoa(id: string): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa/${id}`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch SOA (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function createSoa(payload: Partial<StatementOfAccount>): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to create SOA (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function updateSoa(id: string, payload: Partial<StatementOfAccount>): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to update SOA (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function updateSoaStatus(
  id: string,
  status: SoaStatus,
  settlementDate?: string,
): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ status, settlementDate }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to update status (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function updateSoaItem(
  soaId: string,
  itemId: string,
  updates: Partial<SoaItem>,
): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa/${soaId}/items/${itemId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to update line item (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function reviseSoa(id: string): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa/${id}/revise`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to revise SOA (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function deleteSoa(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/soa/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to delete SOA (${res.status})`);
  }
}

export async function recordSoaPayment(
  id: string,
  payment: { amount: number; paymentDate?: string; reference?: string; invoiceId?: string; notes?: string },
): Promise<StatementOfAccount> {
  const res = await fetch(`${API_BASE}/api/soa/${id}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payment),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to record payment (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function uploadSoaToOneDrive(
  id: string,
  pdfBase64: string,
): Promise<{ success: boolean; itemId: string; webUrl: string; folderPath: string }> {
  const res = await fetch(`${API_BASE}/api/soa/${id}/upload-onedrive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ pdfBase64 }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to upload to OneDrive (${res.status})`);
  }

  return res.json();
}

export async function getSoasByProject(
  projectId: string,
): Promise<Array<{ id: string; soaNo: string; date: string; status: string; recipientName: string; matchingItems: any[] }>> {
  const res = await fetch(`${API_BASE}/api/soa/by-project/${projectId}`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch project SOAs (${res.status})`);
  }

  const json = await res.json();
  return json.data || [];
}
