'use strict';

// Field constants derived from the actual PMv2 project/quotation/expense
// record shapes. The explicit field list is the only defense — there is no
// generic recursive secret-stripping filter.
const PROJECT_FIELDS = [
  'id', 'project_no', 'year', 'am', 'ovp_number', 'po_number', 'account_name',
  'project_name', 'project_category', 'project_location', 'scope_of_work',
  'project_status', 'contract_amount', 'updated_contract_amount', 'contract_billed',
  'amount_contract_billed_net', 'total_contract_balance', 'actual_site_progress_percent',
  'evaluated_progress_percent', 'completion_date', 'updated_completion_date', 'remarks', 'updated_at'
];

const OPPORTUNITY_FIELDS = [
  'id', 'code', 'name', 'location', 'date', 'status', 'ongoing',
  'opportunityGrade', 'mainProjectStatus', 'mainProjectProgressPercent',
  'mainProjectNo', 'createdAt', 'updatedAt'
];

const QUOTATION_FIELDS = [
  'id', 'projectId', 'kind', 'revision', 'dateSent', 'expectedPurchaseDate',
  'validityDays', 'paymentTerms', 'deliveryTerms', 'warrantyMonths',
  'discountPct', 'vatPct', 'formulaVersion'
];

const EXPENSE_FIELDS = [
  'id', 'projectId', 'description', 'amount', 'date', 'category', 'sourceType', 'createdAt'
];

// Company identity only — never contacts, phones, emails, or addresses.
const CLIENT_FIELDS = [
  'id', 'code', 'name'
];

// Returns a new object containing only the keys in `fields` that exist as
// own-enumerable properties on `record`. Inherited keys are never copied.
function pick(record, fields) {
  if (record === null || typeof record !== 'object') {
    return {};
  }
  const result = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      result[field] = record[field];
    }
  }
  return result;
}

function authorizeAiUser(user, config) {
  if (!config.enabled) {
    return { ok: false, status: 503, error: 'ai_assist_disabled' };
  }
  if (!user || !user.username) {
    return { ok: false, status: 401, error: 'unauthenticated' };
  }
  if (!config.allowedUsers.includes(String(user.username).toUpperCase())) {
    return { ok: false, status: 403, error: 'not_allowlisted' };
  }
  return { ok: true, user };
}

function projectProjection(record) {
  return pick(record, PROJECT_FIELDS);
}

function opportunityProjection(record) {
  return pick(record, OPPORTUNITY_FIELDS);
}

function quotationProjection(record) {
  return pick(record, QUOTATION_FIELDS);
}

function expenseProjection(record) {
  return pick(record, EXPENSE_FIELDS);
}

function clientProjection(record) {
  return pick(record, CLIENT_FIELDS);
}

module.exports = {
  authorizeAiUser,
  pick,
  projectProjection,
  opportunityProjection,
  quotationProjection,
  expenseProjection,
  clientProjection,
  PROJECT_FIELDS,
  OPPORTUNITY_FIELDS,
  QUOTATION_FIELDS,
  EXPENSE_FIELDS,
  CLIENT_FIELDS,
};
