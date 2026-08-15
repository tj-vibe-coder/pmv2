'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');

const { authorizeAiUser } = require('./access');
const { validateChatRequest, validateToolInput, validateOperatorExecuteRequest } = require('./schemas');
const { createToolRegistry } = require('./tools');
const { listOperatorCatalog, executeOperatorTool } = require('./operator');
const { runChat } = require('./chat');
const { buildAuditRecord, recordAudit: defaultRecordAudit } = require('./audit');
const { issueLiveToken: defaultIssueLiveToken } = require('./liveToken');
const { buildLiveSystemInstruction } = require('./prompt');
const { createProposalStore, confirmOpportunityProposal, rejectOpportunityProposal } = require('./proposals');

const MAX_LIVE_TOOL_CALLS_PER_SESSION = 8;

function createAiAssistRouter(opts) {
  const { db, getCurrentUser, config, createChatClient } = opts;
  const recordAuditFn = opts.recordAudit || defaultRecordAudit;
  const issueLiveTokenFn = opts.issueLiveToken || defaultIssueLiveToken;
  const proposalStore = opts.proposalStore || createProposalStore();
  const rateLimit = Object.assign({ windowMs: 600000, maxRequests: 20 }, opts.rateLimit);
  const liveRateLimit = Object.assign({ windowMs: 60000, maxRequests: 3 }, opts.liveRateLimit);

  // Per-instance in-memory cost guards (NOT a distributed security boundary).
  // Keyed by allowlisted username only (not IP): the allowlist is 2-3 users,
  // so this stays naturally bounded and isn't reset by an IP/proxy change.
  const requestTimestamps = new Map();
  const liveTokenTimestamps = new Map();
  // liveSessionId -> { userId, expiresAt, toolCallCount }. Bounded by
  // liveRateLimit (at most 3 new sessions/min/user) and pruned on every
  // /live-token call, so this can't grow unbounded either.
  const liveSessions = new Map();
  const AUDIT_TIMEOUT_MS = 2000;

  function checkLimit(map, limitConfig, key) {
    const now = Date.now();
    const timestamps = (map.get(key) || []).filter((ts) => now - ts < limitConfig.windowMs);
    if (timestamps.length >= limitConfig.maxRequests) {
      map.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    map.set(key, timestamps);
    return true;
  }

  function checkRateLimit(username) {
    return checkLimit(requestTimestamps, rateLimit, String(username).toUpperCase());
  }

  async function resolveAuthorizedUser(req, res) {
    try {
      const user = await getCurrentUser(req);
      const auth = authorizeAiUser(user, config);
      if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return null;
      }
      return user;
    } catch {
      res.status(503).json({ ok: false, error: 'auth_unavailable' });
      return null;
    }
  }

  const router = express.Router();

  router.post('/chat', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) {
      return;
    }

    if (!checkRateLimit(user.username)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    let parsed;
    try {
      parsed = validateChatRequest(req.body);
    } catch {
      res.status(400).json({ ok: false, error: 'invalid_request' });
      return;
    }

    const requestId = randomUUID();
    const startedAt = Date.now();

    // Build the audit record ourselves (metadata only — no prompt/answer/tool
    // content, no auth material) so both the default writer and any override
    // receive the record object directly, e.g. for assertions or forwarding.
    // Bounded + failure-swallowing: an audit write (default or injected) must
    // never hang or alter the user-facing response.
    const writeAudit = ({ outcome, latencyMs, usage = null }) => {
      const record = buildAuditRecord({
        requestId,
        user,
        channel: 'text',
        config,
        toolNames: [],
        outcome,
        latencyMs,
        usage,
      });
      return Promise.race([
        recordAuditFn({ db, ...record }),
        new Promise((resolve) => setTimeout(resolve, AUDIT_TIMEOUT_MS)),
      ]).catch(() => {});
    };

    let result;
    try {
      const registry = createToolRegistry({ db, user, proposalStore });
      const client = createChatClient(config);
      result = await runChat({
        client,
        registry,
        config,
        messages: parsed.messages,
        pageContext: parsed.pageContext,
        priorToolResults: parsed.priorToolResults,
        requestId,
      });
    } catch {
      await writeAudit({ outcome: 'error', latencyMs: Date.now() - startedAt });
      res.status(502).json({ ok: false, error: 'provider_error', requestId });
      return;
    }

    await writeAudit({ outcome: 'success', latencyMs: Date.now() - startedAt });
    res.status(200).json({
      ok: true,
      requestId,
      answer: result.answer,
      citations: result.citations,
      followUps: result.followUps,
      notice: result.notice,
      navigateTo: result.navigateTo || null,
      proposal: result.proposal || null,
    });
  });

  router.get('/health', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) {
      return;
    }
    res.status(200).json({
      ok: true,
      enabled: config.enabled,
      chatProvider: config.chatProvider,
      chatModel: config.chatModel,
      liveModel: config.liveModel,
    });
  });

  router.post('/live-token', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) {
      return;
    }

    if (!checkLimit(liveTokenTimestamps, liveRateLimit, String(user.username).toUpperCase())) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    const now = Date.now();
    for (const [id, session] of liveSessions) {
      if (session.expiresAt < now) liveSessions.delete(id);
    }

    const registry = createToolRegistry({ db, user, proposalStore });
    const toolDeclarations = [...registry.values()].map((tool) => tool.declaration);

    let result;
    try {
      const client = opts.createLiveClient(opts.geminiApiKey);
      result = await issueLiveTokenFn({
        createClient: () => client,
        apiKey: opts.geminiApiKey,
        config,
        systemInstruction: buildLiveSystemInstruction(config),
        toolDeclarations,
      });
    } catch {
      res.status(502).json({ ok: false, error: 'provider_error' });
      return;
    }

    const liveSessionId = randomUUID();
    liveSessions.set(liveSessionId, {
      userId: user.id,
      expiresAt: now + config.liveSessionSeconds * 1000,
      toolCallCount: 0,
    });

    res.status(200).json({
      ok: true,
      liveSessionId,
      token: result.token,
      model: result.model,
      expireTime: result.expireTime,
      newSessionExpireTime: result.newSessionExpireTime,
    });
  });

  router.post('/tools/:name', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) {
      return;
    }

    const liveSessionId = req.body && req.body.liveSessionId;
    if (typeof liveSessionId !== 'string' || !liveSessionId) {
      res.status(400).json({ ok: false, error: 'invalid_request' });
      return;
    }

    const session = liveSessions.get(liveSessionId);
    if (!session || session.expiresAt < Date.now()) {
      liveSessions.delete(liveSessionId);
      res.status(401).json({ ok: false, error: 'invalid_session' });
      return;
    }
    // The server ignores any user-supplied identity in the body — the
    // session's bound userId (set at /live-token issuance time) is
    // authoritative, and it's cross-checked against the freshly re-resolved
    // `user` above, not trusted from the request.
    if (String(session.userId) !== String(user.id)) {
      res.status(403).json({ ok: false, error: 'not_allowlisted' });
      return;
    }
    if (session.toolCallCount >= MAX_LIVE_TOOL_CALLS_PER_SESSION) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    let validatedArgs;
    try {
      validatedArgs = validateToolInput(req.params.name, (req.body && req.body.args) || {});
    } catch {
      res.status(400).json({ ok: false, error: 'invalid_request' });
      return;
    }

    const registry = createToolRegistry({ db, user, proposalStore });
    const tool = registry.get(req.params.name);
    if (!tool) {
      res.status(404).json({ ok: false, error: 'unknown_tool' });
      return;
    }

    session.toolCallCount += 1;

    let toolResult;
    try {
      toolResult = await tool.execute(validatedArgs);
    } catch {
      res.status(502).json({ ok: false, error: 'tool_error' });
      return;
    }

    res.status(200).json({ ok: true, result: toolResult.data, sources: toolResult.sources });
  });

  router.post('/proposals/:id/confirm', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) return;
    if (!checkRateLimit(user.username)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }
    const result = await confirmOpportunityProposal({ db, store: proposalStore, user, proposalId: req.params.id });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.status(200).json({ ok: true, ...result.data });
  });

  router.get('/operator/catalog', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) return;
    const registry = createToolRegistry({ db, user, proposalStore });
    res.status(200).json({
      ok: true,
      tools: listOperatorCatalog(registry),
    });
  });

  router.post('/operator/execute', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) return;
    if (!checkRateLimit(user.username)) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    let parsed;
    try {
      parsed = validateOperatorExecuteRequest(req.body);
    } catch (err) {
      if (err && err.code === 'unknown_tool') {
        res.status(404).json({ ok: false, error: 'unknown_tool' });
        return;
      }
      res.status(400).json({ ok: false, error: 'invalid_request' });
      return;
    }

    const registry = createToolRegistry({ db, user, proposalStore });
    let executed;
    try {
      executed = await executeOperatorTool({
        registry,
        name: parsed.name,
        args: parsed.args,
        maxResultBytes: config.maxResultBytes,
      });
    } catch (err) {
      if (err && err.code === 'unknown_tool') {
        res.status(404).json({ ok: false, error: 'unknown_tool' });
        return;
      }
      if (err && err.code === 'result_too_large') {
        res.status(400).json({ ok: false, error: 'invalid_request' });
        return;
      }
      res.status(502).json({ ok: false, error: 'tool_error' });
      return;
    }

    res.status(200).json({
      ok: true,
      name: executed.name,
      result: executed.data,
      sources: executed.sources,
    });
  });

  router.post('/proposals/:id/reject', async (req, res) => {
    const user = await resolveAuthorizedUser(req, res);
    if (!user) return;
    const result = rejectOpportunityProposal({ store: proposalStore, user, proposalId: req.params.id });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.status(200).json({ ok: true, ...result.data });
  });

  return router;
}

module.exports = { createAiAssistRouter };
