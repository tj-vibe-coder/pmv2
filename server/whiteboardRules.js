// Whiteboard rules kept out of server.js so they can be unit-tested (node --test):
// link validation, repeat dates, and what happens when a to-do is ticked.
// NOTE: must stay a non-test file under server/ so scripts/prepare-functions.js packages it.

// What a note can be linked to. 'project' = Project List project, 'calcsheet' = proposal,
// 'invoice' = a Collections invoice, 'liquidation' = a liquidation form.
const WHITEBOARD_LINK_TYPES = ['project', 'calcsheet', 'invoice', 'liquidation'];
const WHITEBOARD_RECURRENCES = ['daily', 'weekly', 'monthly', 'yearly'];

// Returns the cleaned link, null (no link / clear it), or false if the shape is invalid.
function sanitizeWhiteboardLink(link) {
  if (link === undefined || link === null) return null;
  if (typeof link !== 'object') return false;
  const { type, id, label } = link;
  if (!WHITEBOARD_LINK_TYPES.includes(type)) return false;
  if (!id || typeof id !== 'string') return false;
  return { type, id, label: String(label || '').trim().slice(0, 200) };
}

// Today in the Philippines (UTC+8), as YYYY-MM-DD — the team's calendar day.
function phToday(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d) => d.toISOString().slice(0, 10);
const utc = (dateStr) => new Date(`${dateStr}T00:00:00Z`);
const weekdayOf = (dateStr) => utc(dateStr).getUTCDay(); // 0 = Sunday … 6 = Saturday
const addDays = (dateStr, n) => { const d = utc(dateStr); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const daysInMonth = (year, month0) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
// The chosen day of a month, clamped to short months; day 0 means "the last day of the month".
const monthlyOn = (year, month0, day) => {
  const last = daysInMonth(year, month0);
  return ymd(new Date(Date.UTC(year, month0, day === 0 ? last : Math.min(day, last))));
};
const nextMonth = ({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });

// The specific day a repeat falls on, validated per rule:
//   weekly  → 0–6 (0 = Sunday)      monthly → 1–31, or 0 = the last day of the month
// Returns null (no specific day — follow the due date), the number, or false if it is invalid.
// Other rules (daily / yearly) have no day and ignore one.
function sanitizeRecurrenceDay(rule, day) {
  if (day === undefined || day === null || day === '') return null;
  const n = Number(day);
  if (!Number.isInteger(n)) return false;
  if (rule === 'weekly') return n >= 0 && n <= 6 ? n : false;
  if (rule === 'monthly') return n >= 0 && n <= 31 ? n : false;
  return null;
}

function addOnce(dateStr, rule) {
  const d = utc(dateStr);
  if (rule === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (rule === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    // monthly / yearly: keep the day of month, clamped to the last day of a shorter month (Jan 31 → Feb 28)
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + (rule === 'monthly' ? 1 : 12));
    d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())));
  }
  return ymd(d);
}

// Next due date of a repeating to-do: the next occurrence after the previous due date — on the chosen
// weekday / day of the month if one is set, otherwise the same day again — and never in the past, so a
// to-do ticked weeks late doesn't spawn an already-overdue copy.
function nextRecurringDueDate(dueDate, rule, today = phToday(), day = null) {
  if (!WHITEBOARD_RECURRENCES.includes(rule)) return null;
  const base = DATE_RE.test(String(dueDate || '')) ? dueDate : today;
  if (rule === 'weekly' && Number.isInteger(day)) {
    let d = addDays(base, 1);
    for (let i = 0; i < 7 && weekdayOf(d) !== day; i += 1) d = addDays(d, 1);
    for (let i = 0; i < 800 && d < today; i += 1) d = addDays(d, 7);
    return d;
  }
  if (rule === 'monthly' && Number.isInteger(day)) {
    const b = utc(base);
    let cur = nextMonth({ y: b.getUTCFullYear(), m: b.getUTCMonth() });
    let d = monthlyOn(cur.y, cur.m, day);
    for (let i = 0; i < 800 && d < today; i += 1) { cur = nextMonth(cur); d = monthlyOn(cur.y, cur.m, day); }
    return d;
  }
  let next = addOnce(base, rule);
  for (let i = 0; i < 800 && next < today; i += 1) next = addOnce(next, rule);
  return next;
}

