'use strict';

// Explicit opt-in list for the operator HTTP/MCP surface. Deliberately NOT
// derived from the tool registry's keys: if a future tool is added to
// server/aiAssist/tools.js (including a direct-write one) it must be added
// here by hand before external callers (operator/execute, the MCP adapter)
// can reach it — the registry alone is not the allowlist.
const OPERATOR_ALLOWED_TOOLS = new Set([
  'search_projects',
  'get_project_snapshot',
  'get_portfolio_summary',
  'search_sales_opportunities',
  'get_quotation_summary',
  'get_expense_summary',
  'navigate_to_record',
  'list_quotations_for_opportunity',
  'get_opportunity_snapshot',
  'search_clients',
  'query_analytics',
  'propose_opportunity_update',
]);

function publicDeclaration(declaration) {
  if (!declaration || typeof declaration !== 'object') return null;
  return {
    name: String(declaration.name || ''),
    description: String(declaration.description || ''),
    parameters: declaration.parameters && typeof declaration.parameters === 'object'
      ? declaration.parameters
      : { type: 'object', properties: {}, required: [] },
  };
}

function listOperatorCatalog(registry) {
  return [...registry.values()]
    .map((tool) => publicDeclaration(tool.declaration))
    .filter((item) => item && item.name && OPERATOR_ALLOWED_TOOLS.has(item.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function executeOperatorTool({ registry, name, args, maxResultBytes }) {
  if (!OPERATOR_ALLOWED_TOOLS.has(name)) {
    const error = new Error('unknown_tool');
    error.code = 'unknown_tool';
    throw error;
  }
  const tool = registry.get(name);
  if (!tool) {
    const error = new Error('unknown_tool');
    error.code = 'unknown_tool';
    throw error;
  }
  const result = await tool.execute(args || {});
  const serialized = JSON.stringify(result && result.data);
  if (typeof maxResultBytes === 'number' && serialized && serialized.length > maxResultBytes) {
    const error = new Error('result_too_large');
    error.code = 'result_too_large';
    throw error;
  }
  return {
    name,
    data: result.data,
    sources: Array.isArray(result.sources) ? result.sources : [],
  };
}

module.exports = { listOperatorCatalog, executeOperatorTool, publicDeclaration, OPERATOR_ALLOWED_TOOLS };
