# IOCT Read-only AI Assist Chat and Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, cited, read-only PMv2 assistant with structured text chat through Gemini 3.5 Flash-Lite and push-to-talk native voice through a configurable Gemini Live model.

**Architecture:** Text and voice are separate model sessions over one schema-validated server tool registry. The Express/Cloud Functions server owns Gemini credentials, authorization, Firestore projections, citations, limits, and metadata-only audit; the React client owns the drawer, transient conversation state, and Live PCM capture/playback using a constrained ephemeral token.

**Tech Stack:** React 19, TypeScript 4.9, MUI 7, Express 5, Firebase Admin/Firestore Emulator, `@google/genai`, Jest/Testing Library, Node `node:test`, Web Audio API/AudioWorklet.

---

## File structure

### Canonical server modules

- Create `server/aiAssist/config.js` — environment parsing and hard limits.
- Create `server/aiAssist/access.js` — authenticated allowlist policy and redaction helpers.
- Create `server/aiAssist/schemas.js` — strict validators and final response schema.
- Create `server/aiAssist/prompt.js` — versioned text and Live instructions.
- Create `server/aiAssist/tools.js` — declarations, executors, sanitized sources.
- Create `server/aiAssist/chat.js` — bounded function-calling loop.
- Create `server/aiAssist/liveToken.js` — ephemeral Live token provisioning.
- Create `server/aiAssist/audit.js` — privacy-minimized audit writes.
- Create `server/aiAssist/router.js` — authenticated routes.
- Create `server/aiAssist/*.test.js` — pure and route tests.
- Create `server/aiAssist/tools.emulator.test.js` — synthetic Firestore tests.

### Deployment mirror

- Create `scripts/sync-ai-assist.mjs` — canonical-to-Functions copy and `--check` drift detection.
- Generate `functions/server/aiAssist/*` from `server/aiAssist/*`.
- Modify `server.js` and `functions/server.js` — mount the same router.
- Modify root `package.json`, `package-lock.json`, `functions/package.json`, and `functions/package-lock.json` — add `@google/genai` and AI test/sync scripts.

### Client

- Create `src/types/AiAssist.ts` — request, answer, citation, and Live state types.
- Create `src/services/aiAssistService.ts` — authenticated chat, token, and Live tool HTTP calls.
- Create `src/services/aiAssistService.test.ts`.
- Create `src/ai/audio/pcm.ts`, `src/ai/audio/pcm.test.ts` — conversion/resampling.
- Create `src/ai/audio/ioct-assist-capture.worklet.js` — microphone float frames.
- Create `src/ai/liveClient.ts`, `src/ai/liveClient.test.ts` — WebSocket/session state and playback.
- Create `src/components/ai/AiAssistProvider.tsx` — one global memory-only session owner.
- Create `src/components/ai/AiAssistLauncher.tsx`.
- Create `src/components/ai/AiAssistDrawer.tsx` and test.
- Create `src/components/ai/AiMessageList.tsx` and test.
- Create `src/components/ai/AiComposer.tsx` and test.
- Modify `src/App.tsx` — mount provider/launcher inside authenticated `AppLayout`.

### Docs

- Modify `docs/product/PRD.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/agent/PROJECT_STATE.md`, and the atomized memory index/log.

## Task 1: Add the SDK and fail-closed configuration

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `functions/package.json`
- Modify: `functions/package-lock.json`
- Create: `server/aiAssist/config.js`
- Test: `server/aiAssist/config.test.js`

- [ ] **Step 1: Write configuration tests**

```js
// server/aiAssist/config.test.js
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
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node --test server/aiAssist/config.test.js`

Expected: FAIL with `Cannot find module './config'`.

- [ ] **Step 3: Install the current SDK in both packages**

Run:

```bash
npm install @google/genai
npm install --prefix functions @google/genai
```

Keep `@google/generative-ai` because the existing receipt parser still imports it; migrating receipt parsing is outside this feature.

- [ ] **Step 4: Implement strict configuration**

