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
  navigate_to_record: {
    search: { type: 'string', required: true },
    kind: { type: 'enum', values: ['project', 'opportunity', 'quotation', 'any'] },
  },
  list_quotations_for_opportunity: {
    opportunityId: { type: 'string', required: true },
  },
  get_opportunity_snapshot: {
    opportunityId: { type: 'string', required: true },
  },
  search_clients: {
    search: { type: 'string', required: true },
  },
  propose_opportunity_update: {
    opportunityId: { type: 'string', required: true },
    field: { type: 'enum', values: ['status', 'opportunityGrade', 'notes'] },
    value: { type: 'string', required: true },
    reason: { type: 'string' },
  },
};

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CONVERSATION_CHARS = 16000;
const MAX_PRIOR_TOOLS = 8;
const MAX_PRIOR_TOOL_NAME = 80;
const MAX_PRIOR_TOOL_JSON = 12000;

function validateChatRequest(body) {
  if (!isPlainObject(body)) {
    throw new Error('Chat request body must be a plain object');
  }

  const allowedTopKeys = new Set(['messages', 'pageContext', 'priorToolResults']);
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
    const allowedPageKeys = new Set(['route', 'projectId', 'opportunityId', 'quotationId']);
    for (const key of Object.keys(body.pageContext)) {
      if (!allowedPageKeys.has(key)) {
        throw new Error(`Unexpected field "${key}" in pageContext`);
      }
    }
    if (body.pageContext.route !== undefined && typeof body.pageContext.route !== 'string') {
      throw new Error('pageContext.route must be a string');
    }
    function optionalId(field) {
      const value = body.pageContext[field];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw new Error(`pageContext.${field} must be a string or null`);
      }
      return value === undefined ? null : value;
    }
    pageContext = {
      route: body.pageContext.route,
      projectId: optionalId('projectId'),
      opportunityId: optionalId('opportunityId'),
      quotationId: optionalId('quotationId'),
    };
  }

  let priorToolResults = [];
  if (body.priorToolResults !== undefined) {
    if (!Array.isArray(body.priorToolResults) || body.priorToolResults.length > MAX_PRIOR_TOOLS) {
      throw new Error(`"priorToolResults" must be an array of at most ${MAX_PRIOR_TOOLS} items`);
    }
    let totalJson = 0;
    priorToolResults = body.priorToolResults.map((item, index) => {
      if (!isPlainObject(item)) {
        throw new Error(`priorToolResults[${index}] must be a plain object`);
      }
      const keys = Object.keys(item);
      if (keys.length !== 2 || !('name' in item) || !('data' in item)) {
        throw new Error(`priorToolResults[${index}] must contain exactly "name" and "data"`);
      }
      if (typeof item.name !== 'string' || item.name.length < 1 || item.name.length > MAX_PRIOR_TOOL_NAME) {
        throw new Error(`priorToolResults[${index}].name must be a string of 1-${MAX_PRIOR_TOOL_NAME} characters`);
      }
      if (!isPlainObject(item.data) && !Array.isArray(item.data)) {
        throw new Error(`priorToolResults[${index}].data must be a plain object or array`);
      }
      let serialized;
      try {
        serialized = JSON.stringify(item.data);
      } catch {
        throw new Error(`priorToolResults[${index}].data must be JSON-serializable`);
      }
      totalJson += serialized.length;
      if (totalJson > MAX_PRIOR_TOOL_JSON) {
        throw new Error(`priorToolResults JSON exceeds ${MAX_PRIOR_TOOL_JSON} characters`);
      }
      return { name: item.name, data: item.data };
    });
  }

  return { messages, pageContext, priorToolResults };
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
