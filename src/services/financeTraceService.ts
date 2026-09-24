import { API_BASE } from '../config/api';
import type {
  FinanceTraceOrigin,
  FinanceTraceResolutionRequest,
  FinanceTraceResolutionResponse,
  FinanceTraceResponse,
} from '../types/FinanceTrace';

export class FinanceTraceApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly sourceFocusUrl?: string;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    sourceFocusUrl?: string;
  }) {
    super(options.message);
    this.name = 'FinanceTraceApiError';
    this.status = options.status;
    this.code = options.code;
    this.sourceFocusUrl = options.sourceFocusUrl;
  }
}

const authHeaders = (json = false): Record<string, string> => {
  const token = localStorage.getItem('netpacific_token');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
};

async function readJson<T>(response: Response): Promise<T> {
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new FinanceTraceApiError({
      status: response.status,
      code: payload?.code || `HTTP_${response.status}`,
      message: payload?.error || response.statusText || 'Money trail request failed',
      sourceFocusUrl: payload?.sourceFocusUrl,
    });
  }
  return payload as T;
}

const tracePath = (origin: FinanceTraceOrigin): string => {
  const path = `${API_BASE}/api/finance-trace/${origin.type}/${encodeURIComponent(origin.id)}`;
  if (origin.type === 'expense') {
    return `${path}?collection=${encodeURIComponent(origin.collection)}`;
  }
  if (origin.type === 'liquidation') {
    return `${path}?rowId=${encodeURIComponent(origin.rowId)}`;
  }
  return path;
};

export async function getFinanceTrace(
  origin: FinanceTraceOrigin,
): Promise<FinanceTraceResponse> {
  const response = await fetch(tracePath(origin), { headers: authHeaders() });
  return readJson<FinanceTraceResponse>(response);
}

export async function resolveFinanceTrace(
  request: FinanceTraceResolutionRequest,
): Promise<FinanceTraceResolutionResponse> {
  const response = await fetch(`${API_BASE}/api/finance-trace/resolve`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(request),
  });
  return readJson<FinanceTraceResolutionResponse>(response);
}
