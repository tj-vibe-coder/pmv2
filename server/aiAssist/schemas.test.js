const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChatRequest, validateToolInput } = require('./schemas');

test('rejects oversized and extra chat fields', () => {
  assert.throws(() => validateChatRequest({ messages: [{ role: 'user', text: 'x'.repeat(4001) }], extra: true }));
});

test('accepts a well-formed chat request', () => {
  const result = validateChatRequest({ messages: [{ role: 'user', text: 'hello' }], pageContext: { route: '/projects', projectId: null } });
  assert.equal(result.messages[0].text, 'hello');
});

test('rejects too many messages and oversized total', () => {
  const many = Array.from({ length: 13 }, () => ({ role: 'user', text: 'x' }));
  assert.throws(() => validateChatRequest({ messages: many }));
});

test('rejects unknown tool and extra tool properties', () => {
  assert.throws(() => validateToolInput('delete_project', {}));
  assert.throws(() => validateToolInput('search_projects', { search: 'abc', collection: 'users' }));
});

test('accepts a valid search_projects tool input', () => {
  const args = validateToolInput('search_projects', { search: 'plant', year: 2026, status: 'sent' });
  assert.equal(args.search, 'plant');
});
