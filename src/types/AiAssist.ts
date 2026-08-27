export interface AiCitation {
  id: string;
  label: string;
  route: string;
  asOf: string;
}

export interface AiNavigateTo {
  route: string;
  label: string;
}

export type AiChartType = 'bar' | 'horizontal_bar' | 'line' | 'area' | 'pie' | 'donut' | 'composed';

export interface AiChart {
  type: AiChartType;
  title: string;
  tool: string;
  xAxisKey?: string;
  data: Record<string, unknown>[];
}

export interface AiProposal {
  proposalId: string;
  kind: string;
  recordId: string;
  label: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  expiresAt?: string;
}

export interface AiAnswer {
  ok: true;
  requestId: string;
  answer: string;
  citations: AiCitation[];
  followUps: string[];
  notice: string;
  navigateTo?: AiNavigateTo | null;
  proposal?: AiProposal | null;
  chart?: AiChart | null;
}

export type AiMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      citations: AiCitation[];
      notice: string;
      followUps: string[];
      chart: AiChart | null;
    }
  | { id: string; role: 'error'; text: string };

export type AiLivePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error';

export interface AiPageContext {
  route: string;
  projectId: string | null;
  opportunityId: string | null;
  quotationId: string | null;
}

export interface AiPriorToolResult {
  name: string;
  data: unknown;
}

export interface AiLiveTokenResponse {
  ok: true;
  token: string;
  model: string;
  liveSessionId: string;
  expireTime: string;
  newSessionExpireTime: string;
}

export interface AiHealthResponse {
  ok: true;
  enabled: boolean;
  chatProvider: string;
  chatModel: string;
  liveModel: string;
}

export function parseAiChart(value: unknown): AiChart | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const allowedTypes = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'donut', 'composed'];
  const chartType = typeof record.type === 'string' && allowedTypes.includes(record.type)
    ? (record.type as AiChartType)
    : 'bar';
  if (typeof record.title !== 'string' || typeof record.tool !== 'string') return null;
  if (!Array.isArray(record.data)) return null;
  return {
    type: chartType,
    title: record.title,
    tool: record.tool,
    ...(typeof record.xAxisKey === 'string' ? { xAxisKey: record.xAxisKey } : {}),
    data: record.data,
  };
}

export function parseAiProposal(value: unknown): AiProposal | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.proposalId !== 'string' || !record.proposalId) return null;
  if (typeof record.field !== 'string' || !record.field) return null;
  return {
    proposalId: record.proposalId,
    kind: typeof record.kind === 'string' ? record.kind : 'opportunity',
    recordId: typeof record.recordId === 'string' ? record.recordId : '',
    label: typeof record.label === 'string' ? record.label : '',
    field: record.field,
    currentValue: record.currentValue ?? null,
    proposedValue: record.proposedValue ?? null,
    reason: typeof record.reason === 'string' ? record.reason : '',
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
  };
}
