'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveInvoiceEvidenceFolder } = require('./financeEvidenceFolder');

const folder = (id, name) => ({ id, name, folder: {} });
function fixture({ project = {}, proposals = [], mapped, top = [], years = {}, pages = {}, child = folder('sales', 'Sales Invoice'), failStatus } = {}) {
  const calls = [];
  const db = { collection: name => ({
    doc: id => ({ get: async () => ({ id, exists: true, data: () => name === 'invoices' ? { project_id: 'p1' } : name === 'projects' ? { project_no: 'IOCT2606001', ...project } : proposals[0] }) }),
    where: () => ({ get: async () => ({ docs: proposals.map(p => ({ data: () => p })) }) }),
  }) };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (failStatus) return { ok: false, status: failStatus };
    let data;
    if (options.method === 'POST') data = folder('created-sales', 'Sales Invoice');
    else if (url.includes(':/Sales%20Invoice')) data = child;
    else if (url.includes('/items/')) data = mapped;
    else if (pages[url]) data = pages[url];
    else if (url.includes('/root:/01%20Execution:/children')) data = { value: top };
    else {
      const year = url.match(/Execution\/(\d{4})/)[1];
      data = { value: years[year] || [] };
    }
    return { ok: !!data, status: data ? 200 : 404, json: async () => data };
  };
  return { calls, run: () => resolveInvoiceEvidenceFolder({ db, fetch, token: 'fixture', driveId: 'drive', invoiceId: 'si013', root: '01 Execution' }) };
}

test('saved folder identity wins regardless of project name, year and parallel test tree', async () => {
  const f = fixture({ project: { executionFolderId: 'linked', year: 2020 }, mapped: folder('linked', 'Historical renamed folder') });
  assert.equal((await f.run()).id, 'sales');
  assert.match(f.calls[0].url, /items\/linked\?/);
  assert.match(f.calls[1].url, /items\/linked:\/Sales%20Invoice/);
  assert.equal(f.calls.length, 2);
});
test('linked Calcsheet execution identity is used without creating a project folder', async () => {
  const f = fixture({ project: { calcsheet_project_id: 'pcs' }, proposals: [{ executionFolderId: 'pcs-exec' }], mapped: folder('pcs-exec', 'IOCT2606001-LBI Project') });
  await f.run(); assert.match(f.calls[0].url, /items\/pcs-exec\?/);
});
test('SI013 prefers canonical LBI folder over the parallel unsuffixed test folder in a historical year', async () => {
  const f = fixture({ project: { calcsheet_code: 'PCS2606001-LBI-00' }, top: [folder('year', '2024'), folder('now', '2026')], years: { 2024: [folder('canonical', 'IOCT2606001-LBI RCS Cabuyao')], 2026: [folder('wrong', 'IOCT2606001 RCS Cabuyao'), folder('other', 'IOCT26060010-LBI Other')] } });
  await f.run(); assert.match(f.calls.at(-1).url, /items\/canonical:\/Sales/);
  assert.ok(f.calls.every(c => !c.options.method));
});
test('flat historical folders and paginated year listings remain discoverable', async () => {
  const flat = fixture({ top: [folder('flat', 'IOCT2606001 Historical title')] });
  await flat.run(); assert.match(flat.calls.at(-1).url, /items\/flat:/);
  const next = 'https://graph.microsoft.com/v1.0/next-page';
  const paged = fixture({ pages: { 'https://graph.microsoft.com/v1.0/drives/drive/root:/01%20Execution:/children?$top=500&$select=id,name,folder,parentReference': { value: [], '@odata.nextLink': next }, [next]: { value: [folder('paged', 'IOCT2606001-LBI Project')] } } });
  await paged.run(); assert.match(paged.calls.at(-1).url, /items\/paged:/);
});
test('missing, ambiguous, stale mappings and transport failures block without mutations', async () => {
  for (const config of [{}, { top: [folder('a', 'IOCT2606001 A'), folder('b', 'IOCT2606001 B')] }, { project: { executionFolderId: 'stale' } }, { failStatus: 503 }]) {
    const f = fixture(config); await assert.rejects(f.run()); assert.ok(f.calls.every(c => !c.options.method));
  }
});
test('only the Sales Invoice child is created, under resolved project item identity', async () => {
  const f = fixture({ project: { executionFolderId: 'linked' }, mapped: folder('linked', 'Old project'), child: null });
  assert.equal((await f.run()).id, 'created-sales');
  const writes = f.calls.filter(c => c.options.method); assert.equal(writes.length, 1);
  assert.match(writes[0].url, /items\/linked\/children$/);
  assert.deepEqual(JSON.parse(writes[0].options.body), { name: 'Sales Invoice', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' });
});
