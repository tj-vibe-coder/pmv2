const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAiUser, projectProjection } = require('./access');

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

test('authorizeAiUser rejects when username is missing/null', () => {
  const config = { enabled: true, allowedUsers: ['RJR', 'TJC'] };
  assert.equal(authorizeAiUser(null, config).status, 401);
  assert.equal(authorizeAiUser({}, config).status, 401);
});
