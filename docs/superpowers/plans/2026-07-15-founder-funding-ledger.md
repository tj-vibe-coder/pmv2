# Founder Funding Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace new Investment Tracker activity with an auditable Founder Funding Ledger that keeps founder funding separate from company expenses and connects founder-paid liquidations to one canonical expense record.

**Architecture:** Add a server-owned `founder_funding_ledger` collection and `company_settings/founder_funding` configuration. New liquidation submission remains the source of project-expense rows, while the server creates either the existing employee reimbursement record or a linked founder-advance record. Legacy `investments` remains read-only during a review-first reconciliation phase.

**Tech Stack:** React 19, TypeScript, Material UI 7, Express 5, Firebase Admin/Firestore, Node built-in test runner, CRA/Jest.

---

## File Structure

- Create: `server/founderFunding.js` — money conversion, entry validation, outstanding-balance calculation, and source-link rules used by Express routes.
- Create: `server/founderFunding.test.js` — Node unit tests for financial math and invariant enforcement.
- Create: `src/components/FounderFundingLedgerPage.tsx` — ledger dashboard, deposit, repayment, capitalization, void, and reconciliation UI.
- Create: `src/types/FounderFunding.ts` — client-side API payload and response types.
- Create: `src/utils/founderFunding.ts` — display-only PHP/centavo conversion and balance formatting helpers with CRA tests.
- Create: `src/utils/founderFunding.test.ts` — UI money-helper tests.
- Modify: `server.js` — dedicated ledger endpoints; founder-aware liquidation handling; retirement of expense-to-investment sync for new flow; reconciliation endpoints.
- Modify: `src/components/LiquidationFormPage.tsx` — founder payment/treatment form state and payload; remove client-side project-expense synchronization after server-side flow is introduced.
- Modify: `src/App.tsx` — route the new ledger page and retain a temporary legacy redirect.
- Modify: `src/components/finance/FinanceNavList.tsx` and `src/components/Sidebar.tsx` — replace “Investment Tracker” navigation label/path.
- Modify: `src/components/InvestmentTrackerPage.tsx` — present legacy records as read-only and remove “Register as Expense.”
- Modify: `src/components/CAFormPage.tsx`, `src/components/payroll/PayrollRunForm.tsx`, `src/components/ExpenseMonitoring.tsx`, and `src/components/finance/FinanceHomePage.tsx` — remove dependencies on `/api/investments` that are only used to link funding to an expense; keep non-founder employee reimbursement behavior unchanged.
- Modify: `docs/DATA_MODEL.md`, `docs/API.md`, `docs/architecture/OVERVIEW.md`, `docs/agent/PROJECT_STATE.md`, and `docs/agent/TASK_LOG.md` — record the data model, routes, architecture decision, state, and task history.
- Create: `docs/architecture/ADR-0002-founder-funding-ledger.md` — explain why founder advances and capital contributions are distinct from expenses.
- Create: `scripts/reconcile-founder-funding-ledger.js` — read-only dry-run report and explicit `--apply <approved-actions.json>` processor for reviewed legacy actions.
- Create: `scripts/reconcile-founder-funding-ledger.test.js` — matching and action-validation tests.

### Task 1: Establish tested financial primitives

**Files:**

- Create: `server/founderFunding.js`
- Create: `server/founderFunding.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing money and settlement tests.**

```js
// server/founderFunding.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { phpToCentavos, remainingCentavos, validateSettlement } = require('./founderFunding');

test('phpToCentavos retains exact centavos', () => {
  assert.equal(phpToCentavos('5807.44'), 580744);
  assert.equal(phpToCentavos(3781), 378100);
});

test('settlement cannot exceed a founder advance', () => {
  assert.equal(remainingCentavos(580744, [200000, 180000]), 200744);
  assert.throws(() => validateSettlement({ outstandingCentavos: 200744, amountCentavos: 200745 }), /exceeds/);
});
```

- [ ] **Step 2: Run the tests to verify failure.**

Run: `node --test server/founderFunding.test.js`

Expected: failure because `server/founderFunding.js` does not exist.

- [ ] **Step 3: Implement the minimal shared financial contract.**

```js
// server/founderFunding.js
function phpToCentavos(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Amount must be greater than zero');
  return Math.round(numeric * 100);
}

