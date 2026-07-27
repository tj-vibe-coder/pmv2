# Calcsheet Quotation-History Pricing Design

## Status

Approved for implementation planning on 2026-07-24.

## Summary

Calcsheet's **Add Product** dialog will offer two separate sources:

1. **Pricelists** — the existing managed and editable product catalog.
2. **Quotation History** — a new read-only catalog derived from component rows in previous Calcsheet quotations.

Quotation History lets an estimator reuse a historical product and price while seeing the source project, quotation, revision, status, date, original cost, quoted selling price, and the contingency used at that time. It can also suggest a new product contingency based on the item's observed quarterly or annual price movement and the expected purchase date.

The suggestion is advisory. It never changes a quotation until the estimator explicitly applies it.

## Goals

- Make products from all previous quotations searchable from the quotation editor.
- Preserve clear separation between managed Pricelists and read-only Quotation History.
- Show enough source information for an estimator to judge whether a historical price is relevant.
- Suggest product contingency using observed price movement and the time from the selected historical price to the expected purchase date.
- Keep the calculation explainable, reviewable, and manually overridable.
- Reuse existing quotation records without introducing a synchronized product-history collection.

## Non-Goals

- Merging historical quotation rows into Pricelists.
- Updating or overwriting Pricelists from quotation history.
- Automatically applying a suggested contingency.
- Using external market-price feeds, AI-generated inflation estimates, or category-wide guesses.
- Inferring a percentage when fewer than two reliable comparable prices exist.
- Treating automatic quotation restore snapshots as separate market-price observations.
- Permanently merging products solely because their descriptions look similar.

## Approved Product Rules

### Included records

- Include the current saved state of every Calcsheet quotation, regardless of project status, including draft, for-review, sent, won, lost, and inactive projects.
- Include separately created quotation revisions because they are real quotation records.
- Include both IOCT and ACTI quotations.
- Do not weight observations by status. Status remains visible as evidence.
- Exclude documents in `calcsheet_quotation_versions`; those are automatic restore snapshots and may contain incomplete intermediate edits.
- Legacy quotations with no component rows do not produce product-history observations.

### Historical date

- Use `quotation.dateSent` when present.
- Otherwise use `quotation.createdAt` and label it as a fallback date.
- If neither date is valid, show the observation for audit but exclude it from trend calculations.

### Historical prices

Show both:

- **Original normalized cost** — the comparable PHP cost before contingency and markup.
- **Quoted selling price** — the product's selling price in the source quotation after its contingency and markup.

Trend calculations use original normalized cost so changes in markup do not look like product inflation. Quoted selling unit is reconstructed using the source line's contingency and its per-line markup override, falling back to the source quotation's product markup.

### Expected purchase date

- Add one optional expected purchase date to the quotation.
- Allow an optional expected purchase-date override on each component row.
- The line override takes precedence over the quotation-level date.
- When both are blank, assume three months after the new quotation's date and label the date as assumed.
- Expected purchase dates before the new quotation date are invalid.

### Applying suggestions

- Show the suggestion, method, confidence, and supporting observations before application.
- Require the estimator to click **Apply suggestion**.
- Applying the suggestion writes a per-line contingency override using the existing `contingencyPct` and `contingencyPctOverridden` behavior.
- Adding a historical product without applying the suggestion preserves the quotation's normal product-contingency default.
- The estimator can edit an applied contingency afterward.

## Architecture

### Source of truth

Existing `calcsheet_quotations` and `calcsheet_projects` documents remain authoritative. No persistent materialized history collection is introduced.

The managed Pricelists source remains unchanged and continues to use its existing API and collection. Quotation History never writes to it.

### Server-side history endpoints

Add two authenticated operations under the Calcsheet API:

```text
GET /api/calcsheet/product-history
POST /api/calcsheet/product-history/suggest
```

The `GET` operation searches observations. Supported query parameters should include:

