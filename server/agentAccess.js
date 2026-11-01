'use strict';

// Agent API keys: long-lived, revocable credentials for automated agents
// (TJ's scheduled Claude agents) that read projects and post progress notes
// without a person's login session.
//
// - A key looks like `agk_<64 hex>`. Only its SHA-256 hash is stored, as the
//   doc id in `agent_keys`; the plain key is shown once when minted.
// - A key resolves to a synthetic user with `agentScope: true` and role
//   'agent'. The /api gate (server/apiAccess.js) limits such users to
//   AGENT_ROUTES, and no role check in the app grants anything to 'agent'.
// - Agents never edit project fields directly. They read the compact views at
//   GET /api/agent/projects[/:id[/schedule]] and post to the shared project
//   updates log (server/projectUpdates.js), which applies only status / site
//   progress / PO number / PO date.
// - Superadmins mint, list and revoke keys through /api/agent-keys from a
//   normal login session.

const crypto = require('node:crypto');
const express = require('express');

const AGENT_KEY_PREFIX = 'agk_';
const KEY_COLLECTION = 'agent_keys';
const LAST_USED_WRITE_INTERVAL_MS = 60 * 60 * 1000;

function hashAgentKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function mintAgentKey() {
  const key = AGENT_KEY_PREFIX + crypto.randomBytes(32).toString('hex');
  return { key, hash: hashAgentKey(key) };
}

function isAgentKey(token) {
  return typeof token === 'string' && token.startsWith(AGENT_KEY_PREFIX) && token.length === AGENT_KEY_PREFIX.length + 64;
}

function agentUserFromKeyDoc(id, data) {
  return {
    id: `agent_${id.slice(0, 12)}`,
    username: `agent:${data.name || 'unnamed'}`,
    name: data.name || 'Agent',
    role: 'agent',
    approved: 1,
    agentScope: true,
    agentKeyId: id,
  };
}

// Resolve a Bearer token to an agent user, or null. Revoked keys are null.
async function lookupAgentKey(db, token, now = Date.now()) {
  if (!isAgentKey(token)) return null;
  const hash = hashAgentKey(token);
  const ref = db.collection(KEY_COLLECTION).doc(hash);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.revokedAt) return null;
  const last = Date.parse(data.lastUsedAt || '') || 0;
  if (now - last > LAST_USED_WRITE_INTERVAL_MS) {
    ref.update({ lastUsedAt: new Date(now).toISOString() }).catch(() => {});
  }
  return agentUserFromKeyDoc(hash, data);
}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

// The compact view agents read: enough to judge status, schedule and billing.
function agentProjectView(id, p) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    id,
    ovp_number: p.ovp_number || '',
    po_number: p.po_number || '',
    po_date: p.po_date || null,
    project_name: p.project_name || '',
    account_name: p.account_name || '',
    with_acti: !!p.with_acti,
    project_status: p.project_status || '',
    actual_site_progress_percent: num(p.actual_site_progress_percent),
    start_date: p.start_date || null,
    completion_date: p.completion_date || null,
    updated_completion_date: p.updated_completion_date || null,
    updated_contract_amount: num(p.updated_contract_amount || p.contract_amount),
    contract_billed: num(p.contract_billed),
    project_director: p.project_director || '',
    remarks: p.remarks || '',
    latest_update: p.latest_update || null,
    updated_at: p.updated_at || null,
  };
}

