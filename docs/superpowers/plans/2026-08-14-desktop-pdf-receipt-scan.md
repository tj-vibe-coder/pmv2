# Desktop PDF Receipt Scan Implementation Plan

**Goal:** Support one-receipt-per-PDF scanning in Expense Monitoring's single and batch desktop flows.

**Architecture:** Add a small shared receipt-file policy module, then branch at the two picker boundaries. Images retain their crop pipeline; PDFs bypass crop, use Gemini's native PDF input, and retain their extension when uploaded.

**Tech stack:** React 19, TypeScript, Material UI, Jest/React Testing Library, existing Express receipt parser and OneDrive upload APIs.

## Task 1: Add receipt-file policies with tests

**Files:**
- Create: `src/utils/receipts/receiptFile.ts`
- Create: `src/utils/receipts/receiptFile.test.ts`

- [ ] Write failing tests for MIME/extension PDF detection, supported-file validation, the 15 MB PDF limit, parse MIME selection, croppability, and upload extensions.
- [ ] Run the focused test and confirm it fails because the helper does not exist.
- [ ] Implement the smallest helper module that makes the tests pass.
- [ ] Re-run the focused test.

## Task 2: Enable PDF in Scan Multiple

**Files:**
- Modify: `src/components/ScanBatch.tsx`
- Create: `src/components/ScanBatch.pdf.test.tsx`

- [ ] Write a failing component test selecting a PDF and expecting direct parsing with `application/pdf` and no crop screen.
- [ ] Update the picker to accept images and PDFs and clarify its desktop label.
- [ ] Validate selections and retain valid items when others are rejected.
- [ ] Advance crop only through image items; start immediately for PDF-only batches.
- [ ] Parse PDFs with `application/pdf` and preserve `.pdf` upload filenames.
- [ ] Re-run focused tests.

## Task 3: Enable PDF in Scan One

**Files:**
- Modify: `src/components/ExpenseMonitoring.tsx`

- [ ] Update the picker to accept PDFs.
- [ ] Extract the common parsed-receipt form update and duplicate-check sequence.
- [ ] Add the PDF path that validates, bypasses crop, parses natively, and retains the PDF as the pending receipt.
- [ ] Preserve `.pdf` when uploading the pending receipt.
- [ ] Confirm the existing image path still uses crop and JPEG.

## Task 4: Verify and document

**Files:**
- Modify: `docs/agent/TASK_LOG.md`
- Modify: `docs/agent/PROJECT_STATE.md`
- Modify only if a recurring issue is found: `docs/agent/KNOWN_ISSUES.md`

- [ ] Run focused PDF tests.
- [ ] Run the complete frontend test suite.
- [ ] Run TypeScript typecheck and production build.
- [ ] Smoke-test both desktop entry points with a single-page PDF in the local browser.
- [ ] Update project memory with the completed behavior and verification results.
- [ ] Review the final diff for scope, secrets, and unrelated changes.
- [ ] Commit the feature on `feat/finance-money-trail`.
