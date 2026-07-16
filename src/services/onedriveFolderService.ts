/**
 * OneDrive folder service for the corporate shared library.
 *
 * Previously this module talked to Microsoft Graph directly using a delegated
 * user token. It now calls our OWN backend proxy endpoints (`/api/onedrive/*`),
 * which authenticate to Graph server-side with an app-only account and resolve
 * the corporate drive themselves.
 *
 * IMPORTANT — backward compatibility: every exported function keeps its original
 * signature, including the leading `token` and (where present) `driveId`
 * parameters. Those parameters are now IGNORED — the server handles auth and
 * drive resolution — but they are retained so the ~13 existing call sites keep
 * working unchanged. `resolveCorporateDriveId` returns the sentinel `'server'`,
 * which callers pass onward as `driveId` to functions that ignore it.
 *
 * All operations remain idempotent: if a folder by `name` already exists at
 * `parentPath`, the existing item is returned rather than failing (the proxy
 * preserves this behavior).
 */

import { onedriveConfig } from '../config/onedriveConfig';
import { API_BASE } from '../config/api';

export interface DriveItemRef {
  id: string;
  webUrl: string;
  name?: string;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('netpacific_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Drive resolution now happens server-side, so there is nothing to look up from
 * the client. Returns the sentinel `'server'` which callers thread through as the
 * `driveId` argument to the (now-proxied) primitives, all of which ignore it.
 *
 * Kept async + `Promise<string>` and the original parameters for call-site
 * compatibility. `token`/`ownerEmail`/`force` are ignored.
 */
export async function resolveCorporateDriveId(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ownerEmail = onedriveConfig.driveOwner,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  force = false,
): Promise<string> {
  return 'server';
}

/**
 * Look up a single drive item by its full path under the drive root. Returns null
 * when the item does not exist.
 */
async function getItemByPath(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  path: string,
): Promise<DriveItemRef | null> {
  const res = await fetch(`${API_BASE}/api/onedrive/by-path?path=${encodeURIComponent(path)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Lookup failed (${res.status}) at "${path}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data?.ok) return null;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  parentPath: string,
  prefix: string,
): Promise<DriveItemRef[]> {
  if (!prefix) return [];
  const res = await fetch(
    `${API_BASE}/api/onedrive/children?path=${encodeURIComponent(parentPath)}&prefix=${encodeURIComponent(prefix)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`List children failed (${res.status}) at "${parentPath}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const items: Array<{ id: string; name?: string; webUrl?: string; isFolder?: boolean }> =
    Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((it) => it.isFolder)
    .map((it) => ({ id: it.id, webUrl: it.webUrl || '', name: it.name }));
}

/**
 * Resolve any OneDrive folder URL — long Documents-path URL OR short `:f:/p/...`
 * share link — to a drive item. The proxy handles the Graph `/shares` resolution.
 *
 * Use case: "Link existing folder" — the user pastes a OneDrive URL of a folder
 * they want to associate with a calcsheet project (e.g. a historical folder
 * whose name doesn't match the canonical PCS… convention).
 */
export async function resolveSharingUrl(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  sharingUrl: string,
): Promise<DriveItemRef & { isFolder: boolean }> {
  if (!sharingUrl) throw new Error('Empty URL');
  const trimmed = sharingUrl.trim();
  const res = await fetch(`${API_BASE}/api/onedrive/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ url: trimmed }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Could not resolve OneDrive URL (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    id: data.id,
    webUrl: data.webUrl || trimmed,
    name: data.name,
    isFolder: !!data.isFolder,
  };
}

/**
 * Verify a drive item still exists. Returns the item's current metadata
 * (including a fresh webUrl that reflects any moves) or null if deleted/gone.
 * Throws on unexpected transport errors.
 */
export async function verifyDriveItem(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  itemId: string,
): Promise<{ webUrl: string } | null> {
  if (!itemId) return null;
  const res = await fetch(`${API_BASE}/api/onedrive/item/${encodeURIComponent(itemId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Item verify failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data?.ok) return null;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  parentPath: string,
  name: string,
): Promise<DriveItemRef> {
  if (!name || /[\\/]/.test(name)) {
    throw new Error(`Invalid folder name: "${name}"`);
  }
  const fullPath = parentPath ? `${parentPath}/${name}` : name;
  const res = await fetch(`${API_BASE}/api/onedrive/ensure-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path: fullPath }),
  });
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
 */
export async function uploadFileToFolderById(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  parentFolderId: string,
  filename: string,
  blob: Blob,
): Promise<DriveItemRef> {
  if (!parentFolderId) throw new Error('Missing parent folder id');
  if (!filename || /[\\/]/.test(filename)) {
    throw new Error(`Invalid filename: "${filename}"`);
  }
  const contentBase64 = await blobToBase64(blob);
  const res = await fetch(`${API_BASE}/api/onedrive/upload-by-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ folderId: parentFolderId, filename, contentBase64 }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) for "${filename}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: filename };
}

/**
 * Get or create a named child folder under a parent folder identified by its drive
 * item ID. Safe to call concurrently for the same name (the proxy returns the
 * existing folder on conflict).
 */
export async function getOrCreateChildFolderById(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  parentFolderId: string,
  folderName: string,
): Promise<DriveItemRef> {
  const res = await fetch(`${API_BASE}/api/onedrive/child-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ parentId: parentFolderId, name: folderName }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to get/create subfolder "${folderName}": ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: data.name };
}

