'use strict';

const { validateToolInput } = require('./schemas');

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Tools whose result is already a flat, grouped-totals array — the only shape
// the chart panel knows how to draw. chartRef is a POINTER at one of these
// calls, never chart data itself: the model cannot put a wrong number in a
// chart because it never writes the numbers, same trust boundary as citations.
// v1 draws every chart as a single sequential-hue bar (magnitude-comparison is
// the actual job of this data — see the app's dataviz guidance), so chartRef
const CHARTABLE_TOOLS = ['get_portfolio_summary', 'get_expense_summary', 'query_analytics'];

// A malformed or stale chartRef degrades to "no chart" rather than failing
// the whole turn — the prose answer is still good even if the chart pointer
// is bad, so this never throws.
function sanitizeChartRef(value) {
  if (!isPlainObject(value)) return null;
  const { tool, title, type, xAxisKey } = value;
  if (typeof tool !== 'string' || !CHARTABLE_TOOLS.includes(tool)) return null;
  if (typeof title !== 'string' || title.length < 1 || title.length > 80) return null;
  const allowedTypes = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'donut', 'composed'];
  const chartType = (typeof type === 'string' && allowedTypes.includes(type)) ? type : 'bar';
  const cleanXAxisKey = (typeof xAxisKey === 'string' && xAxisKey.length <= 40) ? xAxisKey : undefined;
  return {
    tool,
    title,
    type: chartType,
    ...(cleanXAxisKey ? { xAxisKey: cleanXAxisKey } : {}),
  };
}

function validateFinalResponse(response) {
  if (!isPlainObject(response)) {
    throw new Error('finalResponse must be a plain object');
  }

  const requiredKeys = ['answer', 'citationIds', 'followUps'];
  const allowedKeys = [...requiredKeys, 'chartRef'];
  const unexpected = Object.keys(response).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`finalResponse has unexpected field(s): ${unexpected.join(', ')}`);
  }
  for (const key of requiredKeys) {
    if (!(key in response)) {
      throw new Error(`finalResponse is missing required field "${key}"`);
    }
  }

  const { answer, citationIds, followUps } = response;

  if (typeof answer !== 'string' || answer.length < 1 || answer.length > 6000) {
    throw new Error('finalResponse.answer must be a string of 1-6000 characters');
  }
  if (!Array.isArray(citationIds) || citationIds.length > 20 || citationIds.some((id) => typeof id !== 'string')) {
    throw new Error('finalResponse.citationIds must be an array of at most 20 strings');
  }
  if (
    !Array.isArray(followUps) ||
    followUps.length > 3 ||
    followUps.some((followUp) => typeof followUp !== 'string' || followUp.length > 120)
  ) {
    throw new Error('finalResponse.followUps must be an array of at most 3 strings, each at most 120 characters');
  }

  const chartRef = 'chartRef' in response ? sanitizeChartRef(response.chartRef) : null;

  return { answer, citationIds, followUps, chartRef };
}

async function runChat({ client, registry, config, messages, pageContext, priorToolResults, requestId }) {
  const { maxToolRounds, maxResultBytes } = config;

  const sourceMap = new Map();
  const toolResults = [];
  let toolRounds = 0;
  let totalResultBytes = 0;
  let navigateTo = null;
  let proposal = null;

  for (;;) {
    let result;
    try {
      result = await client.send({ messages, pageContext, priorToolResults, toolResults });
    } catch (error) {
      throw new Error('AI provider request failed');
    }

    if (result && result.finalResponse) {
      const finalResponse = validateFinalResponse(result.finalResponse);
      const citations = finalResponse.citationIds
        .map((id) => sourceMap.get(id))
        .filter((source) => source !== undefined);
      let chart = null;
      if (finalResponse.chartRef) {
        const match = [...toolResults].reverse().find((r) => r.name === finalResponse.chartRef.tool);
        if (match && Array.isArray(match.data)) {
          chart = {
            type: finalResponse.chartRef.type || 'bar',
            title: finalResponse.chartRef.title,
            tool: finalResponse.chartRef.tool,
            ...(finalResponse.chartRef.xAxisKey ? { xAxisKey: finalResponse.chartRef.xAxisKey } : {}),
            data: match.data,
          };
        }
      }
      return {
        answer: finalResponse.answer,
        citations,
        followUps: finalResponse.followUps,
        notice: 'AI-generated summary from IOCT records. Verify before making decisions.',
        navigateTo,
        proposal,
        chart,
      };
    }

    if (result && result.functionCalls) {
      if (process.env.AI_ASSIST_TRACE === 'true') {
        console.error(`[ai-assist:trace] round=${toolRounds} calls=${JSON.stringify(result.functionCalls)}`);
      }
      if (toolRounds >= maxToolRounds) {
        throw new Error('Tool round budget exceeded');
      }
      for (const call of result.functionCalls) {
        const tool = registry.get(call.name);
        if (!tool) {
          throw new Error('Unknown tool: ' + call.name);
        }
        // Bad arguments from the model (e.g. an invented enum value) are
        // recoverable: feed the validation message back as the tool's
        // result so the model can retry with valid arguments instead of
        // the whole chat turn failing with a fatal error. A failure inside
        // tool.execute() itself (Firestore, etc.) is NOT caught here and
        // stays fatal — retrying with different arguments wouldn't help,
        // and silently absorbing it would hide real infra failures.
        let toolResult;
        let validatedArgs;
        try {
          validatedArgs = validateToolInput(call.name, call.args);
        } catch (err) {
          toolResult = {
            data: { error: 'invalid_arguments', message: err && err.message ? err.message : 'Invalid arguments.' },
            sources: [],
          };
        }
        if (toolResult === undefined) {
          toolResult = await tool.execute(validatedArgs);
        }
        totalResultBytes += JSON.stringify(toolResult.data).length;
        if (totalResultBytes > maxResultBytes) {
          throw new Error('Tool result byte budget exceeded');
        }
        if (Array.isArray(toolResult.sources)) {
          for (const source of toolResult.sources) {
            sourceMap.set(source.id, source);
          }
        }
        if (call.name === 'navigate_to_record' && toolResult.data && toolResult.data.action === 'navigate' && typeof toolResult.data.route === 'string') {
          navigateTo = {
            route: toolResult.data.route,
            label: typeof toolResult.data.label === 'string' ? toolResult.data.label : '',
          };
        } else if (call.name === 'navigate_to_record') {
          navigateTo = null;
        }
        if (call.name === 'propose_opportunity_update' && toolResult.data && toolResult.data.proposalId) {
          proposal = {
            proposalId: toolResult.data.proposalId,
            kind: toolResult.data.kind || 'opportunity',
            recordId: toolResult.data.recordId,
            label: toolResult.data.label || '',
            field: toolResult.data.field,
            currentValue: toolResult.data.currentValue,
            proposedValue: toolResult.data.proposedValue,
            reason: toolResult.data.reason || '',
            expiresAt: toolResult.data.expiresAt,
          };
        }
        toolResults.push({ name: call.name, data: toolResult.data });
      }
      toolRounds += 1;
      continue;
    }

    throw new Error('AI provider response must contain either "functionCalls" or "finalResponse"');
  }
}

module.exports = { runChat };
