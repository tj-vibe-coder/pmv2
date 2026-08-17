'use strict';

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const CHAT_PROVIDERS = ['gemini'];

function loadAiAssistConfig(env = process.env) {
  const requested = String(env.AI_ASSIST_CHAT_PROVIDER || 'gemini').trim().toLowerCase();
  const chatProvider = CHAT_PROVIDERS.includes(requested) ? requested : 'invalid';
  return Object.freeze({
    enabled: env.AI_ASSIST_ENABLED === 'true',
    allowedUsers: (env.AI_ASSIST_ALLOWED_USERS || 'RJR,TJC')
      .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean),
    promptVersion: env.AI_ASSIST_PROMPT_VERSION || 'ioct-readonly-v1',
    chatProvider,
    chatModel: env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite',
    liveModel: env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview',
    maxToolRounds: clampInt(env.AI_ASSIST_MAX_TOOL_ROUNDS, 4, 1, 6),
    maxResultBytes: clampInt(env.AI_ASSIST_MAX_RESULT_BYTES, 60000, 10000, 100000),
    maxMessages: 12,
    maxMessageChars: 4000,
    maxConversationChars: 16000,
    liveSessionSeconds: 600,
  });
}

module.exports = { loadAiAssistConfig, CHAT_PROVIDERS };
