const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAiUser, projectProjection, clientProjection } = require('./access');

test('allows only enabled RJR/TJC accounts', () => {
  const config = { enabled: true, allowedUsers: ['RJR', 'TJC'] };
  assert.equal(authorizeAiUser({ username: 'rjr' }, config).ok, true);
  assert.equal(authorizeAiUser({ username: 'viewer' }, config).status, 403);
});

test('fails closed while feature is disabled', () => {
  assert.equal(authorizeAiUser({ username: 'RJR' }, { enabled: false, allowedUsers: ['RJR'] }).status, 503);
});

test('project projection drops unexpected and secret-like fields', () => {
  const value = projectProjection({ id: 'p1', project_name: 'Plant Upgrade', contract_amount: 50, password_hash: 'x', token: 'y' });
  assert.deepEqual(value, { id: 'p1', project_name: 'Plant Upgrade', contract_amount: 50 });
});

test('client projection keeps only company id, code, and name', () => {
  const value = clientProjection({
    id: 'c1',
    code: 'RZC',
    name: 'Rezcoat',
    contacts: [{ email: 'a@b.com' }],
    address: 'hidden',
    am: 'TJC',
  });
  assert.deepEqual(value, { id: 'c1', code: 'RZC', name: 'Rezcoat' });
});

test('authorizeAiUser rejects when username is missing/null', () => {
  const config = { enabled: true, allowedUsers: ['RJR', 'TJC'] };
  assert.equal(authorizeAiUser(null, config).status, 401);
  assert.equal(authorizeAiUser({}, config).status, 401);
});

test('authorizeAiUser rejects scanner-scoped sessions even for allowlisted users', () => {
  const config = { enabled: true, allowedUsers: ['RJR', 'TJC'] };
  const result = authorizeAiUser({ username: 'RJR', scannerScope: true }, config);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});
