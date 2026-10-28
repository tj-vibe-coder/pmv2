import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import type { ProofRef } from '../utils/receipts/paymentProof';

// One bank/e-wallet transfer and how it splits across CAs and reimbursement claims.
// Server: /api/payment-transfers (server/paymentTransfers.js). A record only — paying a
// claim or releasing a CA still happens through their own endpoints.
export type TransferAllocationType = 'cash_advance' | 'reimbursement';

export interface TransferAllocation {
  type: TransferAllocationType;
  id: string;
  docNo?: string | null;
  amount: number;
  rowIds?: string[] | null;
}

export interface PaymentTransfer {
  id: string;
  date: string;
  reference: string | null;
  amount: number;
  remark: string | null;
  payeeName: string | null;
  proofRef: ProofRef | null;
  allocations: TransferAllocation[];
}

export type PaymentTransferInput = Omit<PaymentTransfer, 'id' | 'proofRef'> & { id?: string; proofRef?: ProofRef | null };

export const transferKey = (type: TransferAllocationType, id: string) => `${type}:${id}`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('netpacific_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/payment-transfers${path}`, { ...init, headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function listPaymentTransfers(): Promise<PaymentTransfer[]> {
  return (await call<{ transfers: PaymentTransfer[] }>('')).transfers || [];
}

// Creates when `existingId` is empty, otherwise replaces that transfer.
export async function savePaymentTransfer(input: PaymentTransferInput, existingId?: string): Promise<string> {
  const data = await call<{ id: string }>(existingId ? `/${encodeURIComponent(existingId)}` : '', {
    method: existingId ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
  return data.id;
}

export async function deletePaymentTransfer(id: string): Promise<void> {
  await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Admin-only list of all transfers, indexed by "type:id" for per-row lookups.
export function usePaymentTransfers(enabled: boolean) {
  const [transfers, setTransfers] = useState<PaymentTransfer[]>([]);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try { setTransfers(await listPaymentTransfers()); } catch { /* rows still render without transfers */ }
  }, [enabled]);
  useEffect(() => { void reload(); }, [reload]);
  const byKey = useMemo(() => {
    const map = new Map<string, PaymentTransfer[]>();
    for (const t of transfers) {
      for (const a of t.allocations || []) {
        const k = transferKey(a.type, a.id);
        map.set(k, [...(map.get(k) || []), t]);
      }
    }
    return map;
  }, [transfers]);
  return { transfers, byKey, reload };
}
