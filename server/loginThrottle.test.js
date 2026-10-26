'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginThrottle, clientAddress, retryMinutes, docId } = require('./loginThrottle');

function fakeDb() {
  const store = new Map();
  const ref = (id) => ({
    id,
    get: async () => ({ exists: store.has(id), data: () => store.get(id) }),
    delete: async () => { store.delete(id); },
  });
  return {
    store,
    collection: () => ({ doc: ref }),
    runTransaction: async (fn) => fn({
      get: async (r) => r.get(),
      set: (r, v) => { store.set(r.id, v); },
    }),
  };
}

test('locks after the configured number of attempts and unlocks when the lock expires', async () => {
  const db = fakeDb();
  let t = 1_000_000;
  const throttle = createLoginThrottle({ db, now: () => t, policies: { login: { max: 3, windowMs: 60_000, lockMs: 120_000 } } });
  assert.deepEqual(await throttle.check('login', 'Admin'), { locked: false, retryAfterMs: 0 });
  assert.equal((await throttle.hit('login', 'admin')).locked, false);
  assert.equal((await throttle.hit('login', 'ADMIN ')).locked, false);
  const third = await throttle.hit('login', 'admin');
  assert.deepEqual(third, { locked: true, retryAfterMs: 120_000 });
  t += 30_000;
  assert.deepEqual(await throttle.check('login', 'admin'), { locked: true, retryAfterMs: 90_000 });
  t += 90_001;
  assert.equal((await throttle.check('login', 'admin')).locked, false);
  // The old window is over, so the counter restarts.
  assert.equal((await throttle.hit('login', 'admin')).locked, false);
});

test('a successful attempt clears the budget; kinds and keys are independent', async () => {
  const db = fakeDb();
  const throttle = createLoginThrottle({ db, policies: { login: { max: 2 } } });
  await throttle.hit('login', 'a');
  await throttle.clear('login', 'a');
  assert.equal((await throttle.hit('login', 'a')).locked, false);
  assert.equal((await throttle.hit('login', 'b')).locked, false);
  assert.equal((await throttle.hit('register', 'a')).locked, false);
  assert.equal((await throttle.hit('login', 'b')).locked, true);
  assert.equal((await throttle.check('login', 'a')).locked, false);
});

test('doc ids are stable, lower-cased and safe for Firestore', () => {
  assert.equal(docId('login', ' Admin '), 'login:admin');
  assert.equal(docId('register', 'a/b c'), 'register:a_b_c');
  assert.equal(docId('login', ''), 'login:unknown');
  assert.ok(docId('login', 'x'.repeat(500)).length <= 210);
});

test('client address and retry wording', () => {
  assert.equal(clientAddress({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }), '203.0.113.9');
  assert.equal(clientAddress({ headers: {}, ip: '::1' }), '::1');
  assert.equal(clientAddress({ headers: {} }), 'unknown');
  assert.equal(retryMinutes(1), 1);
  assert.equal(retryMinutes(61_000), 2);
});
