const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeWhiteboardLink, nextRecurringDueDate, firstDueDate, sanitizeRecurrenceDay, applyDoneTransition, phToday, SERVER_ONLY_FIELDS,
  canViewWhiteboardItem, sanitizeProgress, latestProgress, addSubtask, setSubtaskDone, removeSubtask, addUpdate, removeUpdate,
} = require('./whiteboardRules');

const DELETE = Symbol('delete');
const actor = { id: 'u1', name: 'Nylle' };
const NOW = '2026-10-22T03:00:00.000Z';

test('links accept project, calcsheet, invoice and liquidation — nothing else', () => {
  for (const type of ['project', 'calcsheet', 'invoice', 'liquidation']) {
    assert.deepEqual(sanitizeWhiteboardLink({ type, id: 'a1', label: ' X ' }), { type, id: 'a1', label: 'X' });
  }
  assert.equal(sanitizeWhiteboardLink({ type: 'po', id: 'a1' }), false);
  assert.equal(sanitizeWhiteboardLink({ type: 'invoice' }), false);
  assert.equal(sanitizeWhiteboardLink(undefined), null);
  assert.equal(sanitizeWhiteboardLink(null), null);
  assert.equal(sanitizeWhiteboardLink('nope'), false);
});

test('phToday uses the Philippine calendar day (UTC+8)', () => {
  assert.equal(phToday(Date.parse('2026-10-21T17:00:00Z')), '2026-10-22');
  assert.equal(phToday(Date.parse('2026-10-21T15:59:00Z')), '2026-10-21');
});

test('repeat dates: daily, weekly, monthly (month-end clamp), yearly', () => {
  const today = '2026-01-01';
  assert.equal(nextRecurringDueDate('2026-03-10', 'daily', today), '2026-03-11');
  assert.equal(nextRecurringDueDate('2026-03-10', 'weekly', today), '2026-03-17');
  assert.equal(nextRecurringDueDate('2026-03-10', 'monthly', today), '2026-04-10');
  assert.equal(nextRecurringDueDate('2026-01-31', 'monthly', today), '2026-02-28');
  assert.equal(nextRecurringDueDate('2026-12-15', 'monthly', today), '2027-01-15');
  assert.equal(nextRecurringDueDate('2028-02-29', 'yearly', today), '2029-02-28');
  assert.equal(nextRecurringDueDate('2026-03-10', 'sometimes', today), null);
});

test('a repeating to-do ticked late never spawns an already-overdue copy', () => {
  assert.equal(nextRecurringDueDate('2026-06-10', 'monthly', '2026-10-22'), '2026-11-10');
  assert.equal(nextRecurringDueDate('2026-10-01', 'weekly', '2026-10-22'), '2026-10-22');
  assert.equal(nextRecurringDueDate(undefined, 'daily', '2026-10-22'), '2026-10-23');
});

test('ticking records who did it and when; unticking clears it', () => {
  const existing = { kind: 'todo', done: false, text: 't' };
  const ticked = applyDoneTransition({ existing, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, deleteField: DELETE });
  assert.deepEqual(ticked.patch, { done: true, doneBy: 'u1', doneByName: 'Nylle', doneAt: NOW });
  assert.equal(ticked.spawn, null);

  const unticked = applyDoneTransition({ existing: { ...existing, done: true }, existingId: 'i1', patch: { done: false }, actor, nowIso: NOW, deleteField: DELETE });
  assert.deepEqual(unticked.patch, { done: false, doneBy: DELETE, doneByName: DELETE, doneAt: DELETE });
});

test('a patch without "done" is left alone', () => {
  const { patch, spawn } = applyDoneTransition({ existing: { done: false }, existingId: 'i1', patch: { category: 'sales' }, actor, nowIso: NOW, deleteField: DELETE });
  assert.deepEqual(patch, { category: 'sales' });
  assert.equal(spawn, null);
});

test('ticking a repeating to-do spawns the next one, once', () => {
  const existing = {
    kind: 'todo', done: false, visibility: 'general', category: 'finance', text: 'File 2551Q', dueDate: '2026-10-25',
    recurrence: 'monthly', link: { type: 'invoice', id: 'inv1', label: 'INV 8' }, createdBy: 'u9', createdByName: 'RJ',
  };
  const { patch, spawn } = applyDoneTransition({ existing, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, today: '2026-10-22', deleteField: DELETE });
  assert.equal(patch.doneBy, 'u1');
  assert.equal(spawn.dueDate, '2026-11-25');
  assert.equal(spawn.done, false);
  assert.equal(spawn.recurrenceOf, 'i1');
  assert.equal(spawn.recurrence, 'monthly');
  assert.equal(spawn.category, 'finance');
  assert.equal(spawn.createdBy, 'u9');
  assert.deepEqual(spawn.link, existing.link);
  assert.ok(!('doneBy' in spawn));

  // ticked again after an untick: the next one already exists
  const again = applyDoneTransition({ existing: { ...existing, spawnedNextId: 'i2' }, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, today: '2026-10-22', deleteField: DELETE });
  assert.equal(again.spawn, null);
});

