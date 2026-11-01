'use strict';

// Project updates log: a dated, append-only history per operations project
// ("sent shop drawings to ISTS", "panel delivered", "FAT done"). Anyone on the
// team posts from the project page; TJ's Claude agents post through an agent
// API key (server/agentAccess.js). Stored in `projects/{id}/updates`.
//
// An update can also move the project's status and site progress and set its
// PO number / PO date; the previous values are kept on the entry. Closing, cancelling or terminating a
// project stays a normal edit by a person.

const express = require('express');

const SUBCOLLECTION = 'updates';

const UPDATE_TYPES = ['Progress', 'Submittal', 'Site work', 'Delivery', 'Meeting', 'Client', 'Billing', 'Issue', 'Other'];

// Statuses an update may set, matching the operations dashboard vocabulary
// (dataService.getStatusColor). CLOSED/CANCELLED/TERMINATED stay human-only.
const UPDATE_STATUSES = ['NOT STARTED', 'IN PROGRESS', 'ON HOLD', 'SUSPENDED', 'COMPLETED'];

const NOTE_MAX = 2000;
const SHORT_MAX = 200;
const PO_NUMBER_MAX = 80;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// po_date is stored as Unix seconds (EditProjectDialog); accept that or YYYY-MM-DD.
const PO_DATE_MIN = Date.UTC(2000, 0, 1) / 1000;
const PO_DATE_MAX = Date.UTC(2100, 0, 1) / 1000;

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

const present = (v) => v !== undefined && v !== null && v !== '';

function isValidDate(d) {
  return ISO_DATE.test(d) && !Number.isNaN(Date.parse(d));
}

function parsePoDate(value) {
  const s = String(value).trim();
  let secs = null;
  if (isValidDate(s)) secs = Math.floor(Date.parse(s) / 1000);
  else if (/^\d+$/.test(s)) secs = Number(s);
  return secs !== null && secs >= PO_DATE_MIN && secs < PO_DATE_MAX ? secs : null;
}

// Validate an update body. Returns { error } or { update, projectPatch }.
function parseProjectUpdate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const note = cleanText(b.note, NOTE_MAX);
  if (!note) return { error: 'note is required' };

  const update = { note, type: 'Other' };
  const projectPatch = {};

  if (present(b.type)) {
    const type = UPDATE_TYPES.find((t) => t.toLowerCase() === String(b.type).trim().toLowerCase());
    if (!type) return { error: `type must be one of: ${UPDATE_TYPES.join(', ')}` };
    update.type = type;
  }
  if (present(b.date)) {
    const d = String(b.date).trim();
    if (!isValidDate(d)) return { error: 'date must be YYYY-MM-DD' };
    update.date = d;
  }
  if (present(b.status)) {
    const status = String(b.status).trim().toUpperCase();
    if (!UPDATE_STATUSES.includes(status)) return { error: `status must be one of: ${UPDATE_STATUSES.join(', ')}` };
    update.status = status;
    projectPatch.project_status = status;
  }
  if (present(b.progress)) {
    const progress = Number(b.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) return { error: 'progress must be a number from 0 to 100' };
    update.progress = Math.round(progress * 10) / 10;
    projectPatch.actual_site_progress_percent = update.progress;
  }
  if (present(b.po_number)) {
    const po = cleanText(b.po_number, PO_NUMBER_MAX);
    if (!po) return { error: 'po_number must not be blank' };
    update.po_number = po;
    projectPatch.po_number = po;
  }
  if (present(b.po_date)) {
    const secs = parsePoDate(b.po_date);
    if (secs === null) return { error: 'po_date must be YYYY-MM-DD or Unix seconds' };
    update.po_date = secs;
    projectPatch.po_date = secs;
    // The project edit dialog sets the start date to the PO date; do the same.
    projectPatch.start_date = secs;
  }
  if (present(b.next_step)) update.next_step = cleanText(b.next_step, SHORT_MAX);
  if (present(b.next_date)) {
    const d = String(b.next_date).trim();
    if (!isValidDate(d)) return { error: 'next_date must be YYYY-MM-DD' };
    update.next_date = d;
  }
  if (present(b.risk)) {
    const risk = String(b.risk).trim().toLowerCase();
    if (!['low', 'medium', 'high'].includes(risk)) return { error: 'risk must be low, medium or high' };
    update.risk = risk;
  }
  if (present(b.link)) {
    const link = cleanText(b.link, 500);
    if (!/^https:\/\//i.test(link)) return { error: 'link must start with https://' };
    update.link = link;
  }
  if (present(b.source)) update.source = cleanText(b.source, SHORT_MAX);

  return { update, projectPatch };
}

function posterOf(user) {
  return {
    posted_by: user.agentScope ? (user.name || 'Agent') : (user.username || user.name || String(user.id)),
    posted_by_id: String(user.id),
    posted_via: user.agentScope ? 'agent' : 'app',
  };
}

