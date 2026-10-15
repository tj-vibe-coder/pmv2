# ADR-0005: Fixed physical item references on liquidation lines

Date: 2026-10-15. Status: implementation accepted; targeted LQ016 production numbering freeze and authorized date correction verified. Hosted code release remains pending.

## Problem and decision

Dates and display positions are not physical references. LQ26-016-KKS's printed Item7 is row ID `row-1788328095900-5ya141bw24t`, stored at array position4. Its authorized date correction from2026-08-10 to2026-06-29 must not change Item7 into Item1 or shift original Items1–6. Turning off sorting would also be wrong because stored order differs from the physical print order.

Store an additive server-owned `physical_item_numbering` on each liquidation: `{version:1, basis, numbers:{[rowId]:positiveInteger}, nextItemNo, initializedBy, initializedAt}`. Keep permanent row IDs and receipt rowId/OneDrive identities. A legacy baseline is the currently saved ascending-date print order, with stable equal dates and undated rows last. It is computed from SAVED rows before incoming changes. New forms allocate references as items are created. Numbers are unique per form, never reassigned to another row ID, and retained in the ledger after deletion; new references advance the high-water mark and gaps are allowed.

Display/export transport rows expose `physicalItemNo`. This is validated against the ledger and stripped from saved `rows_json`; the ledger is authoritative. Screen/mobile item cells, receipt captions, phone QR labels, PDF/XLSX numbers and reimbursement line labels show this reference, independent of date/amount sorting. New direct-attachment filenames may include Item7; phone uploads whose destination row is not allocated yet keep form/date/details/unique names and acquire their permanent item reference on the desktop row link. Cloud files are never renamed merely because a date changes or a table sorts.

## Reads, persistence and validation

GET `/api/liquidations/:id` previews normalized rows and the ledger, plus `physical_item_numbering_persisted`. GET does not write. Invalid IDs/numbering fail closed through `physical_item_numbering_error`. Legacy read previews alone are not a durable freeze: targeted initialization must precede an external/direct date change. Do not correct dates through the old deployed app while it lacks this contract.

POST `/api/liquidations/:id/item-numbering/initialize` requires an active owner/admin, excludes scanner/tax/viewer scope, and takes `{expectedContentHash, expectedItemNumbers}`. The full mapping must exactly match the saved baseline and saved receipt-review content hash. A transaction rejects stale data, differing printed references and pending revisions. It stores ONLY numbering metadata and an `item_numbering_history` actor/time/basis/mapping-hash event. Retrying the same verified mapping is idempotent. It does not alter dates, raw row order, receipts, amounts, status, reimbursement/payment data or `updated_at`; the saved-content receipt-review hash remains unchanged because initialization preserves the already printed references.

Normal create/draft/revision paths also validate hints and derive a legacy baseline from saved rows before corrections. Draft/proposal/application paths reserve numbers transactionally before accounting side effects, preserving concurrent reservations and rejecting reused/stale hints. Reservations may survive an abandoned, rejected or later failing edit; this intentionally leaves gaps instead of recycling physical references. Pending revisions retain number hints and approval revalidates them. An unrelated client cannot overwrite the ledger through request fields. Reservation history records actor/time/hash. Existing financial reconciliation/audit/payment mechanisms remain in their current routes; this change does not make the overall older financial edit workflow transactional.

Receipt-review fingerprints continue to cover saved content; numbering-only initialization/reservation does not fabricate or invalidate a review. Actual saved date/receipt changes retain the existing review-required behavior. No financial/status writes occur from reads or the initializer.

## Migration and LQ016 coordination

Migration004 is an offline, explicit-ID planner (`--snapshot`, `--manifest`, `--liquidation-id`). It never connects to Firestore and rejects `--apply`/`--rollback`; reviewed manifests are applied only through the guarded per-form endpoint. No broad production backfill. Preserve source PDF/evidence and pending BIR2307 recovery. Resolve conflicting/pending revisions or invalid permanent IDs before initializing.

For LQ016, Tab3 verified all27 row-ID references against Finance's pre-correction manifest, initialized with the saved-content hash, read back Item7/all27 numbers, then applied the separately authorized June29 date correction through the guarded corrected API. The linked expense/reimbursement timestamp effects and one normal revision audit were inventoried. The production freeze/date correction are complete; hosted UI code release remains separate. No broad backfill or deployment is implied by this ADR.
