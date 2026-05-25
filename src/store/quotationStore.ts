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
import { getOneDriveTokenStore } from '../services/onedriveTokenStore';
import { isCorporateOneDriveConfigured } from '../config/onedriveConfig';
import { ensureProposalFolder, ensureExecutionFolder, moveProposalToExecution } from '../services/onedriveFolderService';

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
  addProject: (p: Omit<Project, 'id' | 'code' | 'createdAt' | 'updatedAt'> & { code?: string }) => Promise<Project>;
  updateProject: (id: ID, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: ID) => Promise<void>;
  syncMainProject: (id: ID, opts?: { force?: boolean }) => Promise<SyncMainProjectResult>;

  // Quotations
  createQuotation: (projectId: ID, kind: QuotationKind, recipientId: ID | null) => Promise<Quotation>;
  updateQuotation: (id: ID, patch: Partial<Quotation>) => Promise<Quotation>;
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

export interface SyncMainProjectResult {
  success: boolean;
  action: 'created' | 'recreated' | 'updated' | 'linked-existing';
  mainProjectId: string;
  projectNo: string;
  quotationId: string;
  quotationKind: QuotationKind;
  amount: number;
}

const now = () => new Date().toISOString();

function normalizeNameKey(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function firstLastKey(value: string | undefined | null): string {
  const parts = normalizeNameKey(value).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function mergeSalesContactsWithUsers(
  seed: SalesContact[],
  users: Array<{ id: string; full_name?: string | null; username?: string; email?: string | null; designation?: string | null; contact_number?: string | null }>,
): SalesContact[] {
  const merged = [...seed];
  for (const user of users) {
    const name = (user.full_name || '').trim();
    if (!name) continue;
    const userNameKey = normalizeNameKey(name);
    const userFirstLast = firstLastKey(name);
    const userEmail = (user.email || '').trim();
    const idx = merged.findIndex((contact) => {
      const contactNameKey = normalizeNameKey(contact.name);
      const contactFirstLast = firstLastKey(contact.name);
      return (
        (!!userNameKey && contactNameKey === userNameKey) ||
        (!!userFirstLast && contactFirstLast === userFirstLast) ||
        (!!userEmail && normalizeNameKey(contact.email) === normalizeNameKey(userEmail))
      );
    });
    const patch = {
      id: user.id,
      name,
      position: (user.designation || '').trim(),
      email: userEmail,
      phone: (user.contact_number || '').trim(),
    };
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        position: patch.position || merged[idx].position,
        email: patch.email || merged[idx].email,
        phone: patch.phone || merged[idx].phone,
      };
    } else {
      merged.push(patch);
    }
  }
  return merged;
}

