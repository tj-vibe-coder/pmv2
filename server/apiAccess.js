'use strict';

// Deny-by-default gate for every /api route, mounted in server.js before any
// route is declared. A request needs an approved user unless its route is in
// PUBLIC_ROUTES; phone-scanner sessions (the 'scan_' tokens minted by the QR
// pairing) may only reach SCANNER_ROUTES. Handlers keep their own role checks —
// this only guarantees nobody reaches a handler anonymously, so a route that
// forgets its auth check is closed rather than open.

const PUBLIC_ROUTES = [
  ['POST', /^\/api\/auth\/login$/],
  ['POST', /^\/api\/auth\/logout$/],
  ['POST', /^\/api\/auth\/register$/],
  ['POST', /^\/api\/auth\/forgot-password$/],
  ['POST', /^\/api\/auth\/qr\/exchange$/],
  ['GET', /^\/api\/health$/],
];

// What ScanPage / ScanBatch call on the phone after pairing.
const SCANNER_ROUTES = [
  ['GET', /^\/api\/auth\/me$/],
  ['GET', /^\/api\/projects$/],
  ['POST', /^\/api\/onedrive\/upload$/],
  ['POST', /^\/api\/scan-jobs\/[^/]+\/result$/],
  ['POST', /^\/api\/(project|overhead)-expenses$/],
  ['POST', /^\/api\/receipts\/(parse|detect-crop|check-duplicates)$/],
];

// Express routes case-insensitively and tolerates a trailing slash, so compare
// the same way: '/API/Projects/' must not slip past as a non-API path.
function normalizeApiPath(rawPath) {
  return String(rawPath || '').toLowerCase().replace(/\/+$/, '');
}

function isApiPath(path) {
  return /^\/api(\/|$)/.test(path);
}

function routeMatches(routes, method, path) {
  const verb = method === 'HEAD' ? 'GET' : method; // Express serves HEAD with the GET handler
  return routes.some(([routeVerb, pattern]) => routeVerb === verb && pattern.test(path));
}

function createApiAccessGate({ getCurrentUser, isActiveUser }) {
  return async function apiAccessGate(req, res, next) {
    const path = normalizeApiPath(req.path);
    if (!isApiPath(path) || req.method === 'OPTIONS') return next();
    if (routeMatches(PUBLIC_ROUTES, req.method, path)) return next();
    let user = null;
    try {
      user = await getCurrentUser(req);
    } catch (_) {
      user = null;
    }
    if (!user || !isActiveUser(user)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    // 403, not 401: the client clears its saved token on a 401.
    if (user.scannerScope && !routeMatches(SCANNER_ROUTES, req.method, path)) {
      return res.status(403).json({ success: false, error: 'Not available from a phone scanner session' });
    }
    return next();
  };
}

module.exports = {
  PUBLIC_ROUTES,
  SCANNER_ROUTES,
  normalizeApiPath,
  isApiPath,
  routeMatches,
  createApiAccessGate,
};
