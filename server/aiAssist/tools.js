'use strict';

const {
  projectProjection,
  opportunityProjection,
  quotationProjection,
  expenseProjection,
  clientProjection,
} = require('./access');
const { proposeOpportunityUpdate } = require('./proposals');

const PROJECT_COLLECTION = 'projects';
const OPPORTUNITY_COLLECTION = 'calcsheet_projects';
const QUOTATION_COLLECTION = 'calcsheet_quotations';
const EXPENSE_COLLECTION = 'project_expenses';
const OVERHEAD_EXPENSE_COLLECTION = 'overhead_expenses';
const CLIENT_COLLECTION = 'clients';

const MAX_LIST_RESULTS = 10;
const MAX_GROUPED_ROWS = 20;

const PROJECT_ROUTE_PREFIX = '/projects/';
const OPPORTUNITY_ROUTE_PREFIX = '/sales/calcsheet/projects/';
const QUOTATION_ROUTE_PREFIX = '/sales/calcsheet/quotations/';
const CLIENT_ROUTE = '/sales/clients';

// Static index of named app pages (as opposed to data records) mirrored by
// hand from src/App.tsx's route list — kept here, not derived from the
// router, to stay a one-way dependency like TOOL_DECLARATIONS below. Only
// parameterless, directly-navigable pages are listed (no /projects/:id-style
// detail routes — those go through project/opportunity/quotation search
// instead). Where a page is mounted at more than one path (e.g. Expense
// Monitoring under both / and /finance/), only the canonical route is
// listed; both mounts render the same component against the same data.
const PAGE_INDEX = [
  { label: 'Dashboard', route: '/dashboard', keywords: ['projects dashboard', 'project monitoring', 'home'] },
  { label: 'Location Analysis', route: '/location-analysis', keywords: ['project map', 'project locations'] },
  { label: 'Expense Monitoring', route: '/finance/expense-monitoring', keywords: ['expenses', 'recent expenses'] },
  { label: 'Liquidation Form', route: '/employee/liquidation-form', keywords: ['liquidate', 'file liquidation'] },
  { label: 'Cash Advance Form', route: '/employee/ca-form', keywords: ['ca form', 'cash advance', 'file ca'] },
  { label: 'Direct Labor', route: '/finance/expense-monitoring/direct-labor', keywords: ['direct labor cost'] },
  { label: 'Clients', route: '/sales/clients', keywords: ['companies', 'customers'] },
  { label: 'Material Request', route: '/material-request', keywords: ['mrf', 'material request form', 'orders'] },
  { label: 'Delivery Receipt', route: '/delivery', keywords: ['delivery', 'deliveries'] },
  { label: 'Suppliers', route: '/suppliers', keywords: ['vendors'] },
  { label: 'Purchase Order', route: '/purchase-order', keywords: ['po', 'purchase orders'] },
  { label: 'Estimates', route: '/estimates', keywords: [] },
  { label: 'Reports', route: '/reports', keywords: ['project reports'] },
  { label: 'Progress Report', route: '/reports/progress', keywords: [] },
  { label: 'Service Reports', route: '/reports/service', keywords: ['service report list'] },
  { label: 'Certificate of Completion', route: '/reports/completion', keywords: ['coc'] },
  { label: 'Report Attachments', route: '/reports/attachments', keywords: [] },
  { label: 'Utilities', route: '/utilities', keywords: [] },
  { label: 'EHS Safety Documents', route: '/utilities/ehs', keywords: ['safety certificate', 'safety manual', 'osh program'] },
  { label: 'ID Generator', route: '/utilities/id-generator', keywords: [] },
  { label: 'Acknowledgement Receipt', route: '/utilities/acknowledgement-receipt', keywords: [] },
  { label: 'User Approvals', route: '/user-approvals', keywords: ['pending users', 'approve users'] },
  { label: 'User Management', route: '/settings/users', keywords: ['users', 'settings', 'accounts'] },
  { label: 'Finance Home', route: '/finance', keywords: ['finance dashboard'] },
  { label: 'Collections', route: '/finance/collections', keywords: [] },
  { label: 'Investment Tracker', route: '/finance/investment-tracker', keywords: ['founder funding'] },
  { label: 'Payroll', route: '/finance/payroll', keywords: ['payroll dashboard'] },
  { label: 'Reimbursements', route: '/finance/reimbursements', keywords: [] },
  { label: 'Overhead Expenses', route: '/finance/overhead-expenses', keywords: [] },
  { label: 'Company P&L', route: '/finance/pnl', keywords: ['profit and loss', 'income statement'] },
  { label: 'Tax Ledger', route: '/finance/tax-ledger', keywords: ['tax filer'] },
  { label: 'Sales EWT / 2307', route: '/finance/ewt-2307', keywords: ['ewt', 'withholding', '2307', 'wht'] },
  { label: 'Sales Dashboard', route: '/sales', keywords: ['sales home', 'sales workspace'] },
  { label: 'Calcsheet Projects', route: '/sales/calcsheet/projects', keywords: ['quotations', 'proposals', 'calcsheet'] },
  { label: 'Import Legacy Quotations', route: '/sales/calcsheet/import-legacy', keywords: [] },
  { label: 'Calcsheet Presets', route: '/sales/calcsheet/presets', keywords: ['labor rate presets'] },
  { label: 'Pricelists', route: '/sales/pricelists', keywords: [] },
  { label: 'Employee Portal', route: '/employee', keywords: ['employee home'] },
  { label: 'Daily Time Record', route: '/employee/dtr', keywords: ['dtr', 'attendance'] },
  { label: 'Submit Service Report', route: '/employee/service-report', keywords: [] },
  { label: 'Payslips', route: '/employee/payslips', keywords: [] },
  { label: 'Clock In/Out', route: '/employee/clock', keywords: ['time clock'] },
  { label: 'Projects Analytics Studio', route: '/projects/analytics', keywords: ['projects analytics', 'project charts', 'project visualizer', 'projects studio'] },
  { label: 'Sales Analytics Studio', route: '/sales/analytics', keywords: ['sales analytics', 'pipeline analytics', 'quotation charts', 'sales studio'] },
  { label: 'Finance Analytics Studio', route: '/finance/analytics', keywords: ['finance analytics', 'expense analytics', 'soa analytics', 'finance studio'] },
  { label: 'Analytics Studio', route: '/projects/analytics', keywords: ['analytics', 'analytics studio', 'data formulator', 'charts explorer', 'visualizer', 'data visualization', 'charts'] },
];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toYear(value) {
  const text = String(value ?? '');
  return text.slice(0, 4);
}

