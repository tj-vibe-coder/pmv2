'use strict';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Allowed tool names mapped to their allowed argument shapes. The shape is the
// only defense — any key not listed here is rejected.
const TOOL_ARG_SHAPES = {
  search_projects: {
    search: { type: 'string' },
    year: { type: 'integer' },
    status: { type: 'enum', values: ['draft', 'for_review', 'sent', 'won', 'lost', 'inactive'] },
    client: { type: 'string' },
    category: { type: 'string' },
  },
  get_project_snapshot: {
    projectId: { type: 'string', required: true },
  },
  get_portfolio_summary: {
    groupBy: { type: 'enum', values: ['status', 'year', 'category'] },
  },
  search_sales_opportunities: {
    search: { type: 'string' },
    year: { type: 'integer' },
    status: { type: 'string' },
    client: { type: 'string' },
    grade: { type: 'enum', values: ['A', 'B', 'C'] },
  },
  get_quotation_summary: {
    quotationId: { type: 'string', required: true },
  },
  get_expense_summary: {
    projectId: { type: 'string' },
    year: { type: 'integer' },
    category: { type: 'string' },
  },
};

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CONVERSATION_CHARS = 16000;

function validateChatRequest(body) {
  if (!isPlainObject(body)) {
    throw new Error('Chat request body must be a plain object');
  }

  const allowedTopKeys = new Set(['messages', 'pageContext']);
  for (const key of Object.keys(body)) {
    if (!allowedTopKeys.has(key)) {
      throw new Error(`Unexpected top-level field "${key}" in chat request`);
    }
  }

  if (!Array.isArray(body.messages)) {
    throw new Error('Chat request requires a "messages" array');
  }
  if (body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    throw new Error(`"messages" must contain between 1 and ${MAX_MESSAGES} items (got ${body.messages.length})`);
  }

  const messages = body.messages.map((message, index) => {
    if (!isPlainObject(message)) {
      throw new Error(`messages[${index}] must be a plain object`);
    }
    const keys = Object.keys(message);
    if (keys.length !== 2 || !('role' in message) || !('text' in message)) {
      throw new Error(`messages[${index}] must contain exactly "role" and "text"`);
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw new Error(`messages[${index}].role must be "user" or "assistant"`);
    }
    if (typeof message.text !== 'string' || message.text.length < 1 || message.text.length > MAX_MESSAGE_CHARS) {
      throw new Error(`messages[${index}].text must be a string of 1-${MAX_MESSAGE_CHARS} characters`);
    }
    return { role: message.role, text: message.text };
  });

  const totalChars = messages.reduce((sum, message) => sum + message.text.length, 0);
  if (totalChars > MAX_CONVERSATION_CHARS) {
    throw new Error(`total message text exceeds ${MAX_CONVERSATION_CHARS} characters (got ${totalChars})`);
  }

  let pageContext = null;
  if (body.pageContext !== undefined) {
    if (!isPlainObject(body.pageContext)) {
      throw new Error('"pageContext" must be a plain object');
    }
    const allowedPageKeys = new Set(['route', 'projectId']);
    for (const key of Object.keys(body.pageContext)) {
      if (!allowedPageKeys.has(key)) {
        throw new Error(`Unexpected field "${key}" in pageContext`);
      }
    }
    if (body.pageContext.route !== undefined && typeof body.pageContext.route !== 'string') {
      throw new Error('pageContext.route must be a string');
    }
    if (
      body.pageContext.projectId !== undefined &&
      body.pageContext.projectId !== null &&
      typeof body.pageContext.projectId !== 'string'
    ) {
      throw new Error('pageContext.projectId must be a string or null');
    }
    pageContext = {
      route: body.pageContext.route,
      projectId: body.pageContext.projectId === undefined ? null : body.pageContext.projectId,
    };
  }

  return { messages, pageContext };
}

function validateToolInput(toolName, args) {
  const shape = TOOL_ARG_SHAPES[toolName];
  if (!shape) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  if (args === undefined || args === null) {
    args = {};
  }
  if (!isPlainObject(args)) {
    throw new Error(`Arguments for tool "${toolName}" must be a plain object`);
  }

  const normalized = {};
  for (const key of Object.keys(args)) {
    const field = shape[key];
    if (!field) {
      throw new Error(`Unexpected argument "${key}" for tool "${toolName}"`);
    }
    const value = args[key];
    if (field.type === 'string') {
      if (typeof value !== 'string') {
        throw new Error(`Argument "${key}" for tool "${toolName}" must be a string`);
      }
    } else if (field.type === 'integer') {
      if (!Number.isInteger(value)) {
        throw new Error(`Argument "${key}" for tool "${toolName}" must be an integer`);
      }
    } else if (field.type === 'enum') {
      if (!field.values.includes(value)) {
        throw new Error(`Argument "${key}" for tool "${toolName}" must be one of: ${field.values.join(', ')}`);
      }
    }
    normalized[key] = value;
  }

  for (const key of Object.keys(shape)) {
    if (shape[key].required && !(key in normalized)) {
      throw new Error(`Missing required argument "${key}" for tool "${toolName}"`);
    }
  }

  return normalized;
}

module.exports = { validateChatRequest, validateToolInput };
