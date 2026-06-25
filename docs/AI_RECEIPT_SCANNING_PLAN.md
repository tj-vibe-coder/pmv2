# AI Receipt Scanning — Implementation Plan v2

**Feature**: Phone-photo receipt → Gemini Flash parse → auto-categorize → assign to Project or Overhead → save to Firestore + OneDrive

**Date**: 2026-06-25  
**Author**: Design review — based on codebase audit of IOCT pmv2

---

## 1. What XpenseTrackerWeb Teaches Us

Investigation found XpenseTrackerWeb **is** IOCT pmv2 — same repo, no separate parser implementation. There is no working Gemini code to copy from anywhere in the project. The existing `docs/AI_RECEIPT_SCANNING_PLAN.md` (v1) had the right ideas but the API details, prompt, and interaction with real server endpoints needed refinement after reading the actual code.

**What we DO have as foundation** (all verified against real source):

| Asset | Location | Lines | Status |
|---|---|---|---|
| `convertHeicToJpeg()` | `LiquidationFormPage.tsx` | 111–125 | Works for HEIC→JPEG |
| `normalizeImageOrientation()` | `LiquidationFormPage.tsx` | 128–146 | Works for EXIF baking |
| `generateThumbnail()` | `LiquidationFormPage.tsx` | 91–108 | Works (120px thumbnail) |
| `ensureFolder()` | `onedriveFolderService.ts` | 215–264 | Idempotent folder create |
| `uploadFileToFolderById()` | `onedriveFolderService.ts` | 275–301 | File upload to folder by ID |
| `resolveCorporateDriveId()` | `onedriveFolderService.ts` | 35–70 | Cached drive resolution |
| `attachReceipts()` | `LiquidationFormPage.tsx` | 360–390 | Full receipt-upload pipeline |
| `ensureReceiptsFolder()` | `LiquidationFormPage.tsx` | 345–358 | Creates `Liquidation Receipts/{year}/{form_no}/` |
| `ReceiptAttachment` interface | `LiquidationFormPage.tsx` | 71–81 | Firestore receipt ref shape |
| `normalizeExpenseCategory()` | `financeCategories.ts` | ~20 | Maps aliases to canonical categories |

---

## 2. Files to Touch — Exact Map

### 2.1 `server.js` — New endpoints (insert before the `/*splat` at end of file)

| Endpoint | Purpose | Auth | Body |
|---|---|---|---|
| `POST /api/receipts/parse` | Proxy image to Gemini Flash, return structured JSON | `getCurrentUser(req)` | `{ image: "<base64>" }` |
| `POST /api/overhead-expenses` | Create overhead expense (no projectId) | `getCurrentUser(req)` | `{ description, amount, date, category, receiptRef? }` |
| `GET /api/overhead-expenses` | List overhead expenses (with optional `?year=` filter) | `getCurrentUser(req)` | — |
| `DELETE /api/overhead-expenses/:id` | Delete overhead expense | `getCurrentUser(req)` (own or admin) | — |

Gemini helper functions to add (local functions or a small module at top of `server.js`):
- `const GEMINI_MODEL = 'gemini-2.0-flash-lite'` 
- `const GEMINI_API_KEY = process.env.GEMINI_API_KEY`
- `async function callGeminiReceiptParser(apiKey, base64Image)` — uses vanilla `fetch`, no SDK
- `const RECEIPT_PROMPT = ...` — structured prompt (see §3 below)

**Insertion point**: After the last finance endpoint (investment tracker routes) and before the `express.static('build')` + `/*splat` catch-all. Currently the last API route is around line 2090 and the catch-all is around line 2243. Insert the 4 new routes + helper code between them.

### 2.2 `firestore.indexes.json` — Add overhead_expenses index

