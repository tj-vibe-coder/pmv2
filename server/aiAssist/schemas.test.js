const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChatRequest, validateToolInput } = require('./schemas');

test('rejects oversized and extra chat fields', () => {
  assert.throws(() => validateChatRequest({ messages: [{ role: 'user', text: 'x'.repeat(4001) }], extra: true }));
});

test('accepts a well-formed chat request', () => {
  const result = validateChatRequest({ messages: [{ role: 'user', text: 'hello' }], pageContext: { route: '/projects', projectId: null } });
  assert.equal(result.messages[0].text, 'hello');
  assert.equal(result.pageContext.opportunityId, null);
  assert.equal(result.pageContext.quotationId, null);
});

test('accepts pageContext opportunity and quotation ids', () => {
  const result = validateChatRequest({
    messages: [{ role: 'user', text: 'hello' }],
    pageContext: { route: '/sales/calcsheet/projects/o1', projectId: null, opportunityId: 'o1', quotationId: null },
  });
  assert.equal(result.pageContext.opportunityId, 'o1');
});

test('rejects a route argument on navigate_to_record', () => {
  assert.throws(() => validateToolInput('navigate_to_record', { search: 'rezcoat', route: '/settings/users' }));
});

test('accepts navigate_to_record and list_quotations_for_opportunity inputs', () => {
  const nav = validateToolInput('navigate_to_record', { search: 'rezcoat', kind: 'opportunity' });
  assert.equal(nav.kind, 'opportunity');
  const list = validateToolInput('list_quotations_for_opportunity', { opportunityId: 'opp1' });
  assert.equal(list.opportunityId, 'opp1');
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
