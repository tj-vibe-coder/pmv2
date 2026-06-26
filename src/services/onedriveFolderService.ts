/**
 * OneDrive folder service for the corporate shared library.
 *
 * Targets the OneDrive for Business drive owned by `onedriveConfig.driveOwner`
 * (e.g. `projects@iocontroltech.com`). The signed-in user must have at least
 * read/write access shared from that owner — the `Files.ReadWrite.All` delegated
 * scope grants the necessary breadth on the Graph side.
 *
 * Endpoints used (Microsoft Graph v1.0):
 *   GET  /users/{owner}/drive
 *   GET  /drives/{driveId}/root:/{path}
 *   POST /drives/{driveId}/root:/{parentPath}:/children   (create folder)
 *   PUT  /drives/{driveId}/root:/{folderPath}/{filename}:/content   (upload file)
 *
 * All operations are idempotent: if a folder by `name` already exists at
 * `parentPath`, the existing item is returned rather than failing.
 */

import { onedriveConfig } from '../config/onedriveConfig';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface DriveItemRef {
  id: string;
  webUrl: string;
  name?: string;
}

const DRIVE_ID_CACHE_KEY = 'ioct.onedrive.driveId.v1';

/**
 * Resolve the driveId for the corporate shared OneDrive owner (cached in localStorage).
 * Subsequent calls hit the cache; pass `force=true` to refresh.
 */
export async function resolveCorporateDriveId(
  token: string,
  ownerEmail = onedriveConfig.driveOwner,
  force = false,
): Promise<string> {
  if (!ownerEmail) throw new Error('OneDrive driveOwner is not configured');

  if (!force) {
    try {
      const cached = localStorage.getItem(DRIVE_ID_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { owner: string; driveId: string };
        if (parsed.owner === ownerEmail && parsed.driveId) return parsed.driveId;
      }
    } catch {
      // ignore cache parse errors
    }
  }

  const url = `${GRAPH_BASE}/users/${encodeURIComponent(ownerEmail)}/drive`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive lookup failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const driveId = data?.id;
  if (!driveId) throw new Error('Drive response had no id');

  try {
    localStorage.setItem(DRIVE_ID_CACHE_KEY, JSON.stringify({ owner: ownerEmail, driveId }));
  } catch {
    // localStorage may be unavailable; non-fatal
  }
  return driveId;
}

/** URL-encode each segment of a path, preserving the slashes. */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((seg) => seg.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Look up a single drive item by its full path under the drive root. Returns null on 404.
 */
async function getItemByPath(
  token: string,
  driveId: string,
  path: string,
): Promise<DriveItemRef | null> {
  const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(path)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Lookup failed (${res.status}) at "${path}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: data.name };
}

/**
 * List child folders directly under `parentPath` whose names start with `prefix`
 * (case-insensitive). Used to find historical OneDrive folders whose names don't
 * match the canonical "PCS{code} {name}" convention but share the PCS code part —
 * e.g. project `PCS2602003-REP-00` (code prefix `PCS2602003-`) matches the
 * existing folder `PCS2602003-REPCO Network Configuration`.
 *
 * Files are filtered out — only folders are returned. Empty array on no match.
 */
export async function listFoldersWithPrefix(
  token: string,
  driveId: string,
  parentPath: string,
  prefix: string,
): Promise<DriveItemRef[]> {
  if (!prefix) return [];
  const normalizedPrefix = prefix.toLowerCase();
  const url = parentPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(parentPath)}:/children?$top=500&$select=id,name,webUrl,folder`
    : `${GRAPH_BASE}/drives/${driveId}/root/children?$top=500&$select=id,name,webUrl,folder`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`List children failed (${res.status}) at "${parentPath}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data?.value) ? data.value : [];
  return items
    .filter((it: { name?: string; folder?: unknown }) =>
      !!it.folder &&
      typeof it.name === 'string' &&
      it.name.toLowerCase().startsWith(normalizedPrefix),
    )
    .map((it: { id: string; name: string; webUrl?: string }) => ({
      id: it.id,
      webUrl: it.webUrl || '',
      name: it.name,
    }));
}