```json
{
  "collectionGroup": "overhead_expenses",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "createdBy", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

Also deploy the 3 pending `project_expenses` indexes from Phase 0.

### 2.3 `LiquidationFormPage.tsx` — Add per-row AI scan

Changes:
- Add state: `const [scanDialogRowId, setScanDialogRowId] = useState<string | null>(null)`
- Add state: `const [scanResult, setScanResult] = useState<ParsedReceipt | null>(null)`
- In the per-row rendering (around line 1200, the `rows.map` loop), add an icon button alongside the existing "Attach receipt" button: "Scan receipt with AI" → opens `ReceiptScanDialog`
- On scan result: auto-set `category`, `particulars`, `amount` for that row
- Reuse existing `attachReceipts()` to upload the scanned photo
- The existing `LIQUIDATION_CATEGORIES` constant (line 49) is the target category enum

### 2.4 `CAFormPage.tsx` — Add receipt attachment + AI scan to breakdown rows

Changes (Phase 3):
- Add `ReceiptAttachment[]` state per breakdown row (CAs currently have no receipt attachment)
- Add file input + camera capture per breakdown row
- Add "Scan receipt with AI" button
- Upload receipts to `Cash Advance Receipts/{year}/{ca_no}/` via `onedriveReceiptService.ts`
- `CA_CATEGORIES` (line ~41) is the target enum

### 2.5 `src/services/onedriveFolderService.ts` — No changes needed

The existing `ensureFolder()` and `uploadFileToFolderById()` from lines 215–301 handle all OneDrive operations needed. The new `onedriveReceiptService.ts` will wrap them.

### 2.6 `src/data/financeCategories.ts` — Add category mapping

Add `GEMINI_CATEGORY_MAP: Record<string, string>` for mapping Gemini's raw category guess to the canonical `EXPENSE_CATEGORIES` / `LIQUIDATION_CATEGORIES` lists. Examples:
```
'fuel' → 'Gas', 'petrol' → 'Gas', 'food' → 'Others',
'hotel' → 'Accommodation', 'lodging' → 'Accommodation',
'office supplies' → 'Materials', 'hardware' → 'Materials',
'tools' → 'Tools / Direct', 'taxi' → 'Transportation',
'airfare' → 'Airfare', 'flight' → 'Airfare'
```

### 2.7 `src/App.tsx` — Add overhead expenses route (Phase 4)

```tsx
<Route path="/finance/overhead-expenses" element={<OverheadExpensesPage />} />
```

### 2.8 `src/components/finance/FinanceNavList.tsx` — Add nav link (Phase 4)

Add "Overhead Expenses" under the expense monitoring / investment tracker sidebar group.

---

## 3. Files to Create — Exact Spec

### 3.1 `src/utils/receiptParser.ts`

Exports:
- `interface ParsedReceipt` — `{ vendor, date, amount, tax, currency, category, lineItems[], receiptNumber?, confidence }`
- `async function parseReceipt(imageBlob: Blob): Promise<ParsedReceipt | null>` — 1) compress via `compressImage`, 2) POST to `/api/receipts/parse`, 3) return parsed result
- `async function compressImage(blob: Blob, maxDimension = 1200, quality = 0.8): Promise<Blob>` — canvas resize + JPEG compression

Compression pipeline:
1. If HEIC/HEIF → call `convertHeicToJpeg` (moved to shared utility, or imported from LiquidationFormPage)
2. `createImageBitmap(blob, { imageOrientation: 'from-image' })` to bake EXIF
3. Canvas `drawImage()` scaled to `maxDimension` on longest side, maintaining aspect ratio
4. `canvas.toBlob('image/jpeg', quality)` → return Blob

### 3.2 `src/components/ReceiptScanDialog.tsx`

Props:
- `open: boolean`
- `onClose: () => void`
- `onResult: (parsed: ParsedReceipt, imageBlob: Blob) => void`
- `targetProjectId?: string` — optional, if already known

UI flow:
1. Camera capture (`input type="file" accept="image/*" capture="environment"`) or gallery picker
2. Image preview (reuse EXIF normalization)
3. "Scan" button → POST to `/api/receipts/parse` with loading spinner
4. Result card showing editable fields: vendor, date, amount, tax, category (dropdown), line items (collapsible table)
5. Confidence indicator badge (green/yellow/red)
6. Assignment toggle: Radio button "Project" vs "Overhead"
   - If Project → project dropdown (`ProjectOption[]` from existing code)
   - If Overhead → no project selection needed
7. "Apply" button → calls `onResult` with parsed data + original compressed blob

### 3.3 `src/services/overheadExpenseService.ts`

Exports:
- `interface OverheadExpense` — `{ id?, description, amount, date, category, receiptRef?, sourceType?, createdAt?, createdBy? }`
- `fetchOverheadExpenses(filters?: { year?, category? }): Promise<OverheadExpense[]>`
- `createOverheadExpense(expense: Omit<OverheadExpense, 'id' | 'createdAt' | 'createdBy'>): Promise<OverheadExpense>`
- `deleteOverheadExpense(id: string): Promise<void>`

### 3.4 `src/services/onedriveReceiptService.ts`

Exports:
- `const OVERHEAD_ROOT = '00 Overhead Receipts'`
- `const CA_ROOT = 'Cash Advance Receipts'`
- `async function saveProjectReceipt(token, projectFolderId, imageBlob, expenseId, year?)` → `DriveItemRef`
  - Creates `{projectFolderId}/Receipts/{year}/EXP-{expenseId}.jpg`
  - Falls back to overhead folder if project has no OneDrive link
- `async function saveOverheadReceipt(token, imageBlob, expenseId, year?)` → `DriveItemRef`
  - Creates `OVERHEAD_ROOT/{year}/OH-{expenseId}.jpg`
- `async function saveCAReceipt(token, caNo, imageBlob, filename, year?)` → `DriveItemRef`
  - Creates `CA_ROOT/{year}/{caNo}/{filename}`

### 3.5 `src/components/OverheadExpensesPage.tsx` (Phase 4)

A page similar to `ExpenseMonitoring.tsx` but for the `overhead_expenses` collection:
- List overhead expenses with date/category/amount
- Delete capability
- Collapsible receipt thumbnail (fetched via `fetchDriveItemBlob` from onedriveFolderService)
- Filter by year and category

---

## 4. Gemini Flash Parser — Final Design

### Model: `gemini-2.0-flash-lite`

Why this model over alternatives:
- Native vision + JSON mode in same call — no multi-turn needed
- Fastest latency (~1-2s per receipt) 
- ~$0.075/1K images — negligible for <200 scans/month
- No SDK dependency — works with vanilla `fetch`

### API call (server-side, in server.js)

```js
async function callGeminiReceiptParser(apiKey, base64Image) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: RECEIPT_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
          ]
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
        }
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return JSON.parse(text);
}
```

### Prompt

```js
const RECEIPT_PROMPT = `You are a receipt parsing assistant. Given an image of a receipt or invoice, extract the following fields as a JSON object:

{
  "vendor": "Name of the merchant",
  "date": "Date on receipt in YYYY-MM-DD format, or null if not visible",
  "amount": "Total amount paid as a number",
  "currency": "Currency code (PHP, USD, etc.) or 'PHP' if not specified",
  "tax": "Tax amount as a number, or 0",
  "category": "Best-guess expense category from this list: 3rd Party Labor, Materials, Transportation, Accommodation, Entertainment, Airfare, Gas, Tools / Direct, Others",
  "lineItems": [
    { "description": "Item or service description", "quantity": 1, "unitPrice": 0, "total": 0 }
  ],
  "receiptNumber": "Receipt or invoice number, or null",
  "confidence": "high if most fields are clearly visible, medium if some are unclear, low if the image is poor"
}

Rules:
- amount must be a number (not a string)
- category must be one of the exact values listed above
- If the receipt is in PHP, set currency to "PHP"
- lineItems may be empty if individual items are not listed
- If the receipt is in a language other than English, translate vendor and descriptions to English
- Return ONLY the JSON object, no other text`;
```

### API key handling

- **Stored as Cloud Function env var**: `GEMINI_API_KEY` set via `firebase functions:config:set gemini.api_key="..."` (or Secret Manager)
- **Fallback for local dev**: `process.env.GEMINI_API_KEY` from a local `.env` file (gitignored)
- **Client NEVER sees the key** — it POSTs to `/api/receipts/parse`, the server proxies
- No `REACT_APP_GEMINI_API_KEY` anywhere

### Error handling (server)

| Scenario | HTTP Status | Response |
|---|---|---|
| Missing API key | 503 | `{ error: 'AI parsing not configured' }` |
| No image in body | 400 | `{ error: 'No image provided' }` |
| Unauthorized | 401 | `{ error: 'Unauthorized' }` |
| Gemini API timeout/5xx | 502 | `{ error: 'Parse service unavailable' }` |
| Empty Gemini response | 502 | `{ error: 'Parse returned empty result' }` |
| Invalid JSON from Gemini | 502 | `{ error: 'Parse returned invalid data' }` |
| Success | 200 | `{ success: true, vendor, date, amount, ... }` |

### Error handling (client)

| Scenario | UX |
|---|---|
| Low confidence | Editable result + yellow warning banner "Please verify these values" |
| API unavailable | Snackbar error → user fills manually (existing flow untouched) |
| Bad photo | "Could not read receipt. Try again with a clearer photo." |
| HEIC not convertible | Upload as-is (OneDrive handles HEIC) |

---

## 5. Image Capture & Compression

### Capture strategy

```html
<input type="file" accept="image/*, .heic, .heif" capture="environment" />
```

- `capture="environment"` → phone's rear camera
- Falls back to file picker on desktop or when camera permission denied
- Accepts HEIC/HEIF (iPhone default) — converted to JPEG client-side
- No mobile app needed — works in mobile Safari/Chrome

### Compression pipeline

```
Raw photo (2-8 MB HEIC/JPEG)
  → convertHeicToJpeg() if HEIC
  → createImageBitmap() with EXIF orientation
  → Canvas resize to max 1200px longest side
  → toBlob('image/jpeg', 0.8)
  → Compressed result (150-400 KB JPEG)
