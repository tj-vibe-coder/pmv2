'use strict';

const { randomUUID } = require('node:crypto');

const OPPORTUNITY_COLLECTION = 'calcsheet_projects';

const PROPOSABLE_FIELDS = {
  status: {
    type: 'enum',
    values: ['draft', 'for_review', 'sent', 'inactive'],
  },
  opportunityGrade: {
    type: 'enum',
    values: ['A', 'B', 'C'],
  },
  notes: {
    type: 'string',
    max: 2000,
  },
};

const BLOCKED_STATUS_VALUES = ['won', 'lost'];
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function currentFieldValue(record, field) {
  if (!record || !Object.prototype.hasOwnProperty.call(record, field)) {
    return null;
  }
  const value = record[field];
  return value === undefined ? null : value;
}

function normalizeProposedValue(field, raw) {
  const spec = PROPOSABLE_FIELDS[field];
  if (!spec) {
    const error = new Error('field_not_allowed');
    error.code = 'field_not_allowed';
    throw error;
  }
  if (spec.type === 'enum') {
    if (typeof raw !== 'string' || !spec.values.includes(raw)) {
      const error = new Error('invalid_value');
      error.code = 'invalid_value';
      throw error;
    }
    return raw;
  }
  if (typeof raw !== 'string') {
    const error = new Error('invalid_value');
    error.code = 'invalid_value';
    throw error;
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > spec.max) {
    const error = new Error('invalid_value');
    error.code = 'invalid_value';
    throw error;
  }
  return trimmed;
}

function createProposalStore({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const map = new Map();

  function prune() {
    const t = now();
    for (const [id, proposal] of map) {
      if (proposal.expiresAt <= t) map.delete(id);
    }
  }

  function create(partial) {
    prune();
    const id = randomUUID();
    const proposal = {
      id,
      userId: String(partial.userId),
      kind: 'opportunity',
      recordId: String(partial.recordId),
      label: String(partial.label || partial.recordId),
      field: String(partial.field),
      currentValue: partial.currentValue === undefined ? null : partial.currentValue,
      proposedValue: partial.proposedValue,
      reason: typeof partial.reason === 'string' ? partial.reason.slice(0, 400) : '',
      createdAt: now(),
      expiresAt: now() + ttlMs,
    };
    map.set(id, proposal);
    return proposal;
  }

  function get(id) {
    prune();
    return map.get(id) || null;
  }

  function take(id) {
    prune();
    const proposal = map.get(id) || null;
    if (proposal) map.delete(id);
    return proposal;
  }

  return { create, get, take, prune };
}

function publicProposal(proposal) {
  return {
    proposalId: proposal.id,
    applied: false,
    kind: proposal.kind,
    recordId: proposal.recordId,
    label: proposal.label,
    field: proposal.field,
    currentValue: proposal.currentValue,
    proposedValue: proposal.proposedValue,
    reason: proposal.reason,
    expiresAt: new Date(proposal.expiresAt).toISOString(),
    confirmHint: 'Tap Apply, or say apply that change. This has not been saved yet.',
  };
}

async function proposeOpportunityUpdate({ db, store, user, args, asOf }) {
  if (!user || !user.id) {
    const error = new Error('unauthenticated');
    error.code = 'unauthenticated';
    throw error;
  }
  if (!isPlainObject(args) || typeof args.opportunityId !== 'string' || !args.opportunityId) {
    const error = new Error('invalid_value');
    error.code = 'invalid_value';
    throw error;
  }
  if (typeof args.field !== 'string' || !(args.field in PROPOSABLE_FIELDS)) {
    const error = new Error('field_not_allowed');
    error.code = 'field_not_allowed';
    throw error;
  }
  if (args.field === 'status' && BLOCKED_STATUS_VALUES.includes(args.value)) {
    const error = new Error('field_not_allowed');
    error.code = 'field_not_allowed';
    throw error;
  }

  const proposedValue = normalizeProposedValue(args.field, args.value);
  const snap = await db.collection(OPPORTUNITY_COLLECTION).doc(String(args.opportunityId)).get();
  if (!snap.exists) {
    return { data: { applied: false, error: 'not_found' }, sources: [], asOf };
  }
  const record = { id: snap.id, ...(snap.data() || {}) };
  const currentValue = currentFieldValue(record, args.field);
  if (currentValue === proposedValue) {
    return {
      data: {
        applied: false,
        error: 'unchanged',
        field: args.field,
        currentValue,
        proposedValue,
      },
      sources: [],
      asOf,
    };
  }

  const proposal = store.create({
    userId: user.id,
    recordId: snap.id,
    label: record.name || record.code || snap.id,
    field: args.field,
    currentValue,
    proposedValue,
    reason: args.reason,
  });

  return {
    data: publicProposal(proposal),
    sources: [{
      id: snap.id,
      label: proposal.label,
      route: `/sales/calcsheet/projects/${snap.id}`,
      asOf,
    }],
    asOf,
  };
}

function assertOwnedProposal(store, user, proposalId) {
  if (!user || !user.id) {
    return { ok: false, status: 401, error: 'unauthenticated' };
  }
  if (typeof proposalId !== 'string' || !proposalId) {
    return { ok: false, status: 400, error: 'invalid_request' };
  }
  const proposal = store.get(proposalId);
  if (!proposal) {
    return { ok: false, status: 404, error: 'proposal_not_found' };
  }
  if (String(proposal.userId) !== String(user.id)) {
    return { ok: false, status: 403, error: 'not_allowlisted' };
  }
  return { ok: true, proposal };
}

async function confirmOpportunityProposal({ db, store, user, proposalId }) {
  const auth = assertOwnedProposal(store, user, proposalId);
  if (!auth.ok) return auth;

  const proposal = auth.proposal;
  const ref = db.collection(OPPORTUNITY_COLLECTION).doc(proposal.recordId);
  const snap = await ref.get();
  if (!snap.exists) {
    store.take(proposal.id);
    return { ok: false, status: 404, error: 'not_found' };
  }
  const record = snap.data() || {};
  const liveValue = currentFieldValue({ ...record, id: snap.id }, proposal.field);
  if (liveValue !== proposal.currentValue) {
    return { ok: false, status: 409, error: 'stale_proposal' };
  }

  const update = {
    [proposal.field]: proposal.proposedValue,
    updatedAt: new Date().toISOString(),
  };
  await ref.update(update);
  store.take(proposal.id);
  return {
    ok: true,
    status: 200,
    data: {
      applied: true,
      proposalId: proposal.id,
      kind: proposal.kind,
      recordId: proposal.recordId,
      label: proposal.label,
      field: proposal.field,
      currentValue: proposal.currentValue,
      proposedValue: proposal.proposedValue,
    },
  };
}

function rejectOpportunityProposal({ store, user, proposalId }) {
  const auth = assertOwnedProposal(store, user, proposalId);
  if (!auth.ok) return auth;
  store.take(auth.proposal.id);
  return {
    ok: true,
    status: 200,
    data: { applied: false, rejected: true, proposalId: auth.proposal.id },
  };
}

module.exports = {
  PROPOSABLE_FIELDS,
  BLOCKED_STATUS_VALUES,
  createProposalStore,
  proposeOpportunityUpdate,
  confirmOpportunityProposal,
  rejectOpportunityProposal,
  publicProposal,
};