- `search` — catalog number, part number, brand, or description.
- `status` — optional project-status filter; all statuses by default.
- `sort` — newest date by default, with oldest and price sorting available.
- `limit` — bounded result count, default 50 and maximum 100.

The `GET` operation:

1. Reads current quotation documents and their related Calcsheet projects.
2. Excludes automatic restore snapshots.
3. Flattens component rows into read-only observations.
4. Derives quotation references and source metadata.
5. Normalizes comparable costs.
6. Returns matching observations and source metadata.

The `POST /suggest` operation is a read-only calculation request; it does not write data despite using POST. It accepts:

```ts
interface ProductHistorySuggestionRequest {
  selectedObservationId: string;
  confirmedCandidateObservationIds?: string[];
  analysisDate: string; // new quotation date, YYYY-MM-DD
  expectedPurchaseDate: string; // resolved line/quotation/default target
}
```

It returns the selected observation, all included and excluded evidence, quarterly or annualized method details, confidence, and the suggested contingency percentage. Keeping this calculation server-side provides one authoritative formula while allowing an explicit set of user-confirmed candidate matches.

The optional status filter changes the visible search results only. The suggestion engine always considers every included project status, as approved, and returns those statuses with the evidence.

At IOCT's current data volume, server-side flattening on request is acceptable and avoids synchronization risk. A cache or materialized index can later back the same API contract if volume requires it.

### Observation contract

Each historical result includes:

```ts
interface ProductHistoryObservation {
  observationId: string;
  productKey: string | null;
  matchType: 'exact' | 'confirmed_candidate' | 'unmatched';

  description: string;
  brand?: string;
  partNo?: string;
  uom?: string;

  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;

  quotationId: string;
  quotationKind: QuotationKind;
  quotationRevision: string;
  quotationReference: string;
  quotationDate: string | null;
  quotationDateSource: 'dateSent' | 'createdAt' | 'missing';

  sourceUnitCost: number;
  sourceForex: number;
  sourceDiscountPct: number;
  normalizedUnitCost: number | null;
  quotedSellingUnit: number | null;
  sourceContingencyPct: number;
  sourceMarkupPct: number;
}
```

The exact property names may follow existing project conventions during implementation, but the returned information and semantics are required.

### Quotation data additions

Add optional fields so existing documents remain compatible:

```ts
interface Quotation {
  expectedPurchaseDate?: string; // YYYY-MM-DD
}

interface ComponentLine {
  expectedPurchaseDate?: string; // optional line override, YYYY-MM-DD
  historicalPriceSource?: {
    quotationId: string;
    projectId: string;
    quotationReference: string;
    quotationDate: string;
    normalizedUnitCost: number;
    quotedSellingUnit?: number;
    selectedAt: string;
    suggestedContingencyPct?: number;
    suggestionMethod?: 'quarterly' | 'annualized';
    suggestionConfidence?: 'high' | 'medium' | 'low';
  };
}
```

The source snapshot remains on the new component row even if the old quotation is later edited or deleted. This preserves the reason for the estimator's selected price without making the new quotation depend on a mutable source document.

No Firestore migration is required because all new fields are optional.

## Product Matching

### Exact identity

Normalize catalog and part numbers by trimming whitespace and comparing case-insensitively. An exact normalized catalog or part number is the primary product identity.

### Candidate identity

When catalog or part number is missing:

- Search can suggest candidates using normalized brand and description.
- Candidate matches must be visibly labeled.
- The user must confirm that the rows represent the same product before those rows can be used together for a trend.
- Confirmation applies to the current selection and calculation only; it does not permanently merge records.

Pure fuzzy-description matches must never silently influence a suggestion.

## Contingency Calculation

### 1. Normalize historical cost

For each reliable component observation:

```text
normalizedUnitCost =
  unitCost × effectiveForex × (1 − discountPct / 100)
```

Where:

