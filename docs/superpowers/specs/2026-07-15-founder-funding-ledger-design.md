# Founder Funding Ledger Design

## Purpose

Replace the mixed-purpose Investment Tracker workflow with a Founder Funding Ledger that records how IOCT was funded without creating duplicate company expenses. The ledger is initially available to the recognized founders TJC and RJR.

## Problem

The existing Investment Tracker can be linked to manually-created project expenses while liquidation submission separately creates `liquidation_sync` project expenses. A single founder-paid transaction can therefore appear as more than one company expense. LQ-001 demonstrates this: its two Cebu Pacific rows are represented by both canonical liquidation expenses and separate manual expenses linked to Investment Tracker entries.

## Accounting Model

Each transaction records two separate facts:

1. **Expense evidence**: a liquidation or normal expense entry records the receipt, project, date, category, and exact amount once.
2. **Funding treatment**: the Founder Funding Ledger records whether the company owes the founder, has received permanent capital, or has settled a prior obligation.

Founder-paid business expenses default to a **Founder Advance**. The company may later repay the founder or convert some or all of the outstanding balance to a **Capital Contribution**. A founder may approve their own capitalization, but the system records the actor, date, source advance, and required resolution/reference.

Founder cash or bank deposits create a funding-ledger record directly. They do not create a liquidation; the company records an expense only when it later spends the money.

## Scope

### In scope

- New `founder_funding_ledger` Firestore collection.
- Founder recognition settings seeded with TJC and RJR.
- Founder-paid liquidation treatment, linked to a liquidation rather than an expense ID.
- Founder advances, capital contributions, repayments, capitalization, voiding, and audit history.
- Founder Funding Ledger UI, replacing Investment Tracker navigation for new work.
- Read-only legacy Investment Tracker during transition.
- Review-first reconciliation for legacy duplicates, beginning with LQ-001.
- Removal of the duplicate-prone “Register as Expense” flow from the legacy tracker.
- Server-side validation, role checks, and exact-centavo financial values.

### Out of scope

- Full general ledger, chart of accounts, period closing, or financial statements.
- Automatic accounting/tax determination.
- Automatic modification of historical records.
- Ownership percentage calculations based on funding amounts.
- Changing the organization’s legal share structure.

## Data Contract

`founder_funding_ledger` records use this model:

```ts
type FounderFundingEntry = {
  transactionDate: string; // YYYY-MM-DD
  founderId: string;
  founderName: string;
  entryType: 'founder_advance' | 'capital_contribution' | 'repayment' | 'capitalization' | 'opening_balance_adjustment';
  amountCentavos: number;
  currency: 'PHP';
  description: string;
  source: {
    kind: 'liquidation' | 'cash_deposit' | 'legacy_reconciliation';
    liquidationId?: string;
    liquidationFormNo?: string;
    depositReference?: string;
  };
  settlesEntryId?: string;
  resolutionReference?: string;
  proofRefs: string[];
  status: 'posted' | 'voided';
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
};
```

`company_settings/founder_funding` stores the recognized founder user IDs and optional capital target. Financial rules must read this setting rather than hardcoding names.

## Business Rules

- A founder-paid, no-cash-advance liquidation creates the normal liquidation project-expense rows once and one linked `founder_advance` by default.
- A normal employee’s no-cash-advance liquidation follows the existing reimbursement workflow, not the Founder Funding Ledger.
- A liquidation may have only one active founder-funding entry until partial allocation support is deliberately designed.
- Repayment and capitalization are append-only settlement entries linked through `settlesEntryId`; neither can exceed the remaining advance balance.
- Capitalization requires a non-empty resolution/reference and is permitted when the founder approves their own action.
- Voiding preserves the original financial record and requires a reason; hard deletion is not permitted for ledger records.
- The ledger never creates, edits, or duplicates an expense row.
- New financial APIs are server-authoritative and superadmin-restricted for voiding and reconciliation application.

## UI

The new **Founder Funding Ledger** provides:

- KPI cards for Founder Advances Outstanding, Capital Contributions, Repaid This Period, and Needs Review.
- Tabs for All Activity, Founder Advances, Capital Contributions, and Reconciliation.
- Filters for founder, date range, entry type, source type, and status.
- A direct “Record Founder Deposit” action.
- Source links from ledger entries to their liquidation or proof record.
- Repay and Convert to Capital actions that show the remaining balance before confirmation.

For no-cash-advance liquidations filed by recognized founders, the form displays “Personally paid by founder” and defaults to “Company owes founder.” “Treat as capital contribution” requires explicit confirmation and a resolution/reference.

## Legacy Reconciliation

Legacy data is never changed automatically. The system produces a review queue with likely matches based on date, amount tolerance, description similarity, founder, and project.

For approved LQ-001 reconciliation:

- Keep liquidation-generated project expenses as canonical, using their exact receipt amounts.
- Void or archive matching manual project-expense duplicates with a reconciliation reason; do not hard-delete them.
- Detach/archive corresponding legacy Investment Tracker entries.
- Create an opening Founder Advance linked to LQ-001 only after confirming it was not reimbursed or already formally capitalized.
- Use an explicit mapping review for historic project ID variants such as `5` and `project_5`.

## Rollout

1. Deliver the data contract, server read APIs, and read-only ledger/reconciliation UI.
2. Deliver the new founder-paid liquidation workflow and remove duplicate-prone Investment Tracker expense registration.
3. Deliver repayment, capitalization, voiding, and audit actions.
4. Review legacy reconciliation output with founders and apply only approved actions.
5. Retire legacy tracker write paths after balance and audit signoff.

## Security and Evidence

The feature records internal financial treatment only; it does not decide legal or tax treatment. Capitalization references and source proof are stored as evidence for the company’s accounting and corporate records. The project’s planned Firebase Auth migration remains important because current custom authentication is not suitable for broadly exposed financial workflows.

## Verification

- Unit tests cover centavo conversion, balance calculations, settlement limits, founder recognition, and duplicate prevention.
- API tests cover authorization, required references, source links, and audit/void behavior.
- UI tests cover founder and non-founder liquidation paths plus ledger settlement workflows.
- A dry-run reconciliation report validates LQ-001 without production mutation.
- Production rollout begins only after a Firestore backup and reconciliation signoff.
