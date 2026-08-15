'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolRegistry } = require('./tools');
const { listOperatorCatalog, executeOperatorTool } = require('./operator');

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
