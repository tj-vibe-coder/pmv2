'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
for (const file of ['server.js', 'functions/server.js']) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf("app.post('/api/onedrive/upload',"); const end = source.indexOf('// 2. Delete an item', start);
  async function invoke(role, body, approved = 1, folderError = false) {
    let handler; let calls = 0; let status = 200; let result; let resolved; let uploadedUrl;
    vm.runInNewContext(source.slice(start, end), {
      app: { post: (_path, fn) => { handler = fn; } }, getCurrentUser: async () => ({ id: 'reviewer', role, approved }),
      isActiveUser: user => user.role === 'superadmin' || user.approved === 1,
      require: name => name.endsWith('financeEvidenceFolder') ? { resolveInvoiceEvidenceFolder: async args => { resolved = args; if (folderError) throw new Error('Ambiguous project folder'); return { id: 'resolved-sales' }; } } : require('./financeEvidence'), Buffer, db: {},
      getGraphAppToken: async () => { calls++; return 'mock-graph'; },
      resolveCorporateDriveId: async () => 'actual-drive', ensureFolderByPath: async () => ({ id: 'folder' }),
      contentTypeForFilename: () => 'application/pdf', fetch: async url => { uploadedUrl = url; return { ok: true, json: async () => ({ id: 'item1', webUrl: 'https://example.com/doc.pdf' }) }; },
    });
    const res = { status(code) { status = code; return this; }, json(data) { result = data; return this; } };
    await handler({ body }, res); return { status, result, calls, resolved, uploadedUrl };
  }
  const body = () => ({ folderPath: 'fixture/Invoice', filename: 'invoice.pdf', contentBase64: Buffer.from('%PDF-fixture').toString('base64'), financeEvidenceType: 'bir2307' });
  test(`${file}: invoice evidence resolves project before uploading and blocks unresolved destination`, async () => {
    const payload = { ...body(), financeInvoiceId: 'si013', folderPath: '01 Execution' };
    const uploaded = await invoke('tax_filer', payload);
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.resolved.invoiceId, 'si013');
    assert.equal(uploaded.resolved.root, '01 Execution');
    assert.match(uploaded.uploadedUrl, /items\/resolved-sales:/);
    const blocked = await invoke('admin', payload, 1, true);
    assert.equal(blocked.status, 502); assert.equal(blocked.uploadedUrl, undefined);
  });
  test(`${file}: evidence upload checks permissions/type/size before external services and returns real drive identity`, async () => {
    for (const [role, data, approved] of [
      ['viewer', body(), 1], ['user', body(), 1], ['admin', body(), 0], ['tax_filer', { ...body(), financeEvidenceType: 'payment_proof' }, 1],
    ]) { const result = await invoke(role, data, approved); assert.equal(result.status, 403); assert.equal(result.calls, 0); }
    for (const data of [{ ...body(), filename: 'bad.html' }, { ...body(), filename: '../doc.pdf' }, { ...body(), contentBase64: ' ' }, { ...body(), contentBase64: Buffer.alloc(25 * 1024 * 1024 + 1).toString('base64') }]) {
      const result = await invoke('admin', data); assert.equal(result.status, 400); assert.equal(result.calls, 0);
    }
    const uploaded = await invoke('tax_filer', body()); assert.equal(uploaded.status, 200); assert.equal(uploaded.result.driveId, 'actual-drive');
  });
}
