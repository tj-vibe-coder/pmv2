# Invoice evidence migration 001

This release runs without a backfill: invoice `scan_file` is exposed by a read-through adapter. No production database operation or deployment has been authorized.

`001-invoice-evidence.js` consumes an explicitly obtained, locally protected snapshot:

```json
{"capturedAt":"2026-10-14T00:00:00.000Z","invoices":[{"id":"confirmed-id","scan_file":{"filename":"original.pdf","onedrive_web_url":"https://example.com/original.pdf"}}]}
```

Include full invoice records, not just the abbreviated example. Optional `reimbursements`, `reimbursement_payments`, `cash_advances` and `investments` arrays capture baseline fingerprints. Protect snapshots/manifests as finance data and keep them out of git. Source snapshots are not fetched automatically.

```sh
node scripts/migrations/001-invoice-evidence.js --snapshot /protected/snapshot.json --manifest /protected/001-preview.json
```

Dry run uses no credentials and opens no database connection. Review the manifest's source invoices, before/after records, manual-review skips and financial fingerprints. Original scans stay in place; links are supporting packs only. Different scans sharing a URL produce one metadata document. Missing/invalid URLs are left for manual review.

Apply/rerun and compensating rollback require a local emulator and the unchanged reviewed snapshot/manifest:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrations/001-invoice-evidence.js --snapshot /protected/snapshot.json --manifest /protected/001-preview.json --apply
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrations/001-invoice-evidence.js --snapshot /protected/snapshot.json --manifest /protected/001-preview.json --rollback
```

The emulator project is `demo-finance-evidence`. Load the source snapshot into its `invoices` collection first. Apply refuses changed source records or pre-existing differing evidence. Rollback removes only unchanged metadata covered by this manifest. It transactionally checks document references and retains shared documents when any link outside the removable manifest links still references them, including inactive history markers; the CLI reports those retained IDs. This also supports overlapping batches: the last reference must be removed before shared metadata is deleted. History and original OneDrive bytes remain. Repeat apply/rollback is safe. Do not apply against an already populated evidence registry without review: a current API document differing from the migration proposal correctly fails its precondition. Batches are limited to 100 source invoices and 180 evidence writes to bound transaction size.

Automated transaction fixtures cover dry run, apply/rerun, rollback and failed preconditions in `server/financeEvidence.test.js`. A real Firestore emulator run requires Java and Firebase CLI; neither is installed in the current environment.

For browser review without production services, build the frontend and run:

```sh
node server/test-support/financeEvidencePreview.js
```

Open `http://localhost:3300`, sign in with any fixture-only username/password, and open Sales EWT / BIR 2307. Evidence mutations are in memory; other mutations and real OneDrive uploads are disabled. This does not validate real OneDrive availability or deployed API capability.


# Liquidation receipt review migration 002

`002-liquidation-receipt-review.js` defines an additive write-on-first-review collection; there is no historical backfill. Absent records read as **Not reviewed**. The versioned manifest always has zero writes; even apply/rollback only validates that unchanged manifest and opens no database connection. Existing attestations/history are never synthesized or deleted.

```sh
node scripts/migrations/002-liquidation-receipt-review.js --snapshot /protected/liquidations.json --manifest /protected/002-preview.json
node scripts/migrations/002-liquidation-receipt-review.js --snapshot /protected/liquidations.json --manifest /protected/002-preview.json --apply
```

Snapshot format: `{ "liquidations": [{ "id": "confirmed-id", "status": "submitted" }] }`. Only a deliberate authenticated review through the app creates reviewer/date metadata. ADR-0003 documents permissions and form fingerprinting. The safe preview server also includes `LQ26-FIXTURE`; open Liquidation Form, load that submitted fixture and record/review/withdraw in memory. Restart the fixture server after code changes.


# Physical receipt workflow migration 003

`003-physical-receipt-workflow.js --snapshot /protected/snapshot.json --manifest /protected/003-preview.json` creates a dry-run manifest with zero historical writes. Snapshot requires `liquidations[]` and `reimbursements[]`. Apply/rollback validates the unchanged manifest and is a no-op without database access. It never infers physical submission/RJ review from old paid records. New submission/confirmation and urgent exception metadata are populated only by explicit app actions.

The in-memory preview now has two accounts for hands-on testing: sign in as `STAFF` (form owner) or `RJR` (reviewer), any password; `OTHER` is an admin who cannot perform RJ review. `LQ26-FIXTURE` is already paid but awaiting receipts; `LQ26-UNPAID` supports normal/urgent payment probes through actual reimbursement handlers, with in-memory transactions and mocked funding sync. Real OneDrive and other mutations are disabled. Restart the fixture server after implementation changes.
