'use strict';

// Adapts the installed @google/genai SDK (verified against
// node_modules/@google/genai/dist/genai.d.ts and README.md at implementation
// time — v2.17.0, classic `ai.chats.create()` / `Chat.sendMessage()` surface,
// NOT the newer Interactions API) to the minimal `{ send(state) }` protocol
// that server/aiAssist/chat.js's `runChat()` expects from its injected
// `client`. This module makes real network calls and is intentionally NOT
// unit-tested (chat.js's tests inject a fake client instead). It has not been
// runtime-verified against the live Gemini API — that verification is a
// required manual step before any production enablement (see
// docs/superpowers/plans/2026-08-13-ai-assist-chat-voice.md, "Production stop
// conditions": "Official model ID or ephemeral-token constraint syntax is
// unverified").

const { GoogleGenAI, FunctionCallingConfigMode } = require('@google/genai');

const FINAL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    citationIds: { type: 'array', items: { type: 'string' } },
    followUps: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'citationIds', 'followUps'],
};

// toolDeclarations: array of { name, description, parameters } (the
// `declaration` field already produced by each tools.js registry entry).
function createGeminiChatClient({ apiKey, model, systemInstruction, toolDeclarations }) {
  const ai = new GoogleGenAI({ apiKey });
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      responseMimeType: 'application/json',
      responseSchema: FINAL_RESPONSE_SCHEMA,
    },
  });

  let turn = 0;
  let sentToolResultCount = 0;

  return {
    async send(state) {
      turn += 1;

      let message;
      if (Array.isArray(state.toolResults) && state.toolResults.length > sentToolResultCount) {
        const newResults = state.toolResults.slice(sentToolResultCount);
        sentToolResultCount = state.toolResults.length;
        message = newResults.map((result) => ({
          functionResponse: { name: result.name, response: { result: result.data } },
        }));
      } else if (turn === 1) {
        const lastUserMessage = [...(state.messages || [])].reverse().find((m) => m.role === 'user');
        message = lastUserMessage ? lastUserMessage.text : '';
      } else {
        message = 'Provide your final answer now as the required JSON object.';
      }

      const response = await chat.sendMessage({ message });

      const calls = response.functionCalls;
      if (Array.isArray(calls) && calls.length > 0) {
        return { functionCalls: calls.map((call) => ({ name: call.name, args: call.args || {} })) };
      }

      const text = response.text || '';
      let finalResponse;
      try {
        finalResponse = JSON.parse(text);
      } catch (error) {
        throw new Error('Model did not return valid structured JSON for the final response');
      }
      return { finalResponse };
    },
  };
}

module.exports = { createGeminiChatClient, FINAL_RESPONSE_SCHEMA };
