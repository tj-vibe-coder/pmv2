const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAiAssistConfig } = require('./config');

test('AI Assist is disabled unless explicitly enabled', () => {
  const config = loadAiAssistConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(config.allowedUsers, ['RJR', 'TJC']);
  assert.equal(config.chatModel, 'gemini-3.5-flash-lite');
});

test('limits are clamped to safe ranges', () => {
  const config = loadAiAssistConfig({
    AI_ASSIST_ENABLED: 'true',
    AI_ASSIST_MAX_TOOL_ROUNDS: '999',
    AI_ASSIST_MAX_RESULT_BYTES: '9999999',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.maxToolRounds, 6);
  assert.equal(config.maxResultBytes, 100000);
});
