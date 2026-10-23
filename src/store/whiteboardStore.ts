import { create } from 'zustand';
import type { WhiteboardCategory, WhiteboardItem, WhiteboardKind, WhiteboardLink, WhiteboardPerson, WhiteboardRecurrence, WhiteboardSubtask, WhiteboardUpdate, WhiteboardVisibility } from '../types/Whiteboard';
import { API_BASE } from '../config/api';

// App-wide (not calcsheet-scoped) — talks to /api/whiteboard directly, same
// auth-header convention as quotationStore's api() helper.
// Dev: the host the page was loaded from (so a phone on the LAN reaches the API); prod: same origin. See config/api.ts.

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
  addItem: (item: { kind: WhiteboardKind; visibility: WhiteboardVisibility; category?: WhiteboardCategory; assignedTo?: WhiteboardPerson; text: string; done?: boolean; dueDate?: string; recurrence?: WhiteboardRecurrence; recurrenceDay?: number; link?: WhiteboardLink }) => Promise<WhiteboardItem>;
  // assignedTo/dueDate/link accept `null` (not just `undefined`) to
  // explicitly clear a previously-set value — `undefined` fields are dropped
  // by JSON.stringify before the request even goes out, so they'd silently
  // leave the old value in place rather than clearing it.
  updateItem: (id: string, patch: Partial<Pick<WhiteboardItem, 'text' | 'visibility' | 'done' | 'category'>> & { assignedTo?: WhiteboardPerson | null; dueDate?: string | null; recurrence?: WhiteboardRecurrence | null; recurrenceDay?: number | null; link?: WhiteboardLink | null }) => Promise<{ spawned?: WhiteboardItem } | void>;
  deleteItem: (id: string) => Promise<void>;
  // Subtasks and dated status notes. The server owns these arrays and answers with the new values.
  addSubtask: (id: string, text: string) => Promise<void>;
  setSubtaskDone: (id: string, subtaskId: string, done: boolean) => Promise<void>;
  deleteSubtask: (id: string, subtaskId: string) => Promise<void>;
  addUpdate: (id: string, note: { text: string; progress?: number }) => Promise<void>;
  deleteUpdate: (id: string, updateId: string) => Promise<void>;
  setOpen: (open: boolean) => void;
}

// What the subtask / note endpoints send back: the changed arrays (and, for notes, the task's new progress — null = none).
interface DetailResponse { subtasks?: WhiteboardSubtask[]; updates?: WhiteboardUpdate[]; progress?: number | null; updatedAt?: string }

// Shared by the five subtask / note actions: call the endpoint, then fold the server's answer into the item.
// (Runs only when an action is called, by which time the store below exists.)
async function changeDetail(method: string, id: string, path: string, body?: unknown): Promise<void> {
  const res = await api<DetailResponse>(method, `/${id}${path}`, body);
  useWhiteboardStore.setState((state) => ({
    items: state.items.map((i) => {
      if (i.id !== id) return i;
      const next: WhiteboardItem = { ...i, updatedAt: res.updatedAt ?? i.updatedAt };
      if (res.subtasks) next.subtasks = res.subtasks;
      if (res.updates) next.updates = res.updates;
      if ('progress' in res) next.progress = res.progress ?? undefined;
      return next;
    }),
  }));
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
      const [projects, calcsheet, invoices, liquidations] = await Promise.all([
        request<Array<{ id: string; project_no?: string; project_name?: string }>>('GET', '/api/projects').catch(() => []),
        request<{ projects?: Array<{ id: string; code?: string; name?: string }> }>('GET', '/api/calcsheet/projects').catch(() => ({ projects: [] })),
        request<Array<{ id: string; invoice_no?: string; project_name?: string }>>('GET', '/api/invoices').catch(() => []),
        request<unknown>('GET', '/api/liquidations').catch(() => []),
      ]);
      const liqRows = (Array.isArray(liquidations) ? liquidations : ((liquidations as { liquidations?: unknown[] })?.liquidations ?? [])) as Array<{ id: string; form_no?: string; full_name?: string; total_amount?: number }>;
      const options: WhiteboardLink[] = [
        ...(Array.isArray(projects) ? projects : [])
          .filter((p) => p.id && (p.project_name || p.project_no))
          .map((p) => ({ type: 'project' as const, id: String(p.id), label: [p.project_no, p.project_name].filter(Boolean).join(' – ') })),
        ...(calcsheet.projects ?? [])
          .filter((p) => p.id && (p.code || p.name))
          .map((p) => ({ type: 'calcsheet' as const, id: String(p.id), label: [p.code, p.name].filter(Boolean).join(' – ') })),
        ...(Array.isArray(invoices) ? invoices : [])
          .filter((i) => i.id && i.invoice_no)
          .map((i) => ({ type: 'invoice' as const, id: String(i.id), label: [`Invoice ${i.invoice_no}`, i.project_name].filter(Boolean).join(' – ') })),
        ...liqRows
          .filter((l) => l.id && l.form_no)
          .map((l) => ({ type: 'liquidation' as const, id: String(l.id), label: [`Liquidation ${l.form_no}`, l.full_name].filter(Boolean).join(' – ') })),
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
    // The server fills in who ticked it (doneBy…) and, for a repeating to-do, creates the next one.
    const res = await api<{ doneBy?: string; doneByName?: string; doneAt?: string; dueDate?: string; spawned?: WhiteboardItem }>('PUT', `/${id}`, patch);
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
        if (patch.done !== undefined) {
          next.done = patch.done;
          if (patch.done) { next.doneBy = res?.doneBy; next.doneByName = res?.doneByName; next.doneAt = res?.doneAt; if (res?.spawned) next.spawnedNextId = res.spawned.id; }
          else { next.doneBy = undefined; next.doneByName = undefined; next.doneAt = undefined; }
        }
        if (patch.category !== undefined) next.category = patch.category;
        if ('assignedTo' in patch) next.assignedTo = patch.assignedTo ?? undefined;
        if ('dueDate' in patch) next.dueDate = patch.dueDate ?? undefined;
        if ('recurrence' in patch) next.recurrence = patch.recurrence ?? undefined;
        if ('recurrence' in patch || 'recurrenceDay' in patch) next.recurrenceDay = patch.recurrence ? (patch.recurrenceDay ?? undefined) : undefined;
        // The server fills in a first due date for a repeat saved without one.
        if (res?.dueDate && !patch.dueDate) next.dueDate = res.dueDate;
        if ('link' in patch) next.link = patch.link ?? undefined;
        return next;
      }),
    });
    // Ticking a repeating to-do made the next one on the server — show it right away.
    if (res?.spawned) {
      set({ items: [res.spawned, ...get().items.filter((i) => i.id !== res.spawned!.id)] });
      return { spawned: res.spawned };
    }
  },

  deleteItem: async (id) => {
    await api('DELETE', `/${id}`);
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  addSubtask: (id, text) => changeDetail('POST', id, '/subtasks', { text }),
  setSubtaskDone: (id, subtaskId, done) => changeDetail('PUT', id, `/subtasks/${subtaskId}`, { done }),
  deleteSubtask: (id, subtaskId) => changeDetail('DELETE', id, `/subtasks/${subtaskId}`),
  addUpdate: (id, note) => changeDetail('POST', id, '/updates', note),
  deleteUpdate: (id, updateId) => changeDetail('DELETE', id, `/updates/${updateId}`),

  setOpen: (open) => set({ open }),
}));