```

This reuses the exact pattern from `LiquidationFormPage.tsx` lines 91–146. The `convertHeicToJpeg` and `normalizeImageOrientation` functions should be extracted to a shared utility (`src/utils/imageUtils.ts`) to avoid duplication (currently duplicated in 3 files: LiquidationFormPage.tsx, ServiceReportTab.tsx, ProgressReportTab.tsx).

### Why 1200px / 0.8 quality

- Receipt OCR accuracy plateaus above 800px — 1200px is generous margin
- 0.8 JPEG compresses receipt text very well (high contrast, few colors)
- Keeps Gemini API latency low (smaller payload = faster response)
- Keeps OneDrive storage costs negligible

---

## 6. OneDrive Save Strategy

### 6.1 Project-expense receipts

**Path**: `{project proposal folder}/Receipts/{year}/EXP-{expense_id}.jpg`

Reuses the existing project's OneDrive folder linkage (`proposalFolderId` on the `calcsheet_projects` doc, or `executionFolderId` on the `projects` doc).

```js
// onedriveReceiptService.ts — saveProjectReceipt()
const driveId = await resolveCorporateDriveId(token);
// Create /Receipts subfolder under project folder
const receiptsFolder = await ensureFolder(token, driveId, projectFolderId, 'Receipts');
// Create /Receipts/{year} subfolder
const yearFolder = await ensureFolder(token, driveId, `${projectFolderId}/Receipts`, year);
// Upload
return uploadFileToFolderById(token, driveId, yearFolder.id, `EXP-${expenseId}.jpg`, imageBlob);
```

**Fallback**: If the project has no OneDrive folder linked (old project, not backfilled), fall back to the overhead receipts folder. Log a `[OneDrive]` warning.

### 6.2 Overhead receipts

**Path**: `00 Overhead Receipts/{year}/OH-{expense_id}.jpg`

New root folder at corporate OneDrive level, alongside `00 Proposal/` and `01 Execution/`.

### 6.3 CA receipts

**Path**: `Cash Advance Receipts/{year}/{ca_no}/{filename}.jpg`

New root folder. Per-year, per-CA subfolders.

### 6.4 Folder lifecycle

| Scenario | Behavior |
|---|---|
| Overhead root doesn't exist | Created automatically on first overhead receipt save |
| CA folder doesn't exist | Created automatically on first attachment to that CA |
| Year folder doesn't exist | Created automatically |
| Same year, same CA, new receipt | Uploaded into existing folder |
| OneDrive token missing | Skip save, log warning, show snackbar "Receipt not saved to OneDrive" |

---

## 7. Firestore Schema — Final

### 7.1 New collection: `overhead_expenses`

```
/overhead_expenses/{autoId}
{
  description: string,       // Free text from receipt
  amount: number,            // Parsed total
  date: string,              // YYYY-MM-DD (from receipt)
  category: string,          // Canonical EXPENSE_CATEGORIES value
  createdAt: string,         // ISO timestamp
  createdBy: string,         // user ID
  sourceType: string,        // 'receipt_scan' | 'manual'
  receiptRef?: {             // OneDrive metadata
    oneDriveId: string,
    webUrl: string,
    filename: string
  },
  receiptParsedData?: {      // Raw Gemini output (for audit trail)
    vendor: string,
    receiptNumber: string,
    tax: number,
    currency: string,
    lineItems: Array<{...}>,
    confidence: string
  },
  updatedAt: string
}
```

### 7.2 `project_expenses` — Add optional `receiptRef`

No migration needed — just add the field on new documents. Existing docs remain valid.

### 7.3 `liquidations` — No schema change needed

The existing `receipts_json` field already stores receipt attachment metadata including `oneDriveId` and `webUrl`.

### 7.4 `cash_advances` — No schema change needed

Receipts for CAs are stored separately. A new `receipts` sub-field could be added, or use a separate `ca_receipts` subcollection. For Phase 3, storing receipt refs in a new `caReceipts` array field on the CA doc is simplest.

---

## 8. Phasing Roadmap

### Phase 1: Foundation (server + parser)

**Duration**: First implementation session  
**Milestone**: Working receipt → parsed JSON pipeline (tested via curl/Thunder Client)

| # | Task | Exact File | Details |
|---|---|---|---|
| 1.1 | Add `POST /api/receipts/parse` | `server.js` | Insert before catch-all. Includes `callGeminiReceiptParser()`, `RECEIPT_PROMPT`, error handling |
| 1.2 | Create `receiptParser.ts` | `src/utils/receiptParser.ts` | `parseReceipt()`, `compressImage()`, `ParsedReceipt` interface |
| 1.3 | Extract shared image utils | `src/utils/imageUtils.ts` | Move `convertHeicToJpeg()` + `normalizeImageOrientation()` here (currently duplicated in 3 files) |
| 1.4 | Create `onedriveReceiptService.ts` | `src/services/onedriveReceiptService.ts` | `saveProjectReceipt()`, `saveOverheadReceipt()`, `saveCAReceipt()` |
| 1.5 | Add firestore indexes | `firestore.indexes.json` | overhead_expenses index + deploy pending project_expenses indexes |
| 1.6 | Update `LiquidationFormPage.tsx` imports | `LiquidationFormPage.tsx` | Re-point image helpers to new `imageUtils.ts` |

**Verify**: `curl -X POST https://api-2g62nnt3fa-uc.a.run.app/api/receipts/parse -H "Authorization: Bearer $(token)" -H "Content-Type: application/json" -d '{"image":"<base64-jpeg>"}'` → returns structured JSON.

