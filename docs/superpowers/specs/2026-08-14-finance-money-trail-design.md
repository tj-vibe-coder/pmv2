# Finance Money Trail Design

**Date:** 2026-08-14
**Status:** Approved for implementation planning
**Branch:** `feat/finance-money-trail`, based on `origin/main` (`32d1f49`)
**Scope:** Investment Tracker, Expense Monitoring, Liquidation, Cash Advance, and Reimbursement

## Problem

The finance modules store meaningful relationships, but the UI exposes them inconsistently. Investment Tracker links navigate only to a destination page; they do not select the correct scope, project, filters, pagination, or row. Liquidation-synced expenses contain source IDs, but users cannot easily follow the relationship in either direction. Cash advances and reimbursements extend the same money trail without a single place to inspect it.

Users therefore have to search manually and may mistake expected mirrors for duplicates. Administrators also need a safe way to correct incorrect relationships, such as retaining an investment as capital while deleting a redundant manually entered expense.

## Goals

- Show one consistent, understandable money trail across all five finance modules.
- Distinguish confirmed stored relationships from inferred possible matches.
- Let users inspect the complete trail without leaving the current page.
- Let users jump to an exact destination record that is automatically selected, scrolled into view, and persistently highlighted.
- Let admins and superadmins confirm matches and reconcile incorrect investment-expense relationships through guarded atomic actions.
- Preserve existing Firestore records and link fields as the source of truth.
- Isolate the work from AI Assist by implementing it from `origin/main` on `feat/finance-money-trail`.

## Non-goals

- No AI or LLM-based matching.
- No automatic confirmation of inferred matches.
- No new relationship graph collection or relationship migration.
- No silent accounting changes.
- No direct deletion of liquidation-, purchase-order-, or payroll-synced expenses from the resolver.
- No redesign of the underlying finance modules beyond traceability and precise navigation.

## Design Principles

1. Explicit stored IDs always outrank inference.
2. A linked representation in another module is not a duplicate by itself.
3. Possible matches must be visibly labeled `Needs review` and must explain their evidence.
4. Destructive changes require admin authority, a preview, a reconciliation note, and an atomic server transaction.
5. Destination URLs identify exact records, not merely pages.
6. Existing source-owned rows must be corrected at their source.

## Architecture

The server owns relationship resolution. A dedicated trace API reads existing documents, follows allowlisted relationship fields, and returns a normalized graph to every frontend surface. The frontend renders a shared Money Trail drawer and uses a shared focus-link contract for precise navigation.

No new relationship source of truth is introduced. Existing fields remain authoritative, including:

- Investments: `sourceExpenseId`, `sourceCollection`, `sourceExpenseProjectId`, `linkedExpenseId`, `linkedExpenseCollection`, `linkedExpenseProjectId`
- Expenses: `fundingSource.linkedInvestmentId`, `sourceLiquidationId`, `sourceLiquidationRowId`, `sourceCaId`, `sourcePoId`, and `sourceRunId`
- Liquidations: document ID, row IDs in `rows_json`, `ca_id`, reimbursement fields, and the first-class reimbursement document keyed by liquidation ID
- Cash advances and reimbursements: their current document IDs, funding-source fields, and liquidation references

The canonical server implementation remains `server.js`; the repository's existing server-to-Functions synchronization workflow must keep `functions/server.js` aligned.

## Normalized Trace Contract

### Read endpoint

`GET /api/finance-trace/:recordType/:recordId`

Allowed `recordType` values:

- `investment`
- `project_expense`
- `overhead_expense`
- `liquidation`
- `cash_advance`
- `reimbursement`

For a liquidation row, the optional query parameter `rowId` identifies the exact row.

The response shape is:

