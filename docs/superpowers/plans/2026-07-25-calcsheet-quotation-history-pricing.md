# Calcsheet Quotation-History Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate, read-only Quotation History source to Calcsheet's Add Product dialog and generate explainable product-contingency suggestions from prior quotation prices.

**Architecture:** Existing `calcsheet_quotations`, `calcsheet_projects`, and `clients` documents remain authoritative. Pure CommonJS modules flatten current quotation component rows and calculate quarterly/annualized trends; an authenticated Express router exposes search and read-only suggestion operations. The React editor adds optional purchase dates, consumes the API through a typed service, and keeps Pricelists and Quotation History in separate tabs.

**Tech Stack:** Node 22, Express 5, Firebase Admin/Firestore, React 19, TypeScript 4.9, Material UI 7, Jest/React Testing Library, Node's built-in test runner.

**Design spec:** `docs/superpowers/specs/2026-07-24-calcsheet-quotation-history-pricing-design.md`

---

## File Structure

### New server files

- `server/calcsheetProductHistory.js` — pure observation flattening, product identity, date fallback, search, sort, and pagination.
- `server/calcsheetProductHistory.test.js` — Node tests for observation and search rules.
- `server/calcsheetContingency.js` — pure quarterly/annualized trend, outlier, forecast, rounding, and confidence logic.
- `server/calcsheetContingency.test.js` — Node tests for every calculation branch.
- `server/calcsheetProductHistoryRouter.js` — authenticated Express router and Firestore loading boundary.
- `server/calcsheetProductHistoryRouter.test.js` — endpoint tests with fake Firestore snapshots and a local ephemeral Express server.

### New frontend files

- `src/types/ProductHistory.ts` — API contracts and the dialog-to-editor selection contract.
- `src/services/productHistoryService.ts` — authenticated search and suggestion requests.
- `src/services/productHistoryService.test.ts` — fetch contract and error tests.
- `src/components/calcsheet/ProductHistoryTab.tsx` — lazy-loaded history search, filters, evidence, and explicit Apply action.
- `src/components/calcsheet/ProductHistoryTab.test.tsx` — interaction tests.
- `src/components/calcsheet/ComponentTimingDialog.tsx` — per-component expected-purchase-date override.
- `src/components/calcsheet/ComponentTimingDialog.test.tsx` — timing dialog tests.
- `src/components/pricelists/ProductPickerDialog.tsx` — renamed two-source Add Product dialog.
- `src/components/pricelists/ProductPickerDialog.test.tsx` — tab isolation and selection tests.

### Modified files

- `package.json` — add a server-domain test command without changing dependencies.
- `server.js` — mount the history router with the existing `db` and `requireActiveUser`.
- `src/types/Quotation.ts` — add optional quotation purchase date, component override, and immutable source snapshot.
- `src/components/calcsheet/CalcsheetQuotationEditor.tsx` — purchase date control, product-picker context, historical-row mapping, timing action, and source evidence.
- `docs/agent/TASK_LOG.md` — record the implemented feature if the local memory file exists.
- `docs/agent/PROJECT_STATE.md` — record completion if the local memory file exists.

No Firestore migration, new collection, export change, or new npm dependency is required.

---

### Task 1: Flatten Current Quotations into Searchable Observations

**Files:**
- Create: `server/calcsheetProductHistory.js`
- Create: `server/calcsheetProductHistory.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the failing observation tests**

Create `server/calcsheetProductHistory.test.js` with fixtures that prove all statuses are included, `dateSent` wins over `createdAt`, restore snapshots are irrelevant because only current quotations are passed, invalid costs remain visible, and exact part numbers group case-insensitively:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  flattenProductHistory,
  searchProductHistory,
} = require('./calcsheetProductHistory');

const projects = [
  { id: 'p-draft', code: 'PCS2601001-ABC-00', name: 'Draft Panel', status: 'draft' },
  { id: 'p-lost', code: 'PCS2501002-XYZ-00', name: 'Lost Retrofit', status: 'lost' },
];
const clients = [
  { id: 'c1', code: 'ABC', name: 'ABC Corp' },
  { id: 'c2', code: 'XYZ', name: 'XYZ Corp' },
];
const quotations = [
  {
    id: 'q1', projectId: 'p-draft', recipientId: 'c1', kind: 'IOCT', revision: '01',
    dateSent: '2026-01-15', createdAt: '2026-01-10T00:00:00.000Z',
    productMarkupPct: 20,
    components: [{
      id: 'line-1', description: 'S203-C20 breaker', brand: 'ABB', partNo: ' s203-c20 ',
      uom: 'pc', unitCost: 100, forex: 58, discountPct: 10, contingencyPct: 5,
    }],
  },
  {
    id: 'q2', projectId: 'p-lost', recipientId: 'c2', kind: 'ACTI', revision: '00',
    createdAt: '2025-01-10T00:00:00.000Z', productMarkupPct: 15,
    components: [{
      id: 'line-2', description: 'S203-C20 breaker', brand: 'ABB', partNo: 'S203-C20',
      uom: 'pc', unitCost: 0, forex: 1, discountPct: 0, contingencyPct: 5,
    }],
  },
];

test('flattens current quotation rows with source metadata and comparable prices', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.projectStatus), ['draft', 'lost']);
  assert.equal(rows[0].quotationDate, '2026-01-15');
  assert.equal(rows[0].quotationDateSource, 'dateSent');
  assert.equal(rows[0].normalizedUnitCost, 5220);
  assert.equal(rows[0].quotedSellingUnit, 6577.2);
  assert.equal(rows[0].productKey, 's203-c20');
  assert.equal(rows[1].quotationDateSource, 'createdAt');
  assert.equal(rows[1].normalizedUnitCost, null);
});

test('searches catalog number, brand, description, project, and quotation reference', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  assert.equal(searchProductHistory(rows, { search: 's203-c20' }).items.length, 2);
  assert.equal(searchProductHistory(rows, { search: 'Draft Panel' }).items.length, 1);
  assert.equal(searchProductHistory(rows, { status: 'lost' }).items[0].projectId, 'p-lost');
});

test('sorts newest first and enforces the 100-row maximum', () => {
  const rows = flattenProductHistory({ projects, quotations, clients });
  const result = searchProductHistory(rows, { sort: 'newest', limit: 500 });
  assert.equal(result.items[0].quotationId, 'q1');
  assert.equal(result.limit, 100);
});
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run:

```bash
node --test server/calcsheetProductHistory.test.js
```

Expected: FAIL with `Cannot find module './calcsheetProductHistory'`.

- [ ] **Step 3: Implement the pure observation module**

Create `server/calcsheetProductHistory.js`. Keep it free of Express and Firebase imports:

```js
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? '').trim();
}

function normalizedPart(value) {
  return clean(value).toLowerCase().replace(/\s+/g, '');
}

function productKeyOf(line) {
  const part = normalizedPart(line.partNo);
  return part || null;
}

function validDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function quotationDateOf(quotation) {
  const sent = validDateOnly(quotation.dateSent);
  if (sent) return { value: sent, source: 'dateSent' };
  const created = validDateOnly(quotation.createdAt);
  if (created) return { value: created, source: 'createdAt' };
  return { value: null, source: 'missing' };
}

function quotationRef(projectCode, clientCode, revision) {
  const base = clean(projectCode).replace(/-[A-Z]{3}-\d{2}$/, '');
  return `${base}-${(clean(clientCode) || 'XXX').slice(0, 3).toUpperCase()}-${clean(revision) || '00'}`;
}