function compactAlnum(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function textMatches(haystack, needle) {
  if (haystack === undefined || haystack === null) return false;
  const hay = String(haystack);
  const n = String(needle).trim().toLowerCase();
  if (!n) return false;
  if (hay.toLowerCase().includes(n)) return true;
  const compactNeedle = compactAlnum(n);
  return compactNeedle.length >= 3 && compactAlnum(hay).includes(compactNeedle);
}

function docDataWithId(doc) {
  return { id: doc.id, ...(doc.data() || {}) };
}

// Gemini-function-calling-style declarations mirroring the argument shapes in
// server/aiAssist/schemas.js (TOOL_ARG_SHAPES). Re-derived inline here — the
// tools module must not require schemas.js (keeps the dependency one-way).
const TOOL_DECLARATIONS = {
  search_projects: {
    name: 'search_projects',
    description: 'Search operational project records (filter by status, year, search text, client, or category). Returns up to 10 projects with only allowlisted fields. "Open" or "active" projects are not one status value — call without a status filter and treat won, lost, and inactive as closed when reasoning over the results; do not call this once per status value.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Case-insensitive substring against project name, account name, or OVP number.' },
        year: { type: 'integer', description: 'Match projects from this year.' },
        status: { type: 'string', enum: ['draft', 'for_review', 'sent', 'won', 'lost', 'inactive'], description: 'Match projects by status.' },
        client: { type: 'string', description: 'Substring against the account/client name.' },
        category: { type: 'string', description: 'Exact match against the project category.' },
      },
      required: [],
    },
  },
  get_project_snapshot: {
    name: 'get_project_snapshot',
    description: 'Get one operational project by ID. Returns the allowlisted project fields or null if not found.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The operational project document ID.' },
      },
      required: ['projectId'],
    },
  },
  get_portfolio_summary: {
    name: 'get_portfolio_summary',
    description: 'Aggregate the project portfolio, grouped by status, year, or category, with counts and contract/billed/balance totals.',
    parameters: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['status', 'year', 'category'], description: 'Group key: status, year, or category. Defaults to status.' },
      },
      required: [],
    },
  },
  search_sales_opportunities: {
    name: 'search_sales_opportunities',
    description: 'Search sales opportunities in the calcsheet pipeline (filter by search text, year, status, client, or grade). Returns up to 10 opportunities with only allowlisted fields. "Open" or "active" opportunities are not one status value — call without a status filter and treat won, lost, and inactive as closed when reasoning over the results; do not call this once per status value.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Case-insensitive substring against the opportunity name or code.' },
        year: { type: 'integer', description: 'Match opportunities whose date falls in this year.' },
        status: { type: 'string', description: 'Match opportunities by pipeline status.' },
        client: { type: 'string', description: 'Substring against the opportunity name or code (client name is a foreign key, not stored on the record).' },
        grade: { type: 'string', enum: ['A', 'B', 'C'], description: 'Match opportunities by opportunity grade (A, B, or C).' },
      },
      required: [],
    },
  },
  get_quotation_summary: {
    name: 'get_quotation_summary',
    description: 'Get one quotation by ID with computed totals. Never exposes internal costing line items.',
    parameters: {
      type: 'object',
      properties: {
        quotationId: { type: 'string', description: 'The quotation document ID.' },
      },
      required: ['quotationId'],
    },
  },
  get_expense_summary: {
    name: 'get_expense_summary',
    description: 'Summarize project expenses, optionally filtered by project, year, or category. Returns per-group amounts and counts only — never raw receipt or attachment data.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Only include expenses for this project.' },
        year: { type: 'integer', description: 'Only include expenses dated in this year.' },
        category: { type: 'string', description: 'Only include expenses with this category.' },
      },
      required: [],
    },
  },
  navigate_to_record: {
    name: 'navigate_to_record',
    description: 'Resolve a spoken or typed name to an allowlisted PMv2 destination — either a named app page (Dashboard, Sales Dashboard, Finance Home, Expense Monitoring, Payroll, Company P&L, Calcsheet Projects, Clients, etc.) or a data record (project, opportunity, quotation). Returns action navigate (one match), choose (several), or none. Never accepts a route — the server picks the path.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Name the user said (for example Rezcoat, PCS2602005, Sales Dashboard, or Finance Home).' },
        kind: { type: 'string', enum: ['page', 'project', 'opportunity', 'quotation', 'any'], description: 'page for a named app page/dashboard, project/opportunity/quotation for a data record, or any. proposal means opportunity.' },
      },
      required: ['search'],
    },
  },
  list_quotations_for_opportunity: {
    name: 'list_quotations_for_opportunity',
    description: 'List quotations that belong to one Calcsheet opportunity. Returns allowlisted quotation fields only — never cost line items.',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: 'The calcsheet opportunity / project document ID.' },
      },
      required: ['opportunityId'],
    },
  },
  get_opportunity_snapshot: {
    name: 'get_opportunity_snapshot',
    description: 'Get one Calcsheet opportunity by ID with allowlisted fields and the linked company name/code when present. Never returns personal contact fields.',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: 'The calcsheet opportunity / project document ID.' },
      },
      required: ['opportunityId'],
    },
  },
  search_clients: {
    name: 'search_clients',
    description: 'Search companies by name or 3-letter code only. Returns up to 10 companies. Never returns contacts, phones, emails, or addresses.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Case-insensitive substring against company name or code.' },
      },
      required: ['search'],
    },
  },
  query_analytics: {
    name: 'query_analytics',
    description: 'Query aggregated analytics across operational domains (projects, quotations, expenses, sales_pipeline) grouped by dimension (category, year, status, client, grade, forecast_monthly, forecast_recurring, forecast_category). Returns safe grouped totals and counts.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: ['projects', 'quotations', 'expenses', 'sales_pipeline'], description: 'Operational domain to aggregate.' },
        groupBy: { type: 'string', enum: ['category', 'year', 'status', 'client', 'grade', 'forecast_monthly', 'forecast_recurring', 'forecast_category'], description: 'Grouping dimension.' },
        metric: { type: 'string', enum: ['total_amount', 'count', 'average_amount', 'balance_amount', 'recurring_runrate'], description: 'Metric to compute. Defaults to total_amount.' },
        year: { type: 'integer', description: 'Optional year filter.' },
      },
      required: ['domain'],
    },
  },
  propose_opportunity_update: {
    name: 'propose_opportunity_update',
    description: 'Propose a draft change to one Calcsheet opportunity field. Does not save. User must confirm. Allowed fields: status (draft|for_review|sent|inactive only — never won or lost), opportunityGrade (A|B|C), notes. Never invent a record id.',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: 'The calcsheet opportunity document ID.' },
        field: { type: 'string', enum: ['status', 'opportunityGrade', 'notes'], description: 'The field to update: status, opportunityGrade, or notes.' },
        value: { type: 'string', description: 'The proposed new value.' },
        reason: { type: 'string', description: 'Optional explanation for the proposed change.' },
      },
      required: ['opportunityId', 'field', 'value'],
    },
  },
};

