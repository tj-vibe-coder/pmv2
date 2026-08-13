'use strict';

const { validateToolInput } = require('./schemas');

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateFinalResponse(response) {
  if (!isPlainObject(response)) {
    throw new Error('finalResponse must be a plain object');
  }

  const allowedKeys = ['answer', 'citationIds', 'followUps'];
  const unexpected = Object.keys(response).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`finalResponse has unexpected field(s): ${unexpected.join(', ')}`);
  }
  for (const key of allowedKeys) {
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

  return { answer, citationIds, followUps };
}

async function runChat({ client, registry, config, messages, pageContext, requestId }) {
  const { maxToolRounds, maxResultBytes } = config;

  const sourceMap = new Map();
  const toolResults = [];
  let toolRounds = 0;
  let totalResultBytes = 0;

  for (;;) {
    let result;
    try {
      result = await client.send({ messages, pageContext, toolResults });
    } catch (error) {
      throw new Error('AI provider request failed');
    }

    if (result && result.finalResponse) {
      const finalResponse = validateFinalResponse(result.finalResponse);
      const citations = finalResponse.citationIds
        .map((id) => sourceMap.get(id))
        .filter((source) => source !== undefined);
      return {
        answer: finalResponse.answer,
        citations,
        followUps: finalResponse.followUps,
        notice: 'AI-generated summary from IOCT records. Verify before making decisions.',
      };
    }

    if (result && result.functionCalls) {
      if (toolRounds >= maxToolRounds) {
        throw new Error('Tool round budget exceeded');
      }
      for (const call of result.functionCalls) {
        const tool = registry.get(call.name);
        if (!tool) {
          throw new Error('Unknown tool: ' + call.name);
        }
        const validatedArgs = validateToolInput(call.name, call.args);
        const toolResult = await tool.execute(validatedArgs);
        totalResultBytes += JSON.stringify(toolResult.data).length;
        if (totalResultBytes > maxResultBytes) {
          throw new Error('Tool result byte budget exceeded');
        }
        if (Array.isArray(toolResult.sources)) {
          for (const source of toolResult.sources) {
            sourceMap.set(source.id, source);
          }
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