- `effectiveForex` is the stored FX value, falling back to `1` only when the value is absent.
- Contingency and markup are excluded.
- Non-finite, zero, or negative normalized costs are invalid for trend calculations but remain visible in history.
- UOM must be compatible across compared observations. Conflicting UOMs require user confirmation or exclusion.

### 2. Choose the analysis date and target date

- The analysis date is the new quotation's date.
- Ignore observations dated after the analysis date.
- The target date is the component override, then the quotation expected purchase date, then the labeled three-month default.
- The forecast interval starts on the selected historical observation's quotation date and ends on the target purchase date.

This means an older selected cost receives a larger adjustment than a recent selected cost when both use the same observed growth rate.

### 3. Prefer a quarterly trend

Use the quarterly method when the latest 12 months before the analysis date contain at least three distinct calendar quarters with reliable observations.

1. Compute the median normalized cost in each represented quarter.
2. For each adjacent represented quarter, compute the equivalent per-quarter growth across the actual number of elapsed quarters.
3. Use the median of those per-quarter growth values as the quarterly trend.

Using medians limits the effect of duplicate quotations and unusual one-off prices while still including every valid quotation.

### 4. Fall back to an annualized trend

When quarterly history is insufficient, use the annualized method if:

- At least two reliable observations exist; and
- The earliest and latest reliable observations span at least nine months.

Calculate the compounded annual growth rate between the earliest and latest reliable observations:

```text
annualRate =
  (latestCost / earliestCost) ^ (365 / elapsedDays) − 1
```

If neither method is eligible, return **Insufficient history** and no suggested percentage.

### 5. Forecast the selected cost

For a quarterly rate:

```text
projectedIncrease =
  (1 + quarterlyRate) ^ (forecastDays / 91.3125) − 1
```

For an annualized rate:

```text
projectedIncrease =
  (1 + annualRate) ^ (forecastDays / 365) − 1
```

Then:

```text
suggestedContingencyPct =
  ceil(max(0, projectedIncrease × 100) × 2) / 2
```

The result:

- Never goes below `0%`.
- Rounds upward to the next `0.5%`.
- Is not silently capped. Suggestions over `50%` display a high-risk warning and require deliberate application.

### Worked example

- Selected normalized historical cost: `₱10,000` on 2025-04-01.
- Expected purchase date: 2026-10-01, six quarters later.
- Observed quarterly trend: `2.0%`.

```text
(1.02 ^ 6 − 1) × 100 = 12.62%
```

The suggestion is rounded upward to `13.0%`.

## Outliers and Confidence

### Outliers

- Invalid dates and non-positive costs are excluded with an explicit reason.
- When at least five comparable observations exist, fit a robust Theil-Sen line to `log(normalizedUnitCost)` over time. Apply a median-absolute-deviation check to the residuals; a modified z-score above `3.5` flags an observation as a statistical outlier. If residual MAD is zero, do not classify statistical outliers.
- Flagged outliers are shown in the evidence list and excluded from the generated suggestion with the exclusion reason visible.
- With fewer than five observations, do not automatically classify a valid positive cost as a statistical outlier.

### Confidence

Return an explainable confidence label:

- **High** — exact identity; at least four usable quarter groups; latest observation no more than three months old; compatible UOM; no unresolved data-quality warnings.
- **Medium** — exact identity with the minimum quarterly evidence, or annualized evidence from at least three observations; latest observation no more than 12 months old.
- **Low** — annualized evidence from exactly two observations, a user-confirmed candidate match, stale latest evidence, or a non-critical data-quality warning.

Confidence does not change the mathematical percentage. It tells the estimator how much trust to place in it.

## User Interface

### Add Product dialog

Keep one **Add Product** entry point and add two tabs:

1. **Pricelists**
2. **Quotation History**

The tabs share the dialog but not their data or mutation paths.

### Quotation History tab

Provide:

