'use strict';
const { createHash } = require('node:crypto');
const TYPES = ['service_invoice', 'collection_receipt', 'counter_receipt', 'bir2307', 'payment_proof', 'deposit_slip', 'supporting_pack'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const hash = value => createHash('sha256').update(value).digest('hex');
function text(value, max = 1000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) fail('Invalid text field');
  return value.trim();
}
function id(value) {
  const s = text(value, 200);
  if (!s || s.includes('/') || s === '.' || s === '..') fail('Invalid record ID');
  return s;
}
function date(value) {
  const s = text(value, 10);
  if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s)) fail('Invalid calendar date');
  return s;
}
function url(value) {
  let u;
  try { u = new URL(value); } catch (_) { fail('A valid HTTPS file URL is required'); }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|192\.168\.|10\.|169\.254\.)/.test(u.hostname)) fail('A public HTTPS file URL is required');
  return u.href;
}
function documentInput(body) {
  const webUrl = url(body.webUrl);
  const driveId = text(body.driveId, 200); const itemId = text(body.itemId, 200);
  if (driveId && !itemId) fail('OneDrive item ID required with drive ID');
  const filename = text(body.filename, 240);
  if (!filename) fail('Filename required');
  const mimeType = text(body.mimeType, 100);
  if (mimeType && !['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/bmp'].includes(mimeType)) fail('Unsupported document type');
  const size = body.size == null ? null : body.size;
  if (size != null && (!Number.isSafeInteger(size) || size <= 0 || size > 25 * 1024 * 1024)) fail('Maximum file size is 25 MB');
  const identity = driveId && itemId ? `onedrive:${driveId}:${itemId}` : `url:${webUrl}`;
  return { id: hash(identity), identity, driveId, itemId, webUrl, filename, mimeType, size, provenance: driveId ? 'onedrive' : 'https-reference' };
}
function linkId(invoiceId, documentId, type) { return hash(`invoice:${invoiceId}:${documentId}:${type}`); }
function linkInput(body) {
  if (!TYPES.includes(body.type)) fail('Unsupported invoice evidence type');
  const source = text(body.source);
  if (!source) fail('Evidence source required');
  return { type: body.type, source, reference: text(body.reference, 200), documentDate: date(body.documentDate) };
}
function certificateInput(body) {
  const printedWhtCentavos = body.printedWhtCentavos;
  const printedIncomeCentavos = body.printedIncomeCentavos;
  for (const n of [printedWhtCentavos, printedIncomeCentavos]) if (!Number.isSafeInteger(n) || n < 0) fail('Printed amounts must be non-negative integer centavos');
  const periodStart = date(body.periodStart); const periodEnd = date(body.periodEnd);
  if (!periodStart || !periodEnd || periodEnd < periodStart) fail('Valid certificate period required');
  if (!Array.isArray(body.allocations) || !body.allocations.length || body.allocations.length > 50) fail('Supply 1–50 invoice evidence allocations');
  const allocations = body.allocations.map(a => {
    if (!a || !Number.isSafeInteger(a.whtCentavos) || a.whtCentavos < 0) fail('Invalid evidence allocation');
    return { invoiceId: id(a.invoiceId), whtCentavos: a.whtCentavos };
  });
  if (new Set(allocations.map(a => a.invoiceId)).size !== allocations.length) fail('Duplicate invoice allocation');
  const allocated = allocations.reduce((s, a) => s + a.whtCentavos, 0);
  if (!Number.isSafeInteger(allocated) || allocated > printedWhtCentavos) fail('Evidence allocations exceed printed WHT');
  const reviewState = body.reviewState;
  if (!['unreviewed', 'matched', 'discrepancy', 'resolved'].includes(reviewState)) fail('Invalid review state');
  const reviewNote = text(body.reviewNote, 4000);
  if (reviewState === 'resolved' && !reviewNote) fail('Resolution note required');
  if (!Array.isArray(body.reviewFlags) || body.reviewFlags.length > 20) fail('Invalid review flags');
  const reviewFlags = body.reviewFlags.map(f => text(f, 200)).filter(Boolean);
  if (reviewState === 'matched' && (allocated !== printedWhtCentavos || reviewFlags.length)) fail('Matched requires fully reconciled evidence without open flags');
  return { certificateNumber: text(body.certificateNumber, 200), periodStart, periodEnd, printedIncomeCentavos, printedWhtCentavos,
    printedAtc: text(body.printedAtc, 200), printedDescription: text(body.printedDescription), observedCalculation: text(body.observedCalculation),
    reviewState, reviewNote, reviewFlags, allocations };
}
function legacyDocument(invoice) {
  const s = invoice.scan_file;
  if (!s || !s.onedrive_web_url) return null;
  try {
    return { ...documentInput({ webUrl: s.onedrive_web_url, itemId: s.onedrive_item_id, filename: s.filename || 'Legacy scan' }),
      legacy: true, type: 'supporting_pack', source: 'legacy scan_file (contents not classified)', uploadedAt: s.uploaded_at || null };
  } catch (_) { return null; }
}
module.exports = { TYPES, fail, text, id, date, url, documentInput, linkId, linkInput, certificateInput, legacyDocument };
