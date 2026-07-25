import type {
  ProductHistorySearchResponse,
  ProductHistorySuggestion,
  ProductHistorySuggestionRequest,
} from '../types/ProductHistory';
import { API_BASE } from '../config/api';

const BASE = `${API_BASE}/api/calcsheet/product-history`;

function headers(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(body.error || 'Quotation History request failed');
  }
  return response.json();
}

export async function fetchProductHistory(filters: {
  search?: string;
  status?: string;
  sort?: string;
  limit?: number;
}): Promise<ProductHistorySearchResponse> {
  const query = new URLSearchParams();
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.limit) query.set('limit', String(filters.limit));
  return checked(await fetch(`${BASE}?${query}`, { headers: headers() }));
}

export async function fetchProductHistorySuggestion(
  request: ProductHistorySuggestionRequest,
): Promise<ProductHistorySuggestion> {
  return checked(await fetch(`${BASE}/suggest`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(request),
  }));
}
