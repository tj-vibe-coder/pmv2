import { create } from 'zustand';
import type { WhiteboardItem, WhiteboardKind, WhiteboardVisibility } from '../types/Whiteboard';

// App-wide (not calcsheet-scoped) — talks to /api/whiteboard directly, same
// auth-header convention as quotationStore's api() helper.
const API_BASE = process.env.REACT_APP_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/whiteboard${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || 'API error');
  }
  return res.json();
}

interface WhiteboardState {
  items: WhiteboardItem[];
  loaded: boolean;
  loading: boolean;
  // Dialog open/close lives here too — Header.tsx's quick-access button and
  // its once-per-session auto-popup effect both drive the same dialog.
  open: boolean;
}

interface WhiteboardActions {
  fetchItems: (opts?: { force?: boolean }) => Promise<void>;
  addItem: (item: { kind: WhiteboardKind; visibility: WhiteboardVisibility; text: string; done?: boolean; dueDate?: string }) => Promise<WhiteboardItem>;
  updateItem: (id: string, patch: Partial<Pick<WhiteboardItem, 'text' | 'visibility' | 'done' | 'dueDate'>>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setOpen: (open: boolean) => void;
}

export const useWhiteboardStore = create<WhiteboardState & WhiteboardActions>()((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  open: false,

  fetchItems: async (opts) => {
    if (get().loading) return;
    if (get().loaded && !opts?.force) return;
    set({ loading: true });
    try {
      const res = await api<{ items: WhiteboardItem[] }>('GET', '');
      set({ items: res.items ?? [], loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (item) => {
    const res = await api<{ item: WhiteboardItem }>('POST', '', item);
    const saved = res.item;
    if (!saved || !saved.id) throw new Error('Server did not return the saved item');
    set({ items: [saved, ...get().items] });
    return saved;
  },

  updateItem: async (id, patch) => {
    await api('PUT', `/${id}`, patch);
    const updatedAt = new Date().toISOString();
    set({ items: get().items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt } : i)) });
  },

  deleteItem: async (id) => {
    await api('DELETE', `/${id}`);
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  setOpen: (open) => set({ open }),
}));
