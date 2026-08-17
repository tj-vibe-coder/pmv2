#!/usr/bin/env node
'use strict';

// Thin stdio MCP adapter. HTTP operator catalog/execute is the source of truth.
// IOCT_ASSIST_API_BASE=http://127.0.0.1:3001
// IOCT_ASSIST_TOKEN=<same bearer as netpacific_token>

const readline = require('node:readline');
const { createMcpAdapter } = require('../server/aiAssist/mcpAdapter');

const apiBase = String(process.env.IOCT_ASSIST_API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const token = process.env.IOCT_ASSIST_TOKEN || '';

async function request(path, init = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${apiBase}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const adapter = createMcpAdapter({ request });

function writeMessage(message) {
  if (!message) return;
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  try {
    writeMessage(await adapter.handle(parsed));
  } catch {
    if (Object.prototype.hasOwnProperty.call(parsed, 'id')) {
      writeMessage({ jsonrpc: '2.0', id: parsed.id, error: { code: -32603, message: 'Internal error' } });
    }
  }
});
