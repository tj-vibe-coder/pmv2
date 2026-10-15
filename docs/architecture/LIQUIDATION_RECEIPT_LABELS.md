# Liquidation physical items and receipt names

Updated2026-10-15. Superseded mutable row-position labels with fixed physical references under ADR-0005. Local implementation; no broad backfill, historical cloud rename or deployment.

Opening a form can still default to ascending date. Every screen/mobile row, PDF/XLSX item cell, receipt caption, phone scan label and reimbursement line displays its permanent `physicalItemNo`, derived from the server-owned `physical_item_numbering` ledger. Item7 stays Item7 if its corrected date puts it first in the view. Receipt links continue to use the same row IDs. Deleted numbers remain reserved; new rows use the next available high-water number.

A legacy form's first numbering baseline comes from its saved pre-correction chronology, never its stored array position or incoming corrected date. GET previews this without writing. A guarded per-form initialize action persists the verified mapping and metadata audit before external correction. Normal write paths also pin the saved baseline and validate/reserve references transactionally. See ADR-0005 and migration004 for full contract and limits.

New upload names use form, stable Item number where already allocated, row date, Particulars/supplier, a unique token and one extension. Phone scans whose destination item has not yet been allocated use form/date/details/unique names; linkage on the desktop establishes the physical reference. Names capture details at upload time. Subsequent sorting/date edits do not rename existing files or change file/row identity. Saved raw row order and existing receipt links are preserved.
