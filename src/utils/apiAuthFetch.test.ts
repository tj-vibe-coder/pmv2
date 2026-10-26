import { installApiAuthFetch, isOwnApiUrl } from './apiAuthFetch';

describe('isOwnApiUrl', () => {
  const page = 'https://pmv2-851ae.web.app/sales/calcsheet/projects';

  it('matches same-origin and dev-API-host /api URLs only', () => {
    expect(isOwnApiUrl('/api/suppliers', page, '')).toBe(true);
    expect(isOwnApiUrl('https://pmv2-851ae.web.app/api/projects?x=1', page, '')).toBe(true);
    expect(isOwnApiUrl('http://192.168.1.5:3001/api/projects', 'http://192.168.1.5:3000/', 'http://192.168.1.5:3001')).toBe(true);
    expect(isOwnApiUrl('/apidocs', page, '')).toBe(false);
    expect(isOwnApiUrl('/static/js/main.js', page, '')).toBe(false);
    expect(isOwnApiUrl('https://graph.microsoft.com/v1.0/api/x', page, '')).toBe(false);
    expect(isOwnApiUrl('https://evil.example/api/projects', page, '')).toBe(false);
  });
});

describe('installApiAuthFetch', () => {
  const realFetch = window.fetch;
  let seen: Headers[] = [];

  beforeEach(() => {
    seen = [];
    window.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return Promise.resolve(new Response('{}'));
    }) as typeof window.fetch;
    installApiAuthFetch();
    localStorage.setItem('netpacific_token', 'tok123');
  });

  afterEach(() => {
    window.fetch = realFetch;
    localStorage.clear();
  });

  it('adds the saved token to API calls that have none', async () => {
    await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(seen[0].get('Authorization')).toBe('Bearer tok123');
    expect(seen[0].get('Content-Type')).toBe('application/json');
  });

  it('keeps an Authorization header the caller set', async () => {
    await fetch('/api/auth/me', { headers: { Authorization: 'Bearer scan_other' } });
    expect(seen[0].get('Authorization')).toBe('Bearer scan_other');
  });

  it('never sends the token to other hosts', async () => {
    await fetch('https://graph.microsoft.com/v1.0/me');
    expect(seen[0].get('Authorization')).toBeNull();
  });

  it('sends nothing extra when logged out', async () => {
    localStorage.clear();
    await fetch('/api/health');
    expect(seen[0].get('Authorization')).toBeNull();
  });
});