```ts
type FinanceTraceNodeType =
  | 'investment'
  | 'expense'
  | 'liquidation'
  | 'cash_advance'
  | 'reimbursement';

interface FinanceTraceNode {
  key: string;
  type: FinanceTraceNodeType;
  id: string;
  rowId?: string;
  collection: string;
  label: string;
  secondaryLabel?: string;
  date?: string;
  amount?: number;
  status?: string;
  projectId?: string | null;
  projectName?: string | null;
  sourceType?: string | null;
  focusUrl: string;
}

interface FinanceTraceEdge {
  from: string;
  to: string;
  relation:
    | 'funded_by'
    | 'recorded_as_expense'
    | 'liquidated_by'
    | 'funded_by_cash_advance'
    | 'reimbursed_by';
  confirmed: true;
}

interface FinanceTraceCandidate {
  node: FinanceTraceNode;
  proposedRelation: FinanceTraceEdge['relation'];
  score: number;
  evidence: string[];
  needsReview: true;
}

interface FinanceTraceResponse {
  success: true;
  originKey: string;
  nodes: FinanceTraceNode[];
  edges: FinanceTraceEdge[];
  candidates: FinanceTraceCandidate[];
  permissions: {
    canConfirm: boolean;
    canResolve: boolean;
  };
}
```

The endpoint returns only fields needed for reconciliation and navigation. It does not expose unrelated employee, customer, payroll, or receipt content.

### Resolution endpoint

`POST /api/finance-trace/resolve`

Allowed actions:

```ts
type FinanceTraceResolveAction =
  | 'confirm_match'
  | 'keep_both_separate'
  | 'keep_investment_delete_expense'
  | 'keep_expense_delete_investment';
```

The request includes the action, investment ID, expense collection, expense ID, required reconciliation note, and a preview version derived from the current link state. `keep_investment_delete_expense` may include an optional target investment category such as `Capital Contribution`.

The server rejects unknown actions, collections, or record types before accessing Firestore.

In the first release, `confirm_match` is writable only for an investment-to-expense candidate. It writes the same reciprocal investment/expense fields used by the existing manual linking flow. Possible expense-to-liquidation, liquidation-to-CA, and liquidation-to-reimbursement matches remain review-only because those relations are owned by their source workflows; their action is `Open source record`, not `Confirm match`.

## Confirmed Relationship Resolution

The resolver follows explicit IDs in both directions and verifies reciprocity:

1. Investment to expense through `sourceExpenseId/sourceCollection` or `linkedExpenseId/linkedExpenseCollection`.
2. Expense back to investment through `fundingSource.linkedInvestmentId` or the investment collection's source/backlink query.
3. Project expense to liquidation through `sourceLiquidationId` and `sourceLiquidationRowId`.
4. Liquidation to project expense through equality queries on those two source fields.
5. Liquidation to cash advance through `ca_id`; cash advance to liquidation through the current `ca_id` query.
6. Liquidation to reimbursement through the reimbursement document keyed by liquidation ID and current liquidation reimbursement fields.
7. Investment to cash advance or reimbursement through the existing linked/source expense collection fields.

Broken or one-sided relationships appear as a warning node state. They are not silently repaired by a read request.

## Possible-Match Rules

Possible matches are deterministic and bounded. A candidate requires at least two independent evidence signals from this list:

- Transaction dates are within 14 calendar days.
- Absolute amount difference is no greater than ₱500.
- Normalized descriptions have meaningful token overlap.
- Project IDs match.
- Investor or funding-source investor matches.
- Supplier and invoice identifiers match.
- Receipt identifiers match.
- Liquidation, cash-advance, reimbursement, purchase-order, or payroll source references match.

Rules:

- When both records have valid dates, a difference greater than 14 calendar days rejects the candidate rather than merely reducing its score.
- Every candidate must have at least one semantic identity signal: two or more meaningful normalized description/vendor words, or an exact supplier, invoice, receipt, or source-reference match.
- Amount, date, project, and investor matches are supporting evidence only. Amount plus date—or amount/date plus project/investor—cannot propose a match when descriptions and strong references are unrelated.
- An exact invoice, receipt, or source reference is strong evidence but does not auto-confirm a link.
- Candidates already confirmed to a different record are excluded.
- Explicit confirmed links always appear before candidates.
- Results are capped at five candidates per unresolved relation and sorted by score.
- Each candidate returns human-readable evidence such as `Same project`, `Amount differs by ₱39`, or `Dates are 2 days apart`.
- Each candidate states whether it is confirmable. Only investment-to-expense candidates are confirmable in this release; source-owned relation candidates are navigational review aids.
- Matching never writes data or changes totals.