test('clients can never set who-did-it fields', () => {
  for (const f of ['doneBy', 'doneByName', 'doneAt', 'spawnedNextId', 'recurrenceOf', 'createdBy']) {
    assert.ok(SERVER_ONLY_FIELDS.includes(f), f);
  }
});

// 2026-10-22 is a Thursday (Mondays: Oct 26, Nov 2).
test('a weekly repeat on a chosen weekday lands on that weekday', () => {
  const MON = 1;
  assert.equal(nextRecurringDueDate('2026-10-26', 'weekly', '2026-10-22', MON), '2026-11-02'); // Mon → next Mon
  assert.equal(nextRecurringDueDate('2026-10-22', 'weekly', '2026-10-22', MON), '2026-10-26'); // Thu due date → the Monday after
  assert.equal(nextRecurringDueDate('2026-09-07', 'weekly', '2026-10-22', MON), '2026-10-26'); // very late → next Monday from today
  assert.equal(nextRecurringDueDate('2026-10-22', 'weekly', '2026-10-22', 0), '2026-10-25');   // Sunday
  assert.equal(nextRecurringDueDate('2026-10-22', 'weekly', '2026-10-22', 4), '2026-10-29');   // same weekday as the due date
  assert.equal(nextRecurringDueDate('2026-10-22', 'weekly', '2026-10-22', null), '2026-10-29'); // no day → +7 as before
});

test('a monthly repeat on a chosen day of the month (0 = last day)', () => {
  assert.equal(nextRecurringDueDate('2026-10-15', 'monthly', '2026-10-01', 15), '2026-11-15');
  assert.equal(nextRecurringDueDate('2026-10-31', 'monthly', '2026-10-22', 0), '2026-11-30');
  assert.equal(nextRecurringDueDate('2026-01-31', 'monthly', '2026-01-01', 31), '2026-02-28');
  assert.equal(nextRecurringDueDate('2026-02-28', 'monthly', '2026-01-01', 31), '2026-03-31');
  assert.equal(nextRecurringDueDate('2026-12-15', 'monthly', '2026-12-01', 15), '2027-01-15');
  assert.equal(nextRecurringDueDate('2026-06-15', 'monthly', '2026-10-22', 15), '2026-11-15'); // ticked months late
  assert.equal(nextRecurringDueDate('2026-10-05', 'monthly', '2026-10-01', 20), '2026-11-20'); // due date off the chosen day
});

test('first due date for a repeat added without one', () => {
  assert.equal(firstDueDate('weekly', 1, '2026-10-22'), '2026-10-26');   // next Monday
  assert.equal(firstDueDate('weekly', 4, '2026-10-22'), '2026-10-22');   // today is a Thursday
  assert.equal(firstDueDate('monthly', 25, '2026-10-22'), '2026-10-25'); // later this month
  assert.equal(firstDueDate('monthly', 15, '2026-10-22'), '2026-11-15'); // already passed → next month
  assert.equal(firstDueDate('monthly', 0, '2026-10-22'), '2026-10-31');  // last day
  assert.equal(firstDueDate('daily', null, '2026-10-22'), '2026-10-22');
  assert.equal(firstDueDate('monthly', null, '2026-10-22'), '2026-10-22');
});

test('repeat days are validated per rule', () => {
  assert.equal(sanitizeRecurrenceDay('weekly', 3), 3);
  assert.equal(sanitizeRecurrenceDay('weekly', '0'), 0);
  assert.equal(sanitizeRecurrenceDay('weekly', 7), false);
  assert.equal(sanitizeRecurrenceDay('monthly', 31), 31);
  assert.equal(sanitizeRecurrenceDay('monthly', 0), 0);
  assert.equal(sanitizeRecurrenceDay('monthly', 32), false);
  assert.equal(sanitizeRecurrenceDay('monthly', 1.5), false);
  assert.equal(sanitizeRecurrenceDay('daily', 3), null);   // no day for daily / yearly
  assert.equal(sanitizeRecurrenceDay('yearly', 3), null);
  assert.equal(sanitizeRecurrenceDay('weekly', null), null);
  assert.equal(sanitizeRecurrenceDay('weekly', ''), null);
});

