'use strict';

// Provisions a constrained, single-use Gemini Live ephemeral token via
// @google/genai's `authTokens.create()` (verified against
// node_modules/@google/genai/dist/genai.d.ts — CreateAuthTokenConfig /
// LiveConnectConstraints — at implementation time, v2.17.0). Not
// unit-tested against the live API (liveToken.test.js injects a fake
// `createClient`) — needs manual verification before production enablement,
// same as server/aiAssist/geminiClient.js.

const NEW_SESSION_WINDOW_SECONDS = 60;

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

// createClient: (apiKey) => { authTokens: { create(params) } } — defaults to
// the real SDK; tests inject a fake to avoid network calls.
async function issueLiveToken({ createClient, apiKey, config, systemInstruction, toolDeclarations, now = () => new Date() }) {
  const ai = createClient(apiKey);
  const nowDate = now();

  let response;
  try {
    response = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: addSeconds(nowDate, config.liveSessionSeconds),
        newSessionExpireTime: addSeconds(nowDate, NEW_SESSION_WINDOW_SECONDS),
        liveConnectConstraints: {
          model: config.liveModel,
          config: {
            responseModalities: ['AUDIO'],
            sessionResumption: {},
            systemInstruction,
            tools: [{ functionDeclarations: toolDeclarations }],
          },
        },
        // Locks every field under liveConnectConstraints.config so a
        // browser holding the token cannot request a different model,
        // modality, or tool set than what was approved server-side.
        lockAdditionalFields: ['model', 'responseModalities', 'sessionResumption', 'systemInstruction', 'tools'],
      },
    });
  } catch (error) {
    throw new Error('AI provider token request failed');
  }

  if (!response || typeof response.name !== 'string' || !response.name) {
    throw new Error('AI provider did not return a usable token');
  }

  return {
    token: response.name,
    model: config.liveModel,
    expireTime: addSeconds(nowDate, config.liveSessionSeconds),
    newSessionExpireTime: addSeconds(nowDate, NEW_SESSION_WINDOW_SECONDS),
  };
}

module.exports = { issueLiveToken };