## Hybrid User Interface

### Inline relationship status

Relevant rows in all five modules show compact chips in trail order, for example:

`Investment → Expense → LQ26-003-RPP → Reimbursement pending`

Confirmed nodes use solid semantic colors. Possible matches use a dashed `Needs review` treatment. Missing relations use a neutral `No linked record` state.

Each row offers:

- `View trail` to open the shared drawer without leaving the page.
- A context-aware `Jump to …` action for the next confirmed node.

### Shared Money Trail drawer

The drawer displays:

- Confirmed nodes in transaction order.
- Date, amount, project, status, form or CA number, and collection context.
- Confirmed relationship labels.
- Possible matches in a separate `Needs review` section with evidence.
- `Open exact record` for every node.
- Admin-only `Confirm match` and `Resolve relationship` actions.

The drawer is a reusable component backed solely by the trace API. It does not independently join collections.

### Focus URL contract

Every destination page consumes a standardized `focus` query parameter:

- `?focus=investment:<id>`
- `?focus=expense:project_expenses:<id>`
- `?focus=expense:overhead_expenses:<id>`
- `?focus=liquidation:<id>:<rowId>`
- `?focus=cash_advance:<id>`
- `?focus=reimbursement:<id>`

On arrival, the destination:

1. Parses and validates the allowlisted focus token.
2. Fetches or locates the authoritative target record.
3. Selects the correct workspace scope, project, year, month or quarter, sort, and pagination needed to display it.
4. Loads the exact liquidation, CA, or reimbursement record when applicable.
5. Scrolls the row into view after rendering.
6. Applies a persistent, accessible highlight until the user chooses `Clear focus`.
7. Shows `Back to source` when navigation state identifies an origin URL.

The highlight must not rely on color alone. It includes a visible `Exact linked record` label and an accessible row description.

## Admin Reconciliation Workflow

Only `admin` and `superadmin` roles may confirm, unlink, replace, or delete linked records. Other authorized finance users may view trails and navigate.

Before enabling confirmation, the client requests a fresh trace response. The dialog shows both records, current links, the selected action, totals affected, records deleted, records retained, funding-source changes, and backup recoverability. A reconciliation note is required.

### Keep both, separate them

- Keep the investment document.
- Keep the expense document.
- Clear the investment's expense-link fields.
- Change the expense funding source to `corporate_bank` so existing synchronization cannot recreate an investment link.
- Remove `linkedInvestmentId` and investor-specific funding fields from the expense.

### Keep investment, delete expense

- Require the expense to be user-managed (`manual` or `receipt_scan`) and not source-owned.
- Delete the expense.
- Clear the retained investment's link fields.
- Optionally reclassify the investment, including to `Capital Contribution`.
- Show that the expense total decreases and the investment total remains.

### Keep expense, delete investment

- Keep the expense.
- Change its funding source to `corporate_bank` before deleting the investment so synchronization cannot recreate it.
- Delete the investment.
- Show that the investment total decreases and the expense total remains.

### Protected source records

The resolver refuses deletion when the expense has `sourceType` of `liquidation_sync`, `po_sync`, or `payroll_sync`, or has a protected deterministic source ID. The response includes the exact focus URL for the liquidation, purchase order, or payroll source that must be corrected instead.

### Transaction guards

Every write action:

- Re-checks admin or superadmin authorization.
- Re-reads all affected documents inside a Firestore transaction.
- Verifies amounts, collections, stored link IDs, and source ownership against the preview version.
- Returns `409 Conflict` if a relationship changed after preview.
- Applies all link, funding-source, category, and deletion changes atomically.
- Leaves all records unchanged on failure.

## Audit Trail

Every successful confirmation or resolution writes an append-only `finance_trace_audit` document in the same transaction. This collection is an audit log, not a relationship source of truth.