```js
// server/aiAssist/config.js
'use strict';

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function loadAiAssistConfig(env = process.env) {
  return Object.freeze({
    enabled: env.AI_ASSIST_ENABLED === 'true',
    allowedUsers: (env.AI_ASSIST_ALLOWED_USERS || 'RJR,TJC')
      .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean),
    promptVersion: env.AI_ASSIST_PROMPT_VERSION || 'ioct-readonly-v1',
    chatModel: env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite',
    liveModel: env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025',
    maxToolRounds: clampInt(env.AI_ASSIST_MAX_TOOL_ROUNDS, 4, 1, 6),
    maxResultBytes: clampInt(env.AI_ASSIST_MAX_RESULT_BYTES, 60000, 10000, 100000),
    maxMessages: 12,
    maxMessageChars: 4000,
    maxConversationChars: 16000,
    liveSessionSeconds: 600,
  });
}

module.exports = { loadAiAssistConfig };
```

- [ ] **Step 5: Run the focused tests**

Run: `node --test server/aiAssist/config.test.js`

Expected: 2 passing tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json functions/package.json functions/package-lock.json server/aiAssist/config.js server/aiAssist/config.test.js
git commit -m "chore(ai-assist): add Gemini SDK and safe configuration"
```

## Task 2: Lock authorization, validation, and response contracts

**Files:**

- Create: `server/aiAssist/access.js`
- Create: `server/aiAssist/schemas.js`
- Test: `server/aiAssist/access.test.js`
- Test: `server/aiAssist/schemas.test.js`

- [ ] **Step 1: Write failing access and input tests**

```js
// server/aiAssist/access.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAiUser, projectProjection } = require('./access');

test('allows only enabled RJR/TJC accounts', () => {
  const config = { enabled: true, allowedUsers: ['RJR', 'TJC'] };
  assert.equal(authorizeAiUser({ username: 'rjr' }, config).ok, true);
  assert.equal(authorizeAiUser({ username: 'viewer' }, config).status, 403);
});

test('fails closed while feature is disabled', () => {
  assert.equal(authorizeAiUser({ username: 'RJR' }, { enabled: false, allowedUsers: ['RJR'] }).status, 503);
});

test('project projection drops unexpected and secret-like fields', () => {
  const value = projectProjection({ id: 'p1', project_name: 'Plant Upgrade', contract_amount: 50, password_hash: 'x', token: 'y' });
  assert.deepEqual(value, { id: 'p1', project_name: 'Plant Upgrade', contract_amount: 50 });
});
```

```js
// server/aiAssist/schemas.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChatRequest, validateToolInput } = require('./schemas');

test('rejects oversized and extra chat fields', () => {
  assert.throws(() => validateChatRequest({ messages: [{ role: 'user', text: 'x'.repeat(4001) }], extra: true }));
});

test('rejects unknown tool and extra tool properties', () => {
  assert.throws(() => validateToolInput('delete_project', {}));
  assert.throws(() => validateToolInput('search_projects', { search: 'abc', collection: 'users' }));
});
```

- [ ] **Step 2: Verify the tests fail for missing modules**

Run: `node --test server/aiAssist/access.test.js server/aiAssist/schemas.test.js`

Expected: FAIL with missing `access` and `schemas` modules.

- [ ] **Step 3: Implement allowlist projections**

In `access.js`, implement `pick(record, fields)` and export projections whose field arrays are explicit constants. The project projection must include only:

```js
const PROJECT_FIELDS = [
  'id', 'project_no', 'year', 'am', 'ovp_number', 'po_number', 'account_name',
  'project_name', 'project_category', 'project_location', 'scope_of_work',
  'project_status', 'updated_contract_amount', 'contract_billed',
  'amount_contract_billed_net', 'total_contract_balance', 'actual_site_progress_percent',
  'evaluated_progress_percent', 'completion_date', 'updated_completion_date', 'remarks', 'updated_at'
];
```

Add similarly explicit opportunity, quotation, and aggregate projections. Do not implement a general recursive “remove secrets” filter as the primary defense.

- [ ] **Step 4: Implement handwritten strict validators**

Use dependency-free validators because adding a schema library is unnecessary. Reject non-objects, inherited values, extra keys, invalid enum values, invalid IDs, non-integer limits, and strings beyond specified bounds. Export JSON-schema declarations from the same field constants so Gemini declarations and server validation cannot drift.

The final response validator must accept exactly `{ answer, citationIds, followUps }`, where `answer` is 1–6000 characters, `citationIds` contains at most 20 strings, and `followUps` contains at most 3 strings of 120 characters.

- [ ] **Step 5: Run tests**

Run: `node --test server/aiAssist/access.test.js server/aiAssist/schemas.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/aiAssist/access.js server/aiAssist/access.test.js server/aiAssist/schemas.js server/aiAssist/schemas.test.js
git commit -m "feat(ai-assist): enforce read-only access contracts"
```

## Task 3: Build deterministic read-only Firestore tools

**Files:**

- Create: `server/aiAssist/tools.js`
- Test: `server/aiAssist/tools.test.js`
- Test: `server/aiAssist/tools.emulator.test.js`

- [ ] **Step 1: Write failing registry tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolRegistry } = require('./tools');

test('registry exposes exactly the approved read-only tools', () => {
  const registry = createToolRegistry({ db: {} });
  assert.deepEqual([...registry.keys()].sort(), [
    'get_expense_summary', 'get_portfolio_summary', 'get_project_snapshot',
    'get_quotation_summary', 'search_projects', 'search_sales_opportunities'
  ]);
});

test('unknown tools fail closed', async () => {
  const registry = createToolRegistry({ db: {} });
  assert.equal(registry.has('delete_project'), false);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test server/aiAssist/tools.test.js`

