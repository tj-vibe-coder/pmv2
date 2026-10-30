'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChangePasswordHandler } = require('./changePassword');
const { hashPassword, verifyPassword } = require('./passwords');

function harness({ user, locked = false } = {}) {
  const calls = { updates: [], revoked: [], hits: 0, cleared: 0 };
  const handler = createChangePasswordHandler({
    db: { collection: () => ({ doc: (id) => ({ update: async (v) => { calls.updates.push({ id, ...v }); } }) }) },
    getCurrentUser: async () => user,
    verifyPassword,
    hashPassword,
    revokeUserSessions: async (id, keep) => { calls.revoked.push({ id, keep }); },
    bearerToken: () => 'my-token',
    loginThrottle: {
      check: async () => ({ locked, retryAfterMs: locked ? 60_000 : 0 }),
      hit: async () => { calls.hits++; return { locked: calls.hits >= 3, retryAfterMs: 60_000 }; },
      clear: async () => { calls.cleared++; },
    },
    tooManyAttempts: (ms) => `wait ${ms}`,
  });
  const run = async (body) => {
    let status = 200; let json;
    const res = { status(c) { status = c; return this; }, json(j) { json = j; return this; } };
    await handler({ body }, res);
    return { status, json };
  };
  return { run, calls };
}

async function legacyUser() {
  return { id: 'u1', username: 'staff', role: 'user', approved: 1, password_hash: Buffer.from('Old-Pass-1').toString('base64') };
}

test('changes the password, ends other sessions, keeps the caller signed in', async () => {
  const user = { id: 'u1', username: 'staff', password_hash: await hashPassword('Old-Pass-1') };
  const { run, calls } = harness({ user });
  const r = await run({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22' });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].id, 'u1');
  assert.ok(calls.updates[0].password_hash.startsWith('scrypt$'));
  assert.deepEqual(await verifyPassword('New-Pass-22', calls.updates[0].password_hash), { ok: true, needsUpgrade: false });
  assert.deepEqual(calls.revoked, [{ id: 'u1', keep: 'my-token' }]);
  assert.equal(calls.cleared, 1);
});

test('a legacy (base64) current password is accepted and replaced with a hash', async () => {
  const { run, calls } = harness({ user: await legacyUser() });
  const r = await run({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22' });
  assert.equal(r.status, 200);
  assert.ok(calls.updates[0].password_hash.startsWith('scrypt$'));
});

test('validation: missing, short, unchanged, wrong current', async () => {
  const { run, calls } = harness({ user: await legacyUser() });
  assert.equal((await run({})).status, 400);
  assert.equal((await run({ currentPassword: 'Old-Pass-1' })).status, 400);
  assert.equal((await run({ currentPassword: 'Old-Pass-1', newPassword: 'short' })).status, 400);
  assert.equal((await run({ currentPassword: 'Old-Pass-1', newPassword: 'Old-Pass-1' })).status, 400);
  assert.equal(calls.hits, 0, 'validation failures must not count as attempts');
  const wrong = await run({ currentPassword: 'nope-nope', newPassword: 'New-Pass-22' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.json.error, 'Current password is incorrect');
  assert.equal(calls.hits, 1);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.revoked.length, 0);
});

test('wrong current passwords lock like login does, and a locked account is refused up front', async () => {
  const { run, calls } = harness({ user: await legacyUser() });
  await run({ currentPassword: 'x-x-x-x-x', newPassword: 'New-Pass-22' });
  await run({ currentPassword: 'x-x-x-x-x', newPassword: 'New-Pass-22' });
  const third = await run({ currentPassword: 'x-x-x-x-x', newPassword: 'New-Pass-22' });
  assert.equal(third.status, 429);
  assert.equal(calls.hits, 3);
  const lockedRun = harness({ user: await legacyUser(), locked: true });
  const r = await lockedRun.run({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22' });
  assert.equal(r.status, 429);
  assert.equal(lockedRun.calls.updates.length, 0);
});

test('no user or a phone-scanner session gets 401', async () => {
  assert.equal((await harness({ user: null }).run({ currentPassword: 'a', newPassword: 'b' })).status, 401);
  const scanner = { ...(await legacyUser()), scannerScope: true };
  assert.equal((await harness({ user: scanner }).run({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22' })).status, 401);
});
