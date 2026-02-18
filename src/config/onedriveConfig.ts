/**
 * OneDrive / Microsoft Graph configuration.
 * Set these in .env (or .env.local) with REACT_APP_ prefix:
 *
 *   REACT_APP_ONEDRIVE_CLIENT_ID=your-azure-app-client-id
 *   REACT_APP_ONEDRIVE_TENANT_ID=common
 *   REACT_APP_ONEDRIVE_REDIRECT_URI=http://localhost:3000
 *
 * For production, use your actual redirect URI.
 * Create an app at https://portal.azure.com → App registrations.
 * Add API permissions: Files.ReadWrite, User.Read (or offline_access).
 */

export const onedriveConfig = {
  clientId: process.env.REACT_APP_ONEDRIVE_CLIENT_ID || '',
  tenantId: process.env.REACT_APP_ONEDRIVE_TENANT_ID || 'common',
  redirectUri: process.env.REACT_APP_ONEDRIVE_REDIRECT_URI || `${window.location.origin}/`,
  scopes: ['Files.ReadWrite', 'User.Read'],
};

export const isOneDriveConfigured = (): boolean =>
  typeof onedriveConfig.clientId === 'string' && onedriveConfig.clientId.length > 0;
