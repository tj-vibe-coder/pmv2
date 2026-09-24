'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssistChatClient } = require('./providers');
const { loadAiAssistConfig } = require('./config');

test('default config selects the gemini chat provider', () => {
  const config = loadAiAssistConfig({});
  assert.equal(config.chatProvider, 'gemini');
});

test('unknown AI_ASSIST_CHAT_PROVIDER is invalid and cannot create a client', () => {
  const config = loadAiAssistConfig({ AI_ASSIST_CHAT_PROVIDER: 'openai' });
  assert.equal(config.chatProvider, 'invalid');
  assert.throws(
    () => createAssistChatClient({
      config,
      apiKey: 'k',
      systemInstruction: 'x',
      toolDeclarations: [],
    }),
    (err) => err.code === 'unknown_chat_provider',
  );
});

test('gemini provider returns a send() client', () => {
  const config = loadAiAssistConfig({ AI_ASSIST_CHAT_PROVIDER: 'gemini' });
  const client = createAssistChatClient({
    config,
    apiKey: 'k',
    systemInstruction: 'x',
    toolDeclarations: [],
  });
  assert.equal(typeof client.send, 'function');
});