// Writes one update and applies its status/progress to the project.
async function addProjectUpdate({ db, projectId, parsed, user, syncOperationsStatusToCalcsheet, now = () => new Date() }) {
  const ref = db.collection('projects').doc(String(projectId));
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, status: 404, error: 'Project not found' };
  const before = doc.data() || {};
  const at = now().toISOString();

  const entry = {
    ...parsed.update,
    date: parsed.update.date || at.slice(0, 10),
    previous_status: before.project_status || '',
    previous_progress: Number(before.actual_site_progress_percent || 0),
    ...(parsed.update.po_number ? { previous_po_number: before.po_number || '' } : {}),
    ...(parsed.update.po_date ? { previous_po_date: before.po_date || null } : {}),
    ...posterOf(user),
    created_at: at,
  };
  const entryRef = await ref.collection(SUBCOLLECTION).add(entry);

  const latest = {
    id: entryRef.id,
    date: entry.date,
    type: entry.type,
    note: entry.note,
    by: entry.posted_by,
    via: entry.posted_via,
    at,
    ...(entry.next_step ? { next_step: entry.next_step } : {}),
    ...(entry.next_date ? { next_date: entry.next_date } : {}),
    ...(entry.risk ? { risk: entry.risk } : {}),
  };
  const patch = { ...parsed.projectPatch, latest_update: latest, updated_at: at };
  await ref.update(patch);
  if (syncOperationsStatusToCalcsheet && Object.keys(parsed.projectPatch).length) {
    await syncOperationsStatusToCalcsheet(ref.id, { ...before, ...patch });
  }
  return { ok: true, status: 201, update: { ...entry, id: entryRef.id } };
}

async function listProjectUpdates(db, projectId, limit = 100) {
  const ref = db.collection('projects').doc(String(projectId));
  const doc = await ref.get();
  if (!doc.exists) return null;
  const snap = await ref.collection(SUBCOLLECTION).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .sort((a, b) => `${b.date || ''}${b.created_at || ''}`.localeCompare(`${a.date || ''}${a.created_at || ''}`))
    .slice(0, limit);
}

// Staff roles that may post; viewers can read.
const POSTING_ROLES = ['superadmin', 'admin', 'user'];

function createProjectUpdatesRouter({ db, getCurrentUser, isActiveUser, syncOperationsStatusToCalcsheet }) {
  const router = express.Router();

  const currentUser = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !isActiveUser(user)) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }
    if (user.scannerScope) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return null;
    }
    return user;
  };

  router.get('/api/projects/:id/updates', async (req, res) => {
    try {
      if (!(await currentUser(req, res))) return;
      const updates = await listProjectUpdates(db, req.params.id);
      if (!updates) return res.status(404).json({ success: false, error: 'Project not found' });
      res.json({ success: true, updates, types: UPDATE_TYPES, statuses: UPDATE_STATUSES });
    } catch (err) {
      console.error('[project-updates] list failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  router.post('/api/projects/:id/updates', async (req, res) => {
    try {
      const user = await currentUser(req, res);
      if (!user) return;
      if (!user.agentScope && !POSTING_ROLES.includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Viewers cannot post updates' });
      }
      const parsed = parseProjectUpdate(req.body);
      if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
      const result = await addProjectUpdate({ db, projectId: req.params.id, parsed, user, syncOperationsStatusToCalcsheet });
      if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });
      res.status(201).json({ success: true, update: result.update });
    } catch (err) {
      console.error('[project-updates] post failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  // Only the poster (or a superadmin) may delete an entry. Status/progress it
  // set are not rolled back; that is a normal project edit.
  router.delete('/api/projects/:id/updates/:updateId', async (req, res) => {
    try {
      const user = await currentUser(req, res);
      if (!user) return;
      if (user.agentScope) return res.status(403).json({ success: false, error: 'Forbidden' });
      const projectRef = db.collection('projects').doc(String(req.params.id));
      const ref = projectRef.collection(SUBCOLLECTION).doc(String(req.params.updateId));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Update not found' });
      const entry = snap.data() || {};
      if (user.role !== 'superadmin' && String(entry.posted_by_id) !== String(user.id)) {
        return res.status(403).json({ success: false, error: 'Only the poster can delete this update' });
      }
      await ref.delete();
      const project = await projectRef.get();
      if (project.exists && project.data().latest_update && project.data().latest_update.id === snap.id) {
        const remaining = await listProjectUpdates(db, req.params.id, 1);
        const next = remaining && remaining[0];
        await projectRef.update({
          latest_update: next ? {
            id: next.id, date: next.date, type: next.type, note: next.note, by: next.posted_by, via: next.posted_via, at: next.created_at,
          } : null,
        });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[project-updates] delete failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  return router;
}

module.exports = {
  UPDATE_TYPES,
  UPDATE_STATUSES,
  parseProjectUpdate,
  addProjectUpdate,
  listProjectUpdates,
  createProjectUpdatesRouter,
};
