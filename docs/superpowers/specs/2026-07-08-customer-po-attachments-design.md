# Customer PO attachments on won Calcsheet projects — Design

**Date**: 2026-07-08
**Status**: Approved by TJ (brainstorming session)
**Scope**: Calcsheet sales projects (`/sales/calcsheet/projects/:id`)

## Problem

When a customer issues a Purchase Order, the project is marked Won — but there is
nowhere in the app to attach the PO document to the project. The PO ends up only in
email or loose OneDrive folders, with no PO number/date recorded against the project.

## Decisions (from brainstorming)

- **Location**: Calcsheet sales projects, on `CalcsheetProjectDetail`.
- **Captured per PO**: the file (required) + PO number and PO date (optional fields).
- **Cardinality**: multiple POs per project (revisions, split POs, change orders).
- **Availability**: the Customer PO section shows on **won** projects only, and the
  attach dialog opens automatically (skippable) right after a project is flipped to Won.
- **Storage**: OneDrive file + metadata array on the project doc (Approach A below).

## Approach

**Chosen — A: OneDrive file + `customerPOs` array on the project document.**
Upload the PO file through the existing server-side app-only OneDrive proxy
(`/api/onedrive/*` — no user sign-in required) into the project's execution folder,
under a `Customer PO` subfolder. Persist metadata as an array on the calcsheet
project doc via the existing `PUT /api/calcsheet/projects/:id` (through
`quotationStore.updateProject`). No new server endpoints, no new collections.

Rejected:
- **B: new `calcsheet_po_attachments` collection** — 3 new endpoints + a collection
  for data only viewed per-project today. Revisit if a cross-project PO register is needed.
- **C: reuse `project_attachments`** — mixes PM-project and calcsheet-project ID
  schemes in one collection.

## Data model

`src/types/Quotation.ts` — add to `Project`:

```ts
export interface CustomerPO {
  id: ID;                 // uuid
  poNumber?: string;
  poDate?: string;        // ISO date (yyyy-mm-dd)
  fileName: string;
  driveItemId: string;    // OneDrive item id of the uploaded file
  webUrl?: string;        // OneDrive web link
  fileSize?: number;      // bytes
  uploadedBy?: string;    // username of uploader
  uploadedAt: string;     // ISO datetime
}

// on Project:
customerPOs?: CustomerPO[];
```

The server's calcsheet project PUT already persists arbitrary fields; no server change.

## Upload flow (client, `CalcsheetProjectDetail`)

1. User picks a file (accept: pdf/images/office docs; no hard restriction) and
   optionally fills PO number + PO date in the attach dialog.
2. Resolve target folder, self-healing like the existing folder flows:
   - If `project.executionFolderId` missing → `ensureExecutionFolder(...)` and patch
     the project with the new folder refs (mirrors `createProposalFolderManually`).
   - `getOrCreateChildFolderById(token, driveId, executionFolderId, 'Customer PO')`.
3. `uploadFileToFolderById(...)` with a collision-safe filename. The upload proxy
   does a plain Graph PUT to `:/content`, which **overwrites** an existing same-named
   file — so the client must de-duplicate first: list the `Customer PO` folder via
   `/api/onedrive/children`, and if the name is taken append ` (2)`, ` (3)`, … before
   the extension (keep the original name when free).
4. Append the `CustomerPO` entry to `project.customerPOs` and
   `updateProject(project.id, { customerPOs })`.
5. Failure at any step: show the error in the dialog, save nothing (metadata is only
   written after a successful upload). OneDrive not configured → section shows a
   disabled state with an explanatory caption.

## UI

**Customer PO card** on `CalcsheetProjectDetail`, rendered only when
`project.status === 'won'`, placed with the existing OneDrive folder row/card:

- List of attached POs: `PO number · PO date · filename (link → webUrl, new tab) ·
  size · uploadedBy` with a delete icon per row.
- Delete: confirm dialog → remove the entry from `customerPOs` (project save) and
  best-effort `deleteDriveItem` on the file (failure to delete the drive item does
  not block removing the entry; log a console warning).
- "Attach PO" button → attach dialog (file picker + PO number + PO date + Attach /
  Cancel; busy state while uploading).

**Win prompt**: after `confirmWon()` succeeds (status saved as won, main-project
sync and folder promotion kicked off), open the same attach dialog automatically
with a visible "Skip for now" action. Skipping does nothing; the card remains on
the page.

**Projects list (`CalcsheetProjects`)**: on won rows with `customerPOs?.length`,
show a small `PO` chip (tooltip: "N customer PO(s) attached"). No new fetches —
data rides on the project docs already loaded.

## Error handling

- Upload/proxy errors surface inside the dialog (`Alert`), dialog stays open for retry.
- Execution-folder ensure failure: same error path — the user can retry; nothing saved.
- Stale execution folder (deleted out-of-band): `ensureExecutionFolder`'s
  lookup-first behavior recreates/relinks; consistent with existing self-healing.
- Deleting the OneDrive file out-of-band leaves a dead `webUrl`; acceptable (same as
  existing folder links, which self-heal only on folder open — no extra handling).

## Testing / verification

- `npx tsc --noEmit` clean.
- On TJ's machine (no Firestore creds): verify per repo `verify` skill — client +
  mock API on 3001; mock `/api/calcsheet/*` and `/api/onedrive/{child-folder,upload-by-id,health}`
  to walk the flow: mark a project won → prompt appears → attach with PO number/date →
  card lists the entry → delete removes it → list page shows the PO chip.
- Real-OneDrive verification happens on RJ's machine / production after merge.

## Out of scope

- Cross-project PO register / finance cross-links (Approach B territory).
- Surfacing the PO on the linked main PM project.
- PO amount capture / PO-vs-quotation comparison.