function sourceFor(recordId, label, route, asOf) {
  return { id: recordId, label, route, asOf };
}

function compareByUpdatedAtDesc(a, b) {
  const aTime = typeof a.updated_at === 'string' ? Date.parse(a.updated_at) : Number.NaN;
  const bTime = typeof b.updated_at === 'string' ? Date.parse(b.updated_at) : Number.NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);
  if (aValid && bValid) return bTime - aTime;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

// All collection/field access below is against the hardcoded constants above.
// Nothing from `args` is ever interpolated into a collection name or query.

async function searchProjects(db, args, asOf) {
  const snap = await db.collection(PROJECT_COLLECTION).get();
  let rows = snap.docs.map(docDataWithId);
  if (args.status !== undefined && args.status !== null && args.status !== '') {
    rows = rows.filter((r) => String(r.project_status) === String(args.status));
  }
  if (args.year !== undefined && args.year !== null && args.year !== '') {
    rows = rows.filter((r) => String(r.year) === String(args.year));
  }
  if (args.search !== undefined && args.search !== null && args.search !== '') {
    const needle = String(args.search);
    rows = rows.filter((r) =>
      [r.project_name, r.account_name, r.ovp_number].some((v) => textMatches(v, needle)),
    );
  }
  if (args.client !== undefined && args.client !== null && args.client !== '') {
    const needle = String(args.client).toLowerCase();
    rows = rows.filter((r) =>
      r.account_name !== undefined && r.account_name !== null && String(r.account_name).toLowerCase().includes(needle),
    );
  }
  if (args.category !== undefined && args.category !== null && args.category !== '') {
    rows = rows.filter((r) => String(r.project_category) === String(args.category));
  }
  rows.sort(compareByUpdatedAtDesc);
  rows = rows.slice(0, MAX_LIST_RESULTS);
  return {
    data: rows.map((row) => projectProjection(row)),
    sources: rows.map((row) =>
      sourceFor(row.id, row.project_name || row.project_no || row.id, PROJECT_ROUTE_PREFIX + row.id, asOf),
    ),
    asOf,
  };
}