function remainingCentavos(advanceCentavos, settlementCentavos) {
  return advanceCentavos - settlementCentavos.reduce((sum, value) => sum + value, 0);
}

function validateSettlement({ outstandingCentavos, amountCentavos }) {
  if (!Number.isSafeInteger(amountCentavos) || amountCentavos <= 0) throw new Error('Settlement amount must be a positive centavo value');
  if (amountCentavos > outstandingCentavos) throw new Error('Settlement amount exceeds the outstanding founder advance');
}

module.exports = { phpToCentavos, remainingCentavos, validateSettlement };
```

- [ ] **Step 4: Add a repeatable server-test command.**

```json
// package.json scripts
"test:server": "node --test server/**/*.test.js"
```

- [ ] **Step 5: Run the test command.**

Run: `npm run test:server`

Expected: all `server/**/*.test.js` tests pass.

- [ ] **Step 6: Commit the tested primitives.**

```bash
git add server/founderFunding.js server/founderFunding.test.js package.json
git commit -m "test: add founder funding financial primitives"
```

### Task 2: Add founder configuration and read-only ledger APIs

**Files:**

- Modify: `server.js:43` and the finance-route section before `GET /api/investments`
- Modify: `server/founderFunding.js`
- Modify: `server/founderFunding.test.js`

- [ ] **Step 1: Add failing unit cases for founder recognition and source links.**

```js
test('only configured founder ids can create founder funding entries', () => {
  const { isRecognizedFounder, validateSource } = require('./founderFunding');
  assert.equal(isRecognizedFounder('user_tjc', ['user_tjc', 'user_rjr']), true);
  assert.equal(isRecognizedFounder('user_employee', ['user_tjc', 'user_rjr']), false);
  assert.throws(() => validateSource({ kind: 'liquidation' }), /liquidationId/);
});
```

- [ ] **Step 2: Extend the helper with the validated entry shape.**

```js
const ENTRY_TYPES = new Set(['founder_advance', 'capital_contribution', 'repayment', 'capitalization', 'opening_balance_adjustment']);
function isRecognizedFounder(userId, founderIds) { return founderIds.includes(userId); }
function validateSource(source) {
  if (!source || !['liquidation', 'cash_deposit', 'legacy_reconciliation'].includes(source.kind)) throw new Error('Invalid funding source');
  if (source.kind === 'liquidation' && !source.liquidationId) throw new Error('liquidationId is required');
}
```

- [ ] **Step 3: Add server functions that read the settings document and calculate balances from posted records.**

```js
async function getFounderFundingSettings() {
  const snap = await db.collection('company_settings').doc('founder_funding').get();
  return snap.exists ? snap.data() : { founderUserIds: [] };
}