### Phase 2: Receipt Scan Dialog + Liquidation Integration

**Duration**: Second session  
**Milestone**: Users can scan receipts inside the Liquidation form

| # | Task | Exact File | Details |
|---|---|---|---|
| 2.1 | Create `ReceiptScanDialog.tsx` | `src/components/ReceiptScanDialog.tsx` | Camera capture → preview → scan → editable result → apply |
| 2.2 | Add AI scan button per liquidation row | `LiquidationFormPage.tsx` | Icon button beside "Attach receipt", opens dialog, fills category/particulars/amount |
| 2.3 | Wire scanned photo to existing OneDrive upload | `LiquidationFormPage.tsx` | Reuse `attachReceipts()` for scanned photo |
| 2.4 | Add category mapping | `src/data/financeCategories.ts` | `GEMINI_CATEGORY_MAP` for normalizing Gemini output to canonical categories |

### Phase 3: Cash Advance Scans + Direct Expense Entry — DONE (2026-06-26)

**Duration**: One session  
**Milestone**: Scanning available on CA breakdown and Expense Monitoring "Add Expense" forms

| # | Task | Exact File | Status |
|---|---|---|---|
| 3.1 | Per-row "Scan receipt with AI" camera button on CA breakdown rows; prefills row category/amount/description; photo held in memory and best-effort uploaded to OneDrive `Cash Advance Receipts/{year}/{ca_no}/` AFTER CA create (never blocks creation) | `CAFormPage.tsx` | DONE |
| 3.2 | "Scan receipt" (camera) button in the Add Expense dialog; parses photo and prefills amount/date/description/category. Pure prefill, no OneDrive | `ExpenseMonitoring.tsx` | DONE |