- Search by catalog/part number, brand, and description.
- Optional status filter.
- Newest-first default sorting.
- Result columns for:
  - Product
  - Source project
  - Quotation reference, kind, revision, and status
  - Quotation date and fallback-date label
  - Original normalized cost
  - Quoted selling price
  - Suggested contingency
  - Confidence

Selecting a result opens a detail area that shows:

- All comparable observations used.
- A compact price trend.
- Calculation method and interval.
- Expected purchase date and whether it is assumed.
- Excluded observations and reasons.
- Current line/default contingency versus the suggestion.

### Actions

- **Apply suggestion** sets the previewed component's per-line contingency override.
- **Add product to quotation** adds the component with the currently previewed values.
- Adding without applying the suggestion uses the quotation's existing product-contingency default.
- The resulting component row remains editable through the existing table.

### Quotation editor fields

- Add an optional quotation-level **Expected purchase date** near pricing controls.
- Add an optional per-line purchase-date override in component details. To avoid widening the already dense component grid unnecessarily, this may use a row details popover or secondary editor rather than a permanently visible table column.
- Historical-source metadata is internal evidence and must not appear in customer PDF or Excel exports unless a later requirement explicitly adds it.

## Loading and Error Behavior

- Load Quotation History only when its tab is opened.
- Debounce search requests.
- Pricelists remains usable if Quotation History fails.
- Show a scoped error in the history tab with a retry action.
- Show **Insufficient history** instead of inventing a percentage.
- Show missing or fallback dates explicitly.
- If the selected source quotation is later edited or deleted, a component already added to another quotation retains its stored source snapshot.
- A failed suggestion calculation must not prevent adding the historical product with the normal quotation default.
- Historical API failures and malformed records must not affect quotation saving or existing totals.

## Security

- Require the same active authenticated user check used by other Calcsheet endpoints.
- The endpoint is read-only.
- Return only quotation and project fields required by the picker.
- Do not expose user credentials, private attachments, client contacts, or unrelated project data.

## Verification Strategy

### Unit tests

- Exact part/catalog matching and normalization.
- Candidate matching requires confirmation.
- Normalized PHP cost with FX and discount.
- Quarterly eligibility, quarter medians, elapsed-quarter growth, and compounding.
- Annual fallback eligibility and annualized growth.
- Three-month target fallback and per-line precedence.
- Negative trends clamp to zero.
- Upward rounding to `0.5%`.
- Insufficient-history behavior.
- Invalid costs, invalid dates, UOM conflicts, and outlier handling.
- Confidence labels.

### API tests

- Includes all project statuses and both quotation kinds.
- Includes separately created revisions.
- Excludes `calcsheet_quotation_versions`.
- Resolves project and quotation metadata.
- Uses `dateSent`, then labeled `createdAt`.
- Applies search, filter, sort, and result limits.
- Requires authentication.
- Does not mutate quotations or Pricelists.

### UI tests

- Pricelists and Quotation History are separate tabs.
- Failure in one source does not disable the other.
- Search and filters return source-labeled results.
- Selecting a result displays evidence.
- Adding without applying uses the normal product-contingency default.
- Applying creates a per-line override.
- Expected purchase-date precedence is visible.
- Insufficient history never exposes an actionable generated percentage.

### Regression checks

- Existing manual product entry remains unchanged.
- Existing Pricelists selection remains unchanged.
- Existing component calculations and grand totals remain correct.
- Existing quotation save/version behavior remains correct.
- Existing PDF and Excel exports remain unchanged.

## Rollout

1. Add pure matching and trend-calculation utilities with unit tests.
2. Add the authenticated read-only history endpoint.
3. Add optional quotation and component source fields.
4. Extend Add Product with the separate Quotation History tab.
5. Add expected purchase-date controls and suggestion evidence.
6. Run build, unit, API, and browser regression checks.

Because the design uses existing quotation data and optional fields, no destructive migration or historical backfill is required.
