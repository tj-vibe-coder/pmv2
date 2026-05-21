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

console.log('Prepared functions/server.js from root server.js');
