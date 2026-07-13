import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  Client,
  ID,
  LaborRolePreset,
  Project,
  Quotation,
  QuotationKind,
  QuotationVersion,
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

const normalizeLaborPresets = (presets: LaborRolePreset[]): LaborRolePreset[] =>
  presets.map((p) => {
    if (
      p.group === 'labor' &&
      p.allowance === 250 &&
      p.dailyRate === 1500 &&
      ['Technician', 'Electrician', 'Safety Officer'].includes(p.role)
    ) {
      return { ...p, dailyRate: 1200 };
    }
    return p;
  });

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

export interface CalcsheetSettings {
  defaultJobTitles?: {
    IOCT?: string;
    ACTI?: string;
  };
}

interface State {
  clients: Client[];
  salesContacts: SalesContact[];
  laborPresets: LaborRolePreset[];
  projects: Project[];
  quotations: Quotation[];
  seq: number;
  settings: CalcsheetSettings;
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
  duplicateQuotation: (id: ID, opts?: { projectId?: ID }) => Promise<Quotation | null>;
  // Import a fully-formed Quotation (e.g. from a legacy Excel parse) under an existing project.
  importQuotation: (q: Quotation) => Promise<Quotation>;
  // Saved-version history for a quotation (newest first). Not cached in the store —
  // fetched on demand when the History dialog opens.
  fetchQuotationVersions: (id: ID) => Promise<QuotationVersion[]>;
  deleteQuotationVersion: (quotationId: ID, versionId: ID) => Promise<void>;

  // Presets
  addPreset: (p: Omit<LaborRolePreset, 'id'>) => Promise<LaborRolePreset>;
  updatePreset: (id: ID, patch: Partial<LaborRolePreset>) => Promise<void>;
  deletePreset: (id: ID) => Promise<void>;
  resetPresets: () => Promise<void>;

  // Settings
  updateSettings: (patch: CalcsheetSettings) => Promise<void>;

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
  productMarkupPct: 0,
  productContingencyPct: 0,
  laborMarkupPct: 100,
  generalReqMarkupPct: 0,
  globalContingencyPct: 0,
  discountPct: 0,
  vatPct: 0,
  generalReqts: starterGeneralReqts(),
  components: [],
  services: [],
  manpower: [],
  servicesFromManpower: true,
  engineeringServicesQty: 1,
  exportGeneralReqtsAsLot: true,
  generalReqtsExportQty: 1,
  pageBreakBeforeTerms: false,
  preparedBy: defaultSignatoryName,
  authorizedBy: defaultSignatoryName,
  createdAt: now(),
  updatedAt: now(),
});

// In-flight guard: `initialized` only flips true after init's awaits resolve,
// so two concurrent init() calls (e.g. React StrictMode's double-invoked
// effects in dev) would both pass the state guard and run the empty-presets
// seed-and-persist twice, creating duplicate presets. Share one promise instead.
let initInFlight: Promise<void> | null = null;

