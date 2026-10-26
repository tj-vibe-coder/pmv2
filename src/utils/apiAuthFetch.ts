import { API_BASE } from '../config/api';

const TOKEN_KEY = 'netpacific_token';

// True only for this app's own API (same origin, or the dev API host) — the
// token must never be attached to Graph, Gemini or any other third party.
export function isOwnApiUrl(rawUrl: string, pageHref: string = window.location.href, apiBase: string = API_BASE): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl, pageHref);
  } catch {
    return false;
  }
  const pageOrigin = new URL(pageHref).origin;
  const apiOrigin = apiBase ? new URL(apiBase, pageHref).origin : pageOrigin;
  if (url.origin !== pageOrigin && url.origin !== apiOrigin) return false;
  return /^\/api(\/|$)/i.test(url.pathname);
}

/**
 * The server requires a login on every /api route. Most pages send their own
 * Authorization header, but some fetches never did (they relied on routes that
 * used to be open), so this adds the saved token to any API request that lacks
 * one. A header a caller sets explicitly always wins.
 */
export function installApiAuthFetch(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isOwnApiUrl(url)) return nativeFetch(input, init);
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      // storage blocked: send the request as-is
    }
    if (!token) return nativeFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.has('Authorization')) return nativeFetch(input, init);
    headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
}
