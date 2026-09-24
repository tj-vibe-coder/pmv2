const test = require('node:test');
const assert = require('node:assert/strict');
const { issueLiveToken } = require('./liveToken');

function baseArgs(overrides) {
  return Object.assign(
    {
      createClient: () => ({
        authTokens: { create: async () => ({ name: 'fake-token-123' }) },
      }),
      apiKey: 'unused-in-test',
      config: {
        liveModel: 'gemini-2.5-flash-native-audio-preview-12-2025',
        promptVersion: 'ioct-readonly-v1',
        liveSessionSeconds: 600,
      },
      systemInstruction: 'SYSTEM PROMPT TEXT',
      toolDeclarations: [{ name: 'search_projects', description: 'd', parameters: { type: 'object', properties: {}, required: [] } }],
    },
    overrides,
  );
}

test('locks the ephemeral token to one use, the configured model, audio output, and session resumption', async () => {
  let capturedConfig;
  const args = baseArgs({
    createClient: () => ({
      authTokens: {
        create: async ({ config }) => {
          capturedConfig = config;
          return { name: 'fake-token-123' };
        },
      },
    }),
  });

  const result = await issueLiveToken(args);

  assert.equal(capturedConfig.uses, 1);
  assert.equal(capturedConfig.liveConnectConstraints.model, args.config.liveModel);
  assert.deepEqual(capturedConfig.liveConnectConstraints.config.responseModalities, ['AUDIO']);
  assert.ok(capturedConfig.liveConnectConstraints.config.sessionResumption);
  assert.deepEqual(capturedConfig.liveConnectConstraints.config.inputAudioTranscription, {});
  assert.deepEqual(capturedConfig.liveConnectConstraints.config.outputAudioTranscription, {});
  assert.equal(capturedConfig.liveConnectConstraints.config.systemInstruction, args.systemInstruction);
  assert.deepEqual(
    capturedConfig.liveConnectConstraints.config.tools,
    [{ functionDeclarations: args.toolDeclarations }],
  );
  assert.equal(capturedConfig.lockAdditionalFields, undefined);

  const now = Date.now();
  const newSessionMs = new Date(capturedConfig.newSessionExpireTime).getTime() - now;
  assert.ok(newSessionMs > 0 && newSessionMs <= 65000, `newSessionExpireTime should be ~60s out, got ${newSessionMs}ms`);
  const expireMs = new Date(capturedConfig.expireTime).getTime() - now;
  assert.ok(expireMs > 590000 && expireMs <= 610000, `expireTime should be ~${args.config.liveSessionSeconds}s out, got ${expireMs}ms`);

  assert.equal(result.token, 'fake-token-123');
  assert.equal(result.model, args.config.liveModel);
  assert.equal(typeof result.expireTime, 'string');
  assert.equal(typeof result.newSessionExpireTime, 'string');
});

test('the returned token object never contains the API key or client credentials', async () => {
  const args = baseArgs();
  const result = await issueLiveToken(args);
  const text = JSON.stringify(result).toLowerCase();
  assert.ok(!text.includes('apikey'));
  assert.ok(!text.includes('unused-in-test'));
});

test('throws if the provider returns no token name', async () => {
  const args = baseArgs({
    createClient: () => ({ authTokens: { create: async () => ({}) } }),
  });
  await assert.rejects(() => issueLiveToken(args));
});

test('provider errors are sanitized, never the raw upstream message', async () => {
  const args = baseArgs({
    createClient: () => ({
      authTokens: { create: async () => { throw new Error('upstream leaked-secret-abc'); } },
    }),
  });
  await assert.rejects(
    () => issueLiveToken(args),
    (err) => {
      assert.ok(!String(err.message).includes('leaked-secret-abc'));
      return true;
    },
  );
});

test('only the approved tool declarations reach the token constraints — nothing from args is passed through unchecked', async () => {
  let capturedConfig;
  const args = baseArgs({
    createClient: () => ({
      authTokens: {
        create: async ({ config }) => {
          capturedConfig = config;
          return { name: 'fake-token-123' };
        },
      },
    }),
    toolDeclarations: [{ name: 'search_projects' }, { name: 'get_expense_summary' }],
  });
  await issueLiveToken(args);
  const names = capturedConfig.liveConnectConstraints.config.tools[0].functionDeclarations.map((d) => d.name);
  assert.deepEqual(names, ['search_projects', 'get_expense_summary']);
});
