'use strict';
// Keeps a liquidation save from silently dropping receipts it already holds.
//
// LQ26-024-TJC (2026-10) ended up with 67 rows and receipts_json = [] while 43 of
// its receipt files sat in OneDrive: the browser only sends receipts whose upload
// finished in that tab, so a save from a tab that lost them (reload, other device,
// still uploading) wrote an empty list over the stored one.
//
// Rule: a stored receipt with a OneDrive item stays unless the incoming save
// names it in `removed_receipt_ids` (the client sends the ids the user deleted,
// directly or with their row). Anything else missing is put back and reported.

const parseList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

function keepStoredReceipts(storedJson, incoming, removedIds) {
  const stored = parseList(storedJson).filter((r) => r && typeof r === 'object' && r.oneDriveId);
  const next = parseList(incoming).filter((r) => r && typeof r === 'object');
  const removed = new Set((Array.isArray(removedIds) ? removedIds : []).map(String));
  const present = new Set();
  for (const r of next) {
    if (r.id) present.add(String(r.id));
    if (r.oneDriveId) present.add(String(r.oneDriveId));
  }
  const restored = stored.filter((r) =>
    !present.has(String(r.oneDriveId)) && !(r.id && present.has(String(r.id))) &&
    !removed.has(String(r.oneDriveId)) && !(r.id && removed.has(String(r.id))));
  return { receipts: restored.length ? [...next, ...restored] : next, restored };
}

module.exports = { keepStoredReceipts };