async function getProjectSnapshot(db, args, asOf) {
  const snap = await db.collection(PROJECT_COLLECTION).doc(String(args.projectId)).get();
  if (!snap.exists) {
    return { data: null, sources: [], asOf };
  }
  const record = docDataWithId(snap);
  const data = projectProjection(record);
  return {
    data,
    sources: [sourceFor(snap.id, data.project_name || data.project_no || snap.id, PROJECT_ROUTE_PREFIX + snap.id, asOf)],
    asOf,
  };
}

function groupLabelFor(groupBy, group) {
  if (groupBy === 'status') return String(group);
  if (groupBy === 'year') return String(group);
  return String(group);
}

async function getPortfolioSummary(db, args, asOf) {
  const groupBy = args.groupBy || 'status';
  const keyOf = (row) => {
    if (groupBy === 'status') return row.project_status;
    if (groupBy === 'year') return row.year;
    if (groupBy === 'category') return row.project_category;
    return row.project_status;
  };
  const snap = await db.collection(PROJECT_COLLECTION).get();
  const groups = new Map();
  for (const doc of snap.docs) {
    const row = docDataWithId(doc);
    let group = keyOf(row);
    if (group === undefined || group === null || group === '') {
      group = 'Unspecified';
    }
    if (!groups.has(group)) {
      groups.set(group, { group, count: 0, totalContractAmount: 0, totalBilled: 0, totalBalance: 0 });
    }
    const g = groups.get(group);
    g.count += 1;
    g.totalContractAmount += Number(row.updated_contract_amount ?? row.contract_amount ?? 0) || 0;
    g.totalBilled += Number(row.contract_billed ?? row.amount_contract_billed_net ?? 0) || 0;
    g.totalBalance += Number(row.total_contract_balance ?? 0) || 0;
  }
  let data = Array.from(groups.values());
  data.sort((a, b) => String(a.group).localeCompare(String(b.group)));
  if (data.length > MAX_GROUPED_ROWS) {
    data.sort((a, b) => b.count - a.count);
    data = data.slice(0, MAX_GROUPED_ROWS);
  }
  return {
    data,
    sources: data.map((g) => sourceFor('portfolio:' + g.group, g.group, '/projects', asOf)),
    asOf,
  };
}

// Client name is NOT stored on calcsheet_projects docs — `customerId` is a
// foreign key into `clients`. A cross-collection join is intentionally NOT
// attempted here; the `client` filter matches against name/code only.
async function searchSalesOpportunities(db, args, asOf) {
  const snap = await db.collection(OPPORTUNITY_COLLECTION).get();
  let rows = snap.docs.map(docDataWithId);
  if (args.search !== undefined && args.search !== null && args.search !== '') {
    const needle = String(args.search);
    rows = rows.filter((r) =>
      [r.name, r.code].some((v) => textMatches(v, needle)),
    );
  }
  if (args.client !== undefined && args.client !== null && args.client !== '') {
    const needle = String(args.client).toLowerCase();
    rows = rows.filter((r) =>
      [r.name, r.code].some((v) => v !== undefined && v !== null && String(v).toLowerCase().includes(needle)),
    );
  }
  if (args.year !== undefined && args.year !== null && args.year !== '') {
    rows = rows.filter((r) => toYear(r.date) === String(args.year));
  }
  if (args.status !== undefined && args.status !== null && args.status !== '') {
    rows = rows.filter((r) => String(r.status) === String(args.status));
  }
  if (args.grade !== undefined && args.grade !== null && args.grade !== '') {
    rows = rows.filter((r) => String(r.opportunityGrade) === String(args.grade));
  }
  rows.sort(compareByUpdatedAtDesc);
  rows = rows.slice(0, MAX_LIST_RESULTS);
  return {
    data: rows.map((row) => opportunityProjection(row)),
    sources: rows.map((row) =>
      sourceFor(row.id, row.name || row.code || row.id, OPPORTUNITY_ROUTE_PREFIX + row.id, asOf),
    ),
    asOf,
  };
}

async function getQuotationSummary(db, args, asOf) {
  const snap = await db.collection(QUOTATION_COLLECTION).doc(String(args.quotationId)).get();
  if (!snap.exists) {
    return { data: null, sources: [], asOf };
  }
  const record = docDataWithId(snap);
  const generalReqts = Array.isArray(record.generalReqts) ? record.generalReqts : [];
  const components = Array.isArray(record.components) ? record.components : [];
  const services = Array.isArray(record.services) ? record.services : [];
  const manpower = Array.isArray(record.manpower) ? record.manpower : [];

  const generalSubtotal = generalReqts.reduce((sum, line) => sum + (Number(line.unitPrice) || 0) * (Number(line.qty) || 0), 0);
  const componentsSubtotal = components.reduce((sum, line) => sum + (Number(line.unitCost) || 0) * (Number(line.qty) || 0), 0);
  const servicesSubtotal = services.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  const rawSubtotal = generalSubtotal + componentsSubtotal + servicesSubtotal;
  const afterDiscount = rawSubtotal * (1 - (Number(record.discountPct) || 0) / 100);
  const grandTotal = afterDiscount * (1 + (Number(record.vatPct) || 0) / 100);

  const projected = quotationProjection(record);
  const data = {
    ...projected,
    lineItemCounts: {
      generalReqts: generalReqts.length,
      components: components.length,
      services: services.length,
      manpower: manpower.length,
    },
    rawSubtotal: round2(rawSubtotal),
    grandTotal: round2(grandTotal),
  };
  return {
    data,
    sources: [sourceFor(snap.id, `Quotation ${snap.id}`, QUOTATION_ROUTE_PREFIX + snap.id, asOf)],
    asOf,
  };
}