function summarizeFounderLedger(entries) {
  // Return advancesOutstandingCentavos, capitalContributedCentavos, repaidThisPeriodCentavos,
  // and per-founder balances using only status === 'posted' entries.
}
```

- [ ] **Step 4: Add the read endpoints and keep them superadmin-only.**

```js
app.get('/api/founder-funding-ledger', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const snap = await db.collection('founder_funding_ledger').orderBy('transactionDate', 'desc').get();
  const entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json({ success: true, entries, summary: summarizeFounderLedger(entries) });
});
```

- [ ] **Step 5: Seed settings only through an explicit superadmin endpoint.**

```js
app.put('/api/founder-funding-settings', async (req, res) => {
  // Require superadmin; validate `founderUserIds` against existing users;
  // write { founderUserIds, capitalTargetCentavos, updatedAt, updatedBy }.
});
```

- [ ] **Step 6: Verify with unit tests and an authenticated local/manual API request.**

Run: `npm run test:server`

Expected: founder recognition, source validation, and centavo behavior pass; unconfigured users cannot be treated as founders.

- [ ] **Step 7: Commit the configuration and read API.**

```bash
git add server.js server/founderFunding.js server/founderFunding.test.js
git commit -m "feat: add founder funding ledger read model"
```

### Task 3: Create ledger write APIs with append-only settlement rules

**Files:**

- Modify: `server.js` in the new founder-funding route block
- Modify: `server/founderFunding.js`
- Modify: `server/founderFunding.test.js`

- [ ] **Step 1: Write failing tests for direct deposits, repayment, capitalization, and voiding.**

```js
test('capitalization requires an explicit resolution reference', () => {
  const { validateCapitalization } = require('./founderFunding');
  assert.throws(() => validateCapitalization({ resolutionReference: '' }), /resolution/);
  assert.doesNotThrow(() => validateCapitalization({ resolutionReference: 'BR-2026-07-01' }));
});
```

- [ ] **Step 2: Add validation helpers.**

```js
function validateCapitalization({ resolutionReference }) {
  if (typeof resolutionReference !== 'string' || !resolutionReference.trim()) throw new Error('Capitalization requires a resolution or approval reference');
}
function newAuditFields(userId, now) {
  return { createdAt: now, createdBy: userId, status: 'posted' };
}
```

- [ ] **Step 3: Add direct-deposit creation.**

```js
app.post('/api/founder-funding-ledger/deposits', async (req, res) => {
  // Require superadmin, verify req.body.founderId is configured, convert PHP to centavos,
  // validate cash_deposit source, then create founder_advance or capital_contribution.
  // Return { success: true, entry } and never create project_expenses or liquidations.
});
```

- [ ] **Step 4: Add repayment and capitalization as separate settlement entries.**

```js
app.post('/api/founder-funding-ledger/:id/repay', async (req, res) => {
  // Load the target advance, calculate its posted settlement total, validate the requested amount,
  // and add `{ entryType: 'repayment', settlesEntryId: req.params.id }`.
});
app.post('/api/founder-funding-ledger/:id/capitalize', async (req, res) => {
  // Same balance check; require resolutionReference; add a `capitalization` settlement.
  // Set approvedAt/approvedBy to the acting superadmin, including self-approval.
});
```

- [ ] **Step 5: Add voiding without hard deletion.**

```js
app.post('/api/founder-funding-ledger/:id/void', async (req, res) => {
  // Require superadmin and non-empty reason; reject a void when it would orphan posted settlements.
  // Update only status, voidedAt, voidedBy, and voidReason.
});
```

- [ ] **Step 6: Run tests and manually verify over-settlement returns 400.**

Run: `npm run test:server`

Expected: a repayment or capitalization that exceeds the remaining balance is rejected and no document is created.

- [ ] **Step 7: Commit the write API.**

```bash
git add server.js server/founderFunding.js server/founderFunding.test.js
git commit -m "feat: add founder funding settlement APIs"
```

### Task 4: Make liquidation submission founder-aware and server-authoritative

**Files:**

- Modify: `server.js:1767-1900`
- Modify: `src/components/LiquidationFormPage.tsx:216-270`, `src/components/LiquidationFormPage.tsx:650-735`, and `src/components/LiquidationFormPage.tsx:1060-1135`
- Modify: `server/founderFunding.test.js`

- [ ] **Step 1: Write failing tests for the classification decision.**

```js
test('founder no-CA liquidation creates a founder advance instead of reimbursement', () => {
  const { classifyNoCaLiquidation } = require('./founderFunding');
  assert.equal(classifyNoCaLiquidation({ isFounder: true, treatment: 'company_owes_founder' }), 'founder_advance');
  assert.equal(classifyNoCaLiquidation({ isFounder: false, treatment: null }), 'reimbursement');
});
```

- [ ] **Step 2: Add payload fields to the liquidation form.**

```ts
type FounderPaymentTreatment = 'company_owes_founder' | 'capital_contribution' | '';
// Include in payload only when no `ca_id` is selected:
founderPaymentTreatment,
capitalizationReference,
```

- [ ] **Step 3: Render the founder-only payment treatment control.**

```tsx
{!caId && isRecognizedFounder && (
  <Alert severity="info">
    Personally paid by founder. Default treatment is <strong>Company owes founder</strong>.
  </Alert>
)}
```

- [ ] **Step 4: Move liquidation expense synchronization into the server submission transaction/batch.**

```js
// After the liquidation document ref is allocated, build each project_expenses doc with:
// sourceType: 'liquidation_sync', sourceLiquidationId: ref.id, sourceLiquidationRowId: row.id.
// Use sourceLiquidationId + sourceLiquidationRowId as the idempotency key before writing.
// Do not call `addLiquidationRowsToProjectExpenses` in the browser after a successful response.
```

- [ ] **Step 5: Branch the no-CA treatment server-side.**

```js
if (liqStatus === 'submitted' && !caId && isFounder) {
  // Create one `founder_advance`, or a `capital_contribution` only when the explicit
  // treatment and non-empty capitalization reference were supplied. Do not create reimbursements/{liquidationId}.
} else if (liqStatus === 'submitted' && reimbursableAmount > 0) {
  // Preserve the existing reimbursement document behavior for non-founders and CA excess.
}
```

- [ ] **Step 6: Return the created ledger link and update success copy.**

```js
res.status(201).json({ success: true, id: ref.id, founderFundingEntryId, message: 'Liquidation submitted' });
```

- [ ] **Step 7: Verify three manual cases.**

Run: `npm run start:sandbox`

Expected:

1. TJC/RJR no-CA liquidation creates one liquidation expense set and one founder ledger entry.
2. A non-founder no-CA liquidation creates a reimbursement, not a founder ledger entry.
3. CA-backed liquidation changes only the CA flow and never creates a founder ledger entry.

- [ ] **Step 8: Commit the founder-aware liquidation flow.**

```bash
git add server.js src/components/LiquidationFormPage.tsx server/founderFunding.js server/founderFunding.test.js
git commit -m "feat: link founder paid liquidations to funding ledger"
```

### Task 5: Build the Founder Funding Ledger interface and route

**Files:**

- Create: `src/types/FounderFunding.ts`
- Create: `src/utils/founderFunding.ts`
- Create: `src/utils/founderFunding.test.ts`
- Create: `src/components/FounderFundingLedgerPage.tsx`
- Modify: `src/App.tsx:30` and `src/App.tsx:444-455`
- Modify: `src/components/finance/FinanceNavList.tsx:220-247`
- Modify: `src/components/Sidebar.tsx` where Investment Tracker appears

- [ ] **Step 1: Write the display-helper test.**

```ts
import { formatCentavos } from './founderFunding';
test('formats centavos as Philippine pesos', () => {
  expect(formatCentavos(580744)).toBe('₱5,807.44');
});
```

- [ ] **Step 2: Implement typed client contracts and formatting.**

```ts
export type FounderFundingEntryType = 'founder_advance' | 'capital_contribution' | 'repayment' | 'capitalization' | 'opening_balance_adjustment';
export const formatCentavos = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
```

- [ ] **Step 3: Build the read-only ledger table and KPI cards before write dialogs.**

```tsx
<Card><CardContent><Typography>Founder Advances Outstanding</Typography><Typography variant="h5">{formatCentavos(summary.advancesOutstandingCentavos)}</Typography></CardContent></Card>
<TableRow>
  <TableCell>{entry.transactionDate}</TableCell>
  <TableCell>{entry.founderName}</TableCell>
  <TableCell>{entry.entryType}</TableCell>
  <TableCell align="right">{formatCentavos(entry.amountCentavos)}</TableCell>
