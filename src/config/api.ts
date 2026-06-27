/**
 * API base URL for backend requests.
 * In development, point directly at the API server to avoid proxy issues.
 * Set REACT_APP_API_URL in .env to override (e.g. http://localhost:3001).
 */
// In dev, default the API host to whatever host the page was loaded from (localhost,
// LAN IP, or Tailscale IP) so the app works from any device without a rebuild.
// An explicit REACT_APP_API_URL still wins; production uses same-origin ('').
const devApiBase =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001';

export const API_BASE =
  process.env.REACT_APP_API_URL ??
  (process.env.NODE_ENV === 'development' ? devApiBase : '');
