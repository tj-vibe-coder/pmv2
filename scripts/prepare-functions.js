'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const functionsDir = path.join(rootDir, 'functions');

fs.mkdirSync(functionsDir, { recursive: true });
fs.copyFileSync(
  path.join(rootDir, 'server.js'),
  path.join(functionsDir, 'server.js')
);

const runtimeModules = [
  ['server', 'founderFunding.js'],
  ['scripts', 'reconcile-founder-funding-ledger.js'],
];

for (const [directory, filename] of runtimeModules) {
  const destinationDirectory = path.join(functionsDir, directory);
  fs.mkdirSync(destinationDirectory, { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, directory, filename),
    path.join(destinationDirectory, filename),
  );
}

console.log('Prepared Firebase Functions server and runtime modules from root sources');