test('ticking a repeat with a chosen day spawns the next one on that day and keeps the day', () => {
  const existing = { kind: 'todo', done: false, visibility: 'general', text: 'Team meeting', dueDate: '2026-10-26', recurrence: 'weekly', recurrenceDay: 1, createdBy: 'u9', createdByName: 'RJ' };
  const { spawn } = applyDoneTransition({ existing, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, today: '2026-10-26', deleteField: DELETE });
  assert.equal(spawn.dueDate, '2026-11-02');
  assert.equal(spawn.recurrenceDay, 1);
  const monthly = { ...existing, recurrence: 'monthly', recurrenceDay: 0, dueDate: '2026-10-31' };
  assert.equal(applyDoneTransition({ existing: monthly, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, today: '2026-10-31', deleteField: DELETE }).spawn.dueDate, '2026-11-30');
});

// ── Subtasks, status notes and progress ───────────────────────────────────────
test('clients can never write subtasks, notes or progress through the generic edit', () => {
  for (const f of ['subtasks', 'updates', 'progress']) assert.ok(SERVER_ONLY_FIELDS.includes(f), f);
});

test('private items are visible only to their poster', () => {
  assert.equal(canViewWhiteboardItem({ visibility: 'private', createdBy: 'u1' }, 'u1'), true);
  assert.equal(canViewWhiteboardItem({ visibility: 'private', createdBy: 'u1' }, 'u2'), false);
  assert.equal(canViewWhiteboardItem({ visibility: 'general', createdBy: 'u1' }, 'u2'), true);
  assert.equal(canViewWhiteboardItem({ visibility: 'public', createdBy: 'u1' }, 'u2'), true);
});

test('progress is a 0–100 whole number, or absent', () => {
  assert.equal(sanitizeProgress(undefined), null);
  assert.equal(sanitizeProgress(null), null);
  assert.equal(sanitizeProgress(''), null);
  assert.equal(sanitizeProgress(0), 0);
  assert.equal(sanitizeProgress('45'), 45);
  assert.equal(sanitizeProgress(33.6), 34);
  assert.equal(sanitizeProgress(100), 100);
  assert.equal(sanitizeProgress(101), false);
  assert.equal(sanitizeProgress(-1), false);
  assert.equal(sanitizeProgress('abc'), false);
});

test('subtasks: add (records who), tick (records who and when), untick', () => {
  const added = addSubtask(undefined, { id: 's1', text: '  Get quote  ', actor, nowIso: NOW });
  const mine = { id: 's1', text: 'Get quote', done: false, createdBy: 'u1', createdByName: 'Nylle', createdAt: NOW };
  assert.deepEqual(added.subtasks, [mine]);
  assert.equal(addSubtask(added.subtasks, { id: 's2', text: '   ', actor, nowIso: NOW }).status, 400);
  assert.equal(addSubtask(added.subtasks, { id: 's2', text: 'x'.repeat(201), actor, nowIso: NOW }).status, 400);
  const full = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, text: 't', done: false, createdAt: NOW }));
  assert.equal(addSubtask(full, { id: 'n', text: 'one more', actor, nowIso: NOW }).status, 400);

  const ticked = setSubtaskDone(added.subtasks, 's1', true, { actor, nowIso: NOW });
  assert.deepEqual(ticked.subtasks[0], { ...mine, done: true, doneBy: 'u1', doneByName: 'Nylle', doneAt: NOW });
  const unticked = setSubtaskDone(ticked.subtasks, 's1', false, { actor, nowIso: NOW });
  assert.deepEqual(unticked.subtasks[0], mine);
  assert.equal(setSubtaskDone(added.subtasks, 'nope', true, { actor, nowIso: NOW }).status, 404);
});

test('subtasks: anyone can add one; only its author or the poster can remove it', () => {
  const mate = { id: 'u2', name: 'RJ' };
  // a teammate (not the poster) adds a subtask to someone else's task
  const byMate = addSubtask([], { id: 's1', text: 'Book the crane', actor: mate, nowIso: NOW });
  assert.equal(byMate.subtasks[0].createdBy, 'u2');
  const list = [...byMate.subtasks, { id: 's2', text: "Poster's own", done: false, createdBy: 'u9', createdByName: 'TJ', createdAt: NOW }, { id: 's3', text: 'Old, no author', done: false, createdAt: NOW }];

  assert.equal(removeSubtask(list, 's1', { actorId: 'u2', isOwner: false }).subtasks.length, 2); // author removes their own
  assert.equal(removeSubtask(list, 's2', { actorId: 'u2', isOwner: false }).status, 403);          // …not the poster's
  assert.equal(removeSubtask(list, 's3', { actorId: 'u2', isOwner: false }).status, 403);          // no recorded author → poster's
  assert.equal(removeSubtask(list, 's1', { actorId: 'u9', isOwner: true }).subtasks.length, 2);    // poster removes a teammate's
  assert.equal(removeSubtask(list, 's3', { actorId: 'u9', isOwner: true }).subtasks.length, 2);
  assert.equal(removeSubtask(list, 'nope', { actorId: 'u9', isOwner: true }).status, 404);
});