async function getExpenseSummary(db, args, asOf) {
  const snap = await db.collection(EXPENSE_COLLECTION).get();
  let rows = snap.docs.map(docDataWithId);
  if (args.projectId !== undefined && args.projectId !== null && args.projectId !== '') {
    rows = rows.filter((r) => String(r.projectId) === String(args.projectId));
  }
  if (args.year !== undefined && args.year !== null && args.year !== '') {
    rows = rows.filter((r) => toYear(r.date) === String(args.year));
  }
  if (args.category !== undefined && args.category !== null && args.category !== '') {
    rows = rows.filter((r) => String(r.category) === String(args.category));
  }
  const groups = new Map();
  for (const row of rows) {
    const key = row.category !== undefined && row.category !== null && row.category !== '' ? String(row.category) : 'Unspecified';
    if (!groups.has(key)) {
      groups.set(key, { group: key, count: 0, totalAmount: 0 });
    }
    const g = groups.get(key);
    g.count += 1;
    g.totalAmount += Number(row.amount) || 0;
  }
  let data = Array.from(groups.values());
  data.sort((a, b) => String(a.group).localeCompare(String(b.group)));
  if (data.length > MAX_GROUPED_ROWS) {
    data.sort((a, b) => b.count - a.count);
    data = data.slice(0, MAX_GROUPED_ROWS);
  }
  // Only grouped totals and counts are returned — no receipt/attachment fields.
  return {
    data,
    sources: data.map((g) => sourceFor('expense:' + g.group, g.group, '/expense-monitoring', asOf)),
    asOf,
  };
}

function quotationLabel(row) {
  const kind = row.kind ? String(row.kind) : '';
  const revision = row.revision ? String(row.revision) : '';
  const joined = [kind, revision].filter(Boolean).join(' ');
  return joined || `Quotation ${row.id}`;
}

async function listQuotationsForOpportunity(db, args, asOf) {
  const snap = await db.collection(QUOTATION_COLLECTION).get();
  let rows = snap.docs.map(docDataWithId).filter((row) => String(row.projectId) === String(args.opportunityId));
  rows.sort(compareByUpdatedAtDesc);
  rows = rows.slice(0, MAX_LIST_RESULTS);
  return {
    data: rows.map((row) => quotationProjection(row)),
    sources: rows.map((row) => sourceFor(row.id, quotationLabel(row), QUOTATION_ROUTE_PREFIX + row.id, asOf)),
    asOf,
  };
}

async function loadClientIdentity(db, clientId) {
  if (clientId === undefined || clientId === null || clientId === '') return null;
  const snap = await db.collection(CLIENT_COLLECTION).doc(String(clientId)).get();
  if (!snap.exists) return null;
  return clientProjection(docDataWithId(snap));
}

async function getOpportunitySnapshot(db, args, asOf) {
  const snap = await db.collection(OPPORTUNITY_COLLECTION).doc(String(args.opportunityId)).get();
  if (!snap.exists) {
    return { data: null, sources: [], asOf };
  }
  const record = docDataWithId(snap);
  const data = {
    ...opportunityProjection(record),
    customer: await loadClientIdentity(db, record.customerId),
  };
  return {
    data,
    sources: [sourceFor(snap.id, data.name || data.code || snap.id, OPPORTUNITY_ROUTE_PREFIX + snap.id, asOf)],
    asOf,
  };
}

async function searchClients(db, args, asOf) {
  const needle = String(args.search || '').trim();
  if (!needle) {
    return { data: [], sources: [], asOf };
  }
  const snap = await db.collection(CLIENT_COLLECTION).get();
  let rows = snap.docs.map(docDataWithId).filter((row) =>
    textMatches(row.name, needle) || textMatches(row.code, needle),
  );
  rows.sort(compareByUpdatedAtDesc);
  rows = rows.slice(0, MAX_LIST_RESULTS);
  return {
    data: rows.map((row) => clientProjection(row)),
    sources: rows.map((row) => sourceFor(row.id, row.name || row.code || row.id, CLIENT_ROUTE, asOf)),
    asOf,
  };
}

async function collectQuotationCandidates(db, search, asOf) {
  const snap = await db.collection(QUOTATION_COLLECTION).get();
  const rows = snap.docs.map(docDataWithId);
  const direct = rows.filter((row) =>
    textMatches(row.id, search) || textMatches(row.kind, search) || textMatches(row.revision, search),
  );
  const opps = await searchSalesOpportunities(db, { search }, asOf);
  const oppIds = new Set(opps.data.map((row) => String(row.id)));
  const viaOpp = rows.filter((row) => oppIds.has(String(row.projectId)));
  const seen = new Set();
  const merged = [];
  for (const row of [...direct, ...viaOpp]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push({
      kind: 'quotation',
      id: row.id,
      label: quotationLabel(row),
      route: QUOTATION_ROUTE_PREFIX + row.id,
    });
  }
  return merged.slice(0, MAX_LIST_RESULTS);
}

function searchPages(search) {
  return PAGE_INDEX
    .filter((page) => textMatches(page.label, search) || page.keywords.some((kw) => textMatches(kw, search)))
    .map((page) => ({ kind: 'page', id: page.route, label: page.label, route: page.route }));
}

