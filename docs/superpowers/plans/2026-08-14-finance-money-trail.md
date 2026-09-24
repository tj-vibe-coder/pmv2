# Finance Money Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give every investment, expense, liquidation row, cash advance, and reimbursement a precise, reviewable money trail with safe admin-only link resolution and append-only audit history.

**Architecture:** Add a dependency-injected Express router that reads the existing Firestore source documents on demand, normalizes them into finance-trace nodes, follows confirmed source IDs, and proposes bounded deterministic candidates without persisting a second graph. A shared React drawer renders the graph and resolver, while a common focus-token utility lets each finance page reveal, paginate to, scroll to, and persistently highlight an exact source record. All destructive resolution is server-authorized, transactional where Firestore permits, protected for source-synced expenses, and logged to `finance_trace_audit`.

**Tech Stack:** Node.js, Express 5, Firebase Admin/Firestore, React 19, TypeScript 4.9, React Router 7, Material UI 7, Node test runner, Jest, React Testing Library.

---

## Task 1: Define the trace contract and focus-token behavior

**Files:**
- Create: `src/types/FinanceTrace.ts`
- Create: `src/utils/financeTraceFocus.ts`
- Test: `src/utils/financeTraceFocus.test.ts`

- [ ] **Step 1: Write the failing focus-token tests**

Cover all canonical tokens, safe URL encoding, liquidation row IDs, malformed tokens, and route generation:

```ts
expect(parseFinanceFocus('investment:inv-1')).toEqual({ type: 'investment', id: 'inv-1' });
expect(parseFinanceFocus('expense:project_expenses:exp-1')).toEqual({
  type: 'expense', collection: 'project_expenses', id: 'exp-1',
});
expect(parseFinanceFocus('liquidation:liq-1:row-2')).toEqual({
  type: 'liquidation', id: 'liq-1', rowId: 'row-2',
});
expect(focusUrl({ type: 'cash_advance', id: 'ca-1' })).toBe(
  '/finance/expense-monitoring/ca-form?focus=cash_advance%3Aca-1',
);
expect(parseFinanceFocus('expense:unknown:1')).toBeNull();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/utils/financeTraceFocus.test.ts`

Expected: FAIL because `FinanceTrace` and `financeTraceFocus` do not exist.

- [ ] **Step 3: Add shared TypeScript contracts**

Define `FinanceTraceNodeType`, `FinanceTraceNode`, `FinanceTraceEdge`, `FinanceTraceCandidate`, `FinanceTraceResponse`, `FinanceTracePermissions`, and the four resolver request unions. Keep server JSON names identical to the approved design spec.

```ts
export type FinanceTraceNodeType =
  | 'investment' | 'expense' | 'liquidation' | 'cash_advance' | 'reimbursement';

export interface FinanceTraceResponse {
  originKey: string;
  nodes: FinanceTraceNode[];
  edges: FinanceTraceEdge[];
  candidates: FinanceTraceCandidate[];
  permissions: { canConfirm: boolean; canResolve: boolean };
}
```

- [ ] **Step 4: Implement strict token parsing and URL generation**

