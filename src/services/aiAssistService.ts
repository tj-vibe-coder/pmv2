import { API_BASE } from '../config/api';
import type { AiAnswer, AiMessage, AiNavigateTo, AiPageContext, AiLiveTokenResponse } from '../types/AiAssist';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class AiAssistError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiAssistError';
    this.status = status;
  }
}

export async function sendAiChat(
  messages: Pick<AiMessage, 'role' | 'text'>[],
  pageContext: AiPageContext | null,
  signal?: AbortSignal,
): Promise<AiAnswer> {
  const res = await fetch(`${API_BASE}/api/ai-assist/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ messages, pageContext }),
    signal,
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiAssistError('The assistant is unavailable right now.', res.status);
  }

  const parsed = body as Partial<AiAnswer> & { error?: string };
  if (!res.ok || !parsed.ok) {
    if (res.status === 401) throw new AiAssistError('Sign in to use IOCT Assist.', 401);
    if (res.status === 403) throw new AiAssistError('IOCT Assist is not available for this account.', 403);
    if (res.status === 503) throw new AiAssistError('IOCT Assist is not enabled yet.', 503);
    if (res.status === 429) throw new AiAssistError('Too many requests — please wait a moment.', 429);
    throw new AiAssistError('The assistant could not answer that. Please try again.', res.status);
  }

  if (
    typeof parsed.answer !== 'string' ||
    !Array.isArray(parsed.citations) ||
    !Array.isArray(parsed.followUps) ||
    typeof parsed.notice !== 'string' ||
    typeof parsed.requestId !== 'string'
  ) {
    throw new AiAssistError('The assistant returned an unexpected response.', res.status);
  }

  const answer = parsed as AiAnswer;
  if (parsed.navigateTo != null) {
    const nav = parsed.navigateTo as Partial<AiNavigateTo>;
    if (typeof nav.route !== 'string' || typeof nav.label !== 'string') {
      throw new AiAssistError('The assistant returned an unexpected response.', res.status);
    }
    answer.navigateTo = { route: nav.route, label: nav.label };
  }
  return answer;
}

export async function requestLiveToken(signal?: AbortSignal): Promise<AiLiveTokenResponse> {
  const res = await fetch(`${API_BASE}/api/ai-assist/live-token`, {
    method: 'POST',
    headers: { ...authHeaders() },
    signal,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiAssistError('Could not start a voice session.', res.status);
  }
  const parsed = body as Partial<AiLiveTokenResponse>;
  if (
    !res.ok
    || !parsed.ok
    || typeof parsed.token !== 'string'
    || typeof parsed.liveSessionId !== 'string'
    || !parsed.liveSessionId
  ) {
    throw new AiAssistError('Could not start a voice session.', res.status);
  }
  return parsed as AiLiveTokenResponse;
}

export async function executeLiveTool(
  name: string,
  args: Record<string, unknown>,
  liveSessionId: string,
  signal?: AbortSignal,
): Promise<{ result: unknown; sources: unknown[] }> {
  const res = await fetch(`${API_BASE}/api/ai-assist/tools/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ args, liveSessionId }),
    signal,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiAssistError('The assistant tool call failed.', res.status);
  }
  const parsed = body as { ok?: boolean; result?: unknown; sources?: unknown[] };
  if (!res.ok || !parsed.ok) {
    throw new AiAssistError('The assistant tool call failed.', res.status);
  }
  return { result: parsed.result, sources: parsed.sources || [] };
}