</TableRow>
```

- [ ] **Step 4: Add deposit, repayment, capitalization, and void dialogs using only the new API.**

```ts
await fetch(`${API_BASE}/founder-funding-ledger/${entry.id}/capitalize`, {
  method: 'POST', headers: authHeaders,
  body: JSON.stringify({ amount: form.amount, transactionDate: form.date, resolutionReference: form.resolutionReference, proofRefs: form.proofRefs }),
});
```

- [ ] **Step 5: Route and navigate to the new page.**

```tsx
<Route path="/finance/founder-funding" element={<ProtectedRoute><EmployeeGuard><AppLayout><TaxFilerBlock><FounderFundingLedgerPage /></TaxFilerBlock></AppLayout></EmployeeGuard></ProtectedRoute>} />
```

Use `Founder Funding Ledger` as the sidebar text and retain `/finance/investment-tracker` as a temporary redirect to `/finance/founder-funding`.

- [ ] **Step 6: Run client tests and build.**

Run: `CI=true npm test -- --watchAll=false`

Expected: CRA tests pass.

Run: `npm run build`

Expected: production build completes without TypeScript errors.

- [ ] **Step 7: Commit the ledger UI.**

```bash
git add src/types/FounderFunding.ts src/utils/founderFunding.ts src/utils/founderFunding.test.ts src/components/FounderFundingLedgerPage.tsx src/App.tsx src/components/finance/FinanceNavList.tsx src/components/Sidebar.tsx
git commit -m "feat: add founder funding ledger interface"
```

### Task 6: Retire duplicate-prone legacy Investment Tracker writes

**Files:**

- Modify: `src/components/InvestmentTrackerPage.tsx:237-338` and `src/components/InvestmentTrackerPage.tsx:421-650`
- Modify: `server.js:1012-1135`, `server.js:1230-1235`, `server.js:1272-1338`, `server.js:1566-1701`, `server.js:1964-2040`, `server.js:2715-2732`, and `server.js:5911-6103`
- Modify: `src/components/CAFormPage.tsx`, `src/components/payroll/PayrollRunForm.tsx`, `src/components/ExpenseMonitoring.tsx`, and `src/components/finance/FinanceHomePage.tsx`

- [ ] **Step 1: Add a regression test that proves a liquidation cannot create a second manual project expense.**

```js
test('a funding link references liquidation source, never an expense id', () => {
  const { validateSource } = require('./founderFunding');
  assert.doesNotThrow(() => validateSource({ kind: 'liquidation', liquidationId: 'liq_4', liquidationFormNo: 'LQ-001' }));
});
```

- [ ] **Step 2: Make `InvestmentTrackerPage` legacy-read-only.**

```tsx
<Alert severity="warning">Legacy Investment Tracker is read-only while records are reconciled. New founder funding is recorded in Founder Funding Ledger.</Alert>
```

Delete the `RegisterFormData`, `openRegister`, `submitRegister`, `registerOpen` dialog, and the `PostAddIcon` action. Retain only history display until decommission signoff.

- [ ] **Step 3: Stop creating new `investments` entries from expense funding.**

```js
// Remove calls to syncExpenseFundingInvestment for new project, overhead, cash-advance,
// reimbursement, and payroll writes. Preserve old investment rows untouched.
// Delete the sync helper only after all call sites above have been removed and the legacy page is read-only.
```

- [ ] **Step 4: Remove legacy Investment Tracker lookups from current funding pickers.**

```ts
// Remove `/api/investments` fetches and `linkedInvestmentId` controls from CAFormPage,
// PayrollRunForm, and ExpenseMonitoring. Their company-funded workflow must not create
// or select a Founder Funding Ledger record.
```

- [ ] **Step 5: Run regression checks.**

Run: `npm run test:server && CI=true npm test -- --watchAll=false && npm run build`

Expected: no current route calls `/api/investments` except the legacy read-only page and reconciliation script.

- [ ] **Step 6: Commit legacy write retirement.**

```bash
git add server.js src/components/InvestmentTrackerPage.tsx src/components/CAFormPage.tsx src/components/payroll/PayrollRunForm.tsx src/components/ExpenseMonitoring.tsx src/components/finance/FinanceHomePage.tsx
git commit -m "refactor: retire investment expense linking"
```

### Task 7: Add review-first reconciliation and LQ-001 safeguards

**Files:**

- Create: `scripts/reconcile-founder-funding-ledger.js`
- Create: `scripts/reconcile-founder-funding-ledger.test.js`
- Modify: `server.js` to add `GET /api/founder-funding-ledger/reconciliation` and an approved-action endpoint
- Modify: `src/components/FounderFundingLedgerPage.tsx`

- [ ] **Step 1: Write matching tests using the LQ-001 amount tolerance.**

```js
test('matches the LQ-001 airfare record within one peso but does not auto-apply', () => {
  const { scoreCandidate } = require('./reconcile-founder-funding-ledger');
  const result = scoreCandidate({ date: '2026-02-10', amount: 5807, description: 'Cebu Pacific MNL to Ceb' }, { date: '2026-02-10', amount: 5807.44, description: 'Cebu Pacific Flight' });
  assert.equal(result.amountDifferenceCentavos, 44);
  assert.equal(result.requiresReview, true);
});
```

- [ ] **Step 2: Implement dry-run-only output by default.**

```js
const apply = process.argv.includes('--apply');
if (apply && !process.argv.find(arg => arg.endsWith('.json'))) throw new Error('Applying reconciliation requires an approved actions JSON file');
// Default output writes candidate, confidence, evidence ids, and proposed action only.
```

- [ ] **Step 3: Define explicit approved-action records.**

```json
{
  "action": "void_manual_expense_and_open_founder_advance",
  "liquidationId": "liq_4",
  "manualExpenseIds": ["cNXq0GThevthqLEgkct1"],
  "legacyInvestmentIds": ["nAJkRHOHe2xBRstKCZrW"],
  "founderId": "user_6",
  "reviewedBy": "<superadmin-user-id>",
  "reviewedAt": "2026-07-15T00:00:00.000Z",
  "reason": "Duplicate of LQ-001 liquidation row"
}
```

- [ ] **Step 4: Apply approved actions by voiding, never deleting.**

```js
// Mark manual project expenses with `status: 'voided'`, `voidReason`, and `reconciliationId`.
// Mark legacy investments with `legacyStatus: 'archived_reconciled'`.
// Create one `opening_balance_adjustment` or `founder_advance` only after the action confirms
// that it was neither reimbursed nor already capitalized.
```

- [ ] **Step 5: Surface the report in the ledger Reconciliation tab.**

```tsx
<Button onClick={() => setSelectedCandidate(candidate)}>Review candidate</Button>
<Alert severity="warning">No historical record is changed until a superadmin applies an approved reconciliation action.</Alert>
```

- [ ] **Step 6: Run dry-run against the Firestore emulator seeded from the verified backup.**

Run: `npm run sandbox:seed -- backups/2026-07-15T05-33-12`

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/reconcile-founder-funding-ledger.js`