Tokens must be the only row identity in the query string. Preserve an optional `from` URL for Back to source, but reject unknown node types, expense collections, missing IDs, and extra segments.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/utils/financeTraceFocus.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/types/FinanceTrace.ts src/utils/financeTraceFocus.ts src/utils/financeTraceFocus.test.ts
git commit -m "feat: define finance trace focus contract"
```

## Task 2: Normalize records and score possible matches

**Files:**
- Create: `server/financeTrace.js`
- Test: `server/financeTrace.test.js`

- [ ] **Step 1: Write failing normalization and scoring tests**

Use plain objects so candidate logic remains deterministic and independent of Firestore. Cover:

- stable node keys, labels, dates, amounts, collections, and focus URLs for all five record types;
- JSON and array forms of `liquidations.rows_json`;
- confirmed links from `sourceExpenseId`/`linkedExpenseId`, `sourceLiquidationId`/`sourceLiquidationRowId`, `ca_id`, and `reimbursements.liquidationId`;
- date distance of at most 14 days;
- amount difference of at most ₱500, including centavos;
- normalized text overlap, same project/investor, and supplier/invoice/receipt/source-reference evidence;
- exclusion of the origin and already-confirmed nodes;
- requirement for at least two independent signals;
- stable score ordering and a maximum of five candidates.

```js
const result = rankCandidates(origin, candidates);
assert.equal(result[0].node.id, 'near-centavo-match');
assert.deepEqual(result[0].evidence, ['amount within ₱0.35', 'date within 1 day', 'same project']);
assert.equal(rankCandidates(origin, [onlyAmount]).length, 0);
assert.equal(rankCandidates(origin, sixStrongMatches).length, 5);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test server/financeTrace.test.js`

Expected: FAIL because `server/financeTrace.js` does not exist.

- [ ] **Step 3: Implement pure normalization helpers**

Export `nodeKey`, `parseLiquidationRows`, `normalizeRecord`, `confirmedReferences`, `rankCandidates`, and `isProtectedExpense`. Treat `po_sync`, `liquidation_sync`, `payroll_sync`, `ca_writeoff`, `sourcePoId`, and `sourceLiquidationId` as protected source-owned expense signals.

- [ ] **Step 4: Implement deterministic candidate scoring**

Normalize punctuation/case, ignore common accounting stop words, compare currency as integer centavos, and return user-facing evidence. Directly confirmable candidates are limited to investment↔expense; liquidation/CA/reimbursement candidates must return `confirmable: false` and an Open source action.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test server/financeTrace.test.js`

- [ ] **Step 6: Commit**

```bash
git add server/financeTrace.js server/financeTrace.test.js
git commit -m "feat: normalize and match finance trace records"
```

## Task 3: Add the read-only trace API

