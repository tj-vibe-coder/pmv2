/**
 * Offline queue for DTR punches. When a save can't reach the server (no signal
 * on a job site), the punch is stashed in localStorage and flushed when the
 * connection returns. Punches carry a device timestamp; the server records its
 * own submit time, so an offline delay stays auditable.
 */

const KEY = 'dtr_offline_queue';

export interface QueuedPunch {
  key: string;          // `${employeeId}:${entryDate}` — one queued punch per day
  employeeId: string;
  entryDate: string;
  existingId: string | null;
  body: Record<string, unknown>;  // the /api/dtr payload
  queuedAt: string;     // device ISO time when queued
}

export function readQueue(): QueuedPunch[] {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as QueuedPunch[] : []; } catch { return []; }
}

function writeQueue(q: QueuedPunch[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage unavailable/full */ }
}

export function enqueuePunch(item: QueuedPunch): void {
  const q = readQueue().filter((x) => x.key !== item.key); // newest punch for a day wins
  q.push(item);
  writeQueue(q);
}

export function queueCount(): number { return readQueue().length; }

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('netpacific_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function saveOne(apiBase: string, item: QueuedPunch): Promise<boolean> {
  const headers = authHeaders();
  if (item.existingId) {
    const res = await fetch(`${apiBase}/api/dtr/${item.existingId}`, { method: 'PUT', headers, body: JSON.stringify(item.body) });
    return res.ok;
  }
  const res = await fetch(`${apiBase}/api/dtr`, { method: 'POST', headers, body: JSON.stringify(item.body) });
  if (res.ok) return true;
  if (res.status === 409) {
    // An entry for this date already exists (e.g. created online meanwhile) —
    // look it up and PUT so the offline punch still lands.
    try {
      const g = await fetch(`${apiBase}/api/dtr?employeeId=${encodeURIComponent(item.employeeId)}`, { headers });
      if (g.ok) {
        const entries = await g.json();
        const found = Array.isArray(entries)
          ? entries.find((e: { id?: string; entryDate?: string }) => e.entryDate === item.entryDate)
          : null;
        if (found?.id) {
          const put = await fetch(`${apiBase}/api/dtr/${found.id}`, { method: 'PUT', headers, body: JSON.stringify(item.body) });
          return put.ok;
        }
      }
    } catch { /* fall through */ }
    return true; // server already has an entry for the day; don't retry forever
  }
  return false;
}

/** Try to sync every queued punch. Keeps the ones that still fail. */
export async function flushQueue(apiBase: string): Promise<{ synced: number; failed: number }> {
  const q = readQueue();
  if (q.length === 0) return { synced: 0, failed: 0 };
  const remaining: QueuedPunch[] = [];
  let synced = 0;
  for (const item of q) {
    try {
      if (await saveOne(apiBase, item)) synced++;
      else remaining.push(item);
    } catch {
      remaining.push(item); // still offline
    }
  }
  writeQueue(remaining);
  return { synced, failed: remaining.length };
}
