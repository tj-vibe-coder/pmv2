'use strict';

// Only numeric token-usage fields ever reach the audit log — provider "usage"
// objects are not schema-guaranteed and must never be persisted verbatim.
function sanitizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const sanitized = {};
  for (const field of ['inputTokens', 'outputTokens', 'totalTokens']) {
    if (Number.isFinite(usage[field]) && usage[field] >= 0) {
      sanitized[field] = usage[field];
    }
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

// Builds a metadata-only audit record. The record deliberately contains NO
// prompt text, answer text, tool args/results, or auth material — only the
// fields listed below. Re-derives every field itself (never spreads an
// upstream object) so a caller cannot smuggle extra keys through.
function buildAuditRecord({ requestId, user, channel, config, toolNames, outcome, latencyMs, usage }) {
  return {
    requestId: String(requestId),
    userId: String(user.id),
    username: String(user.username),
    channel: channel === 'voice' ? 'voice' : 'text',
    promptVersion: String(config.promptVersion),
    model: String(channel === 'voice' ? config.liveModel : config.chatModel),
    toolNames: [...new Set(Array.isArray(toolNames) ? toolNames.filter((name) => typeof name === 'string') : [])],
    outcome: outcome === 'success' ? 'success' : 'error',
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
    usage: sanitizeUsage(usage),
    createdAt: new Date().toISOString(),
  };
}

const AUDIT_RECORD_KEYS = [
  'requestId', 'userId', 'username', 'channel', 'promptVersion', 'model',
  'toolNames', 'outcome', 'latencyMs', 'usage', 'createdAt',
];

// Re-projects an already-built record (as produced by buildAuditRecord) onto
// the exact allowlisted key set before persistence — the last line of
// defense if a caller passes a record object directly instead of raw args.
function sanitizeBuiltRecord(record) {
  const sanitized = {};
  for (const key of AUDIT_RECORD_KEYS) {
    if (key in record) sanitized[key] = record[key];
  }
  sanitized.usage = sanitizeUsage(sanitized.usage);
  return sanitized;
}

// Default writer. Accepts either raw builder args ({ user, channel, config,
// ... }) or an already-built record ({ userId, ... }). Writes to
// ai_assist_audit when `db` provides a usable `.add`; any failure (missing db,
// missing add, or a throwing write) is swallowed so an audit failure never
// breaks the user-facing response. Always returns the sanitized record.
async function recordAudit({ db, ...auditRecordArgs }) {
  const record = auditRecordArgs.userId !== undefined
    ? sanitizeBuiltRecord(auditRecordArgs)
    : buildAuditRecord(auditRecordArgs);
  try {
    if (db && typeof db.collection === 'function') {
      const collection = db.collection('ai_assist_audit');
      if (collection && typeof collection.add === 'function') {
        await collection.add(record);
      }
    }
  } catch {
    // Never let an audit-write failure break the user-facing response.
  }
  return record;
}

module.exports = { buildAuditRecord, recordAudit };
