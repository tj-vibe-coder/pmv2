'use strict';
// The OneDrive proxy refuses the '00 System' tree (old backups there hold
// credentials). Runs the guard helpers straight out of server.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('server.js', 'utf8');
const start = source.indexOf('const ONEDRIVE_BLOCKED_ROOTS');
const end = source.indexOf('function contentTypeForFilename', start);

// `graph` is either one item returned for every lookup, or a map of item id → item.
function load(graph, status = 200) {
  const context = {
    fetch: async (url) => {
      const id = decodeURIComponent(url.split('/items/')[1].split('?')[0]);
      const item = graph && graph.byId ? graph.byId[id] : graph;
      return { ok: status >= 200 && status < 300 && !!item, status: item ? status : 404, json: async () => item };
    },
    encodeURIComponent, decodeURIComponent, String,
  };
  vm.runInNewContext(`${source.slice(start, end)}; this.guard = { isBlockedDrivePath, isBlockedDriveItem };`, context);
  return context.guard;
}

test('paths into the 00 System tree are refused, however they are spelled', () => {
  const { isBlockedDrivePath } = load();
  for (const p of ['00 System', '00 System/Backups', '/00 system/backups/x.json', ' 00 SYSTEM /Backups', '00 System\\Backups',
    'Liquidation Receipts/../00 System/Backups', './00 System', '01 Execution/..']) {
    assert.equal(isBlockedDrivePath(p), true, p);
  }
  for (const p of ['00 Proposal/IO Proposal', '01 Execution/2026', 'Liquidation Receipts/2026/LQ26-001', '00 Systems', 'Projects/00 System', '']) {
    assert.equal(isBlockedDrivePath(p), false, p);
  }
});

test('items are refused when they are, or sit inside, the 00 System folder', async () => {
  assert.equal(await load({ name: '00 System', parentReference: { path: '/drive/root:' } }).isBlockedDriveItem('t', 'd', 'x'), true);
  assert.equal(await load({ name: 'snap.json', parentReference: { path: '/drives/abc/root:/00%20System/Backups/2026-10-01' } }).isBlockedDriveItem('t', 'd', 'x'), true);
  assert.equal(await load({ name: 'receipt.jpg', parentReference: { path: '/drive/root:/Liquidation Receipts/2026' } }).isBlockedDriveItem('t', 'd', 'x'), false);
  assert.equal(await load({ name: 'root', root: {} }).isBlockedDriveItem('t', 'd', 'x'), false);
  // Unknown location → refuse; missing item → let the real call return its 404.
  assert.equal(await load({ name: 'odd', parentReference: {} }).isBlockedDriveItem('t', 'd', 'x'), true);
  assert.equal(await load({}, 404).isBlockedDriveItem('t', 'd', 'x'), false);
  await assert.rejects(load({}, 500).isBlockedDriveItem('t', 'd', 'x'));
});

test('without parentReference.path, the guard walks up parent ids to the root', async () => {
  const byId = {
    root: { name: 'root', root: {} },
    sys: { name: '00 System', parentReference: { id: 'root' } },
    bak: { name: 'Backups', parentReference: { id: 'sys' } },
    snap: { name: 'snap.json', parentReference: { id: 'bak' } },
    liq: { name: 'Liquidation Receipts', parentReference: { id: 'root' } },
    rcpt: { name: 'r.jpg', parentReference: { id: 'liq' } },
  };
  const { isBlockedDriveItem } = load({ byId });
  assert.equal(await isBlockedDriveItem('t', 'd', 'snap'), true);
  assert.equal(await isBlockedDriveItem('t', 'd', 'sys'), true);
  assert.equal(await isBlockedDriveItem('t', 'd', 'rcpt'), false);
  assert.equal(await isBlockedDriveItem('t', 'd', 'liq'), false);
  assert.equal(await isBlockedDriveItem('t', 'd', 'root'), false);
});
