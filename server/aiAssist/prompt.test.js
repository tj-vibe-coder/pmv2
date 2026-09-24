const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTextSystemInstruction, buildLiveSystemInstruction } = require('./prompt');

test('text system instruction contains the required safety phrases', () => {
  const text = buildTextSystemInstruction({ promptVersion: 'ioct-readonly-v1' });
  assert.ok(text.includes('read-only'));
  assert.ok(text.includes('propose_opportunity_update'));
  assert.ok(text.includes('applied: true'));
  assert.ok(text.includes('untrusted data'));
  assert.ok(text.includes('Never guess'));
  assert.ok(text.includes('Never manufacture a citation'));
  assert.ok(text.includes('navigate_to_record'));
  assert.ok(text.includes('list_quotations_for_opportunity'));
  assert.ok(text.includes('get_opportunity_snapshot'));
  assert.ok(text.includes('search_clients'));
});

test('live system instruction extends the text instruction with voice rules', () => {
  const text = buildLiveSystemInstruction({ promptVersion: 'ioct-readonly-v1' });
  assert.ok(text.includes('read-only'));
  assert.ok(text.includes('untrusted data'));
  assert.ok(text.includes('Stop speaking immediately when interrupted'));
});

test('never concatenates database values into the instruction', () => {
  const text = buildTextSystemInstruction({ promptVersion: 'ioct-readonly-v1', evilInjectedField: '<script>alert(1)</script>' });
  assert.ok(!text.includes('<script>'));
});

test('text system instruction requires a raw JSON final response; live instruction does not', () => {
  const text = buildTextSystemInstruction({ promptVersion: 'ioct-readonly-v1' });
  assert.ok(text.includes('OUTPUT FORMAT'));
  assert.ok(text.includes('raw JSON object'));
  assert.ok(text.includes('"citationIds"'));

  const live = buildLiveSystemInstruction({ promptVersion: 'ioct-readonly-v1' });
  assert.ok(!live.includes('OUTPUT FORMAT'));
  assert.ok(!live.includes('raw JSON object'));
});
