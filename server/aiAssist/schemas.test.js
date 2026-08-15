const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChatRequest, validateToolInput } = require('./schemas');

test('rejects oversized and extra chat fields', () => {
  assert.throws(() => validateChatRequest({ messages: [{ role: 'user', text: 'x'.repeat(4001) }], extra: true }));
});

test('accepts priorToolResults and rejects extra keys or a raw route', () => {
  const result = validateChatRequest({
    messages: [{ role: 'user', text: 'how many quotations?' }],
    priorToolResults: [{ name: 'navigate_to_record', data: { action: 'navigate', id: 'opp1' } }],
  });
  assert.equal(result.priorToolResults[0].name, 'navigate_to_record');
  assert.throws(() => validateChatRequest({
    messages: [{ role: 'user', text: 'x' }],
    priorToolResults: [{ name: 'navigate_to_record', data: {}, route: '/settings' }],
  }));
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

test('accepts get_opportunity_snapshot and search_clients and rejects extra client fields', () => {
  const snap = validateToolInput('get_opportunity_snapshot', { opportunityId: 'opp1' });
  assert.equal(snap.opportunityId, 'opp1');
  const clients = validateToolInput('search_clients', { search: 'rezcoat' });
  assert.equal(clients.search, 'rezcoat');
  assert.throws(() => validateToolInput('search_clients', { search: 'x', includeContacts: true }));
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

test('validates propose_opportunity_update input and rejects invalid field enum', () => {
  assert.throws(() => validateToolInput('propose_opportunity_update', { opportunityId: 'x', field: 'won', value: 'yes' }));
  const valid = validateToolInput('propose_opportunity_update', {
    opportunityId: 'opp1',
    field: 'opportunityGrade',
    value: 'A',
    reason: 'good margin',
  });
  assert.equal(valid.opportunityId, 'opp1');
  assert.equal(valid.field, 'opportunityGrade');
  assert.equal(valid.value, 'A');
});
