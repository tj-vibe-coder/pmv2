/**
 * OneDrive / Microsoft Graph configuration.
 *
 * Required env vars (REACT_APP_ prefix, in .env / .env.production):
 *   REACT_APP_ONEDRIVE_CLIENT_ID      Azure app registration "Application (client) ID"
 *   REACT_APP_ONEDRIVE_TENANT_ID      Azure "Directory (tenant) ID" (single tenant)
 *   REACT_APP_ONEDRIVE_REDIRECT_URI   SPA redirect URI (e.g. http://localhost:3000)
 *
 * Optional env vars for the corporate shared library (Calcsheet folder automation):
 *   REACT_APP_ONEDRIVE_DRIVE_OWNER    Email of the OneDrive for Business account that
 *                                     hosts the shared proposal/execution folders.
 *                                     The driveId is resolved at runtime via
 *                                     GET /users/{owner}/drive and cached in localStorage.
 *   REACT_APP_ONEDRIVE_PROPOSAL_ROOT  Path under the corporate drive where proposal
 *                                     folders are created (e.g. "00 Proposal/IO Proposal").
 *   REACT_APP_ONEDRIVE_EXECUTION_ROOT Path under the corporate drive where execution
 *                                     folders are created when projects are awarded
 *                                     (e.g. "01 Execution").
 *
 * Azure app setup:
 *   - portal.azure.com → App registrations → New registration
 *   - Single tenant, Platform = Single-page application (SPA)
 *   - Add redirect URIs for dev + prod (http://localhost:3000, https://pm.iocontroltech.com, ...)
 *   - API permissions → Microsoft Graph → Delegated:
 *       Files.ReadWrite.All, Sites.ReadWrite.All, User.Read, offline_access
 *   - Grant admin consent for the tenant.
 */

// The app is served from multiple origins (localhost:3000, pmv2-851ae.web.app,
// pm.iocontroltech.com — all registered as SPA redirect URIs in Azure). A redirect
// URI baked in at build time for one origin silently breaks login on the others:
// the auth response lands on a different origin that has no PKCE code verifier,
// the token exchange fails, and the account is never cached — so the user is
// asked to sign in on every visit. Only honor the env value when it matches the
// origin the app is actually running on; otherwise use the current origin.
function resolveRedirectUri(): string {
  const envUri = process.env.REACT_APP_ONEDRIVE_REDIRECT_URI || '';
  if (typeof window === 'undefined') return envUri || 'http://localhost:3000';
  if (envUri && envUri.startsWith(window.location.origin)) return envUri;
  return window.location.origin;
}

export const onedriveConfig = {
  clientId: process.env.REACT_APP_ONEDRIVE_CLIENT_ID || '',
  tenantId: process.env.REACT_APP_ONEDRIVE_TENANT_ID || 'common',
  redirectUri: resolveRedirectUri(),

  // Delegated Graph scopes. Files.ReadWrite.All + Sites.ReadWrite.All cover both the
  // legacy personal-OneDrive AttachmentsTab flow and the new corporate shared library.
  // offline_access enables silent token refresh; User.Read is needed for /me lookups.
  scopes: [
    'Files.ReadWrite.All',
    'Sites.ReadWrite.All',
    'User.Read',
    'offline_access',
  ],

  // Corporate shared library config (Calcsheet folder automation). All optional —
  // when missing, the corporate flow is silently disabled and the personal-drive
  // AttachmentsTab keeps working as before.
  driveOwner: process.env.REACT_APP_ONEDRIVE_DRIVE_OWNER || '',
  proposalRoot: process.env.REACT_APP_ONEDRIVE_PROPOSAL_ROOT || '',
  executionRoot: process.env.REACT_APP_ONEDRIVE_EXECUTION_ROOT || '',
};

export const isOneDriveConfigured = (): boolean =>
  typeof onedriveConfig.clientId === 'string' && onedriveConfig.clientId.length > 0;

/**
 * True when the corporate shared-library env vars are all set. Calcsheet folder
 * automation gates on this so the app stays functional without the corporate config.
 */
export const isCorporateOneDriveConfigured = (): boolean =>
  isOneDriveConfigured() &&
  onedriveConfig.driveOwner.length > 0 &&
  onedriveConfig.proposalRoot.length > 0 &&
  onedriveConfig.executionRoot.length > 0;
