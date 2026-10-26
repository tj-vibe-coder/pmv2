'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createApiAccessGate, PUBLIC_ROUTES } = require('./apiAccess');

const USERS = {
  'Bearer staff': { id: 'u1', role: 'user', approved: 1 },
  'Bearer pending': { id: 'u2', role: 'user', approved: 0 },
  'Bearer boss': { id: 'u3', role: 'superadmin', approved: 0 },
  'Bearer phone': { id: 'u1', role: 'user', approved: 1, scannerScope: true },
};

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use(createApiAccessGate({
    getCurrentUser: async (req) => USERS[req.headers.authorization] || null,
    isActiveUser: (u) => u.role === 'superadmin' || u.approved === 1,
  }));
  // Stand-ins for real routes; reaching one means the gate let the request through.
  for (const p of ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/qr/exchange',
    '/api/auth/logout', '/api/suppliers', '/api/onedrive/upload', '/api/project-expenses', '/api/scan-jobs/:id/result']) {
    app.post(p, (_req, res) => res.json({ reached: true }));
  }
  for (const p of ['/api/health', '/api/projects', '/api/calcsheet/quotations', '/api/auth/me', '/api/onedrive/children']) {
    app.get(p, (_req, res) => res.json({ reached: true }));
  }
  app.delete('/api/projects', (_req, res) => res.json({ reached: true }));
  app.get('/not-api', (_req, res) => res.json({ reached: true }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn((method, url, token) => fetch(base + url, {
      method,
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'HEAD' ? undefined : '{}',
    }).then((r) => r.status));
  } finally {
    server.close();
  }
}

test('anonymous requests reach only the public routes', async () => {
  await withServer(async (call) => {
    assert.equal(await call('POST', '/api/auth/login'), 200);
    assert.equal(await call('POST', '/api/auth/register'), 200);
    assert.equal(await call('POST', '/api/auth/forgot-password'), 200);
    assert.equal(await call('POST', '/api/auth/qr/exchange'), 200);
    assert.equal(await call('POST', '/api/auth/logout'), 200);
    assert.equal(await call('GET', '/api/health'), 200);
    assert.equal(await call('HEAD', '/api/health'), 200);
    for (const [method, url] of [
      ['GET', '/api/calcsheet/quotations'], ['GET', '/api/projects'], ['POST', '/api/suppliers'],
      ['DELETE', '/api/projects'], ['GET', '/api/auth/me'], ['GET', '/api/onedrive/children'],
      ['GET', '/api/does-not-exist'], ['GET', '/api'],
    ]) {
      assert.equal(await call(method, url), 401, `${method} ${url}`);
    }
  });
});

test('case and trailing-slash variants of a protected path are still protected', async () => {
  await withServer(async (call) => {
    for (const url of ['/API/calcsheet/quotations', '/Api/Projects/', '/api/projects/', '/api/projects//']) {
      assert.equal(await call('GET', url), 401, url);
    }
    // ...and a public route's method is part of the match.
    assert.equal(await call('GET', '/api/auth/login'), 401);
  });
});

test('approved users get through; unapproved ones do not (superadmin is always active)', async () => {
  await withServer(async (call) => {
    assert.equal(await call('GET', '/api/calcsheet/quotations', 'staff'), 200);
    assert.equal(await call('DELETE', '/api/projects', 'staff'), 200);
    assert.equal(await call('GET', '/api/calcsheet/quotations', 'pending'), 401);
    assert.equal(await call('GET', '/api/calcsheet/quotations', 'boss'), 200);
    assert.equal(await call('GET', '/api/calcsheet/quotations', 'nonsense'), 401);
  });
});

test('phone scanner sessions reach only the scanner routes, with 403 so the phone keeps its token', async () => {
  await withServer(async (call) => {
    for (const [method, url] of [
      ['GET', '/api/auth/me'], ['GET', '/api/projects'], ['POST', '/api/onedrive/upload'],
      ['POST', '/api/project-expenses'], ['POST', '/api/scan-jobs/abc123/result'],
    ]) {
      assert.equal(await call(method, url, 'phone'), 200, `${method} ${url}`);
    }
    for (const [method, url] of [
      ['GET', '/api/calcsheet/quotations'], ['GET', '/api/onedrive/children'], ['DELETE', '/api/projects'], ['POST', '/api/suppliers'],
    ]) {
      assert.equal(await call(method, url, 'phone'), 403, `${method} ${url}`);
    }
  });
});

test('non-API paths are left alone', async () => {
  await withServer(async (call) => {
    assert.equal(await call('GET', '/not-api'), 200);
  });
});

test('the public list stays small; growing it should be a deliberate change', () => {
  assert.deepEqual(PUBLIC_ROUTES.map(([verb, re]) => `${verb} ${re.source}`), [
    'POST ^\\/api\\/auth\\/login$',
    'POST ^\\/api\\/auth\\/logout$',
    'POST ^\\/api\\/auth\\/register$',
    'POST ^\\/api\\/auth\\/forgot-password$',
    'POST ^\\/api\\/auth\\/qr\\/exchange$',
    'GET ^\\/api\\/health$',
  ]);
});

test('server.js mounts the gate before declaring any route or router', () => {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').split('\n');
  const gateLine = lines.findIndex((l) => /^app\.use\(createApiAccessGate\(/.test(l));
  assert.ok(gateLine > 0, 'app.use(createApiAccessGate(...)) not found in server.js');
  // A route, or an app.use mounting something on /api (possibly with the path on the next line).
  const firstRoute = lines.findIndex((l, i) => /^\s*app\.(get|post|put|patch|delete|all)\(/.test(l)
    || (/^\s*app\.use\(/.test(l) && /['"`]\/api/.test(l + (lines[i + 1] || ''))));
  assert.ok(firstRoute > gateLine, `a route is declared on line ${firstRoute + 1}, before the gate on line ${gateLine + 1}`);
});
