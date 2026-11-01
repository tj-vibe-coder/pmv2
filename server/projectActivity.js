'use strict';

// Project Activity: one read across every project of what the team and the
// agents have logged — action items (project to-dos on the Whiteboard),
// project updates (projects/{id}/updates) and logged emails (project_emails).
// Feeds the Project Activity page (/projects/activity); agents may read it too.
//
// Updates are read only for projects whose latest_update falls in the window,
// so the cost stays at one projects scan plus a few subcollection reads.

const express = require('express');

const WINDOWS = [7, 14, 30, 90, 365];
const MAX_ROWS = 500;
const READ_ROLES = ['superadmin', 'admin', 'user', 'viewer'];

// Today in the Philippines (UTC+8), as YYYY-MM-DD.
function phToday(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function projectLabel(p) {
  return [p.ovp_number, p.project_name].filter(Boolean).join(' · ');
}

// Window start as YYYY-MM-DD (inclusive): `days` back from today.
function windowStart(days, today) {
  return addDays(today, -(days - 1));
}

function buildActionItems(docs, projects, sinceYmd, today) {
  return docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((i) => i.kind === 'todo' && i.link && i.link.type === 'project' && projects.has(i.link.id))
    // Open items always; done ones only when ticked inside the window.
    .filter((i) => !i.done || String(i.doneAt || '').slice(0, 10) >= sinceYmd)
    .map((i) => ({
      id: i.id,
      project_id: i.link.id,
      project: projectLabel(projects.get(i.link.id)),
      text: i.text || '',
      owner: i.owner || null,
      due_date: i.dueDate || null,
      overdue: !i.done && !!i.dueDate && i.dueDate < today,
      done: !!i.done,
      done_by: i.doneByName || null,
      done_at: i.doneAt || null,
      progress: Number.isFinite(i.progress) ? i.progress : null,
      subtasks_total: (i.subtasks || []).length,
      subtasks_done: (i.subtasks || []).filter((s) => s.done).length,
      latest_note: (i.updates || []).length ? i.updates[i.updates.length - 1].text : null,
      posted_by: i.createdByName || '',
      via: i.createdVia || 'app',
      created_at: i.createdAt || null,
    }));
}

function createProjectActivityRouter({ db, getCurrentUser, isActiveUser, now = () => Date.now() }) {
  const router = express.Router();

  router.get('/api/project-activity', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user || !isActiveUser(user)) return res.status(401).json({ success: false, error: 'Unauthorized' });
      if (user.scannerScope || (!user.agentScope && !READ_ROLES.includes(user.role))) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const days = WINDOWS.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
      const today = phToday(now());
      const since = windowStart(days, today);

      const [projectSnap, boardSnap, emailSnap] = await Promise.all([
        db.collection('projects').get(),
        db.collection('whiteboard_items').where('visibility', '==', 'general').get(),
        db.collection('project_emails').where('date', '>=', `${since}T00:00:00`).get(),
      ]);
      const projects = new Map(projectSnap.docs.map((d) => [d.id, d.data() || {}]));

      const actionItems = buildActionItems(boardSnap.docs, projects, since, today);

      // Updates: only projects whose newest update is inside the window.
      const recent = [...projects.entries()].filter(([, p]) => p.latest_update && String(p.latest_update.date || p.latest_update.at || '').slice(0, 10) >= since);
      const updateLists = await Promise.all(recent.map(async ([id, p]) => {
        const snap = await db.collection('projects').doc(id).collection('updates').get();
        return snap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((u) => String(u.date || '') >= since)
          .map((u) => ({
            id: u.id,
            project_id: id,
            project: projectLabel(p),
            date: u.date || null,
            type: u.type || 'Other',
            note: u.note || '',
            status: u.status || null,
            progress: Number.isFinite(u.progress) ? u.progress : null,
            next_step: u.next_step || null,
            next_date: u.next_date || null,
            risk: u.risk || null,
            link: u.link || null,
            posted_by: u.posted_by || '',
            via: u.posted_via || 'app',
            created_at: u.created_at || null,
          }));
      }));
      const updates = updateLists.flat()
        .sort((a, b) => `${b.date}${b.created_at}`.localeCompare(`${a.date}${a.created_at}`))
        .slice(0, MAX_ROWS);

      const emails = emailSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((e) => projects.has(e.project_id))
        .map((e) => ({
          id: e.id,
          project_id: e.project_id,
          project: projectLabel(projects.get(e.project_id)),
          date: e.date || null,
          direction: e.direction || 'inbound',
          subject: e.subject || '',
          from: e.from || '',
          to: e.to || [],
          summary: e.summary || '',
          category: e.category || '',
          attachments: (e.attachments || []).map((a) => ({ name: a.name, ...(a.link ? { link: a.link } : {}) })),
          link: e.link || null,
          logged_by: e.logged_by || '',
        }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, MAX_ROWS);

      // Per-project roll-up: every project with an action item, update or email in view.
      const rollup = new Map();
      const row = (id) => {
        if (!rollup.has(id)) {
          const p = projects.get(id) || {};
          rollup.set(id, {
            project_id: id,
            ovp_number: p.ovp_number || '',
            project_name: p.project_name || '',
            account_name: p.account_name || '',
            project_status: p.project_status || '',
            progress: Number(p.actual_site_progress_percent) || 0,
            open_items: 0,
            overdue_items: 0,
            done_items: 0,
            next_due: null,
            updates: 0,
            emails: 0,
            last_activity: null,
            latest_update: p.latest_update || null,
          });
        }
        return rollup.get(id);
      };
      const touch = (r, at) => { if (at && (!r.last_activity || at > r.last_activity)) r.last_activity = at; };
      for (const i of actionItems) {
        const r = row(i.project_id);
        if (i.done) { r.done_items += 1; touch(r, i.done_at); } else {
          r.open_items += 1;
          if (i.overdue) r.overdue_items += 1;
          if (i.due_date && (!r.next_due || i.due_date < r.next_due)) r.next_due = i.due_date;
          touch(r, i.created_at);
        }
      }
      for (const u of updates) { const r = row(u.project_id); r.updates += 1; touch(r, u.created_at || u.date); }
      for (const e of emails) { const r = row(e.project_id); r.emails += 1; touch(r, e.date); }
      const byProject = [...rollup.values()]
        .sort((a, b) => b.overdue_items - a.overdue_items || String(b.last_activity || '').localeCompare(String(a.last_activity || '')));

      const open = actionItems.filter((i) => !i.done);
      res.json({
        success: true,
        days,
        since,
        today,
        totals: {
          open_items: open.length,
          overdue_items: open.filter((i) => i.overdue).length,
          due_this_week: open.filter((i) => i.due_date && i.due_date >= today && i.due_date <= addDays(today, 6)).length,
          done_items: actionItems.length - open.length,
          updates: updates.length,
          emails: emails.length,
          projects_active: byProject.length,
        },
        by_project: byProject,
        action_items: actionItems.sort((a, b) => Number(a.done) - Number(b.done) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))),
        updates,
        emails,
      });
    } catch (err) {
      console.error('[project-activity] failed:', err);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });

  return router;
}

module.exports = { createProjectActivityRouter, phToday, windowStart };