async function navigateToRecord(db, args, asOf) {
  const search = String(args.search || '').trim();
  const kind = args.kind || 'any';
  const candidates = [];

  if (kind === 'page' || kind === 'any') {
    candidates.push(...searchPages(search));
  }
  if (kind === 'project' || kind === 'any') {
    const projects = await searchProjects(db, { search }, asOf);
    for (let i = 0; i < projects.data.length; i += 1) {
      const row = projects.data[i];
      const source = projects.sources[i];
      candidates.push({
        kind: 'project',
        id: row.id,
        label: source.label,
        route: PROJECT_ROUTE_PREFIX + row.id,
      });
    }
  }
  if (kind === 'opportunity' || kind === 'any') {
    const opps = await searchSalesOpportunities(db, { search }, asOf);
    for (let i = 0; i < opps.data.length; i += 1) {
      const row = opps.data[i];
      const source = opps.sources[i];
      candidates.push({
        kind: 'opportunity',
        id: row.id,
        label: source.label,
        route: OPPORTUNITY_ROUTE_PREFIX + row.id,
      });
    }
  }
  if (kind === 'quotation' || kind === 'any') {
    candidates.push(...await collectQuotationCandidates(db, search, asOf));
  }

  if (candidates.length === 0) {
    return { data: { action: 'none', search, kind }, sources: [], asOf };
  }
  if (candidates.length === 1) {
    const match = candidates[0];
    return {
      data: {
        action: 'navigate',
        kind: match.kind,
        id: match.id,
        label: match.label,
        route: match.route,
      },
      sources: [sourceFor(match.id, match.label, match.route, asOf)],
      asOf,
    };
  }
  const limited = candidates.slice(0, MAX_LIST_RESULTS);
  return {
    data: { action: 'choose', search, kind, candidates: limited },
    sources: limited.map((item) => sourceFor(item.id, item.label, item.route, asOf)),
    asOf,
  };
}