// First due date for a repeating to-do added without one: the next time its chosen day comes round
// (today counts), or simply today.
function firstDueDate(rule, day = null, today = phToday()) {
  if (rule === 'weekly' && Number.isInteger(day)) {
    let d = today;
    for (let i = 0; i < 7 && weekdayOf(d) !== day; i += 1) d = addDays(d, 1);
    return d;
  }
  if (rule === 'monthly' && Number.isInteger(day)) {
    const t = utc(today);
    const cur = { y: t.getUTCFullYear(), m: t.getUTCMonth() };
    const thisMonth = monthlyOn(cur.y, cur.m, day);
    if (thisMonth >= today) return thisMonth;
    const n = nextMonth(cur);
    return monthlyOn(n.y, n.m, day);
  }
  return today;
}

// Ticking / unticking a to-do. Fills in who completed it (never trusted from the client) and, for a
// repeating to-do, builds the next occurrence. Returns { patch, spawn } — `patch` is merged into the
// Firestore update, `spawn` (or null) is a new item to create. `deleteField` is FieldValue.delete().
function applyDoneTransition({ existing, existingId, patch, actor, nowIso, today = phToday(), deleteField }) {
  const out = { ...patch };
  let spawn = null;
  if (!('done' in out)) return { patch: out, spawn };
  out.done = !!out.done;
  if (out.done && !existing.done) {
    out.doneBy = actor.id;
    out.doneByName = actor.name;
    out.doneAt = nowIso;
    if (existing.kind === 'todo' && WHITEBOARD_RECURRENCES.includes(existing.recurrence) && !existing.spawnedNextId) {
      spawn = {
        kind: 'todo',
        visibility: existing.visibility,
        ...(existing.category ? { category: existing.category } : {}),
        ...(existing.assignedTo ? { assignedTo: existing.assignedTo } : {}),
        text: existing.text,
        done: false,
        dueDate: nextRecurringDueDate(existing.dueDate, existing.recurrence, today, existing.recurrenceDay),
        recurrence: existing.recurrence,
        ...(Number.isInteger(existing.recurrenceDay) ? { recurrenceDay: existing.recurrenceDay } : {}),
        recurrenceOf: existingId,
        ...(existing.link ? { link: existing.link } : {}),
        ...(existing.subtasks && existing.subtasks.length ? { subtasks: resetSubtasks(existing.subtasks) } : {}),
        createdBy: existing.createdBy,
        createdByName: existing.createdByName,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }
  } else if (!out.done && existing.done) {
    out.doneBy = deleteField;
    out.doneByName = deleteField;
    out.doneAt = deleteField;
  }
  return { patch: out, spawn };
}

// ── Subtasks, status notes and progress ───────────────────────────────────────
// A task can carry a checklist (`subtasks`), a dated log of status notes (`updates`) and a 0–100
// `progress`. Progress is never set on its own: it is whatever the latest note that carries one says,
// so the bar can't move without a dated note explaining why. These helpers are pure — each returns
// { error, status } or the new field values; server.js applies them inside a Firestore transaction.
const MAX_SUBTASKS = 50;
const MAX_UPDATES = 200;
const MAX_SUBTASK_LEN = 200;
const MAX_UPDATE_LEN = 1000;

// Private items are only ever the poster's; everything else is visible to any signed-in user.
function canViewWhiteboardItem(item, userId) {
  return item.visibility !== 'private' || item.createdBy === userId;
}

// null = no progress given, 0–100 integer, or false if it isn't a number in range.
function sanitizeProgress(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return false;
  return Math.round(n);
}

// The task's progress: the latest note that carries one (null when none does).
function latestProgress(updates) {
  for (let i = (updates || []).length - 1; i >= 0; i -= 1) {
    if (Number.isInteger(updates[i].progress)) return updates[i].progress;
  }
  return null;
}

function addSubtask(subtasks, { id, text, nowIso }) {
  const list = subtasks || [];
  const clean = String(text || '').trim();
  if (!clean) return { status: 400, error: 'Subtask text is required' };
  if (clean.length > MAX_SUBTASK_LEN) return { status: 400, error: `Subtask is too long (max ${MAX_SUBTASK_LEN} characters)` };
  if (list.length >= MAX_SUBTASKS) return { status: 400, error: `A task can have at most ${MAX_SUBTASKS} subtasks` };
  return { subtasks: [...list, { id, text: clean, done: false, createdAt: nowIso }] };
}

// Ticking records who and when (never taken from the client); unticking clears it.
function setSubtaskDone(subtasks, subtaskId, done, { actor, nowIso }) {
  const list = subtasks || [];
  if (!list.some((s) => s.id === subtaskId)) return { status: 404, error: 'Subtask not found' };
  return {
    subtasks: list.map((s) => {
      if (s.id !== subtaskId) return s;
      const { doneBy, doneByName, doneAt, ...rest } = s;
      return done ? { ...rest, done: true, doneBy: actor.id, doneByName: actor.name, doneAt: nowIso } : { ...rest, done: false };
    }),
  };
}

function removeSubtask(subtasks, subtaskId) {
  const list = subtasks || [];
  if (!list.some((s) => s.id === subtaskId)) return { status: 404, error: 'Subtask not found' };
  return { subtasks: list.filter((s) => s.id !== subtaskId) };
}

// A status note, optionally moving the progress bar — which only the poster may do.
function addUpdate(updates, { id, text, progress, actor, isOwner, nowIso }) {
  const list = updates || [];
  const clean = String(text || '').trim();
  if (!clean) return { status: 400, error: 'Note text is required' };
  if (clean.length > MAX_UPDATE_LEN) return { status: 400, error: `Note is too long (max ${MAX_UPDATE_LEN} characters)` };
  const pct = sanitizeProgress(progress);
  if (pct === false) return { status: 400, error: 'Progress must be a number from 0 to 100' };
  if (pct !== null && !isOwner) return { status: 403, error: 'Only the poster can set progress' };
  if (list.length >= MAX_UPDATES) return { status: 400, error: `A task can have at most ${MAX_UPDATES} notes` };
  const next = [...list, { id, text: clean, ...(pct !== null ? { progress: pct } : {}), by: actor.id, byName: actor.name, at: nowIso }];
  return { updates: next, progress: latestProgress(next) };
}

// A note can be removed by whoever wrote it or by the task's poster; progress falls back to the previous note's.
function removeUpdate(updates, updateId, { actorId, isOwner }) {
  const list = updates || [];
  const target = list.find((u) => u.id === updateId);
  if (!target) return { status: 404, error: 'Note not found' };
  if (!isOwner && target.by !== actorId) return { status: 403, error: 'Only the author or the poster can delete this note' };
  const next = list.filter((u) => u.id !== updateId);
  return { updates: next, progress: latestProgress(next) };
}

// A repeating task's next copy starts with the same checklist, all unticked.
function resetSubtasks(subtasks) {
  return (subtasks || []).map((s) => ({ id: s.id, text: s.text, done: false, createdAt: s.createdAt }));
}

// Fields only the server may set — stripped from anything a client sends.
const SERVER_ONLY_FIELDS = ['doneBy', 'doneByName', 'doneAt', 'spawnedNextId', 'recurrenceOf', 'createdBy', 'createdByName', 'createdAt', 'id', 'subtasks', 'updates', 'progress'];

module.exports = {
  WHITEBOARD_LINK_TYPES,
  WHITEBOARD_RECURRENCES,
  SERVER_ONLY_FIELDS,
  sanitizeWhiteboardLink,
  phToday,
  sanitizeRecurrenceDay,
  nextRecurringDueDate,
  firstDueDate,
  applyDoneTransition,
  canViewWhiteboardItem,
  sanitizeProgress,
  latestProgress,
  addSubtask,
  setSubtaskDone,
  removeSubtask,
  addUpdate,
  removeUpdate,
  resetSubtasks,
};