const blankQuotation = (
  projectId: ID,
  kind: QuotationKind,
  recipientId: ID | null,
  id: string,
  // Default name to pre-fill the Prepared by / Authorized by Autocomplete fields.
  // Caller passes the project's account-manager name (resolved from
  // `project.salesContactId` against `salesContacts`). Both fields remain
  // editable inline on the quotation; this only sets the seed value so the
  // PDF "Prepared by:" defaults to the AM without manual intervention.
  defaultSignatoryName: string = '',
): Quotation => ({
  id,
  projectId,
  kind,
  revision: '00',
  recipientId,
  validityDays: 30,
  paymentTerms: '30% Downpayment, 70% Progress Billing',
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
  preparedBy: defaultSignatoryName,
  authorizedBy: defaultSignatoryName,
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
      const [pRes, qRes, cRes, prRes, sRes, staffRes] = await Promise.all([
        api<{ projects: Project[] }>('GET', '/projects'),
        api<{ quotations: Quotation[] }>('GET', '/quotations'),
        api<{ clients: Client[] }>('GET', '/clients'),
        api<{ presets: LaborRolePreset[] }>('GET', '/presets'),
        api<{ seq: number }>('GET', '/seq'),
        api<{ contacts: Array<{ id: string; full_name?: string | null; username?: string; email?: string | null; designation?: string | null; contact_number?: string | null }> }>('GET', '/api/users/staff-contacts').catch(() => ({ contacts: [] })),
      ]);
      const salesContacts = mergeSalesContactsWithUsers(seedSalesContacts(), staffRes.contacts ?? []);
      set({
        projects: pRes.projects ?? [],
        quotations: qRes.quotations ?? [],
        clients: cRes.clients.length ? cRes.clients : seedClients(),
        salesContacts,
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
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) cleaned[k] = v;
    await api('PUT', `/api/clients/${id}`, cleaned);
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
    const { code: codeOverride, ...rest } = p;
    const project: Project = {
      id: nanoid(8),
      code: (codeOverride || '').trim() || quotationCode(seq, customer?.code ?? 'XXX', '00', new Date(p.date)),
      createdAt: now(),
      updatedAt: now(),
      ...rest,
    };

    // Project creation requires a proposal folder when corporate OneDrive is
    // configured. Create/link it before saving so the stored project has the
    // folder reference from the start instead of relying on a background update.
    let projectWithFolder = project;
    if (isCorporateOneDriveConfigured()) {
      const odStore = getOneDriveTokenStore();
      if (!odStore.isAuthenticated) {
        throw new Error('Sign in to OneDrive before creating a Calcsheet project.');
      }
      const token = await odStore.getToken();
      if (!token) {
        throw new Error('Could not get OneDrive token. Sign in again before creating a project.');
      }
      const ref = await ensureProposalFolder(token, project);
      projectWithFolder = {
        ...project,
        proposalFolderId: ref.id,
        proposalFolderUrl: ref.webUrl,
      };
    }

    const res = await api<{ project: Project }>('POST', '/projects', projectWithFolder);
    const saved = res.project ?? projectWithFolder;
    set({ projects: [...get().projects, saved], seq: seq + 1 });
    return saved;
  },
  updateProject: async (id, patch) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) cleaned[k] = v;
    const prev = get().projects.find((p) => p.id === id);
    await api('PUT', `/projects/${id}`, cleaned);
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now() } : p,
      ),
    });

    // If status transitioned to 'won' (and wasn't already), promote the project's
    // OneDrive folder to the execution location. Preferred path: MOVE the existing
    // proposal folder so all proposal-phase files travel with the project (single
    // source of truth) and leave a .url shortcut in the original proposal location.
    // Fallback for legacy projects without a proposal folder: create a fresh
    // execution folder. Best-effort, fire-and-forget.
    if (patch.status === 'won' && prev && prev.status !== 'won' && isCorporateOneDriveConfigured()) {
      const next: Project = { ...prev, ...patch };
      (async () => {
        try {
          const odStore = getOneDriveTokenStore();
          if (!odStore.isAuthenticated) return;
          const token = await odStore.getToken();
          if (!token) return;

          if (next.proposalFolderId) {
            // Move path: physically relocate the proposal folder to executions, drop
            // a shortcut behind. The folder's ID is preserved.
            const { moved } = await moveProposalToExecution(token, {
              code: next.code,
              name: next.name,
              proposalFolderId: next.proposalFolderId,
              executionFolderName: next.mainProjectNo,
            });
            const patchFields = {
              // Same folder, new location → both fields point to the same URL/ID.
              proposalFolderUrl: moved.webUrl,
              executionFolderId: moved.id,
              executionFolderUrl: moved.webUrl,
            };
            await api('PUT', `/projects/${id}`, patchFields);
            if (next.mainProjectId) {
              await api('PUT', `/api/projects/${next.mainProjectId}`, {
                executionFolderId: moved.id,
                executionFolderUrl: moved.webUrl,
              }).catch(() => {});
            }
            set({
              projects: get().projects.map((proj) =>
                proj.id === id ? { ...proj, ...patchFields } : proj,
              ),
            });
            // eslint-disable-next-line no-console
            console.info('[OneDrive] proposal folder promoted to execution', moved.webUrl);
          } else {
            // Fallback: no proposal folder yet (legacy projects). Create a fresh one
            // at the execution location.
            const executionProject = next.mainProjectNo
              ? { code: next.mainProjectNo, name: '' }
              : next;
            const ref = await ensureExecutionFolder(token, executionProject);
            await api('PUT', `/projects/${id}`, {
              executionFolderId: ref.id,
              executionFolderUrl: ref.webUrl,
            });
            if (next.mainProjectId) {
              await api('PUT', `/api/projects/${next.mainProjectId}`, {
                executionFolderId: ref.id,
                executionFolderUrl: ref.webUrl,
              }).catch(() => {});
            }
            set({
              projects: get().projects.map((proj) =>
                proj.id === id
                  ? { ...proj, executionFolderId: ref.id, executionFolderUrl: ref.webUrl }
                  : proj,
              ),
            });
            // eslint-disable-next-line no-console
            console.info('[OneDrive] execution folder created (no prior proposal)', ref.webUrl);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[OneDrive] execution promotion failed (non-blocking)', err);
        }
      })();
    }
  },
  deleteProject: async (id) => {
    await api('DELETE', `/projects/${id}`);
    set({
      projects: get().projects.filter((p) => p.id !== id),
      quotations: get().quotations.filter((q) => q.projectId !== id),
    });
  },
  syncMainProject: async (id, opts = {}) => {
    const res = await api<SyncMainProjectResult>('POST', `/projects/${id}/sync-main`, {
      force: !!opts.force,
    });
    const nowIso = now();
    set({
      projects: get().projects.map((p) =>
        p.id === id
          ? {
              ...p,
              mainProjectId: res.mainProjectId,
              mainProjectNo: res.projectNo,
              mainProjectLinkedAt: p.mainProjectLinkedAt || nowIso,
              mainProjectLastSyncedAt: nowIso,
              mainProjectSyncStatus: 'linked',
              mainProjectSyncError: '',
              mainProjectStatus: p.mainProjectStatus || 'Not Started',
              mainProjectProgressPercent: p.mainProjectProgressPercent ?? 0,
              mainProjectStatusSyncedAt: nowIso,
            }
          : p,
      ),
    });
    return res;
  },

  // ── Quotations ─────────────────────────────────────────────────────────────

  createQuotation: async (projectId, kind, recipientId) => {
    // Resolve the project's account manager (salesContact) name and seed it into
    // both signatory fields. Editor remains editable; this just gives a sensible
    // default so the PDF "Prepared by:" starts populated with the AM.
    const project = get().projects.find((p) => p.id === projectId);
    const amName = project?.salesContactId
      ? (get().salesContacts.find((sc) => sc.id === project.salesContactId)?.name ?? '')
      : '';
    const q = blankQuotation(projectId, kind, recipientId, nanoid(8), amName);
    const res = await api<{ quotation: Quotation }>('POST', '/quotations', q);
    const saved = res.quotation ?? q;
    set({ quotations: [...get().quotations, saved] });
    return saved;
  },
  updateQuotation: async (id, patch) => {
    // Firestore rejects `undefined` values with a 500. Substitute null (to
    // clear the field) so callers can safely send "I have no value here".
    // Undefined keys are dropped entirely when they would just be left alone.
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleaned[k] = v;
    }
    await api('PUT', `/quotations/${id}`, cleaned);
    const updatedAt = now();
    let saved: Quotation | null = null;
    set({
      quotations: get().quotations.map((q) => {
        if (q.id !== id) return q;
        saved = { ...q, ...patch, updatedAt };
        return saved;
      }),
    });
    if (!saved) throw new Error('Quotation not found after update');
    return saved;
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