async function queryAnalytics(db, args, asOf) {
  const domain = args.domain || 'projects';
  const groupBy = args.groupBy || 'category';
  const year = args.year;

  let snap;
  let rows = [];

  if (domain === 'projects') {
    snap = await db.collection(PROJECT_COLLECTION).get();
    rows = snap.docs.map(docDataWithId);
    if (year !== undefined && year !== null) {
      rows = rows.filter((r) => String(r.year || '').slice(0, 4) === String(year));
    }
    const groups = new Map();
    for (const r of rows) {
      let gKey = 'Unspecified';
      if (groupBy === 'category') gKey = r.project_category || 'Uncategorized';
      else if (groupBy === 'status') gKey = r.project_status || 'Draft';
      else if (groupBy === 'year') gKey = String(r.year || 'Unknown').slice(0, 4);
      else if (groupBy === 'client') gKey = r.account_name || 'Direct';
      if (!groups.has(gKey)) groups.set(gKey, { group: gKey, count: 0, totalAmount: 0, totalBalance: 0, totalBilled: 0 });
      const g = groups.get(gKey);
      g.count += 1;
      const contract = Number(r.updated_contract_amount ?? r.contract_amount ?? 0) || 0;
      const billed = Number(r.contract_billed ?? r.amount_contract_billed_net ?? 0) || 0;
      const balance = Number(r.total_contract_balance ?? 0) || 0;
      g.totalAmount += contract;
      g.totalBilled += billed;
      g.totalBalance += balance;
    }
    let data = Array.from(groups.values()).map((g) => ({
      ...g,
      averageAmount: g.count > 0 ? round2(g.totalAmount / g.count) : 0,
      totalAmount: round2(g.totalAmount),
      totalBilled: round2(g.totalBilled),
      totalBalance: round2(g.totalBalance),
    }));
    data.sort((a, b) => b.totalAmount - a.totalAmount);
    if (data.length > MAX_GROUPED_ROWS) data = data.slice(0, MAX_GROUPED_ROWS);
    return {
      data,
      sources: data.map((g) => sourceFor('analytics:projects:' + g.group, `Projects: ${g.group}`, '/dashboard', asOf)),
      asOf,
    };
  } else if (domain === 'expenses') {
    const pSnap = await db.collection(EXPENSE_COLLECTION).get();
    const pRows = pSnap.docs.map(docDataWithId).map((r) => ({ ...r, _source: 'project', _isRecurring: false }));
    let oRows = [];
    try {
      const oSnap = await db.collection(OVERHEAD_EXPENSE_COLLECTION).get();
      oRows = oSnap.docs.map(docDataWithId).map((r) => ({ ...r, _source: 'overhead', _isRecurring: true }));
    } catch {
      // best-effort
    }
    rows = [...pRows, ...oRows];

    if (year !== undefined && year !== null) {
      rows = rows.filter((r) => toYear(r.date || r.created_at) === String(year));
    }

    if (groupBy === 'forecast_monthly' || groupBy === 'forecast_recurring' || groupBy === 'forecast_category') {
      const RECURRING_CATS = ['Rent', 'Salaries & Wages', 'Communication & Utilities', 'Government Contributions', 'Advertising/Marketing', 'Supplies', 'Repairs & Maintenance', 'Entertainment'];
      const monthMap = new Map();
      const catMap = new Map();

      for (const r of rows) {
        const dStr = String(r.date || r.created_at || '');
        const mo = dStr.slice(0, 7) || '2026-08';
        const isRec = r._isRecurring || (r.category && RECURRING_CATS.some((c) => c.toLowerCase() === String(r.category).toLowerCase()));
        const amt = Number(r.amount) || 0;

        if (!monthMap.has(mo)) monthMap.set(mo, { month: mo, recurring: 0, variable: 0, total: 0, count: 0 });
        const mg = monthMap.get(mo);
        mg.count += 1;
        mg.total += amt;
        if (isRec) mg.recurring += amt;
        else mg.variable += amt;

        const cat = r.category || (r._source === 'overhead' ? 'Overhead Expense' : 'General');
        if (!catMap.has(cat)) catMap.set(cat, { category: cat, total: 0, isRecurring: isRec, count: 0 });
        const cg = catMap.get(cat);
        cg.total += amt;
        cg.count += 1;
      }

      const historicalMonths = Array.from(monthMap.keys()).sort();
      const mCount = Math.max(1, historicalMonths.length);
      let totalRec = 0;
      let totalVar = 0;
      monthMap.forEach((mg) => {
        totalRec += mg.recurring;
        totalVar += mg.variable;
      });

      const recRunRate = round2(totalRec / mCount);
      const varAvg = round2(totalVar / mCount);
      const totalBurn = round2(recRunRate + varAvg);

      if (groupBy === 'forecast_recurring') {
        const horizon = 3;
        const data = [
          { group: 'Fixed Recurring Overhead (Monthly Run Rate)', totalAmount: recRunRate, recurringAmount: recRunRate, variableAmount: 0 },
          { group: 'Variable Direct Costs (Monthly Average)', totalAmount: varAvg, recurringAmount: 0, variableAmount: varAvg },
          { group: `Projected ${horizon}-Month Total Outflow`, totalAmount: round2(totalBurn * horizon), recurringAmount: round2(recRunRate * horizon), variableAmount: round2(varAvg * horizon) },
        ];
        return {
          data,
          sources: data.map((g) => sourceFor('analytics:forecast:' + g.group, `Forecast: ${g.group}`, '/finance/analytics', asOf)),
          asOf,
        };
      }

      if (groupBy === 'forecast_category') {
        let data = Array.from(catMap.values()).map((c) => ({
          group: `${c.category}${c.isRecurring ? ' [Recurring]' : ' [Variable]'}`,
          totalAmount: round2(c.total / mCount),
          count: c.count,
        }));
        data.sort((a, b) => b.totalAmount - a.totalAmount);
        if (data.length > MAX_GROUPED_ROWS) data = data.slice(0, MAX_GROUPED_ROWS);
        return {
          data,
          sources: data.map((g) => sourceFor('analytics:forecast:' + g.group, `Forecast Category: ${g.group}`, '/finance/analytics', asOf)),
          asOf,
        };
      }

      // Default forecast_monthly
      const latestMo = historicalMonths[historicalMonths.length - 1] || '2026-08';
      const data = [];
      for (const m of historicalMonths.slice(-3)) {
        const mg = monthMap.get(m);
        data.push({
          group: `${m} (Actual)`,
          totalAmount: round2(mg.total),
          recurringAmount: round2(mg.recurring),
          variableAmount: round2(mg.variable),
          count: mg.count,
        });
      }

      let [yrS, moS] = latestMo.split('-');
      let yr = parseInt(yrS, 10) || 2026;
      let mo = parseInt(moS, 10) || 8;
      for (let i = 1; i <= 3; i++) {
        mo += 1;
        if (mo > 12) {
          mo -= 12;
          yr += 1;
        }
        const nextMoStr = `${yr}-${String(mo).padStart(2, '0')}`;
        data.push({
          group: `${nextMoStr} (Forecast)`,
          totalAmount: totalBurn,
          recurringAmount: recRunRate,
          variableAmount: varAvg,
          count: 0,
        });
      }

      return {
        data,
        sources: data.map((g) => sourceFor('analytics:forecast:' + g.group, `Forecast: ${g.group}`, '/finance/analytics', asOf)),
        asOf,
      };
    }

    const groups = new Map();
    for (const r of rows) {
      let gKey = 'Unspecified';
      if (groupBy === 'category') gKey = r.category || 'General';
      else if (groupBy === 'year') gKey = toYear(r.date || r.created_at) || 'Unknown';
      else if (groupBy === 'client') gKey = r.payee || r.supplier || r.vendor || 'Payee';
      else if (groupBy === 'status') gKey = r.status || 'Recorded';

      if (!groups.has(gKey)) groups.set(gKey, { group: gKey, count: 0, totalAmount: 0 });
      const g = groups.get(gKey);
      g.count += 1;
      g.totalAmount += Number(r.amount) || 0;
    }
    let data = Array.from(groups.values()).map((g) => ({
      ...g,
      averageAmount: g.count > 0 ? round2(g.totalAmount / g.count) : 0,
      totalAmount: round2(g.totalAmount),
    }));
    data.sort((a, b) => b.totalAmount - a.totalAmount);
    if (data.length > MAX_GROUPED_ROWS) data = data.slice(0, MAX_GROUPED_ROWS);
    return {
      data,
      sources: data.map((g) => sourceFor('analytics:expenses:' + g.group, `Expense: ${g.group}`, '/finance/expense-monitoring', asOf)),
      asOf,
    };
  } else if (domain === 'quotations') {
    snap = await db.collection(QUOTATION_COLLECTION).get();
    rows = snap.docs.map(docDataWithId);
    const groups = new Map();
    for (const r of rows) {
      let gKey = 'Unspecified';
      if (groupBy === 'status') gKey = r.status || 'Draft';
      else if (groupBy === 'year') gKey = toYear(r.date) || 'Unknown';
      else if (groupBy === 'category') gKey = r.kind || 'Standard';
      if (!groups.has(gKey)) groups.set(gKey, { group: gKey, count: 0, totalAmount: 0 });
      const g = groups.get(gKey);
      g.count += 1;
      const generalReqts = Array.isArray(r.generalReqts) ? r.generalReqts : [];
      const components = Array.isArray(r.components) ? r.components : [];
      const services = Array.isArray(r.services) ? r.services : [];
      const rawSubtotal = generalReqts.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0), 0) +
        components.reduce((s, l) => s + (Number(l.unitCost) || 0) * (Number(l.qty) || 0), 0) +
        services.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const afterDiscount = rawSubtotal * (1 - (Number(r.discountPct) || 0) / 100);
      const grandTotal = afterDiscount * (1 + (Number(r.vatPct) || 0) / 100);
      g.totalAmount += grandTotal;
    }
    let data = Array.from(groups.values()).map((g) => ({
      ...g,
      averageAmount: g.count > 0 ? round2(g.totalAmount / g.count) : 0,
      totalAmount: round2(g.totalAmount),
    }));
    data.sort((a, b) => b.totalAmount - a.totalAmount);
    if (data.length > MAX_GROUPED_ROWS) data = data.slice(0, MAX_GROUPED_ROWS);
    return {
      data,
      sources: data.map((g) => sourceFor('analytics:quotations:' + g.group, `Quotations: ${g.group}`, '/sales/calcsheet/projects', asOf)),
      asOf,
    };
  } else {
    snap = await db.collection(OPPORTUNITY_COLLECTION).get();
    rows = snap.docs.map(docDataWithId);
    if (year !== undefined && year !== null) {
      rows = rows.filter((r) => toYear(r.date) === String(year));
    }
    const groups = new Map();
    for (const r of rows) {
      let gKey = 'Unspecified';
      if (groupBy === 'status') gKey = r.status || 'Draft';
      else if (groupBy === 'grade') gKey = r.opportunityGrade || 'Unassigned';
      else if (groupBy === 'year') gKey = toYear(r.date) || 'Unknown';
      if (!groups.has(gKey)) groups.set(gKey, { group: gKey, count: 0, totalAmount: 0 });
      const g = groups.get(gKey);
      g.count += 1;
      g.totalAmount += Number(r.projectCost) || 0;
    }
    let data = Array.from(groups.values()).map((g) => ({
      ...g,
      totalAmount: round2(g.totalAmount),
    }));
    data.sort((a, b) => b.count - a.count);
    if (data.length > MAX_GROUPED_ROWS) data = data.slice(0, MAX_GROUPED_ROWS);
    return {
      data,
      sources: data.map((g) => sourceFor('analytics:pipeline:' + g.group, `Pipeline: ${g.group}`, '/sales/calcsheet/projects', asOf)),
      asOf,
    };
  }
}