**Implementation notes**: reused the existing Phase 2 infrastructure (`receiptParseService.ts`, `utils/receipts/imageCompress.ts`, OneDrive helpers in `onedriveFolderService.ts`) — no new services. CA breakdown rows gained a stable `_uid` (so async scans target the right row); parsed liquidation-taxonomy categories are mapped to the CA category set via `LIQ_TO_CA_CATEGORY`. tsc + `CI=true npm run build` both clean. Runtime E2E (live Gemini parse + OneDrive upload) still needs a manual in-app smoke test — not verifiable headlessly.

### Phase 4: Overhead Expenses (separate page & collection)

**Duration**: One session  
**Milestone**: Users can scan a receipt and assign it as overhead (no project link)

| # | Task | Exact File | Details |
|---|---|---|---|
| 4.1 | Add overhead toggle to ReceiptScanDialog | `ReceiptScanDialog.tsx` | Radio: Project (dropdown) vs Overhead |
| 4.2 | Create overhead expense server endpoints | `server.js` | `POST/GET/DELETE /api/overhead-expenses` |
| 4.3 | Create `overheadExpenseService.ts` | `src/services/overheadExpenseService.ts` | Client-side CRUD |
| 4.4 | Create `OverheadExpensesPage.tsx` | `src/components/OverheadExpensesPage.tsx` | List/delete overhead expenses with receipt thumbnails |
| 4.5 | Add route + nav link | `App.tsx` + `FinanceNavList.tsx` | `/finance/overhead-expenses` route |