/**
 * Resolve any OneDrive folder URL — long Documents-path URL OR short `:f:/p/...`
 * share link — to a drive item. Uses Graph's /shares/{encoded-url}/driveItem
 * endpoint, which transparently handles both forms.
 *
 * URL encoding per Microsoft Graph docs: base64-url encode the sharing URL,
 * prefix with `u!`. Strip any trailing `=` padding and replace `+` → `-`, `/` → `_`.
 *
 * Use case: "Link existing folder" — the user pastes a OneDrive URL of a folder
 * they want to associate with a calcsheet project (e.g. a historical folder
 * whose name doesn't match the canonical PCS… convention).
 */
export async function resolveSharingUrl(
  token: string,
  sharingUrl: string,
): Promise<DriveItemRef & { isFolder: boolean }> {
  if (!sharingUrl) throw new Error('Empty URL');
  const trimmed = sharingUrl.trim();
  // base64url-encode the URL
  const b64 = btoa(unescape(encodeURIComponent(trimmed)))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const encoded = `u!${b64}`;
  const url = `${GRAPH_BASE}/shares/${encoded}/driveItem`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Could not resolve OneDrive URL (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    id: data.id,
    webUrl: data.webUrl || trimmed,
    name: data.name,
    isFolder: !!data.folder,
  };
}

/**
 * Verify a drive item by ID still exists. Returns true if the item is reachable,
 * false on 404 (deleted/moved-out-of-scope), and throws on any other error.
 * Used to detect stale folder URLs stored on calcsheet projects when the user
 * has deleted the folder in OneDrive directly.
 */
/**
 * Verify a drive item still exists. Returns the item's current metadata
 * (including a fresh webUrl that reflects any moves) or null if deleted/gone.
 * Throws on unexpected non-404 errors.
 */