function createToolRegistry({ db, now = () => new Date(), user = null, proposalStore = null }) {
  const tools = new Map();
  for (const toolName of Object.keys(TOOL_DECLARATIONS)) {
    tools.set(toolName, {
      declaration: TOOL_DECLARATIONS[toolName],
      execute: async (args = {}) => {
        const asOf = now().toISOString();
        switch (toolName) {
          case 'search_projects':
            return searchProjects(db, args, asOf);
          case 'get_project_snapshot':
            return getProjectSnapshot(db, args, asOf);
          case 'get_portfolio_summary':
            return getPortfolioSummary(db, args, asOf);
          case 'search_sales_opportunities':
            return searchSalesOpportunities(db, args, asOf);
          case 'get_quotation_summary':
            return getQuotationSummary(db, args, asOf);
          case 'get_expense_summary':
            return getExpenseSummary(db, args, asOf);
          case 'navigate_to_record':
            return navigateToRecord(db, args, asOf);
          case 'list_quotations_for_opportunity':
            return listQuotationsForOpportunity(db, args, asOf);
          case 'get_opportunity_snapshot':
            return getOpportunitySnapshot(db, args, asOf);
          case 'search_clients':
            return searchClients(db, args, asOf);
          case 'query_analytics':
            return queryAnalytics(db, args, asOf);
          case 'propose_opportunity_update': {
            if (!proposalStore || !user) {
              return { data: { applied: false, error: 'propose_unavailable' }, sources: [], asOf };
            }
            try {
              return await proposeOpportunityUpdate({ db, store: proposalStore, user, args, asOf });
            } catch (err) {
              const code = err && err.code;
              if (code === 'field_not_allowed' || code === 'invalid_value' || code === 'unauthenticated') {
                return { data: { applied: false, error: code }, sources: [], asOf };
              }
              throw err;
            }
          }
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
      },
    });
  }
  return tools;
}

module.exports = { createToolRegistry };
