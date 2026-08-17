'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolRegistry } = require('./tools');
const { listOperatorCatalog, executeOperatorTool, OPERATOR_ALLOWED_TOOLS } = require('./operator');

function registryWithExtraTool(extraName) {
  const registry = createToolRegistry({ db: {} });
  registry.set(extraName, {
    declaration: { name: extraName, description: 'not on the operator allowlist', parameters: { type: 'object', properties: {} } },
    execute: async () => ({ data: { wrote: true }, sources: [] }),
  });
  return registry;
}

test('catalog lists only allowlisted declarations, sorted by name', () => {
  const registry = createToolRegistry({ db: {} });
  const catalog = listOperatorCatalog(registry);
  const names = catalog.map((tool) => tool.name);
  assert.ok(names.includes('search_projects'));
  assert.ok(names.includes('propose_opportunity_update'));
  assert.ok(!names.includes('delete_project'));
  assert.deepEqual(names, [...names].sort());
  assert.ok(catalog.every((tool) => tool.description && tool.parameters && tool.parameters.type === 'object'));
});

test('executeOperatorTool runs an allowlisted tool and rejects unknown names', async () => {
  const fakeDb = {
    collection: (name) => {
      assert.equal(name, 'projects');
      return { get: async () => ({ docs: [] }) };
    },
  };
  const registry = createToolRegistry({ db: fakeDb, now: () => new Date('2026-08-15T00:00:00.000Z') });
  const result = await executeOperatorTool({
    registry,
    name: 'search_projects',
    args: { search: 'none' },
  });
  assert.equal(result.name, 'search_projects');
  assert.deepEqual(result.data, []);
  await assert.rejects(
    () => executeOperatorTool({ registry, name: 'delete_project', args: {} }),
    (err) => err.code === 'unknown_tool',
  );
});

test('a tool present in the registry but not on the operator allowlist is rejected (defense-in-depth)', async () => {
  const registry = registryWithExtraTool('hypothetical_direct_write');
  assert.ok(registry.has('hypothetical_direct_write'));
  assert.ok(!listOperatorCatalog(registry).some((tool) => tool.name === 'hypothetical_direct_write'));
  await assert.rejects(
    () => executeOperatorTool({ registry, name: 'hypothetical_direct_write', args: {} }),
    (err) => err.code === 'unknown_tool',
  );
});

test('OPERATOR_ALLOWED_TOOLS stays in sync with the current tool registry (fails loud, not silent, on drift)', () => {
  const registry = createToolRegistry({ db: {} });
  const registryNames = new Set(registry.keys());
  for (const name of OPERATOR_ALLOWED_TOOLS) {
    assert.ok(
      registryNames.has(name),
      `OPERATOR_ALLOWED_TOOLS references "${name}", which no longer exists in the tool registry — update operator.js`,
    );
  }
  for (const name of registryNames) {
    assert.ok(
      OPERATOR_ALLOWED_TOOLS.has(name),
      `Tool "${name}" was added to the registry but is missing from OPERATOR_ALLOWED_TOOLS in operator.js — add it there deliberately if it should be reachable via /operator/execute and the MCP adapter`,
    );
  }
});