/**
 * Fetch a drive item's file content and return it as a Blob.
 * Callers are responsible for converting to a data URL (and applying EXIF
 * orientation correction) before passing to jsPDF's addImage.
 */
export async function fetchDriveItemBlob(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  itemId: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/onedrive/item/${encodeURIComponent(itemId)}/content`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Fetch item content failed (${res.status})`);
  return res.blob();
}

/**
 * Overwrite an existing drive item's bytes in place — id and webUrl are
 * unchanged, so no stored reference (project_expenses.receiptRef,
 * liquidation receipts_json, etc.) ever needs to change. Used to bake a
 * client-side receipt rotation into the actual file so a plain download (or
 * OneDrive itself) shows it upright, not just this app's in-viewer CSS rotate.
 */
export async function replaceDriveItemContent(itemId: string, blob: Blob): Promise<void> {
  const contentBase64 = await blobToBase64(blob);
  const res = await fetch(`${API_BASE}/api/onedrive/item/${encodeURIComponent(itemId)}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ contentBase64 }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Replace content failed (${res.status}): ${errText.slice(0, 300)}`);
  }
}

/**
 * Delete a drive item by id. Best-effort; resolves true on any 2xx (the proxy
 * treats already-gone as success too), false on other errors. Used to clean up an
 * orphaned receipt file when its expense record is deleted — a failure here must
 * never block the Firestore delete.
 */
export async function deleteDriveItem(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  itemId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/onedrive/item/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[OneDrive] deleteDriveItem failed:', err);
    return false;
  }
}

/**
 * Fetch a thumbnail URL for a drive item. Returns a short-lived pre-authed URL
 * usable directly as an `<img src>`, or null on any failure.
 */
export async function getDriveItemThumbnailUrl(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  itemId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/onedrive/item/${encodeURIComponent(itemId)}/thumbnail`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok && typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * Upload a single file to `folderPath` under the drive root. The file is created
 * (or overwritten) at `${folderPath}/${filename}`.
 */
export async function uploadFileToFolder(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  folderPath: string,
  filename: string,
  blob: Blob,
): Promise<DriveItemRef> {
  if (!filename || /[\\/]/.test(filename)) {
    throw new Error(`Invalid filename: "${filename}"`);
  }
  const itemPath = folderPath ? `${folderPath}/${filename}` : filename;
  const contentBase64 = await blobToBase64(blob);
  const res = await fetch(`${API_BASE}/api/onedrive/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ folderPath, filename, contentBase64 }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) for "${itemPath}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: filename };
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

/** Lightweight single-item lookup — returns null on not-found or any error. */
async function tryGetItem(token: string, driveId: string, itemPath: string): Promise<DriveItemRef | null> {
  try {
    return await getItemByPath(token, driveId, itemPath);
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
 * If `newName` is provided, the item is also renamed as part of the same move.
 */
export async function moveItem(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  driveId: string,
  itemId: string,
  newParentPath: string,
  newName?: string,
): Promise<DriveItemRef> {
  const res = await fetch(`${API_BASE}/api/onedrive/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ itemId, destPath: newParentPath, name: newName }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Move failed (${res.status}) item ${itemId} → "${newParentPath}": ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return { id: data.id, webUrl: data.webUrl || '', name: newName };
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