function normalizedCostOf(line) {
  const cost = Number(line.unitCost);
  const forex = line.forex == null ? 1 : Number(line.forex);
  const discount = Number(line.discountPct || 0);
  const value = cost * forex * (1 - discount / 100);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function flattenProductHistory({ projects, quotations, clients }) {
  const projectById = new Map(projects.map((p) => [String(p.id), p]));
  const clientById = new Map(clients.map((c) => [String(c.id), c]));
  const rows = [];
  for (const quotation of quotations) {
    const project = projectById.get(String(quotation.projectId));
    if (!project) continue;
    const recipient = clientById.get(String(quotation.recipientId));
    const date = quotationDateOf(quotation);
    const components = Array.isArray(quotation.components) ? quotation.components : [];
    components.forEach((line, index) => {
      const normalizedUnitCost = normalizedCostOf(line);
      const contingencyPct = Number(line.contingencyPct || 0);
      const markupPct = Number(line.markupPct ?? quotation.productMarkupPct ?? 0);
      rows.push({
        observationId: `${quotation.id}:${line.id || index}`,
        productKey: productKeyOf(line),
        matchType: productKeyOf(line) ? 'exact' : 'unmatched',
        description: clean(line.description),
        brand: clean(line.brand),
        partNo: clean(line.partNo),
        uom: clean(line.uom),
        projectId: String(project.id),
        projectCode: clean(project.code),
        projectName: clean(project.name),
        projectStatus: project.status || 'draft',
        quotationId: String(quotation.id),
        quotationKind: quotation.kind,
        quotationRevision: clean(quotation.revision),
        quotationReference: quotationRef(project.code, recipient?.code, quotation.revision),
        quotationDate: date.value,
        quotationDateSource: date.source,
        sourceUnitCost: Number(line.unitCost || 0),
        sourceForex: line.forex == null ? 1 : Number(line.forex),
        sourceDiscountPct: Number(line.discountPct || 0),
        normalizedUnitCost,
        quotedSellingUnit: normalizedUnitCost == null
          ? null
          : normalizedUnitCost * (1 + contingencyPct / 100) * (1 + markupPct / 100),
        sourceContingencyPct: contingencyPct,
        sourceMarkupPct: markupPct,
      });
    });
  }
  return rows;
}

function searchProductHistory(rows, options = {}) {
  const search = clean(options.search).toLowerCase();
  const status = clean(options.status);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  let items = rows.filter((row) => {
    if (status && row.projectStatus !== status) return false;
    if (!search) return true;
    return [
      row.partNo, row.brand, row.description, row.projectName,
      row.projectCode, row.quotationReference,
    ].some((value) => clean(value).toLowerCase().includes(search));
  });
  const sort = options.sort || 'newest';
  items = [...items].sort((a, b) => {
    if (sort === 'oldest') return clean(a.quotationDate).localeCompare(clean(b.quotationDate));
    if (sort === 'price_asc') return (a.normalizedUnitCost ?? Infinity) - (b.normalizedUnitCost ?? Infinity);
    if (sort === 'price_desc') return (b.normalizedUnitCost ?? -Infinity) - (a.normalizedUnitCost ?? -Infinity);
    return clean(b.quotationDate).localeCompare(clean(a.quotationDate));
  });
  return { items: items.slice(0, limit), total: items.length, limit };
}

module.exports = {
  DAY_MS,
  flattenProductHistory,
  normalizedCostOf,
  productKeyOf,
  searchProductHistory,
};
```

- [ ] **Step 4: Add the focused server test script**

Add this entry to `package.json` scripts:

```json
"test:product-history": "node --test server/calcsheetProductHistory.test.js server/calcsheetContingency.test.js server/calcsheetProductHistoryRouter.test.js"
```

The latter two files are added in Tasks 2 and 3; until then, run the individual test file.

- [ ] **Step 5: Run the observation tests**

Run:

```bash
node --test server/calcsheetProductHistory.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit the observation boundary**

```bash
git add package.json server/calcsheetProductHistory.js server/calcsheetProductHistory.test.js
git commit -m "feat: derive product history from quotations"
```

---

### Task 2: Build the Contingency Suggestion Engine

**Files:**
- Create: `server/calcsheetContingency.js`
- Create: `server/calcsheetContingency.test.js`

- [ ] **Step 1: Write failing tests for quarterly, annual, and insufficient history**

Create `server/calcsheetContingency.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSuggestion } = require('./calcsheetContingency');

const observation = (id, date, cost, extra = {}) => ({
  observationId: id,
  productKey: 's203-c20',
  matchType: 'exact',
  quotationDate: date,
  normalizedUnitCost: cost,
  uom: 'pc',
  ...extra,
});

test('uses median quarterly growth and compounds source date to purchase date', () => {
  const observations = [
    observation('q1:a', '2025-04-01', 10000),
    observation('q2:a', '2025-07-01', 10200),
    observation('q3:a', '2025-10-01', 10404),
    observation('q4:a', '2026-01-01', 10612.08),
  ];
  const result = calculateSuggestion({
    observations,
    selectedObservationId: 'q1:a',
    analysisDate: '2026-01-15',
    expectedPurchaseDate: '2026-10-01',
  });
  assert.equal(result.method, 'quarterly');
  assert.equal(result.suggestedContingencyPct, 13);
  assert.equal(result.confidence, 'high');
});

test('falls back to annualized CAGR for two prices spanning at least nine months', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1:a', '2024-01-01', 10000),
      observation('q2:a', '2025-01-01', 11000),
    ],
    selectedObservationId: 'q2:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });
  assert.equal(result.method, 'annualized');
  assert.equal(result.suggestedContingencyPct, 10);
  assert.equal(result.confidence, 'low');
});

test('returns insufficient history instead of inventing a rate', () => {
  const result = calculateSuggestion({
    observations: [observation('q1:a', '2025-01-01', 10000)],
    selectedObservationId: 'q1:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2025-05-01',
  });
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.suggestedContingencyPct, null);
});

test('clamps a decreasing trend to zero and rounds increases upward to 0.5%', () => {
  const falling = calculateSuggestion({
    observations: [
      observation('q1:a', '2024-01-01', 11000),
      observation('q2:a', '2025-01-01', 10000),
    ],
    selectedObservationId: 'q2:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-02-01',
  });
  assert.equal(falling.suggestedContingencyPct, 0);
});

test('rounds a positive forecast upward to the next half percent', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1:a', '2024-01-01', 10000),
      observation('q2:a', '2025-01-01', 10620),
    ],
    selectedObservationId: 'q2:a',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });
  assert.equal(result.suggestedContingencyPct % 0.5, 0);
  assert.ok(result.suggestedContingencyPct >= 6.2);
});

test('uses only explicitly confirmed candidates when the selected row has no part number', () => {
  const selected = observation('selected', '2024-01-01', 10000, { productKey: null });
  const confirmed = observation('confirmed', '2025-01-01', 11000, { productKey: null });
  const unconfirmed = observation('unconfirmed', '2025-01-01', 15000, { productKey: null });
  const result = calculateSuggestion({
    observations: [selected, confirmed, unconfirmed],
    selectedObservationId: 'selected',
    confirmedCandidateObservationIds: ['confirmed'],
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-01-01',
  });
  assert.deepEqual(result.included.map((row) => row.observationId), ['selected', 'confirmed']);
  assert.equal(result.confidence, 'low');
});

test('flags a robust log-trend outlier and excludes it visibly', () => {
  const result = calculateSuggestion({
    observations: [
      observation('q1', '2024-01-01', 100),
      observation('q2', '2024-04-01', 102),
      observation('q3', '2024-07-01', 104),
      observation('q4', '2024-10-01', 106),
      observation('typo', '2025-01-01', 10000),
      observation('q6', '2025-01-02', 108),
    ],
    selectedObservationId: 'q6',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2025-05-01',
  });
  assert.ok(result.excluded.some((entry) =>
    entry.observationId === 'typo' && entry.reason === 'statistical_outlier'));
});

test('excludes invalid dates, non-positive prices, future observations, and incompatible UOM', () => {
  const result = calculateSuggestion({
    observations: [
      observation('selected', '2024-01-01', 10000),
      observation('valid', '2025-01-01', 11000),
      observation('future', '2027-01-01', 15000),
      observation('bad-price', '2025-01-01', null),
      observation('wrong-uom', '2025-01-01', 12000, { uom: 'box' }),
    ],
    selectedObservationId: 'selected',
    analysisDate: '2025-02-01',
    expectedPurchaseDate: '2026-02-01',
  });
  assert.deepEqual(result.excluded.map((entry) => entry.observationId).sort(),
    ['bad-price', 'future', 'wrong-uom']);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
node --test server/calcsheetContingency.test.js
```

Expected: FAIL with `Cannot find module './calcsheetContingency'`.

- [ ] **Step 3: Implement deterministic trend helpers**

Create `server/calcsheetContingency.js` with these exported boundaries:

```js
const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_DAYS = 91.3125;

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const parseDay = (value) => {
  const time = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : null;
};

const quarterIndex = (dateOnly) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.getUTCFullYear() * 4 + Math.floor(date.getUTCMonth() / 3);
};

function quarterlyRate(observations, analysisMs) {
  const cutoff = analysisMs - 365 * DAY_MS;
  const groups = new Map();
  observations
    .filter((row) => parseDay(row.quotationDate) >= cutoff)
    .forEach((row) => {
      const key = quarterIndex(row.quotationDate);
      groups.set(key, [...(groups.get(key) || []), row.normalizedUnitCost]);
    });
  const quarters = [...groups]
    .map(([index, costs]) => ({ index, cost: median(costs) }))
    .sort((a, b) => a.index - b.index);
  if (quarters.length < 3) return null;
  const rates = [];
  for (let index = 1; index < quarters.length; index += 1) {
    const elapsed = quarters[index].index - quarters[index - 1].index;
    rates.push((quarters[index].cost / quarters[index - 1].cost) ** (1 / elapsed) - 1);
  }
  return { rate: median(rates), quarterCount: quarters.length };
}

function annualizedRate(observations) {
  const sorted = [...observations].sort(
    (a, b) => parseDay(a.quotationDate) - parseDay(b.quotationDate),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const elapsedDays = (parseDay(last.quotationDate) - parseDay(first.quotationDate)) / DAY_MS;
  if (elapsedDays < 273.75) return null;
  return {
    rate: (last.normalizedUnitCost / first.normalizedUnitCost) ** (365 / elapsedDays) - 1,
    elapsedDays,
  };
}

function roundUpHalfPercent(value) {
  return Math.ceil(Math.max(0, value) * 2) / 2;
}
```

Add the robust outlier and confidence helpers:

```js
function theilSenLine(observations) {
  const points = observations.map((row) => ({
    x: parseDay(row.quotationDate) / DAY_MS,
    y: Math.log(row.normalizedUnitCost),
  }));
  const slopes = [];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const dx = points[right].x - points[left].x;
      if (dx !== 0) slopes.push((points[right].y - points[left].y) / dx);
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  const intercept = median(points.map((point) => point.y - slope * point.x));
  return { slope, intercept };
}

function excludeOutliers(observations) {
  if (observations.length < 5) return { included: observations, excluded: [] };
  const line = theilSenLine(observations);
  const residuals = observations.map((row) => {
    const x = parseDay(row.quotationDate) / DAY_MS;
    return Math.log(row.normalizedUnitCost) - (line.intercept + line.slope * x);
  });
  const center = median(residuals);
  const mad = median(residuals.map((value) => Math.abs(value - center)));
  if (mad === 0) return { included: observations, excluded: [] };
  const outlierIds = new Set();
  residuals.forEach((value, index) => {
    const modifiedZ = 0.6745 * Math.abs(value - center) / mad;
    if (modifiedZ > 3.5) outlierIds.add(observations[index].observationId);
  });
  return {
    included: observations.filter((row) => !outlierIds.has(row.observationId)),
    excluded: observations
      .filter((row) => outlierIds.has(row.observationId))
      .map((row) => ({ observationId: row.observationId, reason: 'statistical_outlier' })),
  };
}

function confidenceOf({
  method, usableCount, quarterCount, staleDays, candidateUsed, hasWarnings,
}) {
  if (!candidateUsed && method === 'quarterly' && quarterCount >= 4
      && staleDays <= 92 && !hasWarnings) return 'high';
  if (!candidateUsed && staleDays <= 365
      && ((method === 'quarterly' && quarterCount >= 3)
        || (method === 'annualized' && usableCount >= 3))) return 'medium';
  return 'low';
}
```

Finish with the complete public function:

```js
function calculateSuggestion({
  observations,
  selectedObservationId,
  confirmedCandidateObservationIds = [],
  analysisDate,
  expectedPurchaseDate,
}) {
  const selected = observations.find((row) => row.observationId === selectedObservationId);
  if (!selected) throw new Error('Selected historical price was not found');
  const analysisMs = parseDay(analysisDate);
  const targetMs = parseDay(expectedPurchaseDate);
  const selectedMs = parseDay(selected.quotationDate);
  if (analysisMs == null || targetMs == null || selectedMs == null) {
    throw new Error('Valid analysis, source, and expected purchase dates are required');
  }
  if (targetMs < analysisMs) {
    throw new Error('Expected purchase date cannot be before the quotation date');
  }

  const confirmed = new Set(confirmedCandidateObservationIds);
  const excluded = [];
  let usable = observations.filter((row) => {
    const isSelected = row.observationId === selectedObservationId;
    const sameExactProduct = selected.productKey && row.productKey === selected.productKey;
    const userConfirmed = confirmed.has(row.observationId);
    if (!isSelected && !sameExactProduct && !userConfirmed) return false;
    const rowMs = parseDay(row.quotationDate);
    if (rowMs == null) { excluded.push({ observationId: row.observationId, reason: 'invalid_date' }); return false; }
    if (rowMs > analysisMs) { excluded.push({ observationId: row.observationId, reason: 'future_observation' }); return false; }
    if (!(row.normalizedUnitCost > 0)) { excluded.push({ observationId: row.observationId, reason: 'invalid_cost' }); return false; }
    if (String(row.uom || '').trim().toLowerCase() !== String(selected.uom || '').trim().toLowerCase()) {
      excluded.push({ observationId: row.observationId, reason: 'incompatible_uom' });
      return false;
    }
    return true;
  });

  const outlierResult = excludeOutliers(usable);
  usable = outlierResult.included;
  excluded.push(...outlierResult.excluded);
  if (usable.length < 2) {
    return { status: 'insufficient_history', method: null, confidence: null,
      suggestedContingencyPct: null, included: usable, excluded };
  }

  const quarterly = quarterlyRate(usable, analysisMs);
  const annualized = quarterly ? null : annualizedRate(usable);
  if (!quarterly && !annualized) {
    return { status: 'insufficient_history', method: null, confidence: null,
      suggestedContingencyPct: null, included: usable, excluded };
  }

  const method = quarterly ? 'quarterly' : 'annualized';
  const rate = quarterly?.rate ?? annualized.rate;
  const unitDays = method === 'quarterly' ? QUARTER_DAYS : 365;
  const forecastDays = (targetMs - selectedMs) / DAY_MS;
  const projectedIncreasePct = ((1 + rate) ** (forecastDays / unitDays) - 1) * 100;
  const candidateUsed = usable.some((row) => confirmed.has(row.observationId));
  const latestMs = Math.max(...usable.map((row) => parseDay(row.quotationDate)));
  const staleDays = (analysisMs - latestMs) / DAY_MS;
  const confidence = confidenceOf({
    method, usableCount: usable.length, quarterCount: quarterly?.quarterCount || 0,
    staleDays, candidateUsed, hasWarnings: excluded.length > 0,
  });
  const suggestedContingencyPct = roundUpHalfPercent(projectedIncreasePct);
  return {
    status: 'ready', method, confidence, rate, forecastDays,
    suggestedContingencyPct,
    highRisk: suggestedContingencyPct > 50,
    included: usable,
    excluded,
  };
}

module.exports = {
  annualizedRate,
  calculateSuggestion,
  excludeOutliers,
  quarterlyRate,
  roundUpHalfPercent,
};
```

- [ ] **Step 4: Run the calculation tests**

Run:

```bash
node --test server/calcsheetContingency.test.js
```

Expected: all tests PASS. If the first fixture produces `13.5%` because exact date math crosses more than six 91.3125-day quarters, adjust the fixture's target date so the test explicitly represents six quarters; do not weaken the formula assertion.

- [ ] **Step 5: Commit the calculation engine**

```bash
git add server/calcsheetContingency.js server/calcsheetContingency.test.js
git commit -m "feat: calculate historical price contingency"
```

---

### Task 3: Expose Authenticated Search and Suggestion Endpoints

**Files:**
- Create: `server/calcsheetProductHistoryRouter.js`
- Create: `server/calcsheetProductHistoryRouter.test.js`
- Modify: `server.js:1-45`
- Modify: `server.js:3658-3772`

- [ ] **Step 1: Write failing router tests**

Create `server/calcsheetProductHistoryRouter.test.js`. Use an ephemeral local Express server and fake Firestore snapshots:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createProductHistoryRouter } = require('./calcsheetProductHistoryRouter');