export async function verifyDriveItem(
  token: string,
  driveId: string,
  itemId: string,
): Promise<{ webUrl: string } | null> {
  if (!itemId) return null;
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${encodeURIComponent(itemId)}?$select=id,webUrl`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Item verify failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { webUrl: data.webUrl || '' };
}

/**
 * Idempotent folder creation. If a folder by `name` already exists at `parentPath`,
 * the existing item is returned. Otherwise the folder is created (and returned).
 *
 * - `parentPath` is a slash-separated path under the drive root, e.g.
 *   `"00 Proposal/IO Proposal"`. Use `""` for the drive root itself.
 * - `name` must not contain `/` or `\`.
 */
export async function ensureFolder(
  token: string,
  driveId: string,
  parentPath: string,
  name: string,
): Promise<DriveItemRef> {
  if (!name || /[\\/]/.test(name)) {
    throw new Error(`Invalid folder name: "${name}"`);
  }

  const fullPath = parentPath ? `${parentPath}/${name}` : name;

  // Fast path: lookup-first avoids a 409 on the common case where the folder already exists.
  const existing = await getItemByPath(token, driveId, fullPath);
  if (existing) return existing;

  // Create. conflictBehavior=fail so that if two concurrent calls race, we surface the
  // 409 and re-fetch (rather than silently renaming or replacing).
  const createUrl = parentPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(parentPath)}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  const res = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });

  if (res.status === 409) {
    // Race: another caller created it; fetch and return.
    const after = await getItemByPath(token, driveId, fullPath);
    if (after) return after;
    throw new Error(`Folder creation reported conflict but lookup failed for "${fullPath}"`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Folder create failed (${res.status}) at "${fullPath}": ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: data.name };
}

/**
 * Upload a single file directly into a folder identified by its drive item ID.
 * Preferred over `uploadFileToFolder` (path-based) when the caller already has
 * the folder's ID, since it survives folder moves/renames between proposal and
 * execution locations.
 *
 * Endpoint: PUT /drives/{driveId}/items/{parentId}:/{filename}:/content
 * Up to 250 MB; for larger payloads use a resumable upload session.
 */
export async function uploadFileToFolderById(
  token: string,
  driveId: string,
  parentFolderId: string,
  filename: string,
  blob: Blob,
): Promise<DriveItemRef> {
  if (!parentFolderId) throw new Error('Missing parent folder id');
  if (!filename || /[\\/]/.test(filename)) {
    throw new Error(`Invalid filename: "${filename}"`);
  }
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${encodeURIComponent(parentFolderId)}:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) for "${filename}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: data.name };
}

/**
 * Get or create a named child folder under a parent folder identified by its drive
 * item ID. Tries to create with conflictBehavior:'fail'; on 409 walks the children
 * list to return the existing folder. Safe to call concurrently for the same name.
 */
export async function getOrCreateChildFolderById(
  token: string,
  driveId: string,
  parentFolderId: string,
  folderName: string,
): Promise<DriveItemRef> {
  const childrenUrl = `${GRAPH_BASE}/drives/${driveId}/items/${encodeURIComponent(parentFolderId)}/children`;
  const createRes = await fetch(childrenUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (createRes.ok) {
    const d = await createRes.json();
    return { id: d.id, webUrl: d.webUrl || '', name: d.name };
  }
  if (createRes.status === 409) {
    // Already exists — scan children to find the folder.
    // Include `folder` in $select so the property is present for the type check.
    let cursor: string | undefined = `${childrenUrl}?$top=200&$select=id,name,webUrl,folder`;
    while (cursor) {
      // eslint-disable-next-line no-await-in-loop
      const scanRes: Response = await fetch(cursor, { headers: { Authorization: `Bearer ${token}` } });
      if (!scanRes.ok) break;
      // eslint-disable-next-line no-await-in-loop
      const scanData: { value: Array<{ id: string; name: string; webUrl: string; folder?: unknown }>; '@odata.nextLink'?: string } = await scanRes.json();
      const found = scanData.value.find(item => item.name === folderName && item.folder !== undefined);
      if (found) return { id: found.id, webUrl: found.webUrl || '', name: found.name };
      cursor = scanData['@odata.nextLink'];
    }
  }
  const errText = await createRes.text().catch(() => '');
  throw new Error(`Failed to get/create subfolder "${folderName}": ${errText.slice(0, 200)}`);
}

/**
 * Fetch a drive item's file content and return it as a Blob.
 * Callers are responsible for converting to a data URL (and applying EXIF
 * orientation correction) before passing to jsPDF's addImage.
 */
export async function fetchDriveItemBlob(
  token: string,
  driveId: string,
  itemId: string,
): Promise<Blob> {
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Fetch item content failed (${res.status})`);
  return res.blob();
}

/**
 * Delete a drive item by id. Best-effort; resolves true on 204/404, false on
 * other errors. Used to clean up an orphaned receipt file when its expense record
 * is deleted — a failure here must never block the Firestore delete.
 */
export async function deleteDriveItem(token: string, driveId: string, itemId: string): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    // 204 = deleted, 404 = already gone — both are "success" for cleanup purposes
    return res.ok || res.status === 404;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[OneDrive] deleteDriveItem failed:', err);
    return false;
  }
}

/**
 * Fetch a medium thumbnail URL for a drive item. Returns a short-lived
 * pre-authed URL usable directly as an `<img src>`, or null on any failure.
 */
export async function getDriveItemThumbnailUrl(token: string, driveId: string, itemId: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${encodeURIComponent(itemId)}/thumbnails/0/medium`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data && typeof data.url === 'string') ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * Upload a single file to `folderPath` under the drive root. The file is created
 * (or overwritten — Graph default is `replace`) at `${folderPath}/${filename}`.
 *
 * Uses the simple PUT endpoint, which supports files up to 250 MB. Quotation PDFs
 * and XLSX exports are well under that. For larger files, a resumable upload session
 * would be required.
 */
export async function uploadFileToFolder(
  token: string,
  driveId: string,
  folderPath: string,
  filename: string,
  blob: Blob,
): Promise<DriveItemRef> {
  if (!filename || /[\\/]/.test(filename)) {
    throw new Error(`Invalid filename: "${filename}"`);
  }
  const itemPath = folderPath ? `${folderPath}/${filename}` : filename;
  const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(itemPath)}:/content`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) for "${itemPath}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: data.name };
}

