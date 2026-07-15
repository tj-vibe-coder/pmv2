# ADR-0002: Separate Founder Funding from Expense Evidence

## Status

Accepted — 2026-07-15

## Context

The legacy Investment Tracker mixed capital/funding records with expense registration. A founder-paid receipt could therefore appear as both an Investment Tracker-linked manual expense and a liquidation-generated project expense. LQ-001 exposed this duplication for Cebu Pacific airfare.

## Decision

Use liquidation/project-expense records as the single source of expense evidence and an append-only `founder_funding_ledger` as the source of financing treatment.

- Founder-paid, no-CA liquidations default to a Founder Advance.
- A founder may elect direct capital treatment with a recorded resolution/reference.
- Repayments and capitalizations are append-only settlements linked to the source advance and transactionally limited to its remaining balance.
- TJC and RJR are configured by immutable user ID through `company_settings/founder_funding`; names are display values only.
- A single superadmin approval is sufficient, including self-approval, with actor/date/reference audit fields.
- New liquidation expense rows use deterministic IDs and are committed atomically with the liquidation and funding entry.
- The legacy Investment Tracker remains readable but all write/sync paths are retired.
- Historical reconciliation is review-only until an independently hardened, explicitly approved mutation workflow exists.

## Consequences

Funding no longer inflates expenses. The company can distinguish amounts owed to founders from permanent capital and later settlements. Existing historical duplicates are not silently changed; founders/accounting must review evidence before any correction. The feature remains dependent on the project’s custom authentication risk until Firebase Auth migration.
