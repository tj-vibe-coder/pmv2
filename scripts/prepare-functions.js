'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const functionsDir = path.join(rootDir, 'functions');
const serverSrcDir = path.join(rootDir, 'server');
const serverDestDir = path.join(functionsDir, 'server');

fs.mkdirSync(functionsDir, { recursive: true });
fs.copyFileSync(
  path.join(rootDir, 'server.js'),
  path.join(functionsDir, 'server.js')
);

// root server.js requires ./server/* modules (product history, purchase
// timing, the aiAssist/ subpackage, etc.) — including nested subdirectories.
// Copy runtime modules only (skip *.test.js), recursively, so Cloud
// Functions can load them from functions/server/ relative to
// functions/server.js. A previous non-recursive version of this script
// silently dropped server/aiAssist/* from the deploy bundle until it was
// caught by a functions-codebase-analysis failure on first real deploy.
function copyJsRecursive(srcDir, destDir, copied) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyJsRecursive(srcPath, destPath, copied);
      continue;
    }
    if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) continue;
    fs.copyFileSync(srcPath, destPath);
    copied.push(path.relative(serverSrcDir, srcPath));
  }
}

function removeStaleRecursive(srcDir, destDir) {
  if (!fs.existsSync(destDir)) return;
  for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(srcPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      } else {
        removeStaleRecursive(srcPath, destPath);
      }
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    if (!fs.existsSync(srcPath)) {
      fs.unlinkSync(destPath);
    }
  }
}

const copied = [];
copyJsRecursive(serverSrcDir, serverDestDir, copied);
removeStaleRecursive(serverSrcDir, serverDestDir);

console.log('Prepared functions/server.js from root server.js');
console.log(`Prepared functions/server/ (${copied.sort().join(', ')})`);
