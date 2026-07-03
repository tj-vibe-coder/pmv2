# Expense Monitoring Unification — Recreated Plan / Roadmap

> Recreated 2026-07-01 after a context-limit interruption. This is the plan going
> forward — nothing below is implemented yet except where marked "already true today".

## 1. The idea (RJ's proposal)

Right now there are **two separate pages/collections** that are almost the same thing:

| | `ExpenseMonitoring.tsx` | `OverheadExpensesPage.tsx` |
|---|---|---|
| Firestore collection | `project_expenses` | `overhead_expenses` |
| Required field | `projectId` + `projectName` | — |
| Categories | `PROJECT_EXPENSE_CATEGORIES` (COGS, 5xxx) | `OVERHEAD_CATEGORIES` (OPEX, 6xxx) |
| Everything else (description, amount, date, category, receiptRef, supplier, invoiceNo, invoiceType, vat, tin, deductible, deductibleReason, fundingSource, sourceType, createdAt/By) | identical shape | identical shape |

Confirmed by reading `server.js` (project-expense POST ~line 1150, overhead POST ~line 4420): the two doc
shapes only diverge on the project-linkage fields (`projectId`, `projectName`, `sourcePoId`,
`sourceLiquidationId`, `sourceCaId`) and the category list. RJ's read is correct — having two pages
that are 95% the same table is the source of the "current one is a bit confusing" feeling.

RJ's ask: **don't maintain two pages** — show one expense table, and use a filter/tag
(Overhead vs. a specific project) to slice it, instead of forcing the user to know which
page a given expense lives on.

## 2. Decision: unify at the UI/query layer, NOT the Firestore layer

Two ways to do this:

- **(A) Merge collections** — move everything into one `expenses` collection with an
  optional `projectId`. Cleanest long-term, but touches every place that currently hardcodes
  `project_expenses` / `overhead_expenses`: the P&L endpoint (`GET /api/finance/pnl`), the
  payroll→overhead sync (`POST /api/payroll/runs/:id/approve`), `syncExpenseFundingInvestment`,
  the liquidation promote-to-project flow, and the PO/CA sync jobs. High blast radius, needs a
  data migration, and isn't reversible without care.
- **(B) Keep both collections, merge only in the frontend** — `ExpenseMonitoring` fetches
  *both* `GET /api/project-expenses` and `GET /api/overhead-expenses` (both endpoints already
  exist and work today), tags each row with its origin, and renders one table with a
  scope filter. No backend schema change, no migration, no risk to the P&L/payroll code that
  already depends on the two collection names.

**Going with (B).** It gets RJ the "one table, one filter" experience immediately, and (A) can
still happen later if it's ever worth the migration risk — nothing in (B) forecloses it.

## 3. What "one table" looks like

- Table stays the row-shape it has today (`ExpenseMonitoring.tsx` lines ~1181-1235: Date,
  Project, Project No., PO Number, Category, Description, Amount, Source, Actions) — this is
  the "exact same table" RJ referred to.
- Replace the `Project` cell's meaning slightly: for a project-expense row, show
  `project_no — project_name` (as today); for an overhead row, show an **"Overhead"** chip/tag
  instead of a project name. `PO Number` naturally reads "—" for overhead rows since they never
  have one.
- Add a **scope filter** next to the existing Year/Project selects:
  `All | Overhead | <specific project>` — the existing `selectedProjectId` dropdown already
  lists projects; add an `'overhead'` sentinel value to that same dropdown rather than a new
  control, so there's one filter, not two.
- Add-expense dialog gets a top-level **Project vs. Overhead** toggle (defaults to whatever
  scope is currently filtered). Category list swaps between `PROJECT_EXPENSE_CATEGORIES` and
  `OVERHEAD_CATEGORIES` based on the toggle. On save, POST to `/api/project-expenses` or
  `/api/overhead-expenses` depending on the toggle — both already accept the same body shape.
- Edit / Delete / attach-receipt-later actions must dispatch to the correct endpoint based on
  the row's tagged scope (`project_expenses` rows → `/api/project-expenses/:id`, `overhead`
  rows → `/api/overhead-expenses/:id`).
- `OverheadExpensesPage.tsx` becomes a thin redirect into `ExpenseMonitoring` with the scope
  filter pre-set to `overhead` — same pattern already used for `CalcsheetClients.tsx` redirecting
  to `/sales/clients`. Keeps the route alive for any bookmarks/links without maintaining a
  second copy of the table UI.

## 4. Overhead ↔ Project "transfer" (the 5th pending task)

Since the two Firestore collections stay separate under plan (B), a "move this expense from
Overhead to Project X" action is a real operation, not just a UI re-tag. Needs a small backend
endpoint per direction (or one parameterized endpoint):

- `POST /api/overhead-expenses/:id/convert-to-project` — body: `{ projectId, projectName, category? }`.
  Reads the overhead doc, writes an equivalent doc into `project_expenses` (carrying over
  `receiptRef`, `supplier`, `invoiceNo`, `invoiceType`, `vat`, `tin`, `deductible*`,
  `fundingSource`), deletes the original, and re-runs `syncExpenseFundingInvestment` for both
  the deleted and created doc so any linked `investments` row stays correct. Category needs
  remapping if it doesn't exist in `PROJECT_EXPENSE_CATEGORIES` (default to `'Others'`).
- Mirror endpoint `POST /api/project-expenses/:id/convert-to-overhead` — drops `projectId`/
  `projectName`/PO/liquidation/CA linkage fields (those don't mean anything on an overhead row),
  same fundingSource re-sync.
- Frontend: a "Move to project…" / "Move to overhead…" row action in the unified table, using
  the existing project picker component.

## 5. Sequencing

There's already uncommitted work in progress on `rj/dev` (desktop multi-scan batch, per-receipt
project picker in `ScanBatch.tsx`/`ExpenseMonitoring.tsx`/`OverheadExpensesPage.tsx`/
`InvestmentTrackerPage.tsx`) — that's a different, nearly-finished feature. Recommend finishing
and verifying that first so the unification work below isn't built on a moving target.

1. **Fix ExpenseMonitoring single-scan receipt not saving** (existing bug, independent of
   everything else — do first so it's not masked by the merge).
2. **Unify the table** (§3): fetch-both, scope tag/column, scope filter, scope toggle in
   Add-Expense dialog, scope-aware edit/delete.
3. **Draggable/closeable receipt viewer pane** — build once, against the unified table, instead
   of once per page.
4. **Edit action for existing expense rows** — same, scope-aware PATCH per §3.
5. **Attach receipt later to existing expense rows** — same, scope-aware PATCH.
6. **Overhead ↔ project transfer** (§4) — depends on the unified table existing so there's a
   single place to trigger "move" from.
7. **Redirect `OverheadExpensesPage` → `ExpenseMonitoring`** (§3, last bullet) once the unified
   table covers everything the standalone overhead page did (deductible tracking, BIR
   substantiation accordion, etc. — verify feature parity before cutting over).

## 6. Explicitly not doing (yet)

- No Firestore collection merge (plan (A)) — revisit only if maintaining two collections
  becomes a real pain point (e.g., if the P&L/payroll-sync code needs a rewrite anyway).
- No change to how the P&L endpoint or payroll→overhead sync write to `overhead_expenses` —
  they keep writing directly to the collection; the unified table just needs to render their
  rows correctly (e.g., payroll-sync rows have `createdBy` values like `system` and may want to
  be read-only in the table).
