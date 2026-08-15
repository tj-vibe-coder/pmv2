'use strict';

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
    .filter((item) => item && item.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function executeOperatorTool({ registry, name, args, maxResultBytes }) {
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

module.exports = { listOperatorCatalog, executeOperatorTool, publicDeclaration };
