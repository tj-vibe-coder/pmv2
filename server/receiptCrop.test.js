'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeReceiptCrop } = require('./receiptCrop');
const paper = { topLeft: { x: 0.1, y: 0.1 }, topRight: { x: 0.9, y: 0.15 }, bottomRight: { x: 0.85, y: 0.95 }, bottomLeft: { x: 0.15, y: 0.9 } };
test('receipt crop preserves valid perspective corners and rejects unsafe responses', () => {
  assert.deepEqual(normalizeReceiptCrop(paper), Object.values(paper));
  for (const invalid of [null, {}, { ...paper, topLeft: {} }, { ...paper, topLeft: { x: '0.1', y: 0.1 } },
    { ...paper, topLeft: { x: -0.1, y: 0.1 } }, { ...paper, topLeft: { x: NaN, y: 0.1 } },
    { ...paper, topRight: paper.bottomLeft, bottomLeft: paper.topRight },
    { topLeft: { x: 0, y: 0 }, topRight: { x: 0.01, y: 0 }, bottomRight: { x: 0.01, y: 0.01 }, bottomLeft: { x: 0, y: 0.01 } },
  ]) assert.equal(normalizeReceiptCrop(invalid), null);
});
for (const file of ['server.js', 'functions/server.js']) {
  test(`${file}: crop uses latest Flash-Lite default, honors override and validates Gemini output`, async () => {
    const source = fs.readFileSync(file, 'utf8');
    const start = source.indexOf('async function detectCropWithGemini(');
    const end = source.indexOf("app.post('/api/receipts/detect-crop'", start);
    let chosen; let output = paper;
    const env = { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.1-flash-lite' };
    const context = { process: { env }, extractJson: text => text, require: name => name === '@google/generative-ai' ? {
      GoogleGenerativeAI: class { getGenerativeModel({ model }) { chosen = model; return { generateContent: async () => ({ response: { text: () => JSON.stringify(output) } }) }; } },
    } : require('./receiptCrop') };
    vm.createContext(context); vm.runInContext(source.slice(start, end), context);
    assert.deepEqual(await context.detectCropWithGemini('fixture', 'image/jpeg'), Object.values(paper));
    assert.equal(chosen, 'gemini-3.5-flash-lite');
    env.GEMINI_CROP_MODEL = 'configured-model'; output = {};
    assert.equal(await context.detectCropWithGemini('fixture', 'image/jpeg'), null);
    assert.equal(chosen, 'configured-model');
  });
}
test('Functions predeploy bundles the crop validator', () => {
  const path = require('node:path'); const os = require('node:os'); const { execFileSync } = require('node:child_process');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ioct-crop-package-'));
  try {
    fs.mkdirSync(path.join(fixture, 'scripts')); fs.mkdirSync(path.join(fixture, 'server'));
    fs.copyFileSync('scripts/prepare-functions.js', path.join(fixture, 'scripts/prepare-functions.js'));
    fs.copyFileSync('server/receiptCrop.js', path.join(fixture, 'server/receiptCrop.js'));
    fs.writeFileSync(path.join(fixture, 'server.js'), "module.exports = require('./server/receiptCrop');\n");
    execFileSync(process.execPath, ['scripts/prepare-functions.js'], { cwd: fixture, stdio: 'pipe' });
    const bundled = require(path.join(fixture, 'functions/server.js'));
    assert.deepEqual(bundled.normalizeReceiptCrop(paper), Object.values(paper));
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});
