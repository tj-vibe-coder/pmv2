/**
 * API base URL for backend requests.
 * In development, point directly at the API server to avoid proxy issues.
 * Set REACT_APP_API_URL in .env to override (e.g. http://localhost:3001).
 */
export const API_BASE =
  process.env.REACT_APP_API_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');
