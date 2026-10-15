'use strict';
const { createHash } = require('node:crypto');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function rowsArray(raw) {
  let rows;
  try { rows = typeof raw === 'string' ? JSON.parse(raw) : raw || []; } catch { fail('Invalid liquidation rows'); }
  if (!Array.isArray(rows)) fail('Invalid liquidation rows');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id) || ['__proto__', 'constructor', 'prototype'].includes(row.id)) fail('Physical numbering requires unique permanent row IDs');
    ids.add(row.id);
  }
  return rows;
}
function chronologicalRows(rows) {
  return [...rows].sort((a, b) => !a.date || !b.date ? (a.date ? -1 : b.date ? 1 : 0) : String(a.date).localeCompare(String(b.date)));
}
function physicalNumbering(liquidation) {
  const rows = rowsArray(liquidation.rows_json);
  const saved = liquidation.physical_item_numbering;
  if (!saved) {
    const numbers = Object.fromEntries(chronologicalRows(rows).map((row, index) => [row.id, index + 1]));
    return { version: 1, basis: 'legacy-date-ascending', numbers, nextItemNo: rows.length + 1 };
  }
  if (saved.version !== 1 || !saved.numbers || typeof saved.numbers !== 'object' || Array.isArray(saved.numbers)) fail('Invalid saved physical numbering');
  const values = Object.values(saved.numbers);
  if (values.some(n => !Number.isSafeInteger(n) || n < 1) || new Set(values).size !== values.length
    || !Number.isSafeInteger(saved.nextItemNo) || saved.nextItemNo <= Math.max(0, ...values)
    || rows.some(row => !Object.hasOwn(saved.numbers, row.id))) fail('Invalid saved physical numbering');
  return { ...saved, numbers: { ...saved.numbers } };
}
function numberedRows(liquidation) {
  const numbering = physicalNumbering(liquidation);
  return rowsArray(liquidation.rows_json).map(row => ({ ...row, physicalItemNo: numbering.numbers[row.id] }));
}
function prepareNumberedRows(raw, existing, actor = {}) {
  const rows = rowsArray(raw);
  const numbering = existing ? physicalNumbering(existing) : { version: 1, basis: 'new-item-sequence', numbers: {}, nextItemNo: 1 };
  const reserved = new Set(Object.values(numbering.numbers));
  const cleaned = rows.map(row => {
    const claimed = row.physicalItemNo;
    if (claimed !== undefined && (!Number.isSafeInteger(claimed) || claimed < 1 || claimed >= Number.MAX_SAFE_INTEGER)) fail('Physical item number must be a positive integer');
    if (Object.hasOwn(numbering.numbers, row.id)) {
      if (claimed !== undefined && claimed !== numbering.numbers[row.id]) fail('Physical item numbers cannot change; reload the liquidation');
    } else {
      const assigned = claimed ?? numbering.nextItemNo;
      if (assigned >= Number.MAX_SAFE_INTEGER || assigned < numbering.nextItemNo || reserved.has(assigned)) fail('Physical item number is already reserved; reload the liquidation');
      numbering.numbers[row.id] = assigned; reserved.add(assigned); numbering.nextItemNo = assigned + 1;
    }
    const { physicalItemNo, ...content } = row;
    return content;
  });
  numbering.initializedBy ||= actor.id || null;
  numbering.initializedAt ||= new Date().toISOString();
  return { rows: cleaned, numbering };
}
// Drafts have no paper copy yet, so their item numbers simply follow date order
// (undated last) and are recomputed on every save; client hints are ignored. The
// numbers become permanent when the form is submitted — after that a new line
// (an exception item) takes the next free number and nothing is renumbered.
function draftNumberedRows(raw, actor = {}, basis = 'draft-date-order') {
  const rows = rowsArray(raw);
  const numbers = Object.fromEntries(chronologicalRows(rows).map((row, index) => [row.id, index + 1]));
  const cleaned = rows.map(({ physicalItemNo, ...content }) => content);
  return { rows: cleaned, numbering: { version: 1, basis, numbers, nextItemNo: rows.length + 1, initializedBy: actor.id || null, initializedAt: new Date().toISOString() } };
}
function mappingHash(numbers) {
  return createHash('sha256').update(JSON.stringify(Object.entries(numbers).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
}
module.exports = { rowsArray, chronologicalRows, physicalNumbering, numberedRows, prepareNumberedRows, draftNumberedRows, mappingHash };

// Reserve references before any accounting side effects. A later failed or
// removed edit may leave a gap, but concurrent edits cannot reuse that number.
async function reserveNumberedRows(db, ref, raw, actor = {}) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw Object.assign(new Error('Liquidation not found'), { status: 404 });
    const before = snap.data();
    const prepared = prepareNumberedRows(raw, before, actor);
    const previous = before.physical_item_numbering;
    if (!previous || mappingHash(previous.numbers) !== mappingHash(prepared.numbering.numbers)) {
      tx.update(ref, { physical_item_numbering: prepared.numbering });
      tx.set(ref.collection('item_numbering_history').doc(), { actor: actor.id || null, at: new Date().toISOString(),
        basis: prepared.numbering.basis, mappingHash: mappingHash(prepared.numbering.numbers) });
    }
    return prepared;
  });
}
module.exports.reserveNumberedRows = reserveNumberedRows;