export const useQuotationStore = create<State & Actions>()((set, get) => ({
  clients: seedClients(),
  salesContacts: seedSalesContacts(),
  laborPresets: seedLaborPresets(),
  projects: [],
  quotations: [],
  seq: 1,
  settings: {},
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    if (initInFlight) return initInFlight;
    initInFlight = (async () => {
    try {
      const [pRes, qRes, cRes, prRes, sRes, staffRes, stRes] = await Promise.all([
        api<{ projects: Project[] }>('GET', '/projects'),
        api<{ quotations: Quotation[] }>('GET', '/quotations'),
        api<{ clients: Client[] }>('GET', '/clients'),
        api<{ presets: LaborRolePreset[] }>('GET', '/presets'),
        api<{ seq: number }>('GET', '/seq'),
        api<{ contacts: Array<{ id: string; full_name?: string | null; username?: string; email?: string | null; designation?: string | null; contact_number?: string | null }> }>('GET', '/api/users/staff-contacts').catch(() => ({ contacts: [] })),
        api<{ settings: CalcsheetSettings }>('GET', '/settings').catch(() => ({ settings: {} })),
      ]);
      const salesContacts = mergeSalesContactsWithUsers(seedSalesContacts(), staffRes.contacts ?? []);
      let laborPresets: LaborRolePreset[];
      if (prRes.presets.length) {
        laborPresets = normalizeLaborPresets(prRes.presets);
      } else {
        // First run — the presets collection is empty. Persist the defaults once
        // so their ids are stable Firestore ids on every later load. An in-memory
        // seed would mint fresh nanoids each load, orphaning any manpower
        // `presetId` that referenced them. Best-effort: if a POST fails (offline
        // / not authed), fall back to the in-memory seed for that row.
        const seeds = seedLaborPresets();
        laborPresets = normalizeLaborPresets(
          await Promise.all(
            seeds.map(({ id: _drop, ...body }) =>
              api<{ preset: LaborRolePreset }>('POST', '/presets', body)
                .then((r) => r.preset ?? { id: _drop, ...body })
                .catch(() => ({ id: _drop, ...body })),
            ),
          ),
        );
      }
      set({
        projects: pRes.projects ?? [],
        quotations: qRes.quotations ?? [],
        clients: cRes.clients.length ? cRes.clients : seedClients(),
        salesContacts,
        laborPresets,
        seq: sRes.seq ?? 1,
        settings: stRes.settings ?? {},
        initialized: true,
      });
    } catch {
      // API unavailable — fall back to seed data (offline/local dev without server)
      set({ initialized: true });
    } finally {
      initInFlight = null;
    }
    })();
    return initInFlight;
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

    // When corporate OneDrive is configured we try to create/link the proposal
    // folder up front so the stored project carries the reference from the start.
    // This is BEST-EFFORT: if OneDrive isn't signed in, or a token can't be
    // acquired silently (e.g. the SPA refresh token expired after Azure's 24h cap
    // and ssoSilent is blocked by third-party-cookie policy), we still save the
    // project WITHOUT a folder. The user can sign in and create/link the proposal
    // folder later from the project detail page. Never block project creation on
    // OneDrive — a tokenless-but-cached MSAL session must not strand the user.
    let projectWithFolder = project;
    if (isCorporateOneDriveConfigured()) {
      try {
        const odStore = getOneDriveTokenStore();
        const token = odStore.isAuthenticated ? await odStore.getToken() : null;
        if (token) {
          const ref = await ensureProposalFolder(token, project);
          projectWithFolder = {
            ...project,
            proposalFolderId: ref.id,
            proposalFolderUrl: ref.webUrl,
          };
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            '[OneDrive] No token at project create (signed in:',
            odStore.isAuthenticated,
            ') — saving project without a proposal folder; link it later from the project page.',
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[OneDrive] Proposal-folder creation failed at project create — saving project without a folder; link it later.',
          e,
        );
      }
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
            // Promotion path: create the ops project folder in execution, then move
            // the PCS proposal folder inside it as a subfolder.
            const customerCodeMatch = next.code.match(/^PCS\d{7}-([A-Z0-9]+)-/i);
            const customerSuffix = customerCodeMatch ? `-${customerCodeMatch[1].toUpperCase()}` : '';
            const executionFolderName = next.mainProjectNo
              ? `${next.mainProjectNo}${customerSuffix}${next.name ? ` ${next.name}` : ''}`
              : undefined;
            const { executionFolder, proposalFolder } = await moveProposalToExecution(token, {
              code: next.code,
              name: next.name,
              proposalFolderId: next.proposalFolderId,
              executionFolderName,
            });
            const patchFields = {
              // executionFolder is the new ops project folder; proposalFolder is the
              // PCS subfolder now living inside it.
              proposalFolderUrl: proposalFolder.webUrl,
              executionFolderId: executionFolder.id,
              executionFolderUrl: executionFolder.webUrl,
            };
            await api('PUT', `/projects/${id}`, patchFields);
            // Only update the linked main project's execution folder if it doesn't
            // already have one — avoids overwriting a manually-configured link on
            // pre-Calcsheet projects.
            if (next.mainProjectId) {
              const mainResp = await fetch(`/api/projects/${next.mainProjectId}`).then((r) => r.json()).catch(() => null);
              if (mainResp && !mainResp.executionFolderId) {
                await api('PUT', `/api/projects/${next.mainProjectId}`, {
                  executionFolderId: executionFolder.id,
                  executionFolderUrl: executionFolder.webUrl,
                }).catch(() => {});
              }
            }
            set({
              projects: get().projects.map((proj) =>
                proj.id === id ? { ...proj, ...patchFields } : proj,
              ),
            });
            // eslint-disable-next-line no-console
            console.info('[OneDrive] proposal folder promoted to execution', executionFolder.webUrl);
          } else {
            // Fallback: no proposal folder (legacy or manually-linked projects).
            // Skip if we already have an execution folder linked to this calcsheet project.
            if (next.executionFolderId) return;
            const executionProject = next.mainProjectNo
              ? { code: next.mainProjectNo, name: '' }
              : next;
            const ref = await ensureExecutionFolder(token, executionProject);
            await api('PUT', `/projects/${id}`, {
              executionFolderId: ref.id,
              executionFolderUrl: ref.webUrl,
            });
            // Same guard: only set on main project if not already configured.
            if (next.mainProjectId) {
              const mainResp = await fetch(`/api/projects/${next.mainProjectId}`).then((r) => r.json()).catch(() => null);
              if (mainResp && !mainResp.executionFolderId) {
                await api('PUT', `/api/projects/${next.mainProjectId}`, {
                  executionFolderId: ref.id,
                  executionFolderUrl: ref.webUrl,
                }).catch(() => {});
              }
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
    const defaultTitle = get().settings.defaultJobTitles?.[kind] || undefined;
    const q: Quotation = { ...blankQuotation(projectId, kind, recipientId, nanoid(8), amName), preparedByTitle: defaultTitle };
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
  fetchQuotationVersions: async (id) => {
    const res = await api<{ versions: QuotationVersion[] }>('GET', `/quotations/${id}/versions`);
    return res.versions ?? [];
  },
  deleteQuotationVersion: async (quotationId, versionId) => {
    await api('DELETE', `/quotations/${quotationId}/versions/${versionId}`);
  },
  importQuotation: async (q) => {
    const res = await api<{ quotation: Quotation }>('POST', '/quotations', q);
    const saved = res.quotation ?? q;
    set({ quotations: [...get().quotations, saved] });
    return saved;
  },
  duplicateQuotation: async (id, opts) => {
    const original = get().quotations.find((q) => q.id === id);
    if (!original) return null;
    const targetProjectId = opts?.projectId ?? original.projectId;
    const sameProject = String(targetProjectId) === String(original.projectId);

    // Same-project duplicates bump the revision; cross-project duplicates start
    // fresh at "00". Either way, skip past any revision that already exists for
    // that (project, kind) — the server enforces no uniqueness on this pair.
    const siblingRevisions = get().quotations
      .filter((q) => String(q.projectId) === String(targetProjectId) && q.kind === original.kind)
      .map((q) => parseInt(q.revision, 10))
      .filter((n) => !Number.isNaN(n));
    let nextRevisionNum = sameProject ? parseInt(original.revision, 10) + 1 : 0;
    while (siblingRevisions.includes(nextRevisionNum)) nextRevisionNum += 1;

    const copy: Quotation = {
      ...original,
      id: nanoid(8),
      projectId: targetProjectId,
      revision: String(nextRevisionNum).padStart(2, '0'),
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

  updateSettings: async (patch) => {
    await api('PUT', '/settings', patch);
    set((s) => ({ settings: { ...s.settings, ...patch, defaultJobTitles: { ...s.settings.defaultJobTitles, ...patch.defaultJobTitles } } }));
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