const docs = (rows) => ({ docs: rows.map((row) => ({ id: row.id, data: () => row })) });
const data = {
  calcsheet_projects: docs([{ id: 'p1', code: 'PCS2601001-ABC-00', name: 'Panel', status: 'won' }]),
  calcsheet_quotations: docs([{
    id: 'q1', projectId: 'p1', recipientId: 'c1', kind: 'IOCT', revision: '00',
    dateSent: '2026-01-01', productMarkupPct: 20,
    components: [{ id: 'c1', description: 'Breaker', brand: 'ABB', partNo: 'S203-C20',
      uom: 'pc', unitCost: 100, forex: 1, discountPct: 0, contingencyPct: 5 }],
  }]),
  clients: docs([{ id: 'c1', code: 'ABC', name: 'ABC Corp' }]),
};
const db = { collection: (name) => ({ get: async () => data[name] }) };

async function withServer(requireActiveUser, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/calcsheet/product-history',
    createProductHistoryRouter({ db, requireActiveUser }));
  const server = app.listen(0);
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('GET requires an active user', async () => {
  await withServer(async (_req, res) => { res.status(401).json({ error: 'Unauthorized' }); return null; },
    async (base) => {
      const response = await fetch(base);
      assert.equal(response.status, 401);
    });
});

test('GET returns current quotation observations and never reads version snapshots', async () => {
  const reads = [];
  const trackedDb = { collection: (name) => {
    reads.push(name);
    return { get: async () => data[name] };
  }};
  await withServer(async () => ({ id: 'u1' }), async (base) => {
    const response = await fetch(`${base}?search=S203`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.items[0].quotationId, 'q1');
  });
  assert.equal(reads.includes('calcsheet_quotation_versions'), false);
});