### Phase 5: Polish & Hardening

**Duration**: One session  
**Milestone**: Edge cases handled, no regressions, build passes

| # | Task | Details |
|---|---|---|
| 5.1 | Low-confidence warning UI | Yellow banner when Gemini returns `confidence: 'low'` |
| 5.2 | Graceful offline fallback | If Gemini API is unreachable, existing manual-entry flow still works (no change needed) |
| 5.3 | Batch scan | Optional: scan multiple receipts sequentially with a "Scan Next" button |
| 5.4 | Type definitions | Create `src/types/Receipt.ts` with all receipt-related interfaces |
| 5.5 | Build verification | `npx tsc --noEmit` + `CI=true npm run build` — fix all type/lint errors |
| 5.6 | Update Aggregator | Update Finance Home KPI that sums all expenses to include overhead_expenses |

---

## 9. Risks & Open Questions

### Key decisions made

| Decision | Choice | Rationale |
|---|---|---|
| **API key location** | Server-side `GEMINI_API_KEY` env var on Cloud Function | Never expose key in SPA bundle. Client → `/api/receipts/parse` proxy. |
| **Model** | `gemini-2.0-flash-lite` | Fastest + cheapest with native vision + JSON mode. ~1-2s per receipt. If accuracy insufficient, upgrade to `gemini-2.5-flash` with same prompt. |
| **Image compression** | Client-side canvas, 1200px max, 0.8 JPEG quality | Proven pattern (already in LiquidationFormPage). Reduces API latency and OneDrive storage. `convertHeicToJpeg()` already handles iPhone HEIC. |
| **Overhead storage model** | Separate `overhead_expenses` collection (not null-projectId in project_expenses) | Cleaner query separation. No risk of accidentally including overhead in project-scoped reports. But requires updating Finance Home KPI to sum both collections. |
| **Receipt ref storage** | Embedded `receiptRef` sub-object in expense/overhead doc | No separate lookup needed. The receipt belongs to the expense. |
| **OneDrive overhead root** | `00 Overhead Receipts/` at corporate drive root | Consistent naming with existing `00 Proposal/` and `01 Execution/`. |
| **OneDrive project path** | `{projectFolder}/Receipts/{year}/EXP-{id}.jpg` | Keeps project receipts inside the project's OneDrive folder. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini hallucinates fields (wrong amount, wrong vendor) | Medium | User saves wrong data | All fields editable in dialog. User must explicitly click "Apply". Temperature 0.2 reduces hallucination. |
| Blurry/glare photo | High | Low confidence parse | Show confidence badge. Retake button. Manual edit always available. Existing `normalizeImageOrientation` helps with EXIF. |
| Gemini API becomes unreachable (timeout, quota) | Low | Feature unavailable | Graceful degradation: existing manual entry works unchanged. Server returns 503, client shows snackbar, user fills manually. |
| HEIC conversion on iOS fails | Medium | Photo not parseable | `heic2any` wraps in try/catch — falls back to original file. OneDrive stores HEIC natively; Gemini may or may not parse it (JPEG preferred). |
| `overhead_expenses` not included in Finance Home totals | Medium | YTD expense KPI underreported | After Phase 4, update the `/api/project-expenses/summary` endpoint (or create a new aggregated endpoint) to sum both collections. |
| New expense routes added after the catch-all | Low | `/*splat` returns HTML instead of JSON | Add routes BEFORE the `/*splat` catch-all at end of server.js. The catch-all should last forever. |