Expected: FAIL with missing `tools` module.

- [ ] **Step 3: Implement the fixed registry interface**

```js
function createToolRegistry({ db, now = () => new Date() }) {
  return new Map([
    ['search_projects', { declaration: SEARCH_PROJECTS_DECLARATION, execute: (args) => searchProjects(db, args, now) }],
    ['get_project_snapshot', { declaration: GET_PROJECT_SNAPSHOT_DECLARATION, execute: (args) => getProjectSnapshot(db, args, now) }],
    ['get_portfolio_summary', { declaration: GET_PORTFOLIO_SUMMARY_DECLARATION, execute: (args) => getPortfolioSummary(db, args, now) }],
    ['search_sales_opportunities', { declaration: SEARCH_SALES_DECLARATION, execute: (args) => searchSalesOpportunities(db, args, now) }],
    ['get_quotation_summary', { declaration: GET_QUOTATION_SUMMARY_DECLARATION, execute: (args) => getQuotationSummary(db, args, now) }],
    ['get_expense_summary', { declaration: GET_EXPENSE_SUMMARY_DECLARATION, execute: (args) => getExpenseSummary(db, args, now) }],
  ]);
}
```

Each result must have `{ data, sources, asOf }`. Sources have `{ id, label, route, asOf }`. Never accept a collection name from args. Cap fetched/projected records before JSON serialization and sort deterministically.

- [ ] **Step 4: Implement aggregate parity tests**

Use fixture records to assert portfolio totals equal existing PMv2 meanings: updated contract amount, net billed amount, remaining balance, evaluated progress, status grouping. Use `node:test` with an injected fake collection adapter for unit tests.

- [ ] **Step 5: Add emulator integration tests**