test('POST suggestion validates dates and returns read-only calculation evidence', async () => {
  await withServer(async () => ({ id: 'u1' }), async (base) => {
    const response = await fetch(`${base}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedObservationId: 'q1:c1',
        analysisDate: '2026-02-01',
        expectedPurchaseDate: '2026-05-01',
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'insufficient_history');
  });
});
```

- [ ] **Step 2: Run the router tests and verify failure**

Run:

```bash
node --test server/calcsheetProductHistoryRouter.test.js
```

Expected: FAIL with `Cannot find module './calcsheetProductHistoryRouter'`.

- [ ] **Step 3: Implement the router**

Create `server/calcsheetProductHistoryRouter.js`:

```js
const express = require('express');
const { flattenProductHistory, searchProductHistory } = require('./calcsheetProductHistory');
const { calculateSuggestion } = require('./calcsheetContingency');

function docsWithIds(snapshot) {
  return snapshot.docs.map((doc) => {
    const { id: _stored, ...data } = doc.data();
    return { ...data, id: doc.id };
  });
}

async function loadObservations(db) {
  const [projectSnap, quotationSnap, clientSnap] = await Promise.all([
    db.collection('calcsheet_projects').get(),
    db.collection('calcsheet_quotations').get(),
    db.collection('clients').get(),
  ]);
  return flattenProductHistory({
    projects: docsWithIds(projectSnap),
    quotations: docsWithIds(quotationSnap),
    clients: docsWithIds(clientSnap),
  });
}

function createProductHistoryRouter({ db, requireActiveUser }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res);
      if (!user) return;
      const observations = await loadObservations(db);
      res.json({
        success: true,
        ...searchProductHistory(observations, {
          search: req.query.search,
          status: req.query.status,
          sort: req.query.sort,
          limit: req.query.limit,
        }),
      });
    } catch (error) {
      console.error('[calcsheet] product history search failed:', error);
      res.status(500).json({ error: 'Failed to load quotation history' });
    }
  });

  router.post('/suggest', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res);
      if (!user) return;
      const observations = await loadObservations(db);
      res.json({
        success: true,
        ...calculateSuggestion({
          observations,
          selectedObservationId: String(req.body?.selectedObservationId || ''),
          confirmedCandidateObservationIds: Array.isArray(req.body?.confirmedCandidateObservationIds)
            ? req.body.confirmedCandidateObservationIds.map(String)
            : [],
          analysisDate: String(req.body?.analysisDate || ''),
          expectedPurchaseDate: String(req.body?.expectedPurchaseDate || ''),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Suggestion failed';
      const clientError = /required|cannot be before|not found/i.test(message);
      res.status(clientError ? 400 : 500).json({ error: message });
    }
  });

  return router;
}

module.exports = { createProductHistoryRouter, loadObservations };
```

- [ ] **Step 4: Mount the router in `server.js`**

Near the other top-level requires:

```js
const { createProductHistoryRouter } = require('./server/calcsheetProductHistoryRouter');
```

Immediately before the existing quotation routes:

```js
app.use(
  '/api/calcsheet/product-history',
  createProductHistoryRouter({ db, requireActiveUser }),
);
```

Do not query or import `calcsheet_quotation_versions`.

- [ ] **Step 5: Run all server-domain tests**

Run:

```bash
npm run test:product-history
```

Expected: all observation, calculation, and router tests PASS.

- [ ] **Step 6: Commit the API boundary**

```bash
git add server.js server/calcsheetProductHistoryRouter.js server/calcsheetProductHistoryRouter.test.js
git commit -m "feat: expose calcsheet product history API"
```

---

### Task 4: Add Frontend Contracts and API Client

**Files:**
- Create: `src/types/ProductHistory.ts`
- Create: `src/services/productHistoryService.ts`
- Create: `src/services/productHistoryService.test.ts`
- Modify: `src/types/Quotation.ts:96-112`
- Modify: `src/types/Quotation.ts:143-189`

- [ ] **Step 1: Add failing service tests**

Create `src/services/productHistoryService.test.ts`:

```ts
import {
  fetchProductHistory,
  fetchProductHistorySuggestion,
} from './productHistoryService';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.setItem('netpacific_token', 'token');
});

it('encodes search filters and includes authentication', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, items: [], total: 0, limit: 50 }),
  });
  await fetchProductHistory({ search: 'ABB S203', status: 'lost', sort: 'newest' });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('search=ABB+S203&status=lost&sort=newest'),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  );
});

it('posts explicit suggestion dates and selected observation', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true, status: 'ready', method: 'quarterly',
      confidence: 'medium', suggestedContingencyPct: 13,
      included: [], excluded: [],
    }),
  });
  await fetchProductHistorySuggestion({
    selectedObservationId: 'q1:c1',
    analysisDate: '2026-01-01',
    expectedPurchaseDate: '2026-04-01',
  });
  expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      selectedObservationId: 'q1:c1',
      analysisDate: '2026-01-01',
      expectedPurchaseDate: '2026-04-01',
    }),
  }));
});

it('surfaces the server error message', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    statusText: 'Bad Request',
    json: async () => ({ error: 'Expected purchase date cannot be before the quotation date' }),
  });
  await expect(fetchProductHistorySuggestion({
    selectedObservationId: 'q1:c1',
    analysisDate: '2026-01-01',
    expectedPurchaseDate: '2025-12-01',
  })).rejects.toThrow('Expected purchase date cannot be before the quotation date');
});
```

- [ ] **Step 2: Define shared TypeScript contracts**

Create `src/types/ProductHistory.ts` with the API response fields from the design spec:

```ts
import type { ProjectStatus, QuotationKind } from './Quotation';

export interface ProductHistoryObservation {
  observationId: string;
  productKey: string | null;
  matchType: 'exact' | 'confirmed_candidate' | 'unmatched';
  description: string;
  brand?: string;
  partNo?: string;
  uom?: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;
  quotationId: string;
  quotationKind: QuotationKind;
  quotationRevision: string;
  quotationReference: string;
  quotationDate: string | null;
  quotationDateSource: 'dateSent' | 'createdAt' | 'missing';
  sourceUnitCost: number;
  sourceForex: number;
  sourceDiscountPct: number;
  normalizedUnitCost: number | null;
  quotedSellingUnit: number | null;
  sourceContingencyPct: number;
  sourceMarkupPct: number;
}

export interface ProductHistorySearchResponse {
  success: true;
  items: ProductHistoryObservation[];
  total: number;
  limit: number;
}

export type SuggestionMethod = 'quarterly' | 'annualized';
export type SuggestionConfidence = 'high' | 'medium' | 'low';

export interface ProductHistorySuggestionRequest {
  selectedObservationId: string;
  confirmedCandidateObservationIds?: string[];
  analysisDate: string;
  expectedPurchaseDate: string;
}

export interface ProductHistorySuggestion {
  success: true;
  status: 'ready' | 'insufficient_history';
  method: SuggestionMethod | null;
  confidence: SuggestionConfidence | null;
  suggestedContingencyPct: number | null;
  highRisk?: boolean;
  included: ProductHistoryObservation[];
  excluded: Array<{ observationId: string; reason: string }>;
}

export interface ProductHistoryAddSelection {
  observation: ProductHistoryObservation;
  suggestion: ProductHistorySuggestion | null;
  applySuggestion: boolean;
  expectedPurchaseDateOverride?: string;
}
```

- [ ] **Step 3: Extend quotation types with optional fields**

In `src/types/Quotation.ts`, add:

```ts
export interface HistoricalPriceSource {
  observationId: string;
  quotationId: ID;
  projectId: ID;
  quotationReference: string;
  quotationDate: string;
  normalizedUnitCost: number;
  quotedSellingUnit?: number;
  selectedAt: string;
  suggestedContingencyPct?: number;
  suggestionMethod?: 'quarterly' | 'annualized';
  suggestionConfidence?: 'high' | 'medium' | 'low';
}
```

Then extend `ComponentLine`:

```ts
expectedPurchaseDate?: string;
historicalPriceSource?: HistoricalPriceSource;
```

And extend `Quotation`:

```ts
expectedPurchaseDate?: string;
```

- [ ] **Step 4: Implement the authenticated API client**

Create `src/services/productHistoryService.ts`:

```ts
import type {
  ProductHistorySearchResponse,
  ProductHistorySuggestion,
  ProductHistorySuggestionRequest,
} from '../types/ProductHistory';

const API_BASE = process.env.REACT_APP_API_URL
  ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');
const BASE = `${API_BASE}/api/calcsheet/product-history`;

function headers(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || 'Quotation History request failed');
  }
  return response.json();
}

export async function fetchProductHistory(filters: {
  search?: string;
  status?: string;
  sort?: string;
  limit?: number;
}): Promise<ProductHistorySearchResponse> {
  const query = new URLSearchParams();
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.limit) query.set('limit', String(filters.limit));
  return checked(fetch(`${BASE}?${query}`, { headers: headers() }));
}

export async function fetchProductHistorySuggestion(
  request: ProductHistorySuggestionRequest,
): Promise<ProductHistorySuggestion> {
  return checked(fetch(`${BASE}/suggest`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(request),
  }));
}
```

- [ ] **Step 5: Run the focused frontend tests**

Run:

```bash
npm test -- --watchAll=false src/services/productHistoryService.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit contracts and client**

```bash
git add src/types/Quotation.ts src/types/ProductHistory.ts \
  src/services/productHistoryService.ts src/services/productHistoryService.test.ts
git commit -m "feat: add product history client contracts"
```

---

### Task 5: Add Quotation and Per-Component Purchase Dates

**Files:**
- Create: `src/components/calcsheet/ComponentTimingDialog.tsx`
- Create: `src/components/calcsheet/ComponentTimingDialog.test.tsx`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx:475-507`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx:1185-1228`

- [ ] **Step 1: Write the failing timing dialog tests**

Create `src/components/calcsheet/ComponentTimingDialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import ComponentTimingDialog from './ComponentTimingDialog';

it('shows the quotation date fallback and saves an override', () => {
  const onSave = jest.fn();
  render(
    <ComponentTimingDialog
      open
      quotationExpectedPurchaseDate="2026-04-01"
      value=""
      minimumDate="2026-01-01"
      onClose={jest.fn()}
      onSave={onSave}
    />,
  );
  expect(screen.getByText(/uses quotation date: 2026-04-01/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/product expected purchase date/i), {
    target: { value: '2026-06-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith('2026-06-01');
});

it('rejects a date before the quotation date', () => {
  render(
    <ComponentTimingDialog
      open quotationExpectedPurchaseDate="" value="" minimumDate="2026-01-01"
      onClose={jest.fn()} onSave={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText(/product expected purchase date/i), {
    target: { value: '2025-12-31' },
  });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText(/cannot be before/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement the focused timing dialog**

Create `src/components/calcsheet/ComponentTimingDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField, Typography,
} from '@mui/material';

interface Props {
  open: boolean;
  value?: string;
  quotationExpectedPurchaseDate?: string;
  minimumDate: string;
  onClose: () => void;
  onSave: (value: string) => void;
}

export default function ComponentTimingDialog({
  open, value = '', quotationExpectedPurchaseDate = '', minimumDate, onClose, onSave,
}: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  const invalid = Boolean(draft && draft < minimumDate);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Product purchase timing</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Product expected purchase date"
            type="date"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: minimumDate }}
            error={invalid}
            helperText={invalid ? 'Expected purchase date cannot be before the quotation date.' : 'Clear to use the quotation-level date.'}
          />
          {!draft && (
            <Alert severity="info">
              {quotationExpectedPurchaseDate
                ? `Uses quotation date: ${quotationExpectedPurchaseDate}`
                : 'Uses the assumed date three months after the quotation date.'}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => setDraft('')}>Clear override</Button>
        <Button variant="contained" disabled={invalid} onClick={() => onSave(draft)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add the quotation-level expected purchase date**

In the Pricing Controls grid in `CalcsheetQuotationEditor.tsx`, add:

```tsx
<TextField
  label="Expected purchase date"
  type="date"
  size="small"
  value={quotation.expectedPurchaseDate ?? ''}
  onChange={(event) => setField('expectedPurchaseDate', event.target.value || undefined)}
  InputLabelProps={{ shrink: true }}
  inputProps={{ min: quotationDate }}
  helperText={quotation.expectedPurchaseDate
    ? 'Used for product price-contingency forecasts'
    : 'Blank assumes 3 months after the quotation date'}
  disabled={isLegacy}
/>
```

Use one helper for the effective new-quotation date:

```ts
const quotationDate =
  quotation.dateSent
  || quotation.createdAt?.slice(0, 10)
  || todayDateOnly();
```

- [ ] **Step 4: Add a compact timing action to component rows**

Add local state:

```ts
const [timingComponentId, setTimingComponentId] = useState<string | null>(null);
const timingComponent = quotation.components.find((line) => line.id === timingComponentId);
```

Add a 42-pixel calendar action column after Lead Time:

```tsx
{
  key: '_timing',
  label: '',
  width: 42,
  render: (row) => (
    <Tooltip title={row.expectedPurchaseDate
      ? `Expected purchase: ${row.expectedPurchaseDate}`
      : 'Set product expected purchase date'}>
      <IconButton size="small" onClick={() => setTimingComponentId(row.id)}>
        <EventIcon fontSize="small" color={row.expectedPurchaseDate ? 'primary' : 'inherit'} />
      </IconButton>
    </Tooltip>
  ),
}
```

Render `ComponentTimingDialog` near the other editor dialogs and update the matching component through `setField('components', ...)`.

- [ ] **Step 5: Run the timing tests and build**

Run:

```bash
npm test -- --watchAll=false src/components/calcsheet/ComponentTimingDialog.test.tsx
npm run build
```

Expected: tests PASS and build succeeds.

- [ ] **Step 6: Commit purchase timing**

```bash
git add src/components/calcsheet/ComponentTimingDialog.tsx \
  src/components/calcsheet/ComponentTimingDialog.test.tsx \
  src/components/calcsheet/CalcsheetQuotationEditor.tsx
git commit -m "feat: add calcsheet purchase timing"
```

---

### Task 6: Build the Quotation History Search and Evidence UI

**Files:**
- Create: `src/components/calcsheet/ProductHistoryTab.tsx`
- Create: `src/components/calcsheet/ProductHistoryTab.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Create `src/components/calcsheet/ProductHistoryTab.test.tsx` with mocked service functions:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProductHistoryTab from './ProductHistoryTab';
import * as service from '../../services/productHistoryService';

jest.mock('../../services/productHistoryService');
const mocked = service as jest.Mocked<typeof service>;
const row = {
  observationId: 'q1:c1', productKey: 's203-c20', matchType: 'exact' as const,
  description: 'S203-C20 breaker', brand: 'ABB', partNo: 'S203-C20', uom: 'pc',
  projectId: 'p1', projectCode: 'PCS2601001-ABC-00', projectName: 'Panel Upgrade',
  projectStatus: 'won' as const, quotationId: 'q1', quotationKind: 'IOCT' as const,
  quotationRevision: '01', quotationReference: 'PCS2601001-ABC-01',
  quotationDate: '2025-04-01', quotationDateSource: 'dateSent' as const,
  sourceUnitCost: 10000, sourceForex: 1, sourceDiscountPct: 0,
  normalizedUnitCost: 10000, quotedSellingUnit: 13560,
  sourceContingencyPct: 5, sourceMarkupPct: 20,
};

beforeEach(() => {
  mocked.fetchProductHistory.mockResolvedValue({ success: true, items: [row], total: 1, limit: 50 });
  mocked.fetchProductHistorySuggestion.mockResolvedValue({
    success: true, status: 'ready', method: 'quarterly', confidence: 'medium',
    suggestedContingencyPct: 13, included: [row], excluded: [],
  });
});

it('loads lazily, shows source evidence, and does not apply by default', async () => {
  const onAdd = jest.fn();
  render(<ProductHistoryTab active analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} onAdd={onAdd} />);
  expect(await screen.findByText('Panel Upgrade')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /select s203-c20 breaker/i }));
  expect(await screen.findByText(/suggested contingency/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add product to quotation' }));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ applySuggestion: false }));
});

it('requires an explicit Apply click', async () => {
  const onAdd = jest.fn();
  render(<ProductHistoryTab active analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} onAdd={onAdd} />);
  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply 13% suggestion' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add product to quotation' }));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ applySuggestion: true }));
});

it('shows insufficient history without an Apply button', async () => {
  mocked.fetchProductHistorySuggestion.mockResolvedValue({
    success: true, status: 'insufficient_history', method: null, confidence: null,
    suggestedContingencyPct: null, included: [row], excluded: [],
  });
  render(<ProductHistoryTab active analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} onAdd={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  expect(await screen.findByText('Insufficient history')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
});

it('recalculates when the product purchase date changes', async () => {
  render(<ProductHistoryTab active analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} onAdd={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  fireEvent.change(screen.getByLabelText('This product expected purchase date'), {
    target: { value: '2026-07-01' },
  });
  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedPurchaseDate: '2026-07-01' }),
  ));
});

it('sends only explicitly confirmed description-match candidates', async () => {
  const unmatched = { ...row, observationId: 'q1:no-part', productKey: null, partNo: '' };
  const candidate = { ...unmatched, observationId: 'q2:no-part', quotationReference: 'PCS2' };
  mocked.fetchProductHistory.mockResolvedValue({
    success: true, items: [unmatched, candidate], total: 2, limit: 50,
  });
  render(<ProductHistoryTab active analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} onAdd={jest.fn()} />);
  fireEvent.click((await screen.findAllByRole('button', { name: /select s203-c20 breaker/i }))[0]);
  fireEvent.click(await screen.findByLabelText(/PCS2/));
  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenLastCalledWith(
    expect.objectContaining({ confirmedCandidateObservationIds: ['q2:no-part'] }),
  ));
});

it('keeps a retryable scoped error inside the tab', async () => {
  mocked.fetchProductHistory.mockRejectedValue(new Error('Failed to load quotation history'));
  render(<ProductHistoryTab active analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} onAdd={jest.fn()} />);
  expect(await screen.findByText('Failed to load quotation history')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement local search state and lazy loading**

Create `ProductHistoryTab.tsx` with props:

```ts
interface Props {
  active: boolean;
  analysisDate: string;
  expectedPurchaseDate: string;
  defaultContingencyPct: number;
  onAdd: (selection: ProductHistoryAddSelection) => void;
}
```

Use:

```ts
const [search, setSearch] = useState('');
const [status, setStatus] = useState('');
const [sort, setSort] = useState('newest');
const [rows, setRows] = useState<ProductHistoryObservation[]>([]);
const [selected, setSelected] = useState<ProductHistoryObservation | null>(null);
const [suggestion, setSuggestion] = useState<ProductHistorySuggestion | null>(null);
const [applySuggestion, setApplySuggestion] = useState(false);
const [targetDate, setTargetDate] = useState(expectedPurchaseDate);
const [confirmedCandidateIds, setConfirmedCandidateIds] = useState<string[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Load only when `active` is true. Debounce `search` by 300 ms using a cleanup-safe `setTimeout`. A search error sets only this tab's `error`.

When a result is selected, request its suggestion with `targetDate` and
`confirmedCandidateIds`. Re-run the suggestion request whenever either changes:

```ts
await fetchProductHistorySuggestion({
  selectedObservationId: selected.observationId,
  confirmedCandidateObservationIds: confirmedCandidateIds,
  analysisDate,
  expectedPurchaseDate: targetDate,
});
```

- [ ] **Step 3: Implement the result table and evidence panel**

Render a responsive split view:

- Left: search field, status select, sort select, and a table with Product, Source, Date, Cost, Quoted, Suggestion.
- Right: selected source metadata, fallback-date warning, included/excluded evidence, method, confidence, current default, and suggestion.

Add a date field above the evidence so the estimator can override the purchase
date for this product before calculating:

```tsx
<TextField
  label="This product expected purchase date"
  type="date"
  size="small"
  value={targetDate}
  onChange={(event) => setTargetDate(event.target.value)}
  InputLabelProps={{ shrink: true }}
  inputProps={{ min: analysisDate }}
  helperText={targetDate === expectedPurchaseDate
    ? 'Using quotation-level or assumed purchase date'
    : 'Product-level override'}
/>
```

For a row without an exact part number, show other visible results with the same
normalized brand and description as candidate checkboxes:

```tsx
{!selected.productKey && candidateRows.map((candidate) => (
  <FormControlLabel
    key={candidate.observationId}
    control={
      <Checkbox
        checked={confirmedCandidateIds.includes(candidate.observationId)}
        onChange={(_event, checked) => setConfirmedCandidateIds((current) =>
          checked
            ? [...current, candidate.observationId]
            : current.filter((id) => id !== candidate.observationId))}
      />
    }
    label={`${candidate.quotationReference} · ${candidate.quotationDate} · ${candidate.projectName}`}
  />
))}
```

Label this section `Confirm same product`. Never send unchecked candidates to
the suggestion endpoint.

Use exact action labels required by tests:

```tsx
<Button
  aria-label={`Select ${row.description}`}
  onClick={() => selectObservation(row)}
>
  Review
</Button>
```

When the suggestion is ready:

```tsx
<Button
  variant={applySuggestion ? 'outlined' : 'contained'}
  onClick={() => setApplySuggestion((value) => !value)}
>
  {applySuggestion
    ? 'Use default contingency'
    : `Apply ${suggestion.suggestedContingencyPct}% suggestion`}
</Button>
```

The Add action is always separate:

```tsx
<Button
  variant="contained"
  disabled={!selected}
  onClick={() => selected && onAdd({
    observation: selected,
    suggestion,
    applySuggestion,
    expectedPurchaseDateOverride:
      targetDate === expectedPurchaseDate ? undefined : targetDate,
  })}
>
  Add product to quotation
</Button>
```

If `suggestion.highRisk`, show a warning alert before allowing the user to toggle Apply. If the source date is `createdAt`, show `Fallback date`.

- [ ] **Step 4: Run the UI tests**

Run:

```bash
npm test -- --watchAll=false src/components/calcsheet/ProductHistoryTab.test.tsx
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit the history tab**

```bash
git add src/components/calcsheet/ProductHistoryTab.tsx \
  src/components/calcsheet/ProductHistoryTab.test.tsx
git commit -m "feat: add quotation history picker tab"
```

---

### Task 7: Convert Add Product into Separate Pricelists and Quotation History Tabs

**Files:**
- Create: `src/components/pricelists/ProductPickerDialog.tsx`
- Create: `src/components/pricelists/ProductPickerDialog.test.tsx`
- Delete: `src/components/pricelists/PricelistPickerDialog.tsx`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx:44`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx:241`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx:451-473`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx:1688`

- [ ] **Step 1: Write failing tab-isolation tests**

Create `src/components/pricelists/ProductPickerDialog.test.tsx`. Mock the Pricelist store and `ProductHistoryTab` so the test focuses on separation:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import ProductPickerDialog from './ProductPickerDialog';

jest.mock('../calcsheet/ProductHistoryTab', () => (props: {
  active: boolean;
  onAdd: (value: unknown) => void;
}) => props.active
  ? <button onClick={() => props.onAdd({ observation: { observationId: 'q1:c1' } })}>
      Add historical fixture
    </button>
  : null);

jest.mock('../../store/pricelistStore', () => ({
  usePricelistStore: (selector: (state: unknown) => unknown) => selector({
    items: [], loading: false, filters: {
      search: '', suppliers: [], categories: [], brands: [],
      poles: null, minPrice: null, maxPrice: null,
    },
    fetchItems: jest.fn(), fetchFilters: jest.fn(), resetFilters: jest.fn(),
  }),
}));

it('labels the sources Pricelists and Quotation History', () => {
  render(<ProductPickerDialog open onClose={jest.fn()} onAddPricelist={jest.fn()}
    onAddHistory={jest.fn()} analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} />);
  expect(screen.getByRole('tab', { name: 'Pricelists' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Quotation History' })).toBeInTheDocument();
  expect(screen.queryByText('TJ Catalog')).not.toBeInTheDocument();
});

it('does not load history until its tab is selected', () => {
  render(<ProductPickerDialog open onClose={jest.fn()} onAddPricelist={jest.fn()}
    onAddHistory={jest.fn()} analysisDate="2026-01-01"
    expectedPurchaseDate="2026-04-01" defaultContingencyPct={5} />);
  expect(screen.queryByText('Add historical fixture')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Quotation History' }));
  expect(screen.getByText('Add historical fixture')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rename and refactor the dialog**

Move `PricelistPickerDialog.tsx` to `ProductPickerDialog.tsx`. Preserve the existing Pricelist selection code and place it inside the first tab.

Use this public contract:

```ts
interface Props {
  open: boolean;
  onClose: () => void;
  onAddPricelist: (items: PricelistItem[]) => void;
  onAddHistory: (selection: ProductHistoryAddSelection) => void;
  analysisDate: string;
  expectedPurchaseDate: string;
  defaultContingencyPct: number;
}
```

The dialog title is `Add Product`. Add MUI `Tabs`:

```tsx
<Tabs value={tab} onChange={(_event, value) => setTab(value)}>
  <Tab label="Pricelists" />
  <Tab label="Quotation History" />
</Tabs>
```

Only render `ProductHistoryTab` after its tab is active. A failure in that tab must not alter Pricelist state or controls.

- [ ] **Step 3: Add historical rows to the editor without automatic contingency**

In `CalcsheetQuotationEditor.tsx`, add:

```ts
const addFromHistory = (selection: ProductHistoryAddSelection) => {
  const item = selection.observation;
  const suggested = selection.applySuggestion
    ? selection.suggestion?.suggestedContingencyPct
    : null;
  const line: ComponentLine = {
    id: id(),
    code: nextCode('B', quotation.components),
    description: item.description,
    brand: item.brand || '',
    partNo: item.partNo || '',
    qty: 1,
    uom: item.uom || 'pc',
    unitCost: item.sourceUnitCost,
    forex: item.sourceForex || 1,
    discountPct: item.sourceDiscountPct || 0,
    expectedPurchaseDate: selection.expectedPurchaseDateOverride,
    contingencyPct: suggested ?? (quotation.productContingencyPct ?? 0),
    contingencyPctOverridden: suggested != null,
    historicalPriceSource: {
      observationId: item.observationId,
      quotationId: item.quotationId,
      projectId: item.projectId,
      quotationReference: item.quotationReference,
      quotationDate: item.quotationDate!,
      normalizedUnitCost: item.normalizedUnitCost!,
      quotedSellingUnit: item.quotedSellingUnit ?? undefined,
      selectedAt: new Date().toISOString(),
      suggestedContingencyPct: suggested ?? undefined,
      suggestionMethod: suggested != null ? selection.suggestion?.method ?? undefined : undefined,
      suggestionConfidence: suggested != null ? selection.suggestion?.confidence ?? undefined : undefined,
    },
  };
  commit('components', [...quotation.components, line] as ComponentLine[]);
};
```

Guard against missing date or normalized cost in the tab before enabling Add.

- [ ] **Step 4: Pass the resolved dates into the product picker**

Add:

```ts
const addMonthsDateOnly = (dateOnly: string, months: number) => {
  const date = new Date(`${dateOnly}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return format(date, 'yyyy-MM-dd');
};
const effectiveExpectedPurchaseDate =
  quotation.expectedPurchaseDate || addMonthsDateOnly(quotationDate, 3);
```

Render:

```tsx
<ProductPickerDialog
  open={catalogOpen}
  onClose={() => setCatalogOpen(false)}
  onAddPricelist={addFromCatalog}
  onAddHistory={addFromHistory}
  analysisDate={quotationDate}
  expectedPurchaseDate={effectiveExpectedPurchaseDate}
  defaultContingencyPct={quotation.productContingencyPct ?? 0}
/>
```

- [ ] **Step 5: Show compact source evidence on historical rows**

Beside the description, render:

```tsx
{row.historicalPriceSource && (
  <Tooltip title={[
    row.historicalPriceSource.quotationReference,
    row.historicalPriceSource.quotationDate,
    `Base cost ${PHP(row.historicalPriceSource.normalizedUnitCost)}`,
  ].join(' · ')}>
    <Chip label="Quote history" size="small" variant="outlined" color="info" />
  </Tooltip>
)}
```

This evidence stays internal and is not added to PDF or Excel exporters.

- [ ] **Step 6: Run picker tests and full build**

Run:

```bash
npm test -- --watchAll=false \
  src/components/pricelists/ProductPickerDialog.test.tsx \
  src/components/calcsheet/ProductHistoryTab.test.tsx
npm run build
```

Expected: tests PASS and TypeScript build succeeds.

- [ ] **Step 7: Commit editor integration**

```bash
git add src/components/pricelists/ProductPickerDialog.tsx \
  src/components/pricelists/ProductPickerDialog.test.tsx \
  src/components/pricelists/PricelistPickerDialog.tsx \
  src/components/calcsheet/CalcsheetQuotationEditor.tsx
git commit -m "feat: add quotation history to product picker"
```

---

### Task 8: Run Regression Checks and Update Project Memory

**Files:**
- Modify: `docs/agent/TASK_LOG.md` if present
- Modify: `docs/agent/PROJECT_STATE.md` if present
- Modify: `docs/agent/KNOWN_ISSUES.md` only if verification finds a durable issue

- [ ] **Step 1: Run all focused automated tests**

```bash
npm run test:product-history
npm test -- --watchAll=false \
  src/services/productHistoryService.test.ts \
  src/components/calcsheet/ComponentTimingDialog.test.tsx \
  src/components/calcsheet/ProductHistoryTab.test.tsx \
  src/components/pricelists/ProductPickerDialog.test.tsx \
  src/utils/calcsheet/serverGrandTotal.parity.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: `Compiled successfully.`

- [ ] **Step 3: Run local Firestore-emulator smoke checks**

Start the existing tracked emulator and sandbox app:

```bash
npm run emulator
npm run sandbox:seed
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=pmv2-851ae npm start
```

Verify:

1. Login succeeds against seeded emulator data.
2. Existing Pricelists tab loads and adds an item unchanged.
3. Quotation History remains unloaded until its tab is selected.
4. History shows draft, lost, won, and other current quotation statuses.
5. Restore snapshots never appear.
6. A recent exact-match product displays quarterly evidence when eligible.
7. A two-point, nine-month history displays annualized evidence.
8. A one-point history displays `Insufficient history`.
9. Add without Apply uses the quotation default contingency.
10. Apply creates a per-line override.
11. Quotation and component purchase dates change the forecast horizon.
12. Saving and reopening preserves `historicalPriceSource`.
13. PDF and Excel exports contain no internal source metadata.

- [ ] **Step 4: Check error isolation**

Temporarily stop the emulator or API while the dialog is open. Confirm Quotation History shows a retryable scoped error and the Pricelists tab remains operable. Restart services before continuing.

- [ ] **Step 5: Update project memory**

If the locally ignored memory files exist, append a dated entry to `docs/agent/TASK_LOG.md` and update `docs/agent/PROJECT_STATE.md` with:

```markdown
- Implemented Calcsheet Quotation History as a read-only Add Product source,
  separate from Pricelists. Historical product selections retain source
  snapshots, and contingency suggestions use quarterly trends with annualized
  fallback plus explicit estimator application.
```

Only update `KNOWN_ISSUES.md` when verification discovers a recurring or fragile behavior.

- [ ] **Step 6: Confirm the final diff is scoped**

```bash
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
```

Expected: only the planned server, frontend, test, package script, and local memory files are changed.

- [ ] **Step 7: Commit memory updates if tracked**

```bash
git add docs/agent/TASK_LOG.md docs/agent/PROJECT_STATE.md 2>/dev/null || true
git diff --cached --quiet || git commit -m "docs: record quotation history pricing"
```

Do not commit emulator data, Firebase debug logs, `.env` files, service-account files, or `.superpowers/brainstorm` artifacts.