### Open questions for RJ

1. **Overhead: separate page or lumped into Expense Monitoring?** A separate `overhead_expenses` collection + page is cleaner but adds a new UI surface. Alternative: store overhead in `project_expenses` with `projectId: null` and add a filter toggle to ExpenseMonitoring. **I recommend the separate collection** — cleaner queries, no risk of project-scoped reports accidentally including overhead. But it means Phase 4 is longer.

2. **CA receipt attachment now or later?** The CA form has no receipt attachment today. Should scanning be added to CA breakdown rows in Phase 2 alongside Liquidation, or is Phase 3 acceptable? **I'd say Phase 3** — Liquidation is the primary scan use case. CAs rarely need per-item receipts.

3. **API key provisioning path**: The key needs to be set on the Cloud Function. Path A: `firebase functions:config:set gemini.api_key="..."` (simpler). Path B: Google Cloud Secret Manager (more secure, requires extra setup). **Path A is fine for an internal tool** — the key is still server-side and never in the bundle.

4. **PDF receipts**: Some suppliers send PDF invoices. Should v1 handle PDFs? Gemini Flash can parse PDF pages if we convert to images first (e.g., `pdfjs-dist` client-side). **Recommend: photos only for v1**. Add PDF support as a Phase 5+ enhancement. The existing Liquidation form already handles PDF attachment without AI parsing.

### Trade-offs summary

- **Separate overhead collection vs nullable projectId**: Separate collection wins for query clarity but adds sync complexity for Finance Home KPIs. If the KPI update is too complex, revisit the nullable-projectId approach.
- **Client-side compression vs send raw**: Compression wins — smaller payloads = faster Gemini response = cheaper API costs. The code to do it already exists in the project.
- **Vanilla fetch vs google-genai SDK**: Fetch wins — no dependency, one fewer `npm install`, simpler error handling. The SDK's `response_schema` parameter for stricter JSON validation is nice-to-have but not necessary with prompt + `response_mime_type`.
