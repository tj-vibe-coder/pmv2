# ADR-0002: Invoice evidence separate from financial movements

Date: 2026-10-14. Status: accepted for the authorized Phases 0–2 implementation; production rollout pending.

## Decision

Use `finance_documents` for immutable file identity (OneDrive drive/item pair when known, otherwise normalized HTTPS URL) and `finance_document_links` for deterministic invoice/document/type relationships. References lacking a drive ID remain explicitly URL-identified; do not guess a drive or merge identities by filename. Evidence writes never write invoices, payment ledgers, cash advances or investments. Legacy `scan_file` remains a read-through supporting-pack adapter; no inferred classification or original-file deletion.

Only invoice entities are enabled in this release. Approved users with an existing invoice-readable role can read invoice evidence. Admin/superadmin can attach, classify, unlink and review. Tax filers can attach/review BIR2307 evidence only; ordinary users/viewers are read-only. No waiver/blocking-disbursement policy is introduced. These conservative permissions reuse finance role boundaries and can be narrowed by RJ before deployment.

Keep file identity immutable. Link metadata corrections use a revision precondition; type changes are explicit unlink/relink actions. Unlink requires a reason and retains history. Each successful mutation appends an immutable event in an evidence-only history collection within the same transaction. Retried identical link creation is a no-op; concurrent additions use separate deterministic records. Upload filenames include unique IDs to prevent overwriting historical OneDrive content. The UI retains successfully uploaded metadata for retry if API linking fails.

Certificate printed values, period, ATC, description, observed calculation and review flags belong to the shared document. Evidence allocations belong to invoice links, in integer centavos. Certificate editing supplies a complete allocation list and uses document revision checks. Allocation sums may be below printed WHT during capture but cannot exceed it; matched requires exact reconciliation to both printed WHT and each positively allocated invoice's booked WHT. Retired zero allocations remain for audit and do not constrain matching or counterparty checks. Discrepancy/resolved allow recorded differences; resolved requires a note. All revisions preserve prior values. Linking or review never changes received/expected history or recognizes WHT again.

## Migration and rollout

Migration `001-invoice-evidence` is an offline, versioned snapshot-to-manifest planner, dry-run by default. It only proposes supporting-pack links for legacy scans. Apply and compensating rollback are emulator-only with manifest/precondition checks. Rollback retains shared document metadata referenced by links outside its removable manifest set, checking references transactionally before deleting; inactive history links also retain metadata. Financial baseline fingerprints, before/after records and file identities accompany the manifest. Production migration/deployment needs a separate authorized operation; runtime adapters work without backfill. No historical payment reconstruction in this release.

## Consequences

A shared slip has one document identity and several evidence links. Cash received, deposit and clearance dates stay in legacy mode until Phase 3. Packs and received history can remain available even when a standalone 2307 link is missing. No automated tax-rate/treatment decisions, OCR or new storage/dependencies are introduced. Existing external OneDrive permissions continue to govern HTTPS file access; API metadata access is role-checked, and there is no new public file proxy.

Refresh explicitly discards open reference/certificate drafts after a successful reload, then requires reopening from current evidence. It never silently rebases a stale draft onto a newer revision.
