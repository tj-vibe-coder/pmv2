'use strict';

// Password storage. New and changed passwords are stored as
//   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
// Older accounts still hold the legacy value, base64(password), which is
// reversible; verifyPassword accepts it and reports needsUpgrade so the login
// handler can rewrite the record on the user's next successful sign-in. Nobody
// has to reset a password for the migration. Built on node:crypto only — no new
// dependency to ship to Cloud Functions.

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const PREFIX = 'scrypt';
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX + '$');
}

async function hashPassword(plain) {
  if (typeof plain !== 'string' || !plain) throw new Error('password required');
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(plain, salt, KEY_LENGTH, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Resolves to { ok, needsUpgrade }. Never throws on malformed input.
async function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || !plain || typeof stored !== 'string' || !stored) {
    return { ok: false, needsUpgrade: false };
  }
  if (!isHashed(stored)) {
    const ok = safeEqual(Buffer.from(stored), Buffer.from(Buffer.from(plain).toString('base64')));
    return { ok, needsUpgrade: ok };
  }
  const parts = stored.split('$');
  if (parts.length !== 6) return { ok: false, needsUpgrade: false };
  const [, N, r, p, saltB64, keyB64] = parts;
  try {
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(plain, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return { ok: safeEqual(key, expected), needsUpgrade: false };
  } catch (_) {
    return { ok: false, needsUpgrade: false };
  }
}

module.exports = { hashPassword, verifyPassword, isHashed };