// ---------------------------------------------------------------------------
// High-level wrappers used by the calcsheet store/UI
// ---------------------------------------------------------------------------

/**
 * The PCS code portion used for prefix-matching against existing OneDrive folder
 * names. Same value the canonical folder name starts with — e.g. `PCS2602003-`
 * for project code `PCS2602003-REP-00`. Used by auto-detect to find historical
 * folders whose names diverge from the canonical convention.
 */
export function projectCodePrefix(project: { code: string }): string {
  // Strip the "-REV" suffix and the customer-code segment so the prefix matches
  // both canonical (`PCS2602003-REP …`) and historical (`PCS2602003-REPCO …`,
  // `PCS2602003 - REP …`) naming variants. The first 10 chars `PCS{YYMM}{SEQ}`
  // are stable across formats.
  const m = project.code.match(/^(PCS\d{7})/);
  return m ? m[1] : project.code.split('-')[0];
}

/** Build the canonical folder name for a calcsheet project's OneDrive folder. */
export function projectFolderName(project: { code: string; name: string }): string {
  // Strip the "-REV" suffix from the project code so the folder stays stable across revisions.
  // PCS2602001-ICI-00 → PCS2602001-ICI
  const codeNoRev = project.code.replace(/-\d{2}$/, '');
  const safeName = sanitizeForOneDrive(project.name || '');
  return `${codeNoRev} ${safeName}`.trim();
}

/**
 * Remove characters that OneDrive/SharePoint disallow or treat specially in item names:
 *   < > : " / \ | ? *
 * Also collapses repeated whitespace and trims.
 */