Each audit entry contains:

- Action
- Required reconciliation note
- Actor user ID and display name
- Server timestamp
- Affected collection and document IDs
- Compact before and after relationship snapshots
- Amount impact for expense and investment totals
- Protected-source decision where applicable

The audit snapshot excludes receipt images, credentials, authentication tokens, and unrelated personal data.

## Error Handling

- `400 Bad Request`: malformed focus token, action, collection, IDs, or missing reconciliation note.
- `401 Unauthorized`: no authenticated user.
- `403 Forbidden`: user lacks permission to view the finance record or perform an admin action.
- `404 Not Found`: origin or affected record no longer exists.
- `409 Conflict`: stored relationships changed after preview or conflict with another confirmed relationship.
- `422 Unprocessable Entity`: requested destructive action targets a protected source-owned expense; response includes its source focus URL.
- `500 Internal Server Error`: unexpected read or transaction failure; no partial writes are allowed.

The drawer preserves successfully loaded nodes when optional candidate matching fails and displays a non-blocking warning. A failed destination lookup shows `Linked record no longer exists` and offers a return action.

## Accessibility

- Trail chips and edges have text labels; meaning never relies only on color.
- The drawer has an accessible title, logical focus order, Escape handling, and returns focus to its trigger.
- Focused rows expose `aria-current` or an equivalent accessible exact-record label.
- Scroll-to-row respects reduced-motion preferences.
- Resolver dialogs announce destructive impact and validation errors.
- Buttons have descriptive names such as `Open expense Medical for Manpower` rather than generic `Open` labels.

## Testing Strategy

### Server unit tests

- Resolve every explicit relationship direction.
- Detect broken and one-sided links without mutating data.
- Score and rank possible matches using fixed fixtures.
- Exclude candidates already linked elsewhere.
- Enforce the two-signal threshold, 14-day window, ₱500 tolerance, and five-candidate cap.
- Build correct focus URLs for every node type.

### Emulator-backed endpoint and transaction tests

- Enforce view and admin permissions.
- Confirm a possible match atomically.
- Exercise all three resolution actions.
- Verify funding-source changes prevent investment recreation.
- Block protected source-owned expenses with `422` and a source focus URL.
- Return `409` for stale previews.
- Verify no partial writes after forced transaction failure.
- Verify one audit entry per successful action and none for failed actions.

All automated write tests target the Firestore emulator only.

### Frontend tests

- Parse and reject focus tokens.
- Render confirmed, missing, broken, and possible relationships distinctly.
- Hide admin actions from non-admin users.
- Open and close the drawer with correct focus restoration.
- Auto-select filters and pagination for exact expense rows.
- Auto-load and highlight exact liquidation rows, cash advances, reimbursements, and investments.
- Preserve highlight until `Clear focus`.
- Display stale and protected-source errors.

### Browser verification

- Investment Tracker to exact project expense and back.
- Expense to exact liquidation row and back.
- Liquidation to cash advance or reimbursement and back.
- Confirm a possible match as an admin in the emulator.
- Exercise all three resolver previews and outcomes in the emulator.
- Verify mobile drawer behavior, keyboard navigation, reduced motion, and persistent highlighting.

### Repository checks

- Relevant Jest and Node test suites.
- TypeScript typecheck.
- Production build.
- Server-to-Functions synchronization check.
- Firestore emulator smoke test.

## Documentation and Memory Updates

Implementation must update:

- `docs/agent/TASK_LOG.md`
- `docs/agent/PROJECT_STATE.md`
- `docs/agent/KNOWN_ISSUES.md` only if a recurring link or focus limitation remains
- `docs/API.md` for trace endpoints and contracts
- An ADR only if implementation changes the approved source-of-truth or audit architecture

## Rollout

1. Implement and verify entirely on `feat/finance-money-trail` from `origin/main`.
2. Use emulator fixtures for all write-path verification.
3. Run read-only production trace queries only if explicitly requested for validation.
4. Do not deploy or merge without explicit user instruction.
5. Preserve existing records and behavior for users who do not open the Money Trail.
