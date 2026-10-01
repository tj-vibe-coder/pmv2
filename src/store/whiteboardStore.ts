import { create } from 'zustand';
import type { WhiteboardCategory, WhiteboardItem, WhiteboardKind, WhiteboardLink, WhiteboardPerson, WhiteboardVisibility } from '../types/Whiteboard';

// App-wide (not calcsheet-scoped) — talks to /api/whiteboard directly, same
// auth-header convention as quotationStore's api() helper.
const API_BASE = process.env.REACT_APP_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
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

const api = <T,>(method: string, path: string, body?: unknown) => request<T>(method, `/api/whiteboard${path}`, body);

interface WhiteboardState {
  items: WhiteboardItem[];
  loaded: boolean;
  loading: boolean;
  // Dialog open/close lives here too — Header.tsx's quick-access button and
  // its once-per-session auto-popup effect both drive the same dialog.
  open: boolean;
  // Everything a note can be linked to (Project List projects + calcsheet
  // proposals). Reloaded every time the Whiteboard opens so a project
  // created since the last open shows up without a page refresh.
  linkOptions: WhiteboardLink[];
  linkOptionsLoading: boolean;
}

interface WhiteboardActions {
  fetchItems: (opts?: { force?: boolean }) => Promise<void>;
  fetchLinkOptions: () => Promise<void>;
  // Adds a just-created project to the picker without a refetch.
  addLinkOption: (link: WhiteboardLink) => void;
  addItem: (item: { kind: WhiteboardKind; visibility: WhiteboardVisibility; category?: WhiteboardCategory; assignedTo?: WhiteboardPerson; text: string; done?: boolean; dueDate?: string; link?: WhiteboardLink }) => Promise<WhiteboardItem>;
  // assignedTo/dueDate/link accept `null` (not just `undefined`) to
  // explicitly clear a previously-set value — `undefined` fields are dropped
  // by JSON.stringify before the request even goes out, so they'd silently
  // leave the old value in place rather than clearing it.
  updateItem: (id: string, patch: Partial<Pick<WhiteboardItem, 'text' | 'visibility' | 'done' | 'category'>> & { assignedTo?: WhiteboardPerson | null; dueDate?: string | null; link?: WhiteboardLink | null }) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setOpen: (open: boolean) => void;
}

export const useWhiteboardStore = create<WhiteboardState & WhiteboardActions>()((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  open: false,
  linkOptions: [],
  linkOptionsLoading: false,

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

  fetchLinkOptions: async () => {
    if (get().linkOptionsLoading) return;
    set({ linkOptionsLoading: true });
    try {
      // Best-effort, each source independently — one failing still leaves
      // the other usable. If both fail (e.g. offline), keep the last list
      // rather than blanking the picker.
      const [projects, calcsheet] = await Promise.all([
        request<Array<{ id: string; project_no?: string; project_name?: string }>>('GET', '/api/projects').catch(() => []),
        request<{ projects?: Array<{ id: string; code?: string; name?: string }> }>('GET', '/api/calcsheet/projects').catch(() => ({ projects: [] })),
      ]);
      const options: WhiteboardLink[] = [
        ...(Array.isArray(projects) ? projects : [])
          .filter((p) => p.id && (p.project_name || p.project_no))
          .map((p) => ({ type: 'project' as const, id: String(p.id), label: [p.project_no, p.project_name].filter(Boolean).join(' – ') })),
        ...(calcsheet.projects ?? [])
          .filter((p) => p.id && (p.code || p.name))
          .map((p) => ({ type: 'calcsheet' as const, id: String(p.id), label: [p.code, p.name].filter(Boolean).join(' – ') })),
      ];
      if (options.length > 0 || get().linkOptions.length === 0) set({ linkOptions: options });
    } finally {
      set({ linkOptionsLoading: false });
    }
  },

  addLinkOption: (link) => {
    const rest = get().linkOptions.filter((o) => !(o.type === link.type && o.id === link.id));
    set({ linkOptions: [link, ...rest] });
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
    set({
      items: get().items.map((i) => {
        if (i.id !== id) return i;
        // The wire format accepts `null` to explicitly clear
        // assignedTo/dueDate/link; normalize back to `undefined` for the
        // in-memory item shape (which never stores null for these).
        const next: WhiteboardItem = { ...i, updatedAt };
        if (patch.text !== undefined) next.text = patch.text;
        if (patch.visibility !== undefined) next.visibility = patch.visibility;
        if (patch.done !== undefined) next.done = patch.done;
        if (patch.category !== undefined) next.category = patch.category;
        if ('assignedTo' in patch) next.assignedTo = patch.assignedTo ?? undefined;
        if ('dueDate' in patch) next.dueDate = patch.dueDate ?? undefined;
        if ('link' in patch) next.link = patch.link ?? undefined;
        return next;
      }),
    });
  },

  deleteItem: async (id) => {
    await api('DELETE', `/${id}`);
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  setOpen: (open) => set({ open }),
}));
