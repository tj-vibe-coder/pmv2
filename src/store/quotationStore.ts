import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  Client,
  ID,
  LaborRolePreset,
  Project,
  Quotation,
  QuotationKind,
  SalesContact,
} from '../types/Quotation';
import { seedClients, seedSalesContacts } from '../data/quotationClients';
import { seedLaborPresets, starterGeneralReqts } from '../data/quotationPresets';
import { quotationCode } from '../utils/calcsheet/codes';

// API base — talks to pmv2's Express server
const API_BASE = process.env.REACT_APP_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');
const BASE = `${API_BASE}/api/calcsheet`;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Paths starting with /api/ are absolute (hit the pmv2-wide endpoint, e.g. /api/clients);
  // everything else is relative to the calcsheet base (/api/calcsheet/...).
  const url = path.startsWith('/api/') ? `${API_BASE}${path}` : `${BASE}${path}`;
  const res = await fetch(url, {
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

interface State {
  clients: Client[];
  salesContacts: SalesContact[];
  laborPresets: LaborRolePreset[];
  projects: Project[];
  quotations: Quotation[];
  seq: number;
  initialized: boolean;
}

interface Actions {
  // Hydrate store from API (call once on mount)
  init: () => Promise<void>;

  // Clients
  addClient: (c: Omit<Client, 'id'>) => Promise<Client>;
  updateClient: (id: ID, patch: Partial<Client>) => Promise<void>;
  deleteClient: (id: ID) => Promise<void>;

  // Projects
  addProject: (p: Omit<Project, 'id' | 'code' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
  updateProject: (id: ID, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: ID) => Promise<void>;

  // Quotations
  createQuotation: (projectId: ID, kind: QuotationKind, recipientId: ID | null) => Promise<Quotation>;
  updateQuotation: (id: ID, patch: Partial<Quotation>) => Promise<void>;
  deleteQuotation: (id: ID) => Promise<void>;
  duplicateQuotation: (id: ID) => Promise<Quotation | null>;
  // Import a fully-formed Quotation (e.g. from a legacy Excel parse) under an existing project.
  importQuotation: (q: Quotation) => Promise<Quotation>;

  // Presets
  addPreset: (p: Omit<LaborRolePreset, 'id'>) => Promise<LaborRolePreset>;
  updatePreset: (id: ID, patch: Partial<LaborRolePreset>) => Promise<void>;
  deletePreset: (id: ID) => Promise<void>;
  resetPresets: () => Promise<void>;

  resetAll: () => Promise<void>;
}

const now = () => new Date().toISOString();

const blankQuotation = (
  projectId: ID,
  kind: QuotationKind,
  recipientId: ID | null,
  id: string,
): Quotation => ({
  id,
  projectId,
  kind,
  revision: '00',
  recipientId,
  validityDays: 30,
  paymentTerms: '30% DP, 70% Progress Billing',
  deliveryTerms: 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.',
  warrantyMonths: 12,
  productMarkupPct: 30,
  laborMarkupPct: 30,
  generalReqMarkupPct: 0,
  globalContingencyPct: 0,
  discountPct: 0,
  vatPct: 0,
  generalReqts: starterGeneralReqts(),
  components: [],
  services: [],
  manpower: [],
  servicesFromManpower: true,
  preparedBy: '',
  authorizedBy: 'Renzel Punongbayan',
  createdAt: now(),
  updatedAt: now(),
});

export const useQuotationStore = create<State & Actions>()((set, get) => ({
  clients: seedClients(),
  salesContacts: seedSalesContacts(),
  laborPresets: seedLaborPresets(),
  projects: [],
  quotations: [],
  seq: 1,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    try {
      const [pRes, qRes, cRes, prRes, sRes] = await Promise.all([
        api<{ projects: Project[] }>('GET', '/projects'),
        api<{ quotations: Quotation[] }>('GET', '/quotations'),
        api<{ clients: Client[] }>('GET', '/clients'),
        api<{ presets: LaborRolePreset[] }>('GET', '/presets'),
        api<{ seq: number }>('GET', '/seq'),
      ]);
      set({
        projects: pRes.projects ?? [],
        quotations: qRes.quotations ?? [],
        clients: cRes.clients.length ? cRes.clients : seedClients(),
        laborPresets: prRes.presets.length ? prRes.presets : seedLaborPresets(),
        seq: sRes.seq ?? 1,
        initialized: true,
      });
    } catch {
      // API unavailable — fall back to seed data (offline/local dev without server)
      set({ initialized: true });
    }
  },

  // ── Clients (unified `/api/clients` — see consolidation) ──────────────────

  addClient: async (c) => {
    // The unified endpoint returns the full doc on POST.
    const saved = await api<Client>('POST', '/api/clients', c);
    set({ clients: [...get().clients, saved] });
    return saved;
  },
  updateClient: async (id, patch) => {
    await api('PUT', `/api/clients/${id}`, patch);
    set({ clients: get().clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  },
  deleteClient: async (id) => {
    await api('DELETE', `/api/clients/${id}`);
    set({ clients: get().clients.filter((c) => c.id !== id) });
  },

  // ── Projects ───────────────────────────────────────────────────────────────

  addProject: async (p) => {
    const customer = get().clients.find((c) => c.id === p.customerId);
    const seq = await api<{ seq: number }>('POST', '/seq/increment').then((r) => r.seq).catch(() => get().seq);
    const project: Project = {
      id: nanoid(8),
      code: quotationCode(seq, customer?.code ?? 'XXX', '00', new Date(p.date)),
      createdAt: now(),
      updatedAt: now(),
      ...p,
    };
    const res = await api<{ project: Project }>('POST', '/projects', project);
    const saved = res.project ?? project;
    set({ projects: [...get().projects, saved], seq: seq + 1 });
    return saved;
  },
  updateProject: async (id, patch) => {
    await api('PUT', `/projects/${id}`, patch);
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now() } : p,
      ),
    });
  },
  deleteProject: async (id) => {
    await api('DELETE', `/projects/${id}`);
    set({
      projects: get().projects.filter((p) => p.id !== id),
      quotations: get().quotations.filter((q) => q.projectId !== id),
    });
  },

  // ── Quotations ─────────────────────────────────────────────────────────────

  createQuotation: async (projectId, kind, recipientId) => {
    const q = blankQuotation(projectId, kind, recipientId, nanoid(8));
    const res = await api<{ quotation: Quotation }>('POST', '/quotations', q);
    const saved = res.quotation ?? q;
    set({ quotations: [...get().quotations, saved] });
    return saved;
  },
  updateQuotation: async (id, patch) => {
    await api('PUT', `/quotations/${id}`, patch);
    set({
      quotations: get().quotations.map((q) =>
        q.id === id ? { ...q, ...patch, updatedAt: now() } : q,
      ),
    });
  },
  deleteQuotation: async (id) => {
    await api('DELETE', `/quotations/${id}`);
    set({ quotations: get().quotations.filter((q) => q.id !== id) });
  },
  importQuotation: async (q) => {
    const res = await api<{ quotation: Quotation }>('POST', '/quotations', q);
    const saved = res.quotation ?? q;
    set({ quotations: [...get().quotations, saved] });
    return saved;
  },
  duplicateQuotation: async (id) => {
    const original = get().quotations.find((q) => q.id === id);
    if (!original) return null;
    const copy: Quotation = {
      ...original,
      id: nanoid(8),
      revision: String(parseInt(original.revision, 10) + 1).padStart(2, '0'),
      createdAt: now(),
      updatedAt: now(),
    };
    // Duplicating a legacy snapshot produces an editable revision under the current formulation.
    // importedFrom is preserved for provenance.
    if (original.formulaVersion === 'legacy') {
      copy.formulaVersion = 'current';
      delete copy.legacyTotalsSnapshot;
      delete copy.generalReqContingencyMode;
    }
    const res = await api<{ quotation: Quotation }>('POST', '/quotations', copy);
    const saved = res.quotation ?? copy;
    set({ quotations: [...get().quotations, saved] });
    return saved;
  },

  // ── Presets ────────────────────────────────────────────────────────────────

  addPreset: async (p) => {
    const preset: LaborRolePreset = { id: nanoid(8), ...p };
    const res = await api<{ preset: LaborRolePreset }>('POST', '/presets', preset);
    const saved = res.preset ?? preset;
    set({ laborPresets: [...get().laborPresets, saved] });
    return saved;
  },
  updatePreset: async (id, patch) => {
    await api('PUT', `/presets/${id}`, patch);
    set({ laborPresets: get().laborPresets.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  },
  deletePreset: async (id) => {
    await api('DELETE', `/presets/${id}`);
    set({ laborPresets: get().laborPresets.filter((p) => p.id !== id) });
  },
  resetPresets: async () => {
    const defaults = seedLaborPresets();
    // Delete all existing presets
    const current = get().laborPresets;
    await Promise.all(current.map((p) => api('DELETE', `/presets/${p.id}`).catch(() => {})));
    // Re-seed
    const saved = await Promise.all(
      defaults.map((p) => api<{ preset: LaborRolePreset }>('POST', '/presets', p).then((r) => r.preset ?? p)),
    );
    set({ laborPresets: saved });
  },

  resetAll: async () => {
    // Clear all data from API. Clients live in the unified /api/clients collection.
    const { projects, quotations, clients, laborPresets } = get();
    await Promise.all([
      ...projects.map((p) => api('DELETE', `/projects/${p.id}`).catch(() => {})),
      ...quotations.map((q) => api('DELETE', `/quotations/${q.id}`).catch(() => {})),
      ...clients.map((c) => api('DELETE', `/api/clients/${c.id}`).catch(() => {})),
      ...laborPresets.map((p) => api('DELETE', `/presets/${p.id}`).catch(() => {})),
    ]);
    const [seededClients, seededPresets] = await Promise.all([
      Promise.all(seedClients().map((c) => api<Client>('POST', '/api/clients', c).catch(() => c))),
      Promise.all(seedLaborPresets().map((p) => api<{ preset: LaborRolePreset }>('POST', '/presets', p).then((r) => r.preset ?? p))),
    ]);
    set({
      clients: seededClients as Client[],
      salesContacts: seedSalesContacts(),
      laborPresets: seededPresets,
      projects: [],
      quotations: [],
      seq: 1,
    });
  },
}));

export const projectQuotations = (projectId: ID) =>
  useQuotationStore.getState().quotations.filter((q) => q.projectId === projectId);
