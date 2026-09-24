'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('prepare-functions includes finance trace runtime modules and excludes tests', () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), '.finance-trace-package-'));
  try {
    fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'server'), { recursive: true });
    fs.copyFileSync(
      path.join(root, 'scripts', 'prepare-functions.js'),
      path.join(fixture, 'scripts', 'prepare-functions.js'),
    );
    fs.writeFileSync(path.join(fixture, 'server.js'), "module.exports = require('./server/financeTraceRouter');\n");
    for (const name of [
      'financeTrace.js',
      'financeTraceRouter.js',
      'financeTrace.test.js',
      'financeTraceRouter.test.js',
    ]) {
      fs.copyFileSync(path.join(root, 'server', name), path.join(fixture, 'server', name));
    }

    execFileSync(process.execPath, ['scripts/prepare-functions.js'], {
      cwd: fixture,
      stdio: 'pipe',
    });

    const runtimeDir = path.join(fixture, 'functions', 'server');
    assert.equal(fs.existsSync(path.join(runtimeDir, 'financeTrace.js')), true);
    assert.equal(fs.existsSync(path.join(runtimeDir, 'financeTraceRouter.js')), true);
    assert.equal(fs.existsSync(path.join(runtimeDir, 'financeTrace.test.js')), false);
    assert.equal(fs.existsSync(path.join(runtimeDir, 'financeTraceRouter.test.js')), false);

    const trace = require(path.join(runtimeDir, 'financeTrace.js'));
    const router = require(path.join(runtimeDir, 'financeTraceRouter.js'));
    assert.equal(typeof trace.rankCandidates, 'function');
    assert.equal(typeof router.createFinanceTraceRouter, 'function');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
