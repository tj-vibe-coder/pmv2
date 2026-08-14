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

export interface AiAnswer {
  ok: true;
  requestId: string;
  answer: string;
  citations: AiCitation[];
  followUps: string[];
  notice: string;
  navigateTo?: AiNavigateTo | null;
}

export type AiMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; citations: AiCitation[]; notice: string }
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
  chatModel: string;
  liveModel: string;
}
