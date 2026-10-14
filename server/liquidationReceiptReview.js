'use strict';
const { createHash } = require('node:crypto');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function array(raw) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw || []; }
  catch (_) { throw Object.assign(new Error('Invalid saved liquidation content'), { status: 400 }); }
  if (!Array.isArray(value)) throw Object.assign(new Error('Invalid saved liquidation content'), { status: 400 });
  return value;
}
function receiptReviewHash(liquidation) {
  const header = Object.fromEntries(['form_no', 'employee_name', 'employee_number', 'date_of_submission', 'ca_id', 'total_amount', 'status'].map(key => [key, liquidation[key] ?? null]));
  const receipts = array(liquidation.receipts_json).map(receipt => Object.fromEntries(['id', 'rowId', 'oneDriveId', 'webUrl', 'filename', 'imageHash'].map(key => [key, receipt[key] ?? null])));
  return createHash('sha256').update(JSON.stringify(canonical({ version: 1, header, rows: array(liquidation.rows_json), receipts }))).digest('hex');
}
function reviewStatus(liquidation, review) {
  if (!review?.reviewedBy) return 'not_reviewed';
  if (!review.active) return 'withdrawn';
  return review.contentHash === receiptReviewHash(liquidation) ? 'reviewed' : 'review_required';
}
module.exports = { receiptReviewHash, reviewStatus };