function createAgentRouter({ db, getCurrentUser, isActiveUser }) {
  const router = express.Router();

  const requireAgentOrStaff = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !isActiveUser(user)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }
    if (user.scannerScope) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return null;
    }
    if (!user.agentScope && !['superadmin', 'admin', 'user'].includes(user.role)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return null;
    }
    return user;
  };

  const requireSuperadminSession = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !isActiveUser(user) || user.agentScope || user.scannerScope || user.role !== 'superadmin') {
      res.status(403).json({ success: false, error: 'Superadmin only' });
      return null;
    }
    return user;
  };

  // ---- Agent-facing ----

  router.get('/api/agent/projects', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const snap = await db.collection('projects').get();
      let rows = snap.docs.map((d) => agentProjectView(d.id, d.data() || {}));
      if (String(req.query.active || '') === '1') {
        const closed = new Set(['CLOSED', 'COMPLETED', 'CANCELLED', 'TERMINATED']);
        rows = rows.filter((r) => !closed.has(String(r.project_status).toUpperCase()) || (r.actual_site_progress_percent >= 100 && r.contract_billed < r.updated_contract_amount));
      }
      rows.sort((a, b) => String(b.ovp_number).localeCompare(String(a.ovp_number)));
      res.json({ success: true, projects: rows });
    } catch (err) {
      console.error('[agent] list projects failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  router.get('/api/agent/projects/:id', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const doc = await db.collection('projects').doc(String(req.params.id)).get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Project not found' });
      res.json({ success: true, project: agentProjectView(doc.id, doc.data() || {}) });
    } catch (err) {
      console.error('[agent] get project failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  // The project's schedule, as GET /api/schedule-tasks?projectId= returns it.
  router.get('/api/agent/projects/:id/schedule', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const id = String(req.params.id);
      const doc = await db.collection('projects').doc(id).get();
      if (!doc.exists) return res.status(404).json({ success: false, error: 'Project not found' });
      const snap = await db.collection('calcsheet_schedule_tasks').where('projectId', '==', id).get();
      const tasks = snap.docs.map((d) => { const { id: _id, ...data } = d.data(); return { ...data, id: d.id }; });
      tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.startDate || '').localeCompare(String(b.startDate || '')));
      res.json({ success: true, tasks });
    } catch (err) {
      console.error('[agent] get schedule failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  // ---- Key management (superadmin login session only) ----

  router.post('/api/agent-keys', async (req, res) => {
    try {
      const user = await requireSuperadminSession(req, res);
      if (!user) return;
      const name = cleanText(req.body && req.body.name, 80);
      if (!name) return res.status(400).json({ success: false, error: 'name is required' });
      const { key, hash } = mintAgentKey();
      const now = new Date().toISOString();
      await db.collection(KEY_COLLECTION).doc(hash).set({
        name,
        createdAt: now,
        createdBy: user.username || String(user.id),
        lastUsedAt: null,
        revokedAt: null,
      });
      // The plain key is returned exactly once and never stored.
      res.status(201).json({ success: true, id: hash.slice(0, 12), name, key });
    } catch (err) {
      console.error('[agent] mint key failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  router.get('/api/agent-keys', async (req, res) => {
    try {
      if (!(await requireSuperadminSession(req, res))) return;
      const snap = await db.collection(KEY_COLLECTION).get();
      const keys = snap.docs.map((d) => {
        const k = d.data() || {};
        return { id: d.id.slice(0, 12), name: k.name, createdAt: k.createdAt, createdBy: k.createdBy, lastUsedAt: k.lastUsedAt || null, revokedAt: k.revokedAt || null };
      }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ success: true, keys });
    } catch (err) {
      console.error('[agent] list keys failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  router.delete('/api/agent-keys/:id', async (req, res) => {
    try {
      const user = await requireSuperadminSession(req, res);
      if (!user) return;
      const prefix = String(req.params.id || '').toLowerCase();
      if (!/^[0-9a-f]{12}$/.test(prefix)) return res.status(400).json({ success: false, error: 'Bad key id' });
      const snap = await db.collection(KEY_COLLECTION).get();
      const match = snap.docs.find((d) => d.id.startsWith(prefix));
      if (!match) return res.status(404).json({ success: false, error: 'Key not found' });
      await match.ref.update({ revokedAt: new Date().toISOString(), revokedBy: user.username || String(user.id) });
      res.json({ success: true });
    } catch (err) {
      console.error('[agent] revoke key failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  return router;
}

module.exports = {
  AGENT_KEY_PREFIX,
  hashAgentKey,
  mintAgentKey,
  isAgentKey,
  lookupAgentKey,
  agentProjectView,
  createAgentRouter,
};