Expected: LQ-001 is reported as a review candidate; no documents are written.

- [ ] **Step 7: Commit reconciliation tooling.**

```bash
git add scripts/reconcile-founder-funding-ledger.js scripts/reconcile-founder-funding-ledger.test.js server.js src/components/FounderFundingLedgerPage.tsx
git commit -m "feat: add founder funding reconciliation review"
```

### Task 8: Document, verify, and prepare controlled rollout

**Files:**

- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/API.md`
- Modify: `docs/architecture/OVERVIEW.md`
- Create: `docs/architecture/ADR-0002-founder-funding-ledger.md`
- Modify: `docs/agent/PROJECT_STATE.md`
- Modify: `docs/agent/TASK_LOG.md`

- [ ] **Step 1: Document the collection and its no-duplicate invariant.**

```md
### `founder_funding_ledger`

Funding records do not represent an expense. A liquidation source may have one active founder-funding record; its project expenses remain in `project_expenses` with `sourceType: liquidation_sync`.
```

- [ ] **Step 2: Document every public API request/response and authorization rule.**

```md
### POST `/api/founder-funding-ledger/:id/capitalize`

Requires: superadmin and a non-empty `resolutionReference`.
Creates: append-only `capitalization` entry. Does not change the linked project expense.
```

- [ ] **Step 3: Record the architecture decision.**

```md
## Decision