test('notes: dated, attributed, and progress follows the latest note that sets one', () => {
  const t1 = '2026-10-20T01:00:00.000Z';
  const t2 = '2026-10-21T02:00:00.000Z';
  const t3 = '2026-10-22T03:00:00.000Z';
  const a = addUpdate(undefined, { id: 'u-a', text: 'Waiting on supplier', progress: 30, actor, nowIso: t1 });
  assert.deepEqual(a.updates, [{ id: 'u-a', text: 'Waiting on supplier', progress: 30, by: 'u1', byName: 'Nylle', at: t1 }]);
  assert.equal(a.progress, 30);

  // a note without a progress value leaves progress alone
  const mate = { id: 'u2', name: 'RJ' };
  const b = addUpdate(a.updates, { id: 'u-b', text: 'Supplier replied', actor: mate, nowIso: t2 });
  assert.equal(b.updates.length, 2);
  assert.ok(!('progress' in b.updates[1]));
  assert.equal(b.progress, 30);

  // …and anyone — not only the poster — can move it with a note
  const c = addUpdate(b.updates, { id: 'u-c', text: 'PO released', progress: 70, actor: mate, nowIso: t3 });
  assert.equal(c.progress, 70);
  assert.equal(c.updates[2].byName, 'RJ');
  assert.equal(latestProgress(c.updates), 70);
  assert.equal(latestProgress([]), null);
  assert.equal(latestProgress(undefined), null);
});

test('notes: validation', () => {
  const base = { id: 'n1', actor, nowIso: NOW };
  assert.equal(addUpdate([], { ...base, text: '  ' }).status, 400);
  assert.equal(addUpdate([], { ...base, text: 'x'.repeat(1001) }).status, 400);
  assert.equal(addUpdate([], { ...base, text: 'ok', progress: 120 }).status, 400);
  assert.equal(addUpdate([], { ...base, text: 'ok', progress: 'abc' }).status, 400);
  assert.equal(addUpdate([], { ...base, text: 'ok', progress: 50 }).progress, 50);
  const full = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, text: 't', by: 'u1', byName: 'N', at: NOW }));
  assert.equal(addUpdate(full, { ...base, text: 'one more' }).status, 400);
});

test('notes: delete by author or poster; progress falls back to the previous note', () => {
  const updates = [
    { id: 'a', text: 'start', progress: 20, by: 'u1', byName: 'Nylle', at: NOW },
    { id: 'b', text: 'half', progress: 50, by: 'u1', byName: 'Nylle', at: NOW },
    { id: 'c', text: 'fyi', by: 'u2', byName: 'RJ', at: NOW },
  ];
  const noLatest = removeUpdate(updates, 'b', { actorId: 'u1', isOwner: true });
  assert.equal(noLatest.progress, 20);
  assert.equal(noLatest.updates.length, 2);
  assert.equal(removeUpdate(noLatest.updates, 'a', { actorId: 'u1', isOwner: true }).progress, null);
  // a teammate can delete their own note, not someone else's
  assert.equal(removeUpdate(updates, 'c', { actorId: 'u2', isOwner: false }).updates.length, 2);
  assert.equal(removeUpdate(updates, 'a', { actorId: 'u2', isOwner: false }).status, 403);
  // the poster can delete a teammate's note
  assert.equal(removeUpdate(updates, 'c', { actorId: 'u1', isOwner: true }).updates.length, 2);
  assert.equal(removeUpdate(updates, 'zzz', { actorId: 'u1', isOwner: true }).status, 404);
});

test('a repeating task spawns with its checklist reset and no notes or progress', () => {
  const existing = {
    kind: 'todo', done: false, visibility: 'general', text: 'Monthly report', dueDate: '2026-10-15', recurrence: 'monthly', createdBy: 'u9', createdByName: 'RJ',
    subtasks: [{ id: 's1', text: 'Gather numbers', done: true, doneBy: 'u1', doneByName: 'Nylle', doneAt: NOW, createdBy: 'u9', createdByName: 'RJ', createdAt: NOW }],
    updates: [{ id: 'n1', text: 'Started', progress: 40, by: 'u9', byName: 'RJ', at: NOW }], progress: 40,
  };
  const { spawn } = applyDoneTransition({ existing, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, today: '2026-10-22', deleteField: DELETE });
  assert.deepEqual(spawn.subtasks, [{ id: 's1', text: 'Gather numbers', done: false, createdBy: 'u9', createdByName: 'RJ', createdAt: NOW }]);
  assert.ok(!('updates' in spawn));
  assert.ok(!('progress' in spawn));
  // no checklist → no empty array written
  const plain = { ...existing, subtasks: undefined };
  assert.ok(!('subtasks' in applyDoneTransition({ existing: plain, existingId: 'i1', patch: { done: true }, actor, nowIso: NOW, today: '2026-10-22', deleteField: DELETE }).spawn));
});