**Files:**
- Create: `server/financeTraceRouter.js`
- Create: `server/financeTraceRouter.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing router tests for authentication, visibility, graph traversal, and candidates**

Build the router with a fake Firestore adapter and ephemeral Express app, following `server/calcsheetProductHistoryRouter.test.js`. Assert:

- 401 for no valid user;
- 404 for a missing or invisible origin;
- admin and superadmin get `canConfirm/canResolve: true`, other users get both false;
- non-admin records obey the same ownership/source visibility rules as the source module;
- a trace starting at an investment follows its confirmed expense, liquidation row, CA, and reimbursement without duplicate nodes or edges;
- inferred candidates are clearly `needsReview: true` and never appear as confirmed edges;
- malformed record types/collections/row IDs return 400.

```js
const response = await requestJson(app, '/api/finance-trace/investment/inv-1', userToken);
assert.equal(response.status, 200);
assert.deepEqual(response.body.edges.map(e => e.confirmed), [true, true, true]);
assert.equal(response.body.candidates[0].needsReview, true);
```

- [ ] **Step 2: Run the router test and verify RED**

Run: `node --test server/financeTraceRouter.test.js`

- [ ] **Step 3: Implement dependency-injected trace reads**

Create `createFinanceTraceRouter({ db, getCurrentUser, FieldValue })`. Fetch the origin, breadth-first traverse explicit references with a visited set, batch independent candidate collection reads, and return normalized nodes/edges/candidates. Do not write or repair data during GET.

- [ ] **Step 4: Mount the router before the SPA fallback**

```js
const { createFinanceTraceRouter } = require('./server/financeTraceRouter');
// after getCurrentUser and before static fallback
app.use('/api/finance-trace', createFinanceTraceRouter({ db, getCurrentUser, FieldValue }));
```

- [ ] **Step 5: Run API tests and existing server regression tests**

Run:

```bash
node --test server/financeTrace.test.js server/financeTraceRouter.test.js
node --test server/calcsheetProductHistoryRouter.test.js
```

- [ ] **Step 6: Commit**

```bash
git add server.js server/financeTraceRouter.js server/financeTraceRouter.test.js
git commit -m "feat: add finance trace read API"
```

## Task 4: Implement safe resolver actions and append-only audit

**Files:**
- Modify: `server/financeTrace.js`
- Modify: `server/financeTraceRouter.js`
- Modify: `server/financeTrace.test.js`
- Modify: `server/financeTraceRouter.test.js`

- [ ] **Step 1: Write failing permission, validation, mutation, and audit tests**

Cover all actions:

1. `confirm_match` writes reciprocal investment/expense link fields and funding source.
2. `keep_both_separate` clears reciprocal links and makes the expense `corporate_bank`.
3. `keep_investment_delete_expense` optionally reclassifies the investment, deletes only an eligible manual/receipt/migrated expense, and clears stale link fields.
4. `keep_expense_delete_investment` deletes the investment and makes the retained expense `corporate_bank`.

Also prove:

- 401 unauthenticated and 403 non-admin;
- 409 stale expected-version/precondition or already-resolved pair;
- 422 protected PO/liquidation/payroll/source-owned expense, with `sourceFocusUrl`;
- 400 invalid pair, action, category, or mismatched collection;
- every successful action creates exactly one immutable `finance_trace_audit` document containing actor, timestamp, action, both before snapshots, after/deleted outcomes, reason, and request ID;
- failed actions create no audit row and no partial writes.

- [ ] **Step 2: Run the router tests and verify RED**

Run: `node --test server/financeTrace.test.js server/financeTraceRouter.test.js`

- [ ] **Step 3: Add resolver validation helpers**

Validate the pair server-side; never trust labels, amounts, roles, collection names, or protected-state flags from the browser. Permit direct confirmation only for investment↔expense.

- [ ] **Step 4: Implement `POST /api/finance-trace/resolve`**

Use `db.runTransaction` to read both records again, enforce preconditions, apply the selected mutations/deletions, and create the audit document in the same transaction. Use `FieldValue.delete()` for cleared fields. Return the fresh trace rooted at the retained record plus a concise action message.

- [ ] **Step 5: Run focused and regression tests**

Run:

```bash
node --test server/financeTrace.test.js server/financeTraceRouter.test.js
node --test server/*.test.js
```

- [ ] **Step 6: Commit**

```bash
git add server/financeTrace.js server/financeTraceRouter.js server/financeTrace.test.js server/financeTraceRouter.test.js
git commit -m "feat: resolve finance links with audit trail"
```

## Task 5: Verify Cloud Functions packaging

**Files:**
- Modify: `scripts/prepare-functions.js` only if the current generic module copy does not cover the new router
- Test: `server/financeTracePackaging.test.js`

- [ ] **Step 1: Write a failing packaging/load test**

Run the preparation script in a temporary fixture or assert its output contract, then require the prepared Functions server with Firebase dependencies stubbed. Verify `functions/server/financeTrace.js` and `functions/server/financeTraceRouter.js` are present while `*.test.js` files are excluded.

- [ ] **Step 2: Run the packaging test and verify RED or existing support**

Run: `node --test server/financeTracePackaging.test.js`

If the test passes immediately because `prepare-functions.js` already copies all runtime modules, keep the test as a deployment regression and do not change the script.

- [ ] **Step 3: Make the smallest packaging correction if needed**

Keep the existing generic `server/*.js` copy behavior; do not hardcode a one-off finance file list.

- [ ] **Step 4: Verify GREEN and generated runtime load**

Run:

```bash
node --test server/financeTracePackaging.test.js
node scripts/prepare-functions.js
test -f functions/server/financeTrace.js
test -f functions/server/financeTraceRouter.js
```

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-functions.js server/financeTracePackaging.test.js functions/server.js functions/server/financeTrace.js functions/server/financeTraceRouter.js
git commit -m "test: protect finance trace function packaging"
```

## Task 6: Add the frontend API client and focus-row hook

**Files:**
- Create: `src/services/financeTraceService.ts`
- Create: `src/services/financeTraceService.test.ts`
- Create: `src/hooks/useFinanceRowFocus.ts`
- Create: `src/hooks/useFinanceRowFocus.test.tsx`

- [ ] **Step 1: Write failing service and hook tests**

Assert bearer auth, URL encoding, structured API error propagation, resolver payloads, stale response protection, filter/page callbacks, delayed scroll after loading, persistent highlight, Clear focus, and Back to source.

```ts
renderHook(() => useFinanceRowFocus({
  records, pageSize: 10, revealRecord, rowRefs, location, navigate,
}));
expect(revealRecord).toHaveBeenCalledWith(records[21]);
expect(setPage).toHaveBeenCalledWith(2);
expect(rowRefs.current.get('expense:project_expenses:e-22')?.scrollIntoView).toHaveBeenCalled();
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/services/financeTraceService.test.ts src/hooks/useFinanceRowFocus.test.tsx`

- [ ] **Step 3: Implement the authenticated service**

Expose `getFinanceTrace(origin)` and `resolveFinanceTrace(request)`. Use the existing `token` localStorage convention and surface server `code`, `message`, and `sourceFocusUrl` without flattening them into a generic error.

- [ ] **Step 4: Implement reusable focused-row behavior**

The hook parses `focus`, calls the page-specific reveal callback, selects the correct page, waits for the row ref, scrolls with `block: 'center'`, and retains highlight until Clear focus or navigation. Never silently clear focus after scrolling.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/services/financeTraceService.test.ts src/hooks/useFinanceRowFocus.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/services/financeTraceService.ts src/services/financeTraceService.test.ts src/hooks/useFinanceRowFocus.ts src/hooks/useFinanceRowFocus.test.tsx
git commit -m "feat: add finance trace client and row focus"
```

## Task 7: Build the shared Money Trail drawer and resolver

**Files:**
- Create: `src/components/finance/MoneyTrailButton.tsx`
- Create: `src/components/finance/MoneyTrailDrawer.tsx`
- Create: `src/components/finance/FinanceTraceResolveDialog.tsx`
- Test: `src/components/finance/MoneyTrailDrawer.test.tsx`
- Test: `src/components/finance/FinanceTraceResolveDialog.test.tsx`

- [ ] **Step 1: Write failing drawer tests**

Cover loading/error/retry, confirmed chain ordering, relation chips, exact focus links, Back to source, possible-match Needs review treatment, evidence display, maximum five candidates, and empty states. Verify semantic headings, keyboard activation, focus trap/return, labelled icon buttons, and non-color-only status.

- [ ] **Step 2: Write failing resolver-dialog tests**

Assert view-only roles see no mutation controls; admin/superadmin see Confirm and all three separation choices; destructive choices require explicit confirmation and reason; investment-retained option allows category reclassification; protected errors replace destructive controls with Open source; successful resolution refreshes the trail.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/finance/MoneyTrailDrawer.test.tsx src/components/finance/FinanceTraceResolveDialog.test.tsx`

- [ ] **Step 4: Implement the shared UI**

Use MUI `Drawer`, `Chip`, `Alert`, `Dialog`, `List`, and `Skeleton`. The compact row control should say `View trail` and may show a confirmed-count badge; it must not trigger per-row API reads until opened.

- [ ] **Step 5: Verify GREEN and accessibility assertions**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/finance/MoneyTrailDrawer.test.tsx src/components/finance/FinanceTraceResolveDialog.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/MoneyTrailButton.tsx src/components/finance/MoneyTrailDrawer.tsx src/components/finance/FinanceTraceResolveDialog.tsx src/components/finance/*.test.tsx
git commit -m "feat: build money trail drawer and resolver"
```

## Task 8: Integrate Investment Tracker and precise expense navigation

**Files:**
- Modify: `src/components/InvestmentTrackerPage.tsx`
- Create: `src/components/InvestmentTrackerPage.moneyTrail.test.tsx`

- [ ] **Step 1: Write failing page integration tests**

Assert an `investment:<id>` focus token reveals the exact row, clears conflicting filters, selects its page, scrolls, and highlights it. Assert linked expense chips use collection-aware focus URLs, View trail opens the shared drawer, and resolver completion updates/removes the affected investment row without a full-page reload.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/InvestmentTrackerPage.moneyTrail.test.tsx`

- [ ] **Step 3: Add trace controls and focus behavior**

Replace `expenseLinkTarget` page-only navigation with `focusUrl`. Add a dedicated Trail column/control, stable row refs keyed by focus token, persistent highlight styling, Clear focus, and Back to source.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/InvestmentTrackerPage.moneyTrail.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/InvestmentTrackerPage.tsx src/components/InvestmentTrackerPage.moneyTrail.test.tsx
git commit -m "feat: trace investments to exact finance records"
```

## Task 9: Integrate project and overhead expense views

**Files:**
- Modify: `src/components/ExpenseMonitoring.tsx`
- Modify: `src/components/OverheadExpensesPage.tsx`
- Create: `src/components/ExpenseMonitoring.moneyTrail.test.tsx`
- Create: `src/components/OverheadExpensesPage.moneyTrail.test.tsx`

- [ ] **Step 1: Write failing Expense Monitoring tests**

For both `project_expenses` and `overhead_expenses` focus tokens, assert automatic year/month/project/scope selection, correct sorted-page calculation, exact-row scroll/highlight, and durable focus controls. Assert relation chips target exact investment/liquidation/CA records and View trail works for every visible row.

- [ ] **Step 2: Write failing overhead-page tests**

Assert direct overhead route focus and exact investment links work for users who enter through `/finance/overhead-expenses`.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/ExpenseMonitoring.moneyTrail.test.tsx src/components/OverheadExpensesPage.moneyTrail.test.tsx`

- [ ] **Step 4: Implement collection-aware expense focus**

The unified monitor must set `selectedYear`, clear quarter/month conflicts, set the exact project or `OVERHEAD_SENTINEL`, recompute the sorted index, set `page`, then scroll. Source-synced rows show source links and no delete resolution in the drawer.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/ExpenseMonitoring.moneyTrail.test.tsx src/components/OverheadExpensesPage.moneyTrail.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/ExpenseMonitoring.tsx src/components/OverheadExpensesPage.tsx src/components/ExpenseMonitoring.moneyTrail.test.tsx src/components/OverheadExpensesPage.moneyTrail.test.tsx
git commit -m "feat: reveal exact expenses from money trails"
```

## Task 10: Integrate Liquidation rows and Cash Advances

**Files:**
- Modify: `src/components/LiquidationFormPage.tsx`
- Modify: `src/components/CAFormPage.tsx`
- Create: `src/components/LiquidationFormPage.moneyTrail.test.tsx`
- Create: `src/components/CAFormPage.moneyTrail.test.tsx`

- [ ] **Step 1: Write failing Liquidation tests**

Assert `liquidation:<id>:<rowId>` auto-loads submitted or draft liquidation through `loadDraft`, expands the correct form context, scrolls to the exact itemized row, persists highlight, and offers exact expense/CA/reimbursement chips plus View trail. A missing row must show a recoverable message while keeping the liquidation loaded.

- [ ] **Step 2: Write failing Cash Advance tests**

Assert `cash_advance:<id>` reveals the exact CA in the admin balance/history section, scrolls/highlights it, and its liquidation chips use form-and-row-aware focus URLs when available.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/LiquidationFormPage.moneyTrail.test.tsx src/components/CAFormPage.moneyTrail.test.tsx`

- [ ] **Step 4: Implement precise source navigation**

Reuse existing `loadDraft` and linked-liquidation data. Do not create a second liquidation loader. Add stable row refs and the shared focus hook after records have loaded.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/LiquidationFormPage.moneyTrail.test.tsx src/components/CAFormPage.moneyTrail.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/LiquidationFormPage.tsx src/components/CAFormPage.tsx src/components/LiquidationFormPage.moneyTrail.test.tsx src/components/CAFormPage.moneyTrail.test.tsx
git commit -m "feat: trace liquidation rows and cash advances"
```

## Task 11: Integrate Reimbursements and close the five-module trail

**Files:**
- Modify: `src/components/ReimbursementDashboard.tsx`
- Create: `src/components/ReimbursementDashboard.moneyTrail.test.tsx`

- [ ] **Step 1: Write failing reimbursement integration tests**

Assert `reimbursement:<id>` reveals and highlights the exact claim, including a paid claim that is not in the default pending list by loading it through trace context or a focused-record endpoint. Assert exact liquidation and CA chips, View trail, Clear focus, Back to source, and view-only permission behavior.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/ReimbursementDashboard.moneyTrail.test.tsx`

- [ ] **Step 3: Implement focused reimbursement loading**

Do not broaden the default pending dashboard query. When focused, merge only the authorized exact claim returned by the trace API into the displayed rows, mark it as historical when paid, and keep existing payment actions restricted to pending records.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/ReimbursementDashboard.moneyTrail.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/ReimbursementDashboard.tsx src/components/ReimbursementDashboard.moneyTrail.test.tsx
git commit -m "feat: trace reimbursement claims"
```

## Task 12: Document, verify, and review the complete feature

**Files:**
- Modify: `docs/agent/TASK_LOG.md`
- Modify: `docs/agent/PROJECT_STATE.md`
- Modify: `docs/agent/KNOWN_ISSUES.md` only if a recurring limitation or fragile workaround is discovered
- Modify: `docs/product/PRD.md` only if the approved Money Trail behavior is not already captured by the design spec and project requirements

- [ ] **Step 1: Run all focused server tests**

```bash
node --test server/financeTrace.test.js server/financeTraceRouter.test.js server/financeTracePackaging.test.js
```

- [ ] **Step 2: Run all focused frontend tests**

```bash
npm test -- --watchAll=false --runTestsByPath \
  src/utils/financeTraceFocus.test.ts \
  src/services/financeTraceService.test.ts \
  src/hooks/useFinanceRowFocus.test.tsx \
  src/components/finance/MoneyTrailDrawer.test.tsx \
  src/components/finance/FinanceTraceResolveDialog.test.tsx \
  src/components/InvestmentTrackerPage.moneyTrail.test.tsx \
  src/components/ExpenseMonitoring.moneyTrail.test.tsx \
  src/components/OverheadExpensesPage.moneyTrail.test.tsx \
  src/components/LiquidationFormPage.moneyTrail.test.tsx \
  src/components/CAFormPage.moneyTrail.test.tsx \
  src/components/ReimbursementDashboard.moneyTrail.test.tsx
```

- [ ] **Step 3: Run project checks**

```bash
node --test server/*.test.js
npx tsc --noEmit
npm test -- --watchAll=false
npm run build
node scripts/prepare-functions.js
```

No `typecheck` package script exists, so `npx tsc --noEmit` is the explicit type check. Do not run resolver write tests against production Firestore; use fake adapters or the Firestore emulator only.

- [ ] **Step 4: Perform browser QA against local/emulator data**

Verify keyboard and pointer flows across all five modules:

1. Open a confirmed investment→expense→liquidation→CA chain from each end.
2. Confirm the target page changes its filters/page and highlights the exact row.
3. Use Back to source and Clear focus.
4. Review a near-amount/near-date possible match and verify it stays unlinked.
5. As admin, confirm a safe investment↔expense pair.
6. Exercise each three-way resolver path on seeded emulator records.
7. Verify a liquidation/PO/payroll-synced expense refuses deletion and opens its source.
8. As a non-admin, verify all trails remain viewable but resolver controls are absent.
9. Inspect `finance_trace_audit` in the emulator for one record per successful action and none for rejected actions.

- [ ] **Step 5: Update project memory**

Record the branch, API, focus-token contract, resolver protections, audit collection, checks run, and any remaining limitations in `TASK_LOG.md` and `PROJECT_STATE.md`.

- [ ] **Step 6: Self-review the diff against the design specification**

Compare `git diff origin/main...HEAD` with `docs/superpowers/specs/2026-08-14-finance-money-trail-design.md`. Specifically inspect authorization, visibility parity, Firestore transaction boundaries, protected-source deletion checks, exact-focus behavior, accessibility, and removal of stale links after every resolver action.

- [ ] **Step 7: Commit documentation and verification results**

```bash
git add docs/agent/TASK_LOG.md docs/agent/PROJECT_STATE.md docs/agent/KNOWN_ISSUES.md docs/product/PRD.md
git commit -m "docs: record finance money trail delivery"
```

## Coverage Review

- The plan covers the five approved record types and both project/overhead expense collections.
- Confirmed relations and deterministic possible matches remain separate; no inferred relation is auto-linked.
- Only investment↔expense candidates can be directly confirmed in v1; source-owned liquidation/CA/reimbursement candidates open their source.
- The three resolver outcomes cover keep-both, retain-investment/delete-expense, and retain-expense/delete-investment.
- Protected synced expenses cannot be deleted from the trace UI.
- Every successful mutation is admin-authorized, revalidated in a transaction, and append-only audited.
- Exact focus includes filter/page reveal, scroll, persistent highlight, Back to source, and Clear focus.
- Paid reimbursements and hidden-by-default records are still discoverable through authorized focused trace reads.
- Server, frontend, deployment packaging, typecheck, build, automated tests, emulator writes, browser navigation, and accessibility are explicitly verified.
