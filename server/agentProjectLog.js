'use strict';

// Email log and action items for agent keys (and staff sessions).
//
// - Emails: every email an agent reads about a project is logged in
//   `project_emails`, one doc per (project, message_id). The doc id is a hash
//   of the pair, so re-sending the same email is a no-op.
// - Action items: to-dos the agent pulls from those emails. They are ordinary
//   whiteboard items (`whiteboard_items`, kind 'todo', the shared General board
//   under the Project list, linked to the project), so they show on the
//   Whiteboard with no UI change. An optional `source_ref` makes re-posting the
//   same item a no-op. Anyone may tick them on the board, as with any General
//   item; only the agent that posted one may change its text or due date.

const crypto = require('node:crypto');
const express = require('express');
const { addSubtask, addUpdate, applyDoneTransition } = require('./whiteboardRules');

const EMAIL_COLLECTION = 'project_emails';
const WB_COLLECTION = 'whiteboard_items';
const DIRECTIONS = ['inbound', 'outbound'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIST = 200;
// Board people (src/types/Whiteboard.ts WHITEBOARD_PEOPLE) and their tags.
const OWNER_TAGS = { tj: 'TJC', rj: 'RJR', renzel: 'RPP', nylle: 'NDM', kim: 'KKS' };

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

function hash(...parts) {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function httpsLink(value) {
  const link = cleanText(value, 2000);
  if (!link) return '';
  try {
    return new URL(link).protocol === 'https:' ? link : null;
  } catch {
    return null;
  }
}

function addressList(value, name) {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : String(value).split(/[;,]/);
  if (list.length > 100) throw new InputError(`${name} allows at most 100 addresses`);
  return list.map((a) => cleanText(a, 200)).filter(Boolean);
}

function emailView(id, e, full) {
  const { body, ...rest } = e;
  return { ...rest, id, ...(full ? { body: body || '' } : { has_body: !!body }) };
}

function actionItemView(id, item) {
  return {
    id,
    text: item.text || '',
    owner: item.owner || null,
    due_date: item.dueDate || null,
    done: !!item.done,
    done_by: item.doneByName || null,
    done_at: item.doneAt || null,
    progress: Number.isFinite(item.progress) ? item.progress : null,
    subtasks: (item.subtasks || []).map((s) => ({ id: s.id, text: s.text, done: !!s.done })),
    notes: (item.updates || []).map((u) => ({ text: u.text, by: u.byName || '', at: u.at })),
    source_ref: item.agentSourceRef || null,
    email_message_id: item.sourceEmailMessageId || null,
    posted_by: item.createdByName || '',
    created_at: item.createdAt || null,
    updated_at: item.updatedAt || null,
  };
}

function isProjectItem(item, projectId) {
  return item.kind === 'todo' && item.visibility === 'general' && item.link && item.link.type === 'project' && item.link.id === projectId;
}

function createAgentProjectLogRouter({ db, getCurrentUser, isActiveUser, deleteField }) {
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

  const actor = (user) => ({ id: String(user.id), name: user.full_name || user.name || user.username || 'Agent' });
  const fail = (res, err, what) => {
    if (err instanceof InputError) return res.status(400).json({ success: false, error: err.message });
    console.error(`[agent] ${what} failed:`, err);
    return res.status(500).json({ success: false, error: 'Database error' });
  };

  async function loadProject(res, id) {
    const doc = await db.collection('projects').doc(id).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return null;
    }
    return doc.data() || {};
  }

  // ---- Email log ----

  router.post('/api/agent/projects/:id/emails', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const projectId = String(req.params.id);
      const project = await loadProject(res, projectId);
      if (!project) return;
      const body = req.body || {};

      const messageId = cleanText(body.message_id, 500);
      if (!messageId) throw new InputError('message_id is required (the email\'s Message-ID or mailbox id, used to skip duplicates)');
      const subject = cleanText(body.subject, 500);
      const from = cleanText(body.from, 200);
      if (!subject && !from) throw new InputError('subject or from is required');
      const sentAt = cleanText(body.date, 40);
      if (!sentAt || Number.isNaN(Date.parse(sentAt))) throw new InputError('date is required (ISO date-time the email was sent or received)');
      const direction = body.direction === undefined ? 'inbound' : String(body.direction);
      if (!DIRECTIONS.includes(direction)) throw new InputError('direction must be inbound or outbound');
      const link = httpsLink(body.link);
      if (link === null) throw new InputError('link must be an https URL');
      if (body.attachments !== undefined && !Array.isArray(body.attachments)) throw new InputError('attachments must be an array');
      const attachments = (body.attachments || []).slice(0, 50).map((a, i) => {
        const name = cleanText(a && (a.name || a.filename), 300);
        if (!name) throw new InputError(`attachments[${i}].name is required`);
        const aLink = httpsLink(a.link);
        if (aLink === null) throw new InputError(`attachments[${i}].link must be an https URL`);
        const size = Number(a.size);
        return { name, ...(Number.isFinite(size) && size >= 0 ? { size } : {}), ...(aLink ? { link: aLink } : {}) };
      });

      const id = hash(projectId, messageId).slice(0, 40);
      const ref = db.collection(EMAIL_COLLECTION).doc(id);
      const existing = await ref.get();
      if (existing.exists) {
        return res.json({ success: true, duplicate: true, email: emailView(id, existing.data() || {}, false) });
      }
      const now = new Date().toISOString();
      const record = {
        project_id: projectId,
        project_no: project.ovp_number || '',
        message_id: messageId,
        thread_id: cleanText(body.thread_id, 500),
        direction,
        subject,
        from,
        to: addressList(body.to, 'to'),
        cc: addressList(body.cc, 'cc'),
        date: new Date(sentAt).toISOString(),
        summary: cleanLongText(body.summary, 4000),
        body: cleanLongText(body.body, 50000),
        category: cleanText(body.category, 60),
        attachments,
        link,
        logged_via: user.agentScope ? 'agent' : 'user',
        logged_by: actor(user).name,
        created_at: now,
      };
      await ref.set(record);
      res.status(201).json({ success: true, duplicate: false, email: emailView(id, record, false) });
    } catch (err) { fail(res, err, 'log email'); }
  });

  router.get('/api/agent/projects/:id/emails', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const projectId = String(req.params.id);
      if (!(await loadProject(res, projectId))) return;
      const full = String(req.query.full || '') === '1';
      const snap = await db.collection(EMAIL_COLLECTION).where('project_id', '==', projectId).get();
      const emails = snap.docs
        .map((d) => emailView(d.id, d.data() || {}, full))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, MAX_LIST);
      res.json({ success: true, emails });
    } catch (err) { fail(res, err, 'list emails'); }
  });

  // ---- Action items (whiteboard to-dos) ----

  router.get('/api/agent/projects/:id/action-items', async (req, res) => {
    try {
      if (!(await requireAgentOrStaff(req, res))) return;
      const projectId = String(req.params.id);
      if (!(await loadProject(res, projectId))) return;
      const snap = await db.collection(WB_COLLECTION).where('visibility', '==', 'general').get();
      let items = snap.docs.filter((d) => isProjectItem(d.data() || {}, projectId)).map((d) => actionItemView(d.id, d.data() || {}));
      if (String(req.query.open || '') === '1') items = items.filter((i) => !i.done);
      items.sort((a, b) => Number(a.done) - Number(b.done) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
      res.json({ success: true, action_items: items });
    } catch (err) { fail(res, err, 'list action items'); }
  });

  router.post('/api/agent/projects/:id/action-items', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const projectId = String(req.params.id);
      const project = await loadProject(res, projectId);
      if (!project) return;
      const body = req.body || {};

      const text = cleanText(body.text, 500);
      if (!text) throw new InputError('text is required (max 500)');
      let owner = null;
      if (body.owner !== undefined && body.owner !== null && body.owner !== '') {
        owner = String(body.owner).toLowerCase();
        if (!OWNER_TAGS[owner]) throw new InputError(`owner must be one of: ${Object.keys(OWNER_TAGS).join(', ')}`);
      }
      let dueDate = null;
      if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '') {
        dueDate = String(body.due_date);
        if (!validDate(dueDate)) throw new InputError('due_date must be YYYY-MM-DD');
      }
      const sourceRef = cleanText(body.source_ref, 300);
      const agentRef = sourceRef ? hash(projectId, sourceRef).slice(0, 40) : null;
      if (agentRef) {
        const dup = await db.collection(WB_COLLECTION).where('agentRef', '==', agentRef).get();
        if (dup.docs.length) {
          return res.json({ success: true, duplicate: true, action_item: actionItemView(dup.docs[0].id, dup.docs[0].data() || {}) });
        }
      }
      if (body.subtasks !== undefined && !Array.isArray(body.subtasks)) throw new InputError('subtasks must be an array of strings');

      const who = actor(user);
      const now = new Date().toISOString();
      let subtasks = [];
      for (const s of body.subtasks || []) {
        const r = addSubtask(subtasks, { id: crypto.randomBytes(6).toString('hex'), text: typeof s === 'string' ? s : s && s.text, actor: who, nowIso: now });
        if (r.error) throw new InputError(r.error);
        subtasks = r.subtasks;
      }
      let updates = [];
      let progress = null;
      const note = cleanText(body.note, 1000);
      if (note) {
        const r = addUpdate(updates, { id: crypto.randomBytes(6).toString('hex'), text: note, actor: who, nowIso: now });
        if (r.error) throw new InputError(r.error);
        updates = r.updates;
        progress = r.progress;
      }

      const label = [project.ovp_number, project.project_name].filter(Boolean).join(' · ').slice(0, 200);
      const doc = {
        kind: 'todo',
        visibility: 'general',
        category: 'project',
        text: owner ? `[${OWNER_TAGS[owner]}] ${text}` : text,
        done: false,
        ...(dueDate ? { dueDate } : {}),
        link: { type: 'project', id: projectId, label },
        ...(owner ? { owner } : {}),
        ...(subtasks.length ? { subtasks } : {}),
        ...(updates.length ? { updates, ...(progress !== null && progress !== undefined ? { progress } : {}) } : {}),
        ...(agentRef ? { agentRef, agentSourceRef: sourceRef } : {}),
        ...(body.email_message_id ? { sourceEmailMessageId: cleanText(body.email_message_id, 500) } : {}),
        createdVia: user.agentScope ? 'agent' : 'user',
        createdBy: who.id,
        createdByName: who.name,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(WB_COLLECTION).add(doc);
      res.status(201).json({ success: true, duplicate: false, action_item: actionItemView(ref.id, doc) });
    } catch (err) { fail(res, err, 'create action item'); }
  });

  router.put('/api/agent/action-items/:id', async (req, res) => {
    try {
      const user = await requireAgentOrStaff(req, res);
      if (!user) return;
      const id = String(req.params.id);
      const ref = db.collection(WB_COLLECTION).doc(id);
      const snap = await ref.get();
      const existing = snap.exists ? snap.data() || {} : null;
      if (!existing || !existing.link || existing.link.type !== 'project' || existing.visibility !== 'general' || existing.kind !== 'todo') {
        return res.status(404).json({ success: false, error: 'Action item not found' });
      }
      const body = req.body || {};
      const who = actor(user);
      const isPoster = existing.createdBy === who.id;
      const now = new Date().toISOString();
      let patch = {};

      if (body.text !== undefined || body.due_date !== undefined) {
        if (!isPoster) return res.status(403).json({ success: false, error: 'Only the poster can change the text or due date' });
        if (body.text !== undefined) {
          const text = cleanText(body.text, 500);
          if (!text) throw new InputError('text cannot be empty');
          patch.text = existing.owner && OWNER_TAGS[existing.owner] ? `[${OWNER_TAGS[existing.owner]}] ${text}` : text;
        }
        if (body.due_date !== undefined) {
          if (body.due_date === null || body.due_date === '') patch.dueDate = deleteField;
          else if (!validDate(String(body.due_date))) throw new InputError('due_date must be YYYY-MM-DD');
          else patch.dueDate = String(body.due_date);
        }
      }
      if (body.note !== undefined) {
        const r = addUpdate(existing.updates, { id: crypto.randomBytes(6).toString('hex'), text: body.note, progress: body.progress, actor: who, nowIso: now });
        if (r.error) throw new InputError(r.error);
        patch.updates = r.updates;
        patch.progress = r.progress === null || r.progress === undefined ? deleteField : r.progress;
      }
      if (body.done !== undefined) {
        if (typeof body.done !== 'boolean') throw new InputError('done must be true or false');
        // Ticking a repeating to-do spawns its next copy; that stays on the board itself.
        if (existing.recurrence) return res.status(409).json({ success: false, error: 'This is a repeating to-do; tick it on the Whiteboard' });
        patch.done = body.done;
        patch = applyDoneTransition({ existing, existingId: id, patch, actor: who, nowIso: now, deleteField }).patch;
      }
      if (!Object.keys(patch).length) throw new InputError('Nothing to update (done, note, progress, text, due_date)');
      patch.updatedAt = now;
      await ref.update(patch);
      const after = (await ref.get()).data() || {};
      res.json({ success: true, action_item: actionItemView(id, after) });
    } catch (err) { fail(res, err, 'update action item'); }
  });

  return router;
}

module.exports = { OWNER_TAGS, createAgentProjectLogRouter };
