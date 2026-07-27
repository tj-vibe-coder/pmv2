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

// root server.js requires ./server/* modules (product history, purchase timing,
// etc.). Copy runtime modules only (skip *.test.js) so Cloud Functions can load
// them from functions/server/ relative to functions/server.js.
fs.mkdirSync(serverDestDir, { recursive: true });
const copied = [];
for (const name of fs.readdirSync(serverSrcDir)) {
  if (!name.endsWith('.js') || name.endsWith('.test.js')) continue;
  fs.copyFileSync(path.join(serverSrcDir, name), path.join(serverDestDir, name));
  copied.push(name);
}

// Remove stale modules that no longer exist at the root (keeps package clean).
for (const name of fs.readdirSync(serverDestDir)) {
  if (!name.endsWith('.js')) continue;
  if (!fs.existsSync(path.join(serverSrcDir, name))) {
    fs.unlinkSync(path.join(serverDestDir, name));
  }
}

console.log('Prepared functions/server.js from root server.js');
console.log(`Prepared functions/server/ (${copied.sort().join(', ')})`);
