const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTextSystemInstruction, buildLiveSystemInstruction } = require('./prompt');

test('text system instruction contains the required safety phrases', () => {
  const text = buildTextSystemInstruction({ promptVersion: 'ioct-readonly-v1' });
  assert.ok(text.includes('read-only'));
  assert.ok(text.includes('untrusted data'));
  assert.ok(text.includes('Never guess'));
  assert.ok(text.includes('Never manufacture a citation'));
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
