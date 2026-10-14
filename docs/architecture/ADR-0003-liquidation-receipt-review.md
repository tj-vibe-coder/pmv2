# ADR-0003: Manual liquidation receipt review

Date: 2026-10-14. Status: accepted for local implementation; deployment pending.

Use the term **Receipts reviewed**, with **Reviewed by** and **Review date**. This is a human attestation that every listed expense was checked against its original/scanned receipt for completeness and matching particulars, date and amount. It does not approve a payment, establish tax deductibility, or substitute for the signed paper form.

Approved admins/superadmins record their own authenticated identity, actual review date (today or earlier), optional notes and explicit confirmation. Identity and recording timestamp are server-owned; backdating the actual review date does not backdate the recording event. Reviews may cover original paper receipts without requiring digital uploads. Ordinary users can read review status on their own forms; tax-filer/scanner scopes cannot access this operational endpoint.

Store the latest attestation in `liquidation_receipt_reviews/{liquidationId}` with a versioned SHA-256 fingerprint of saved form headers, rows, totals and receipt references. Keep immutable before/after events in its `history` subcollection. Review writes only touch this collection. Transactions check the displayed content fingerprint and expected review revision, preventing stale review or concurrent overwrites. Only submitted forms without pending edits can be reviewed. Withdrawal requires a reason and keeps previous reviewer/date/history.

A review is current only while the saved content matches its fingerprint. Applied form/receipt-link corrections show **Review required** without deleting the prior review. Pending edits do not change the saved fingerprint but block a new attestation until resolved. Payment/reimbursement status changes do not invalidate receipt review. Fingerprints track stored content/references, not external OneDrive bytes changed in place; the human remains responsible for the contents inspected.

Schema migration `002-liquidation-receipt-review` is a versioned offline dry-run inspector. No historical attestations are synthesized and no historical document updates are needed; missing reviews read as **Not reviewed**. Apply/rollback are explicit no-ops with an unchanged empty-write manifest. The collection is populated only by deliberate authenticated review actions. No deployment/production writes are authorized by this implementation.

## Superseding workflow extension — ADR-0004

RJ clarified that staff may record physical handover and RJ confirms/reviews it before closure. The original generic-admin review capability is superseded by RJ-only review tied to the current physical submission version. Historical generic reviews remain history and do not satisfy closure. Normal payment requires RJ review; explicit urgent-payment reasons permit earlier payout while workflow stays open. See ADR-0004 for the implemented rules.