export function sanitizeForOneDrive(input: string): string {
  return input
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Look up an existing folder by PCS code prefix under `parentPath`. Returns the
 * unique match (intended for auto-detect of historical folders), or null when
 * there are 0 or >1 matches. The caller decides what to do with the ambiguous
 * cases — typically fall through to creating a canonical-named folder, and let
 * the user reconcile manually via the "Link existing" dialog if needed.
 */
async function findUniquePrefixMatch(
  token: string,
  driveId: string,
  parentPath: string,
  project: { code: string },
): Promise<DriveItemRef | null> {
  const prefix = projectCodePrefix(project);
  if (!prefix) return null;
  const matches = await listFoldersWithPrefix(token, driveId, parentPath, prefix);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Create (or look up) the proposal folder for a project.
 *
 * Resolution order:
 *   1. Exact canonical name match (`ensureFolder` does this internally) — newest
 *      and most common case.
 *   2. Prefix match on the PCS code part (handles historical folders whose names
 *      diverge from canonical convention — `PCS2602003-REPCO …` vs the canonical
 *      `PCS2602003-REP …`). Only auto-links when there's exactly one match;
 *      ambiguous cases fall through to step 3 and the user can use "Link
 *      existing" to disambiguate.
 *   3. Create fresh with canonical name.
 *
 * The `matchedExisting` flag on the return value tells the caller whether they
 * linked to an existing folder vs created a new one — useful for toasts.
 */
export async function ensureProposalFolder(
  token: string,
  project: { code: string; name: string },
): Promise<DriveItemRef & { parentPath: string; folderName: string; matchedExisting: boolean }> {
  // Proposal folders do NOT get Client PO / Sales Invoice subfolders — those are execution-only.
  return ensureInRoot(token, project, onedriveConfig.proposalRoot, false);
}

/** Create (or look up) the execution folder for a project (status='won' transition). */
export async function ensureExecutionFolder(
  token: string,
  project: { code: string; name: string },
): Promise<DriveItemRef & { parentPath: string; folderName: string; matchedExisting: boolean }> {
  // Execution folders always get Client PO / Sales Invoice subfolders seeded on creation.
  return ensureInRoot(token, project, onedriveConfig.executionRoot, true);
}

/** Lightweight single-item lookup — returns null on 404 or any error. */
async function tryGetItem(token: string, driveId: string, itemPath: string): Promise<DriveItemRef | null> {
  try {
    const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(itemPath)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, webUrl: data.webUrl || '', name: data.name } as DriveItemRef;
  } catch {
    return null;
  }
}

async function ensureInRoot(
  token: string,
  project: { code: string; name: string },
  root: string,
  seedSubfolders = false,
): Promise<DriveItemRef & { parentPath: string; folderName: string; matchedExisting: boolean }> {
  const driveId = await resolveCorporateDriveId(token);
  const canonical = projectFolderName(project);

  // Current operational year — new folders always land inside this subfolder.
  const year = String(new Date().getFullYear());
  const yearRoot = root ? `${root}/${year}` : year;

  // Resolution order (year-aware + backward-compat for flat historicals):
  //
  //  1a. Exact canonical name inside the year subfolder  → new standard location
  //  1b. Exact canonical name in the flat root           → pre-year historical
  //  2a. Prefix match inside the year subfolder          → year folder, non-canonical name
  //  2b. Prefix match in the flat root                   → flat historical, non-canonical name
  //  3.  Create fresh in the year subfolder              → always use new structure

  // 1a — year subfolder, exact
  const yearExact = await tryGetItem(token, driveId, `${yearRoot}/${canonical}`);
  if (yearExact) {
    return { ...yearExact, parentPath: yearRoot, folderName: yearExact.name || canonical, matchedExisting: true };
  }

  // 1b — flat root, exact (backward compat)
  const flatExact = await tryGetItem(token, driveId, root ? `${root}/${canonical}` : canonical);
  if (flatExact) {
    return { ...flatExact, parentPath: root, folderName: flatExact.name || canonical, matchedExisting: true };
  }

  // 2a — year subfolder, prefix scan
  const yearPrefix = await findUniquePrefixMatch(token, driveId, yearRoot, project).catch(() => null);
  if (yearPrefix) {
    return { ...yearPrefix, parentPath: yearRoot, folderName: yearPrefix.name || canonical, matchedExisting: true };
  }

  // 2b — flat root, prefix scan (backward compat)
  const flatPrefix = await findUniquePrefixMatch(token, driveId, root, project).catch(() => null);
  if (flatPrefix) {
    return { ...flatPrefix, parentPath: root, folderName: flatPrefix.name || canonical, matchedExisting: true };
  }

  // 3 — create in year subfolder; ensure the year folder itself exists first.
  await ensureFolder(token, driveId, root, year);
  const created = await ensureFolder(token, driveId, yearRoot, canonical);
  if (seedSubfolders) {
    await createExecutionProjectSubfolders(token, driveId, `${yearRoot}/${canonical}`);
  }
  return { ...created, parentPath: yearRoot, folderName: canonical, matchedExisting: false };
}

/**
 * Move a drive item to a new parent path. The item's ID is preserved; only its
 * parentReference and webUrl change. Returns the updated item.
 *
 * If `newName` is provided, the item is also renamed as part of the same PATCH.
 */
export async function moveItem(
  token: string,
  driveId: string,
  itemId: string,
  newParentPath: string,
  newName?: string,
): Promise<DriveItemRef> {
  const parent = await getItemByPath(token, driveId, newParentPath);
  if (!parent) {
    throw new Error(`Move target parent not found: "${newParentPath}"`);
  }
  const body: Record<string, unknown> = { parentReference: { id: parent.id } };
  if (newName) body.name = newName;

  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Move failed (${res.status}) item ${itemId} → "${newParentPath}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: data.name };
}

/**
 * Create a Windows-format `.url` shortcut file at `parentPath` that opens `targetUrl`
 * when double-clicked. Used as a breadcrumb in the original proposal location after
 * a project's folder has been promoted to the execution location.
 *
 * `shortcutName` should end with `.url`.
 */
export async function createUrlShortcut(
  token: string,
  driveId: string,
  parentPath: string,
  shortcutName: string,
  targetUrl: string,
): Promise<DriveItemRef> {
  const content = `[InternetShortcut]\r\nURL=${targetUrl}\r\n`;
  const blob = new Blob([content], { type: 'text/plain' });
  return uploadFileToFolder(token, driveId, parentPath, shortcutName, blob);
}

const EXECUTION_PROJECT_SUBFOLDERS = ['Client PO', 'Sales Invoice'] as const;

/**
 * Create standard subfolders inside a newly-created execution project folder.
 * Uses ensureFolder (lookup-first) so it's safe to call on existing folders too.
 * Failures are non-fatal and logged as warnings — missing subfolders don't block
 * the parent folder creation.
 */
async function createExecutionProjectSubfolders(
  token: string,
  driveId: string,
  projectFolderPath: string,
): Promise<void> {
  await Promise.all(
    EXECUTION_PROJECT_SUBFOLDERS.map((name) =>
      ensureFolder(token, driveId, projectFolderPath, name).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[OneDrive] subfolder "${name}" creation failed (non-fatal)`, err);
      }),
    ),
  );
}

/**
 * Promote a project's proposal folder to the execution location:
 *
 *   1. Create (or find) a project folder in `executionRoot` named `executionFolderName`
 *      (e.g. `IOCT2605001-LBI Batangas Power Plant`).
 *   2. Move the PCS proposal folder inside that project folder as a subfolder — the
 *      PCS folder keeps its original name and all its files travel with it.
 *   3. Drop a `.url` shortcut in the original proposal location pointing to the
 *      execution project folder (not the PCS subfolder), so browsing the proposal
 *      root still shows where the project went.
 *
 * The resulting OneDrive structure:
 *   01 Execution/
 *     IOCT2605001-LBI Batangas Plant/      ← executionFolder (returned)
 *       PCS2602001-LBI Batangas Plant/     ← proposalFolder moved inside
 *
 * Idempotent-ish: `ensureFolder` is lookup-first, and `moveItem` with the same
 * parentReference is a no-op per the Graph API, so re-promoting (won→lost→won)
 * is safe.
 *
 * Returns refs for both the new execution project folder and the moved proposal
 * subfolder so the caller can persist the right IDs/URLs.
 */
export async function moveProposalToExecution(
  token: string,
  project: { code: string; name: string; proposalFolderId: string; executionFolderName?: string },
): Promise<{ executionFolder: DriveItemRef; proposalFolder: DriveItemRef; shortcut: DriveItemRef | null }> {
  const driveId = await resolveCorporateDriveId(token);
  const pcsFolderName = projectFolderName(project);
  const execFolderName = project.executionFolderName
    ? sanitizeForOneDrive(project.executionFolderName)
    : pcsFolderName;

  // Year-aware roots — execution folder lands in e.g. "01 Execution/2026/IOCT2605001-…"
  const year = String(new Date().getFullYear());
  const execYearRoot = onedriveConfig.executionRoot
    ? `${onedriveConfig.executionRoot}/${year}`
    : year;
  const proposalYearRoot = onedriveConfig.proposalRoot
    ? `${onedriveConfig.proposalRoot}/${year}`
    : year;

  // Step 1: Ensure the year folder exists in execution root, then create (or
  // find) the project folder inside it, then seed Client PO / Sales Invoice.
  await ensureFolder(token, driveId, onedriveConfig.executionRoot, year);
  const executionFolder = await ensureFolder(token, driveId, execYearRoot, execFolderName);
  const execSubPath = `${execYearRoot}/${execFolderName}`;
  await createExecutionProjectSubfolders(token, driveId, execSubPath);

  // Step 2: Move the PCS proposal folder inside the execution project folder.
  const proposalFolder = await moveItem(token, driveId, project.proposalFolderId, execSubPath);

  // Step 3: Drop a shortcut in the year-aware proposal location pointing to the
  // execution project folder. Overwrite-safe if already exists (re-won after lost).
  let shortcut: DriveItemRef | null = null;
  try {
    const shortcutName = `${pcsFolderName} (moved to Execution).url`;
    shortcut = await createUrlShortcut(
      token,
      driveId,
      proposalYearRoot,
      shortcutName,
      executionFolder.webUrl,
    );
  } catch (err) {
    // Shortcut is a nice-to-have; folder promotion already succeeded.
    // eslint-disable-next-line no-console
    console.warn('[OneDrive] proposal shortcut creation failed (non-fatal)', err);
  }

  return { executionFolder, proposalFolder, shortcut };
}