Skip unless `FIRESTORE_EMULATOR_HOST` is set. Seed synthetic documents with obvious fake names, execute all six tools, assert projections exclude `password_hash`, `accessToken`, receipt bodies, and non-allowlisted fields, then delete only the test namespace documents.

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=pmv2-851ae node --test server/aiAssist/tools.emulator.test.js
```

Expected: six tool scenarios pass against synthetic data.

- [ ] **Step 6: Commit**

```bash
git add server/aiAssist/tools.js server/aiAssist/tools.test.js server/aiAssist/tools.emulator.test.js
git commit -m "feat(ai-assist): add allowlisted Firestore query tools"
```

## Task 4: Implement prompts and bounded text orchestration

**Files:**

- Create: `server/aiAssist/prompt.js`
- Create: `server/aiAssist/chat.js`
- Test: `server/aiAssist/prompt.test.js`
- Test: `server/aiAssist/chat.test.js`

- [ ] **Step 1: Write prompt-injection and tool-budget tests**

The prompt test must assert the exact strings `read-only`, `untrusted data`, `Never guess`, and `Never manufacture a citation`. The chat test uses a fake client that requests `search_projects`, returns a final structured answer, and proves a fifth tool round is rejected when `maxToolRounds` is four.

```js
test('derives citations only from executed tools', async () => {
  const result = await runChat({ client: fakeClientWithCitationIds(['project:p1', 'project:invented']), registry, config, messages });
  assert.deepEqual(result.citations.map((c) => c.id), ['project:p1']);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test server/aiAssist/prompt.test.js server/aiAssist/chat.test.js`

Expected: missing module failures.

- [ ] **Step 3: Implement the approved prompt verbatim**

Export `buildTextSystemInstruction(config)` and `buildLiveSystemInstruction(config)` from `prompt.js`. Copy the approved prompt contract from the design spec. Do not concatenate database values into the system instruction.

- [ ] **Step 4: Implement the Gemini loop with dependency injection**

`runChat({ client, registry, config, messages, pageContext, requestId })` must:

1. Normalize and validate messages.
2. Call the configured model with the tool declarations.
3. Execute only declared calls through `validateToolInput`.
4. Enforce tool-round and serialized-byte budgets.
5. Return tool results to Gemini as data.
6. Request the strict final response schema.
7. Validate the final response and intersect citation IDs with collected server sources.
8. Return a fixed notice and never expose provider traces or thoughts.

Use `@google/genai` official syntax verified at implementation time; keep SDK creation outside `runChat` so tests never make network calls.

- [ ] **Step 5: Run tests**

Run: `node --test server/aiAssist/prompt.test.js server/aiAssist/chat.test.js`

Expected: prompt, function-call, unknown-tool, budget, insufficient-data, provider-error, and citation-filter tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/aiAssist/prompt.js server/aiAssist/prompt.test.js server/aiAssist/chat.js server/aiAssist/chat.test.js
git commit -m "feat(ai-assist): add bounded grounded chat orchestration"
```

## Task 5: Add audit, routes, rate limits, and deployment mirroring

**Files:**

- Create: `server/aiAssist/audit.js`
- Create: `server/aiAssist/router.js`
- Test: `server/aiAssist/router.test.js`
- Create: `scripts/sync-ai-assist.mjs`
- Test: `scripts/sync-ai-assist.test.mjs`
- Modify: `server.js`
- Modify: `functions/server.js`
- Modify: `package.json`

- [ ] **Step 1: Write route authorization tests**

Use a small Express test server on an ephemeral port and injected `getCurrentUser`, Gemini client, registry, and audit writer. Assert unauthenticated `401`, non-allowlisted `403`, disabled `503`, invalid body `400`, unknown Live tool `404`, rate limit `429`, provider error `502`, and successful `200`.

- [ ] **Step 2: Implement metadata-only audit**

```js
function buildAuditRecord({ requestId, user, channel, config, toolNames, outcome, latencyMs, usage }) {
  return {
    requestId,
    userId: String(user.id),
    username: String(user.username),
    channel,
    promptVersion: config.promptVersion,
    model: channel === 'voice' ? config.liveModel : config.chatModel,
    toolNames: [...new Set(toolNames)],
    outcome,
    latencyMs,
    usage: usage || null,
    createdAt: new Date().toISOString(),
  };
}
```

Tests must prove prompt text, answer text, args, results, authorization header, and provider token are absent.

- [ ] **Step 3: Implement router and per-user/IP limiter**

Use a bounded in-memory map with periodic pruning; limit chat to 20 requests per 10 minutes and Live token issuance to 3 per minute per authenticated user plus IP. Document that this is a per-instance cost guard, not a distributed security boundary. Reject before calling Gemini.

Mount using:

```js
const { createAiAssistRouter } = require('./server/aiAssist/router');
app.use('/api/ai-assist', createAiAssistRouter({ db, getCurrentUser }));
```

Use the equivalent Functions-local path in `functions/server.js` after mirroring.

- [ ] **Step 4: Implement deterministic mirror script**

The script recursively copies only `.js` files from `server/aiAssist` to `functions/server/aiAssist`, excluding `*.test.js`. `--check` compares relative paths and SHA-256 hashes without writing and exits nonzero on drift.

Add scripts:

```json
{
  "ai-assist:sync": "node scripts/sync-ai-assist.mjs",
  "ai-assist:check": "node scripts/sync-ai-assist.mjs --check",
  "test:ai-assist": "node --test server/aiAssist/*.test.js scripts/sync-ai-assist.test.mjs"
}
```

- [ ] **Step 5: Sync and verify both entrypoints**

Run:

```bash
npm run ai-assist:sync
npm run ai-assist:check
npm run test:ai-assist
node --check server.js
node --check functions/server.js
```

Expected: no mirror drift, all AI tests pass, both servers parse.

- [ ] **Step 6: Commit**

```bash
git add server/aiAssist/audit.js server/aiAssist/router.js server/aiAssist/router.test.js scripts/sync-ai-assist.mjs scripts/sync-ai-assist.test.mjs functions/server/aiAssist server.js functions/server.js package.json
git commit -m "feat(ai-assist): expose protected chat API"
```

## Task 6: Add typed client service and global transient state

**Files:**

- Create: `src/types/AiAssist.ts`
- Create: `src/services/aiAssistService.ts`
- Test: `src/services/aiAssistService.test.ts`
- Create: `src/components/ai/AiAssistProvider.tsx`
- Test: `src/components/ai/AiAssistProvider.test.tsx`

- [ ] **Step 1: Write service tests**

Assert the bearer token is included, abort signals propagate, non-JSON errors become generic messages, `401`/`403` remain distinguishable, and malformed successful payloads are rejected.

- [ ] **Step 2: Define exact client contracts**

```ts
export interface AiCitation { id: string; label: string; route: string; asOf: string }
export interface AiAnswer {
  ok: true; requestId: string; answer: string; citations: AiCitation[];
  followUps: string[]; notice: string;
}
export type AiMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; citations: AiCitation[]; notice: string }
  | { id: string; role: 'error'; text: string };
export type AiLivePhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'reconnecting' | 'error';
```

- [ ] **Step 3: Implement authenticated service functions**

Export `sendAiChat`, `requestLiveToken`, and `executeLiveTool`. Read `netpacific_token` at call time, accept `AbortSignal`, and never log request bodies.

- [ ] **Step 4: Implement one provider**

The provider owns open/closed state, memory-only messages, one active text abort controller, and later one Live client. On logout/unmount it aborts, closes Live, clears messages, and releases audio. It does not persist chat history.

- [ ] **Step 5: Run tests**

Run: `npm test -- --watchAll=false src/services/aiAssistService.test.ts src/components/ai/AiAssistProvider.test.tsx`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/AiAssist.ts src/services/aiAssistService.ts src/services/aiAssistService.test.ts src/components/ai/AiAssistProvider.tsx src/components/ai/AiAssistProvider.test.tsx
git commit -m "feat(ai-assist): add client contracts and session state"
```

## Task 7: Build the responsive text assistant UI

**Files:**

- Create: `src/components/ai/AiAssistLauncher.tsx`
- Create: `src/components/ai/AiAssistDrawer.tsx`
- Create: `src/components/ai/AiMessageList.tsx`
- Create: `src/components/ai/AiComposer.tsx`
- Test: `src/components/ai/AiAssistDrawer.test.tsx`
- Test: `src/components/ai/AiMessageList.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write interaction and XSS tests**

Cover open/close, send, loading, stop, retry, clear, source navigation, follow-up chips, narrow-screen dialog mode, disabled feature response, and a model string containing `<img src=x onerror=alert(1)>` rendered literally with no element creation.

- [ ] **Step 2: Implement accessible MUI components**

Mount inside `AppLayout`:

```tsx
<AiAssistProvider user={user}>
  {children}
  <AiAssistLauncher />
  <AiAssistDrawer />
</AiAssistProvider>
```

Render the launcher only for `RJR`/`TJC`; keep server authorization authoritative. Use a persistent `Read only` chip and the exact notice returned by the server. Use MUI `Drawer` on desktop and full-screen `Dialog` under the `sm` breakpoint.

- [ ] **Step 3: Add route-aware suggestions**

Use fixed local mappings only, for example `/projects` -> “Which open projects have the largest balance?” and `/sales` -> “Summarize opportunities currently for review.” Do not send hidden page DOM or form values as context.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test -- --watchAll=false src/components/ai/AiAssistDrawer.test.tsx src/components/ai/AiMessageList.test.tsx
npm run build
```

Expected: tests pass; CRA build completes with only documented existing warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai src/App.tsx
git commit -m "feat(ai-assist): add cited read-only chat drawer"
```

## Task 8: Provision constrained Live tokens and Live tool calls

**Files:**

- Create: `server/aiAssist/liveToken.js`
- Test: `server/aiAssist/liveToken.test.js`
- Modify: `server/aiAssist/router.js`
- Modify: `server/aiAssist/router.test.js`
- Generate: `functions/server/aiAssist/*`

- [ ] **Step 1: Write token-constraint tests with a fake SDK client**

Assert one use, one-minute new-session expiry, ten-minute expiry, configured model, audio response modality, session resumption, approved system instruction, approved tools only, and absence of the API key in the returned object.

- [ ] **Step 2: Implement token provisioning using current official syntax**

Create the server SDK client from `process.env.GEMINI_API_KEY` only after authorization. Lock every supported setup field in the ephemeral token constraints. If the selected model cannot be constrained as specified, fail the health check and keep voice disabled; never fall back to a browser API key.

- [ ] **Step 3: Add `/live-token` and `/tools/:name`**

Issue a random `liveSessionId` bound in memory to authenticated user ID and expiry. The tool route validates this binding, re-authorizes the current request, counts at most four tool calls per voice turn/eight per session, calls the same registry executor, and returns `{ result, sources }`.

- [ ] **Step 4: Sync and run server tests**

Run:

```bash
npm run ai-assist:sync
npm run ai-assist:check
npm run test:ai-assist
```

Expected: token and Live tool tests pass without a network call.

- [ ] **Step 5: Commit**

```bash
git add server/aiAssist/liveToken.js server/aiAssist/liveToken.test.js server/aiAssist/router.js server/aiAssist/router.test.js functions/server/aiAssist
git commit -m "feat(ai-assist): add constrained Gemini Live sessions"
```

## Task 9: Add browser PCM capture, playback, interruption, and push-to-talk

**Files:**

- Create: `src/ai/audio/pcm.ts`
- Test: `src/ai/audio/pcm.test.ts`
- Create: `src/ai/audio/ioct-assist-capture.worklet.js`
- Create: `src/ai/liveClient.ts`
- Test: `src/ai/liveClient.test.ts`
- Modify: `src/components/ai/AiAssistProvider.tsx`
- Modify: `src/components/ai/AiComposer.tsx`
- Modify: `src/components/ai/AiAssistDrawer.tsx`

- [ ] **Step 1: Write deterministic audio tests**

Test clipping and little-endian PCM16 encoding, 48 kHz -> 16 kHz resampling length/value tolerance, 24 kHz playback timeline continuity, stop clearing all active sources, and a stale start operation releasing its acquired stream.

- [ ] **Step 2: Implement pure PCM utilities**

```ts
export function float32ToPcm16Le(input: Float32Array): ArrayBuffer {
  const out = new ArrayBuffer(input.length * 2);
  const view = new DataView(out);
  input.forEach((value, index) => {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  });
  return out;
}
```

Implement `downsampleMono(input, sourceRate, 16000)` as a tested averaging resampler. Keep base64 conversion separate.

- [ ] **Step 3: Implement Live client lifecycle**

Follow the current official `@google/genai` browser Live API callbacks. Maintain a module/provider singleton with `operationId`, `startPromise`, media stream, capture context/worklet, playback context, socket/session, active sources, next play time, latest resumption token, and one reconnect attempt. Check the captured operation ID after every `await`.

On model interruption: stop active sources, clear the array, set next play time to `currentTime`, and report `interrupted`. On stop: invalidate the operation, close the Live session, disconnect nodes, stop tracks, close contexts, clear sources and citations, and return to idle.

- [ ] **Step 4: Implement push-to-talk UI**

Use pointer and keyboard press/release semantics with an explicit click fallback for assistive technology. Display mic permission, connection, listening, thinking, speaking, interruption, reconnect, and error states. Do not start on drawer open and do not implement ambient listening.

- [ ] **Step 5: Return Live tool results and show sources**

When the model emits a function call, call `executeLiveTool`, send the result back to the Live session using the official function-response message, and add only server-returned source chips to the visible voice transcript area.

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test -- --watchAll=false src/ai/audio/pcm.test.ts src/ai/liveClient.test.ts src/components/ai/AiAssistProvider.test.tsx
npm run build
```

Expected: all tests pass and the production build completes.

- [ ] **Step 7: Commit**

```bash
git add src/ai src/components/ai/AiAssistProvider.tsx src/components/ai/AiComposer.tsx src/components/ai/AiAssistDrawer.tsx
git commit -m "feat(ai-assist): add push-to-talk native voice"
```

## Task 10: Complete security, documentation, and rollout verification

**Files:**

- Modify: `docs/product/PRD.md`
- Modify: `docs/API.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/agent/PROJECT_STATE.md`
- Create: `docs/agent/memory/log/2026-08-13-ai-assist-chat-voice.md`
- Modify: `docs/agent/memory/index.md`
- Create: `docs/ai-assist-golden-questions.json`

- [ ] **Step 1: Add a 25-case factual safety rubric**

Include project lookup, portfolio aggregation, sales/quotation lookup, expense aggregation, ambiguous names, no data, conflicting data, prompt injection in remarks, invented citation attempt, payroll request, user/password request, raw receipt request, edit/approve/delete request, long input, and unauthorized account.

Each case includes `question`, synthetic fixture IDs, required source IDs, forbidden claims, and expected refusal category. Do not include production values.

- [ ] **Step 2: Run the complete automated checks**

```bash
npm run test:ai-assist
npm test -- --watchAll=false
npm run test:product-history
npm run ai-assist:check
npm run build
npm audit --omit=dev
npm audit --prefix functions --omit=dev
```

Expected: tests/build/mirror check pass. Audit findings must be triaged; do not run `npm audit fix` automatically if it would alter unrelated dependencies.

- [ ] **Step 3: Run the emulator suite**

Start the emulator in one terminal:

```bash
npm run emulator
```

Run synthetic AI integration tests in another:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=pmv2-851ae node --test server/aiAssist/tools.emulator.test.js
```

Expected: no production access and all synthetic scenarios pass.

- [ ] **Step 4: Perform manual browser verification**

With `AI_ASSIST_ENABLED=true` only in local sandbox, verify:

1. RJR/TJC UI availability and server success.
2. Non-allowlisted `403` using a synthetic user.
3. Desktop drawer and mobile full-screen layout.
4. Source chips open the correct PMv2 records.
5. Read-only refusals for edits, approvals, deletes, payroll, credentials, and raw attachments.
6. Microphone allow/deny, press/release, interruption, stop during permission prompt, logout cleanup, token expiry, one reconnect, and final failure state.
7. No API key in browser source, network response, localStorage, console, or audit record.
8. Model answers pass all 25 golden questions. Record model IDs and date checked.

- [ ] **Step 5: Update durable docs**

Document routes, collection fields, feature flag, models, remaining custom-auth production gate, tests, and rollout state. The task log must state whether text and voice are locally verified, production-enabled, or still gated.

- [ ] **Step 6: Commit documentation and test corpus**

```bash
git add docs/product/PRD.md docs/API.md docs/DATA_MODEL.md docs/agent/PROJECT_STATE.md docs/agent/memory/log/2026-08-13-ai-assist-chat-voice.md docs/agent/memory/index.md docs/ai-assist-golden-questions.json
git commit -m "docs(ai-assist): record verification and rollout gates"
```

## Production stop conditions

Do not enable production voice or text when any of these is true:

- Official model ID or ephemeral-token constraint syntax is unverified.
- A browser can obtain the long-lived Gemini key.
- Any non-allowlisted account can reach a model or tool executor.
- Any tool can write or access excluded data.
- Citation IDs can be invented by the model.
- Root and Functions AI modules differ.
- Golden-set hallucination, prompt-injection, or read-only refusal checks fail.
- Microphone/audio resources survive Stop, logout, or unmount.
- The custom-auth risk has not received explicit production sign-off.

