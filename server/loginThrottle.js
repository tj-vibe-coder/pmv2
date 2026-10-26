'use strict';

// Attempt limiter for the public auth routes, kept in Firestore so it holds
// across Cloud Functions instances. One doc per (kind, key):
//   login_throttle/<kind>:<key> = { count, windowStart, lockedUntil }
// `kind` separates policies (login per account, register per address, ...).
// Keys are lower-cased so "Admin" and "admin" share a budget.

const DEFAULT_POLICY = { max: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };

function docId(kind, key) {
  const clean = String(key || '').trim().toLowerCase().replace(/[\/\s]+/g, '_').slice(0, 200) || 'unknown';
  return `${kind}:${clean}`;
}

function createLoginThrottle({ db, collection = 'login_throttle', now = Date.now, policies = {} }) {
  const policyFor = (kind) => ({ ...DEFAULT_POLICY, ...(policies[kind] || {}) });

  // Resolves to { locked, retryAfterMs }. Read-only.
  async function check(kind, key) {
    const snap = await db.collection(collection).doc(docId(kind, key)).get();
    const data = snap.exists ? snap.data() : null;
    const t = now();
    if (data && data.lockedUntil && data.lockedUntil > t) return { locked: true, retryAfterMs: data.lockedUntil - t };
    return { locked: false, retryAfterMs: 0 };
  }

  // Counts one attempt. Resolves to { locked, retryAfterMs } for the state after it.
  async function hit(kind, key) {
    const { max, windowMs, lockMs } = policyFor(kind);
    const ref = db.collection(collection).doc(docId(kind, key));
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const t = now();
      const prev = snap.exists ? snap.data() : {};
      const inWindow = prev.windowStart && t - prev.windowStart < windowMs;
      const count = (inWindow ? Number(prev.count) || 0 : 0) + 1;
      const next = { count, windowStart: inWindow ? prev.windowStart : t, lockedUntil: null, updatedAt: t };
      if (count >= max) next.lockedUntil = t + lockMs;
      tx.set(ref, next);
      return next.lockedUntil ? { locked: true, retryAfterMs: next.lockedUntil - t } : { locked: false, retryAfterMs: 0 };
    });
  }

  async function clear(kind, key) {
    await db.collection(collection).doc(docId(kind, key)).delete();
  }

  return { check, hit, clear, policyFor };
}

// Client address behind Firebase Hosting / Cloud Run: first x-forwarded-for entry.
function clientAddress(req) {
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return xff || (req.ip ? String(req.ip) : 'unknown');
}

function retryMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

module.exports = { createLoginThrottle, clientAddress, retryMinutes, docId, DEFAULT_POLICY };
