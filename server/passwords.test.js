'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, isHashed } = require('./passwords');

test('a new hash verifies, differs per call, and never contains the password', async () => {
  const a = await hashPassword('IOCT-example-1');
  const b = await hashPassword('IOCT-example-1');
  assert.ok(isHashed(a));
  assert.notEqual(a, b, 'salt must differ');
  assert.ok(!a.includes('IOCT-example-1') && !a.includes(Buffer.from('IOCT-example-1').toString('base64')));
  assert.deepEqual(await verifyPassword('IOCT-example-1', a), { ok: true, needsUpgrade: false });
  assert.deepEqual(await verifyPassword('IOCT-example-2', a), { ok: false, needsUpgrade: false });
  assert.deepEqual(await verifyPassword('ioct-example-1', a), { ok: false, needsUpgrade: false });
});

test('legacy base64 records still verify and ask to be upgraded', async () => {
  const legacy = Buffer.from('old-pass-123').toString('base64');
  assert.ok(!isHashed(legacy));
  assert.deepEqual(await verifyPassword('old-pass-123', legacy), { ok: true, needsUpgrade: true });
  assert.deepEqual(await verifyPassword('old-pass-124', legacy), { ok: false, needsUpgrade: false });
  // A legacy record whose length differs from the attempt must not throw.
  assert.deepEqual(await verifyPassword('x', legacy), { ok: false, needsUpgrade: false });
});

test('garbage input is rejected without throwing', async () => {
  for (const stored of ['', null, undefined, 'scrypt$bad', 'scrypt$1$2$3$!!$!!', 'scrypt$0$0$0$AA==$AA==', 42]) {
    assert.deepEqual(await verifyPassword('anything', stored), { ok: false, needsUpgrade: false }, String(stored));
  }
  for (const plain of ['', null, undefined, 42]) {
    assert.deepEqual(await verifyPassword(plain, await hashPassword('p')), { ok: false, needsUpgrade: false }, String(plain));
  }
  await assert.rejects(hashPassword(''));
});
