'use strict';

const { createGeminiChatClient } = require('./geminiClient');

const CHAT_CLIENTS = {
  gemini: createGeminiChatClient,
};

function createAssistChatClient({ config, apiKey, systemInstruction, toolDeclarations }) {
  const factory = CHAT_CLIENTS[config && config.chatProvider];
  if (!factory) {
    const error = new Error('unknown_chat_provider');
    error.code = 'unknown_chat_provider';
    throw error;
  }
  return factory({
    apiKey,
    model: config.chatModel,
    systemInstruction,
    toolDeclarations,
  });
}

module.exports = { createAssistChatClient, CHAT_CLIENTS };
