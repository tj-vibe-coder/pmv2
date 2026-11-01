'use strict';

// Calcsheet endpoints for agent keys (and staff sessions): look up clients,
// create a proposal (calcsheet project) and build its quotations. Agents work
// on drafts only:
//
// - A new proposal gets its PCS code from the shared sequence counter, exactly
//   as the app's "New project" does. Its status starts 'draft'; an agent may
//   move it between 'draft' and 'for_review' but never to sent/won/lost
//   (awarding stays a person's call through /api/calcsheet/projects/:id/award).
// - Quotations are seeded with the app's defaults for a new quotation, then the
//   agent's lines and settings are layered on. Updates snapshot the prior state
//   into calcsheet_quotation_versions, like a save in the editor, and an
//   awarded (price-locked) quotation answers 409.
// - The OneDrive proposal folder is not created here (it needs a person's
//   OneDrive sign-in); open the project in the app to create or link it.

const crypto = require('node:crypto');
const express = require('express');
const { AWARD_LOCK_FIELDS } = require('./calcsheetAward');

const AGENT_STATUSES = ['draft', 'for_review'];
const KINDS = ['IOCT', 'ACTI'];
const SCOPES = ['supply', 'services', 'both'];
const GRADES = ['A', 'B', 'C'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINES = 500;
const APP_URL = 'https://pmv2-851ae.web.app';

const STARTER_GENERAL_REQTS = [
  'Mobilization / Demobilization',
  'Accommodation',
  'Tools & Equipment',
  'PPE and other Safety Requirements',
  'Documentation and As-built Drawing',
  'General Contingency',
  'Project Management',
];

class InputError extends Error {}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function cleanLongText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function shortId() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

function lineCode(prefix, index) {
  return `${prefix}-${String((index + 1) * 10).padStart(4, '0')}`;
}

// A number field: undefined keeps the fallback; anything else must be finite
// and inside [min, max].
function numberField(value, name, { min = 0, max = 1e12, fallback } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${name} must be a number from ${min} to ${max}`);
  return n;
}

function linesArray(value, name) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new InputError(`${name} must be an array`);
  if (value.length > MAX_LINES) throw new InputError(`${name} allows at most ${MAX_LINES} lines`);
  return value;
}

function headerFlags(l) {
  if (l.isChildHeader) return { isChildHeader: true };
  if (l.isHeader) return { isHeader: true };
  return null;
}

function normalizeGeneralReqts(lines) {
  return lines.map((l, i) => {
    const description = cleanText(l && l.description, 300);
    if (!description) throw new InputError(`generalReqts[${i}].description is required`);
    const line = {
      id: shortId(),
      code: lineCode('A', i),
      description,
      unitPrice: numberField(l.unitPrice, `generalReqts[${i}].unitPrice`, { fallback: 0 }),
      qty: numberField(l.qty, `generalReqts[${i}].qty`, { fallback: 1 }),
      uom: cleanText(l.uom, 20) || 'lot',
    };
    const markup = numberField(l.markupPct, `generalReqts[${i}].markupPct`, { max: 1000 });
    if (markup !== undefined) line.markupPct = markup;
    return line;
  });
}

function normalizeComponents(lines) {
  return lines.map((l, i) => {
    const description = cleanText(l && l.description, 500);
    if (!description) throw new InputError(`components[${i}].description is required`);
    const header = headerFlags(l);
    if (header) return { id: shortId(), code: lineCode('B', i), description, qty: 0, uom: '', unitCost: 0, forex: 1, contingencyPct: 0, discountPct: 0, ...header };
    const line = {
      id: shortId(),
      code: lineCode('B', i),
      description,
      brand: cleanText(l.brand, 80),
      partNo: cleanText(l.partNo, 80),
      qty: numberField(l.qty, `components[${i}].qty`, { fallback: 1 }),
      uom: cleanText(l.uom, 20) || 'pc',
      unitCost: numberField(l.unitCost, `components[${i}].unitCost`, { fallback: 0 }),
      forex: numberField(l.forex, `components[${i}].forex`, { min: 0.0001, max: 10000, fallback: 1 }),
      contingencyPct: numberField(l.contingencyPct, `components[${i}].contingencyPct`, { max: 1000, fallback: 0 }),
      discountPct: numberField(l.discountPct, `components[${i}].discountPct`, { max: 100, fallback: 0 }),
    };
    const markup = numberField(l.markupPct, `components[${i}].markupPct`, { max: 1000 });
    if (markup !== undefined) line.markupPct = markup;
    const lead = numberField(l.leadTimeDays, `components[${i}].leadTimeDays`, { max: 3650 });
    if (lead !== undefined) line.leadTimeDays = lead;
    const group = cleanText(l.group, 80);
    if (group) line.group = group;
    const subheader = cleanText(l.subheader, 120);
    if (subheader) line.subheader = subheader;
    const note = cleanText(l.internalNote, 500);
    if (note) line.internalNote = note;
    if (l.optional === true) line.optional = true;
    return line;
  });
}

function normalizeServices(lines) {
  return lines.map((l, i) => {
    const description = cleanText(l && l.description, 500);
    if (!description) throw new InputError(`services[${i}].description is required`);
    const header = headerFlags(l);
    if (header) return { id: shortId(), code: lineCode('C', i), description, amount: 0, ...header };
    const qty = numberField(l.qty, `services[${i}].qty`, { fallback: 1 });
    const unitPrice = numberField(l.unitPrice, `services[${i}].unitPrice`);
    const amount = numberField(l.amount, `services[${i}].amount`, { fallback: unitPrice !== undefined ? qty * unitPrice : 0 });
    const line = { id: shortId(), code: lineCode('C', i), description, amount, qty, uom: cleanText(l.uom, 20) || 'lot' };
    if (unitPrice !== undefined) line.unitPrice = unitPrice;
    const group = cleanText(l.group, 80);
    if (group) line.group = group;
    const subheader = cleanText(l.subheader, 120);
    if (subheader) line.subheader = subheader;
    const note = cleanText(l.internalNote, 500);
    if (note) line.internalNote = note;
    return line;
  });
}

function normalizeManpower(lines) {
  return lines.map((l, i) => {
    const role = cleanText(l && l.role, 80);
    if (!role) throw new InputError(`manpower[${i}].role is required`);
    const group = l.group === 'labor' ? 'labor' : 'engineering';
    return {
      id: shortId(),
      role,
      group,
      headcount: numberField(l.headcount, `manpower[${i}].headcount`, { max: 1000, fallback: 1 }),
      mandays: numberField(l.mandays, `manpower[${i}].mandays`, { max: 10000, fallback: 1 }),
      dailyRate: numberField(l.dailyRate, `manpower[${i}].dailyRate`, { fallback: 0 }),
      allowance: numberField(l.allowance, `manpower[${i}].allowance`, { fallback: 0 }),
      presetId: null,
    };
  });
}

// Scalar quotation settings an agent may set, with their checks.
function quotationSettings(body) {
  const out = {};
  const pct = (key, max = 1000) => {
    const v = numberField(body[key], key, { max });
    if (v !== undefined) out[key] = v;
  };
  ['productMarkupPct', 'laborMarkupPct', 'generalReqMarkupPct', 'productContingencyPct', 'globalContingencyPct', 'ewtPct'].forEach((k) => pct(k));
  pct('discountPct', 100);
  pct('vatPct', 100);
  const validity = numberField(body.validityDays, 'validityDays', { max: 365 });
  if (validity !== undefined) out.validityDays = validity;
  const warranty = numberField(body.warrantyMonths, 'warrantyMonths', { max: 120 });
  if (warranty !== undefined) out.warrantyMonths = warranty;
  const deliveryFee = numberField(body.deliveryFee, 'deliveryFee');
  if (deliveryFee !== undefined) out.deliveryFee = deliveryFee;
  if (typeof body.nonVat === 'boolean') out.nonVat = body.nonVat;
  if (typeof body.deliveryTermsEnabled === 'boolean') out.deliveryTermsEnabled = body.deliveryTermsEnabled;
  for (const key of ['paymentTerms', 'deliveryTerms', 'preparedBy', 'preparedByTitle', 'authorizedBy']) {
    if (body[key] !== undefined) out[key] = cleanText(body[key], 300);
  }
  if (body.notes !== undefined) out.notes = cleanLongText(body.notes, 4000);
  for (const key of ['dateSent', 'expectedPurchaseDate']) {
    if (body[key] === undefined || body[key] === '') continue;
    if (!validDate(String(body[key]))) throw new InputError(`${key} must be YYYY-MM-DD`);
    out[key] = String(body[key]);
  }
  if (body.terms !== undefined) {
    if (!body.terms || typeof body.terms !== 'object') throw new InputError('terms must be an object');
    const terms = {};
    for (const key of ['scopeOfWork', 'exclusions', 'basisOfProposal', 'deliveryLines', 'warrantyExclusion']) {
      if (body.terms[key] !== undefined) terms[key] = cleanLongText(body.terms[key], 8000);
    }
    out.termsOverrides = terms;
  }
  return out;
}

// Line arrays from the body, normalized; only the arrays that were sent.
function quotationLines(body) {
  const out = {};
  const gr = linesArray(body.generalReqts, 'generalReqts');
  if (gr) out.generalReqts = normalizeGeneralReqts(gr);
  const comps = linesArray(body.components, 'components');
  if (comps) out.components = normalizeComponents(comps);
  const svc = linesArray(body.services, 'services');
  if (svc) out.services = normalizeServices(svc);
  const mp = linesArray(body.manpower, 'manpower');
  if (mp) out.manpower = normalizeManpower(mp);
  return out;
}

// The app's defaults for a new quotation (src/store/quotationStore.ts blankQuotation).
function blankQuotation(projectId, kind, recipientId, scopeCategory, signatory) {
  return {
    projectId,
    kind,
    scopeCategory,
    revision: '00',
    recipientId,
    validityDays: 30,
    paymentTerms: '30% Downpayment, 70% Progress Billing',
    deliveryTerms: 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.',
    warrantyMonths: 12,
    productMarkupPct: 30,
    productContingencyPct: 0,
    laborMarkupPct: 100,
    generalReqMarkupPct: 0,
    ...(kind === 'IOCT' ? { ewtPct: 5 } : {}),
    globalContingencyPct: 0,
    discountPct: 0,
    vatPct: 0,
    nonVat: kind === 'IOCT',
    deliveryTermsEnabled: scopeCategory !== 'services',
    generalReqts: scopeCategory === 'supply' ? [] : normalizeGeneralReqts(STARTER_GENERAL_REQTS.map((description) => ({ description, unitPrice: 0, qty: 1, uom: 'lot' }))),
    components: [],
    services: [],
    manpower: [],
    servicesFromManpower: true,
    engineeringServicesQty: 1,
    exportGeneralReqtsAsLot: true,
    generalReqtsExportQty: 1,
    pageBreakBeforeTerms: false,
    preparedBy: signatory,
    authorizedBy: signatory,
  };
}

// Services price from manpower when manpower is given, else from the service
// lines' own amounts.
function servicesMode(q) {
  const manpower = Array.isArray(q.manpower) ? q.manpower : [];
  return { servicesFromManpower: manpower.length > 0, servicesPerLinePricing: false };
}

function projectView(id, p) {
  return {
    id,
    code: p.code || '',
    name: p.name || '',
    location: p.location || '',
    date: p.date || null,
    customerId: p.customerId || null,
    status: p.status || '',
    opportunityGrade: p.opportunityGrade || null,
    notes: p.notes || '',
    mainProjectId: p.mainProjectId || null,
    createdByName: p.createdByName || '',
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
    url: `${APP_URL}/sales/calcsheet/projects/${id}`,
  };
}

function createAgentCalcsheetRouter({ db, getCurrentUser, isActiveUser, nextProjectSeq, grandTotal, isAwardLocked, validateTiming }) {
  const router = express.Router();

  const requireAgentOrStaff = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !isActiveUser(user)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }
    if (user.scannerScope || (!user.agentScope && !['superadmin', 'admin', 'user'].includes(user.role))) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return null;
    }
    return user;
  };

  const actorName = (user) => user.full_name || user.name || user.username || String(user.id);
  const fail = (res, err, what) => {
    if (err instanceof InputError) return res.status(400).json({ success: false, error: err.message });
    console.error(`[agent] ${what} failed:`, err);
    return res.status(500).json({ success: false, error: 'Database error' });
  };

  const quotationView = (id, q) => {
    const { id: _stored, ...data } = q;
    return { ...data, id, grandTotal: Math.round(grandTotal(q) * 100) / 100, url: `${APP_URL}/sales/calcsheet/quotations/${id}` };
  };

  async function findClient(ref) {
    const key = cleanText(ref, 80);
    if (!key) return null;
    const byId = await db.collection('clients').doc(key).get();
    if (byId.exists) return { id: byId.id, ...(byId.data() || {}) };
    const snap = await db.collection('clients').where('code', '==', key.toUpperCase()).get();
    const d = snap.docs[0];
    return d ? { id: d.id, ...(d.data() || {}) } : null;
  }

  // Clients without their contact details: an agent needs only the id and code.
  router.get('/api/agent/clients', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const snap = await db.collection('clients').get();
      const clients = snap.docs
        .map((d) => { const c = d.data() || {}; return { id: d.id, code: c.code || '', name: c.name || '' }; })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ success: true, clients });
    } catch (err) { fail(res, err, 'list clients'); }
  });

  router.get('/api/agent/calcsheet/projects', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const snap = await db.collection('calcsheet_projects').get();
      const projects = snap.docs
        .map((d) => projectView(d.id, d.data() || {}))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ success: true, projects });
    } catch (err) { fail(res, err, 'list calcsheet projects'); }
  });

  router.get('/api/agent/calcsheet/projects/:id', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const id = String(req.params.id);
      const doc = await db.collection('calcsheet_projects').doc(id).get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Proposal not found' });
      const qs = await db.collection('calcsheet_quotations').where('projectId', '==', id).get();
      const quotations = qs.docs.map((d) => quotationView(d.id, d.data() || {}))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ success: true, project: projectView(doc.id, doc.data() || {}), quotations });
    } catch (err) { fail(res, err, 'get calcsheet project'); }
  });

  router.post('/api/agent/calcsheet/projects', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const body = req.body || {};
      const name = cleanText(body.name, 200);
      if (!name) throw new InputError('name is required');
      const client = await findClient(body.customerId || body.customer_code);
      if (!client) throw new InputError('customerId (a client id or 3-letter code from GET /api/agent/clients) is required and must exist');
      const date = body.date === undefined || body.date === '' ? new Date().toISOString().slice(0, 10) : String(body.date);
      if (!validDate(date)) throw new InputError('date must be YYYY-MM-DD');
      const status = body.status === undefined ? 'draft' : String(body.status);
      if (!AGENT_STATUSES.includes(status)) throw new InputError(`status must be one of: ${AGENT_STATUSES.join(', ')}`);
      let grade;
      if (body.opportunityGrade !== undefined && body.opportunityGrade !== null && body.opportunityGrade !== '') {
        grade = String(body.opportunityGrade).toUpperCase();
        if (!GRADES.includes(grade)) throw new InputError('opportunityGrade must be A, B or C');
      }

      const seq = await nextProjectSeq();
      const cli = String(client.code || 'XXX').toUpperCase().slice(0, 3).padEnd(3, 'X');
      const code = `PCS${date.slice(2, 4)}${date.slice(5, 7)}${String(seq).padStart(3, '0')}-${cli}-00`;
      const now = new Date().toISOString();
      const data = {
        code,
        name,
        location: cleanText(body.location, 200),
        date,
        customerId: client.id,
        partnerId: null,
        salesContactId: null,
        status,
        notes: cleanLongText(body.notes, 4000),
        ...(grade ? { opportunityGrade: grade } : {}),
        createdBy: String(user.id),
        createdByName: actorName(user),
        createdVia: user.agentScope ? 'agent' : 'user',
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection('calcsheet_projects').add(data);
      res.status(201).json({ success: true, project: projectView(ref.id, data) });
    } catch (err) { fail(res, err, 'create calcsheet project'); }
  });

  router.put('/api/agent/calcsheet/projects/:id', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const ref = db.collection('calcsheet_projects').doc(String(req.params.id));
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Proposal not found' });
      const prev = doc.data() || {};
      if (!AGENT_STATUSES.includes(prev.status)) return res.status(409).json({ success: false, error: `Proposal is '${prev.status}'; agents edit draft or for_review proposals only` });
      const body = req.body || {};
      const patch = {};
      if (body.name !== undefined) {
        patch.name = cleanText(body.name, 200);
        if (!patch.name) throw new InputError('name cannot be empty');
      }
      if (body.location !== undefined) patch.location = cleanText(body.location, 200);
      if (body.notes !== undefined) patch.notes = cleanLongText(body.notes, 4000);
      if (body.status !== undefined) {
        if (!AGENT_STATUSES.includes(String(body.status))) throw new InputError(`status must be one of: ${AGENT_STATUSES.join(', ')}`);
        patch.status = String(body.status);
      }
      if (body.opportunityGrade !== undefined) {
        const grade = String(body.opportunityGrade || '').toUpperCase();
        if (!GRADES.includes(grade)) throw new InputError('opportunityGrade must be A, B or C');
        patch.opportunityGrade = grade;
      }
      if (!Object.keys(patch).length) throw new InputError('Nothing to update (name, location, notes, status, opportunityGrade)');
      patch.updatedAt = new Date().toISOString();
      await ref.update(patch);
      res.json({ success: true, project: projectView(doc.id, { ...prev, ...patch }) });
    } catch (err) { fail(res, err, 'update calcsheet project'); }
  });

  router.post('/api/agent/calcsheet/projects/:id/quotations', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const projectId = String(req.params.id);
      const doc = await db.collection('calcsheet_projects').doc(projectId).get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Proposal not found' });
      const project = doc.data() || {};
      if (!AGENT_STATUSES.includes(project.status)) return res.status(409).json({ success: false, error: `Proposal is '${project.status}'; agents add quotations to draft or for_review proposals only` });
      const body = req.body || {};
      const kind = String(body.kind || 'IOCT').toUpperCase();
      if (!KINDS.includes(kind)) throw new InputError('kind must be IOCT or ACTI');
      const scope = String(body.scopeCategory || 'both');
      if (!SCOPES.includes(scope)) throw new InputError('scopeCategory must be supply, services or both');
      let recipientId = project.customerId || null;
      if (body.recipientId) {
        const client = await findClient(body.recipientId);
        if (!client) throw new InputError('recipientId must be an existing client id or code');
        recipientId = client.id;
      }
      let revision = '00';
      if (body.revision !== undefined) {
        revision = cleanText(body.revision, 12);
        if (!/^[0-9A-Za-z-]{1,12}$/.test(revision)) throw new InputError('revision must be like 00, 01 or 00-OPT1');
      }

      const settings = quotationSettings(body);
      const lines = quotationLines(body);
      const now = new Date().toISOString();
      const q = {
        ...blankQuotation(projectId, kind, recipientId, scope, actorName(user)),
        ...settings,
        ...lines,
        revision,
        createdVia: user.agentScope ? 'agent' : 'user',
        createdByName: actorName(user),
        createdAt: now,
        updatedAt: now,
      };
      Object.assign(q, servicesMode(q));
      AWARD_LOCK_FIELDS.forEach((k) => { delete q[k]; });
      const timingError = validateTiming ? validateTiming(q) : null;
      if (timingError) throw new InputError(timingError);
      const ref = await db.collection('calcsheet_quotations').add(q);
      res.status(201).json({ success: true, quotation: quotationView(ref.id, q) });
    } catch (err) { fail(res, err, 'create quotation'); }
  });

  router.put('/api/agent/calcsheet/quotations/:id', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const id = String(req.params.id);
      const ref = db.collection('calcsheet_quotations').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Quotation not found' });
      const { id: _stored, ...prev } = doc.data() || {};
      if (isAwardLocked(prev)) return res.status(409).json({ success: false, error: 'This quotation was awarded, so its price is locked.' });
      const project = await db.collection('calcsheet_projects').doc(String(prev.projectId)).get();
      const status = project.exists ? (project.data() || {}).status : null;
      if (!AGENT_STATUSES.includes(status)) return res.status(409).json({ success: false, error: `Proposal is '${status}'; agents edit quotations on draft or for_review proposals only` });

      const body = req.body || {};
      const patch = { ...quotationSettings(body), ...quotationLines(body) };
      if (!Object.keys(patch).length) throw new InputError('Nothing to update');
      // Re-derive the services mode only when the agent changed those lines, so
      // a pricing mode picked in the editor is left alone otherwise.
      if (patch.services || patch.manpower) Object.assign(patch, servicesMode({ ...prev, ...patch }));
      const timingError = validateTiming ? validateTiming({ ...prev, ...patch }) : null;
      if (timingError) throw new InputError(timingError);
      patch.updatedAt = new Date().toISOString();

      try {
        await db.collection('calcsheet_quotation_versions').add({
          quotationId: id,
          projectId: prev.projectId || null,
          savedAt: patch.updatedAt,
          savedBy: actorName(user),
          remarks: cleanText(body.remarks, 500) || null,
          data: prev,
        });
      } catch (verErr) {
        console.warn('[agent] quotation version snapshot failed (non-blocking):', verErr && verErr.message);
      }
      await ref.update(patch);
      res.json({ success: true, quotation: quotationView(id, { ...prev, ...patch }) });
    } catch (err) { fail(res, err, 'update quotation'); }
  });

  return router;
}

module.exports = { AGENT_STATUSES, createAgentCalcsheetRouter };
