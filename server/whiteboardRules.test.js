const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeWhiteboardLink, nextRecurringDueDate, firstDueDate, sanitizeRecurrenceDay, applyDoneTransition, phToday, SERVER_ONLY_FIELDS,
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
