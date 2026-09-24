# Desktop PDF Receipt Scan Design

## Goal

Allow desktop users to select receipt PDFs through both **Scan One** and **Scan Multiple** in Expense Monitoring. The existing Gemini receipt parser already accepts `application/pdf`; this change connects the browser file-selection, parsing, crop flow, and OneDrive upload paths to that capability.

## Approved scope

- One selected PDF represents one receipt and one expense.
- The current use case is a single-page receipt PDF.
- PDFs are sent directly to Gemini and do not enter the image cropper.
- Multiple selected PDFs each become a separate batch item.
- Mixed image/PDF batches are supported: images retain the existing crop step, while PDFs skip it.
- Multi-page PDFs are accepted as one receipt but are not split into one item per page.
- No new dependency, API endpoint, database field, or migration is required.

## File handling

The file pickers will accept the existing image formats plus PDF. A shared receipt-file utility will provide one source of truth for:

- detecting PDFs by MIME type or `.pdf` extension;
- validating supported receipt files;
- enforcing a 15 MB PDF limit before base64 conversion;
- choosing the parser MIME type; and
- preserving the `.pdf` extension when uploading to OneDrive.

Images continue to be cropped and encoded as JPEG. PDFs remain unchanged for parsing and upload.

## Scan One flow

When the selected file is an image, the existing auto-detect, crop, parse, duplicate check, and form-prefill flow remains unchanged. When it is a PDF, Expense Monitoring validates the file, bypasses crop detection, calls Gemini with `application/pdf`, applies the same parsed fields and duplicate checks, and stores the original PDF as the pending receipt attachment.

The shared parsed-result application logic will be extracted inside the component so the image and PDF paths produce the same form state and notifications.

## Scan Multiple flow

Each valid selected file becomes a batch item. If the batch contains images, the crop UI advances only through those image items. PDF items are skipped during crop and included when parsing starts. If the batch contains only PDFs, parsing starts immediately.

For each item, the parser receives `application/pdf` for an uncropped PDF and `image/jpeg` for a cropped image. Upload names use `.pdf` for PDFs and `.jpg` for images.

## Error handling

- Unsupported files are rejected before processing with a visible message.
- PDFs over 15 MB are rejected with a visible size-limit message.
- In a multiple-file selection, invalid items are excluded while valid items continue; the user is told how many were skipped.
- Existing parse and upload failures remain reviewable and do not silently create a successful receipt attachment.

## Verification

- Unit tests cover PDF detection, validation, parser MIME selection, and upload filenames.
- A component test covers a PDF-only Scan Multiple selection bypassing crop and invoking Gemini as `application/pdf`.
- Existing frontend tests, TypeScript, and production build must remain green.
- Browser smoke verifies that the desktop pickers expose PDF support and a single-page PDF reaches review/prefill without a crop dialog.
