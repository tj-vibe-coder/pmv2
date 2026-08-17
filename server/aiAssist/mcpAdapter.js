'use strict';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'ioct-assist', version: '0.1.0' };

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function catalogToMcpTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => ({
    name: String(tool.name || ''),
    description: String(tool.description || ''),
    inputSchema: tool.parameters && typeof tool.parameters === 'object'
      ? tool.parameters
      : { type: 'object', properties: {} },
  })).filter((tool) => tool.name);
}

function createMcpAdapter({ request }) {
  if (typeof request !== 'function') {
    throw new Error('MCP adapter requires a request(path, init) function');
  }

  async function handle(message) {
    if (!message || typeof message !== 'object') {
      return jsonRpcError(null, -32600, 'Invalid Request');
    }
    const { id, method } = message;
    const isNotification = !Object.prototype.hasOwnProperty.call(message, 'id');

    if (typeof method !== 'string' || !method) {
      return isNotification ? null : jsonRpcError(id, -32600, 'Invalid Request');
    }

    if (method.startsWith('notifications/')) {
      return null;
    }

    if (method === 'initialize') {
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (method === 'ping') {
      return jsonRpcResult(id, {});
    }

    if (method === 'tools/list') {
      const res = await request('/api/ai-assist/operator/catalog', { method: 'GET' });
      if (res.status !== 200 || !res.body || res.body.ok !== true) {
        return jsonRpcError(id, -32000, operatorHttpError(res.status));
      }
      return jsonRpcResult(id, { tools: catalogToMcpTools(res.body.tools) });
    }

    if (method === 'tools/call') {
      const params = message.params && typeof message.params === 'object' ? message.params : {};
      const name = typeof params.name === 'string' ? params.name : '';
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? params.arguments
        : {};
      if (!name) {
        return jsonRpcResult(id, {
          isError: true,
          content: [{ type: 'text', text: 'A tool name is required.' }],
        });
      }
      const res = await request('/api/ai-assist/operator/execute', {
        method: 'POST',
        body: { name, args },
      });
      if (res.status !== 200 || !res.body || res.body.ok !== true) {
        return jsonRpcResult(id, {
          isError: true,
          content: [{ type: 'text', text: operatorHttpError(res.status) }],
        });
      }
      return jsonRpcResult(id, {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: res.body.name,
            result: res.body.result,
            sources: res.body.sources || [],
          }),
        }],
      });
    }

    return jsonRpcError(id, -32601, 'Method not found');
  }

  return { handle, catalogToMcpTools };
}

function operatorHttpError(status) {
  if (status === 401) return 'Sign in to use IOCT Assist.';
  if (status === 403) return 'IOCT Assist is not available for this account.';
  if (status === 404) return 'Unknown Assist tool.';
  if (status === 429) return 'Too many requests — please wait a moment.';
  if (status === 503) return 'IOCT Assist is not enabled yet.';
  return 'The Assist operator could not complete that request.';
}

module.exports = {
  PROTOCOL_VERSION,
  SERVER_INFO,
  createMcpAdapter,
  catalogToMcpTools,
  operatorHttpError,
};
