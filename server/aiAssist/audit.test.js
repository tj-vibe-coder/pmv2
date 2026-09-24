const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAuditRecord, recordAudit } = require('./audit');

const baseArgs = {
  requestId: 'r1',
  user: { id: 'u1', username: 'RJR' },
  channel: 'text',
  config: { promptVersion: 'ioct-readonly-v1', chatModel: 'gemini-3.5-flash-lite', liveModel: 'gemini-2.5-flash-native-audio-preview-12-2025' },
  toolNames: ['search_projects'],
  outcome: 'success',
  latencyMs: 42,
  usage: null,
};

test('buildAuditRecord never carries prompt/answer content even if smuggled through usage', () => {
  const record = buildAuditRecord({ ...baseArgs, usage: { inputTokens: 10, prompt: 'super secret prompt text' } });
  assert.equal(record.usage.prompt, undefined);
  assert.deepEqual(record.usage, { inputTokens: 10 });
});

test('recordAudit sanitizes an already-built record before persisting, dropping unexpected keys', async () => {
  const writes = [];
  const db = { collection: () => ({ add: async (record) => { writes.push(record); } }) };
  const smuggled = {
    userId: 'u1',
    username: 'RJR',
    channel: 'text',
    promptVersion: 'ioct-readonly-v1',
    model: 'gemini-3.5-flash-lite',
    toolNames: ['search_projects'],
    outcome: 'success',
    latencyMs: 5,
    usage: null,
    createdAt: '2026-08-13T00:00:00.000Z',
    requestId: 'r2',
    promptText: 'this must never be written',
    accessToken: 'should-also-never-be-written',
  };
  await recordAudit({ db, ...smuggled });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].promptText, undefined);
  assert.equal(writes[0].accessToken, undefined);
});

test('recordAudit swallows a throwing db write and still returns the record', async () => {
  const db = { collection: () => ({ add: async () => { throw new Error('boom'); } }) };
  const record = await recordAudit({ db, ...baseArgs });
  assert.equal(record.outcome, 'success');
});
