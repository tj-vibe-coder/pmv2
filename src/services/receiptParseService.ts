import { API_BASE } from '../config/api';
import type { ParsedReceipt } from '../types/Receipt';

export async function parseReceipt(imageBase64: string, mimeType: string): Promise<ParsedReceipt> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  const res = await fetch(`${API_BASE}/api/receipts/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  const data = await res.json().catch(() => ({} as { ok?: boolean; receipt?: ParsedReceipt; error?: string }));
  if (!res.ok || !data.ok || !data.receipt) {
    throw new Error(data.error || 'Failed to parse receipt');
  }
  return data.receipt;
}