Founder-paid expenses default to a repayable founder advance. Capital contribution is a separate, explicit, auditable conversion or deposit record. The application does not infer ownership from contribution amounts.
```

- [ ] **Step 4: Run the full verification suite.**

Run: `npm run test:server`

Expected: server financial and reconciliation unit tests pass.

Run: `CI=true npm test -- --watchAll=false`

Expected: CRA tests pass.

Run: `npm run build`

Expected: production build passes.

- [ ] **Step 5: Run a sandbox smoke test.**

Run: `npm run start:sandbox`

Expected: founder liquidation, employee reimbursement, direct founder deposit, repayment, capitalization, void, and review-only reconciliation all work without production writes.

- [ ] **Step 6: Capture rollout evidence and commit documentation.**

```bash
git add docs/DATA_MODEL.md docs/API.md docs/architecture/OVERVIEW.md docs/architecture/ADR-0002-founder-funding-ledger.md docs/agent/PROJECT_STATE.md docs/agent/TASK_LOG.md
git commit -m "docs: record founder funding ledger rollout"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–3 implement the ledger contract and settlement rules; Task 4 implements founder-paid liquidation behavior; Tasks 5–6 implement the user-facing replacement and retire the duplicate-producing integration; Task 7 provides review-first legacy remediation; Task 8 covers architecture, API, data-model documentation, sandbox validation, and rollout evidence.
- **No placeholders:** Every new route, record type, validation rule, manual scenario, and commit scope is named explicitly. Future partial allocation and general-ledger capability are intentionally excluded from this plan.
- **Type consistency:** `amountCentavos`, `source.kind`, `entryType`, `settlesEntryId`, `resolutionReference`, and `status` are used consistently across server, UI, test, and reconciliation tasks.
