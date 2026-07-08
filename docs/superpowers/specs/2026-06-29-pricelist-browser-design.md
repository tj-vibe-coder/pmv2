# Pricelist Browser & Calcsheet Integration

**Date**: 2026-06-29
**Status**: Approved
**Author**: TJ + Claude

## Summary

A standalone pricelist browser page under the Sales workspace (`/sales/pricelists`) backed by Firestore, with cart-style import into Calcsheet quotations. Initial dataset: HVC DCPI ABB Pricelist (March 2026, ~300+ items). Data seeded via a one-time import script.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data storage | Firestore collection + import script | Shared, queryable, no PDF parser UI needed now |
| Navigation | `/sales/pricelists` under Sales workspace | Close to quotation workflow, not buried in Calcsheet |
| Import to Calcsheet | Cart-style pick + quotation editor "Browse Catalog" button | Both entry points for different workflows |
| Filtering UX | Flat table with search bar + smart auto-populated filters | ~300 items doesn't need category tree navigation |

## Data Model

### Firestore collection: `pricelist_items`

```typescript
interface PricelistItem {
  id: string;                  // Firestore doc ID (auto)
  supplier: string;            // "HVC DCPI"
  brand: string;               // "ABB"
  pricelistName: string;       // "HVC DCPI ABB Pricelist March 2026"
  pricelistDate: string;       // "2026-03"
  category: string;            // "SH200 C-Series" | "S200 C-Series" | "AX Series" | ...
  categoryLabel: string;       // "Miniature Circuit Breaker - Compact Home"
  catalogNo: string;           // "SH201-C6"
  abbRefNo: string;            // "2CDS211001R0064"
  description: string;         // "6AT 1P 10Kaic@240V, 6Kaic@440V"
  poles?: number;              // 1, 2, 3 (parsed from description/section)
  ampRating?: number;          // 6, 10, 16, ... (parsed from description)
  dimensions?: { w: number; d: number; h: number }; // mm
  sellingPrice: number;        // PHP amount (e.g. 339.05)
  sepEquivalent?: string;      // "EZ9F56106" or null for N/A
  coilVoltage?: string;        // "110V" | "230V" (for contactors)
  frameSize?: number;          // 125, 250, 400, ... (for MCCBs)
  kaic?: string;               // breaking capacity string
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Design notes:
- Flat structure, no sub-collections. All items queryable in one collection.
- Parsed fields (`poles`, `ampRating`, `frameSize`) enable smart filtering without string-parsing at query time.
- `pricelistName` + `pricelistDate` support future multi-pricelist scenarios (new quarter = new batch).
- `supplier` + `brand` support future non-ABB catalogs.
- Deterministic doc IDs based on catalogNo (e.g. `dcpi_abb_SH201-C6`) for idempotent re-imports.

## Import Script

`scripts/import-pricelist-dcpi-abb.js`:
- Node script using firebase-admin
- Contains the parsed PDF data as a hardcoded array (~300+ items extracted from all 15 pages)
- Writes to Firestore `pricelist_items` collection
- Idempotent: deterministic doc IDs, re-running overwrites not duplicates
- All items tagged with `pricelistDate: "2026-03"`, `supplier: "HVC DCPI"`, `brand: "ABB"`

## Server Endpoints

Added to `server.js`:

```
GET  /api/pricelists              — list items with filtering
  Query params: supplier, brand, category, search, minPrice, maxPrice
  Returns: { items: PricelistItem[] }

GET  /api/pricelists/:id          — single item by doc ID

GET  /api/pricelists/filters      — distinct values for filter dropdowns
  Returns: { suppliers: string[], brands: string[], categories: string[], poles: number[] }
```

All filtering in-memory (collection is ~300 items, small enough to fetch-and-filter). No composite indexes needed.

## Frontend Components

```
src/components/pricelists/
  PricelistBrowser.tsx          — standalone page at /sales/pricelists
  PricelistTable.tsx            — reusable table with search, filters, pagination
  PricelistFilters.tsx          — search bar + filter dropdowns
  PricelistPickerDialog.tsx     — dialog wrapper for use inside quotation editor
```

### Store

New `src/store/pricelistStore.ts` (Zustand) — separate from quotationStore since data is independent.

Actions: `fetchItems(filters?)`, `fetchFilters()`, `setSearch(term)`, `setFilters(...)`.

### Route & Nav

- Route: `/sales/pricelists` registered in `App.tsx`
- Sales workspace sidebar: new "Pricelists" nav item below Calcsheet items

## UI Design

### Standalone Browser (`/sales/pricelists`)

Follows existing design system (Box root, h4 title, `NET_PACIFIC_COLORS`, MUI v7 Grid).

- **Header**: "Pricelists" title + subtitle "HVC DCPI - ABB Products (March 2026)"
- **Search bar**: Full-width text field, fuzzy matches across catalogNo, description, ABB ref no., SEP equivalent. Debounced 300ms.
- **Filter row**: Horizontal dropdowns/chips:
  - Category (multi-select): auto-populated from data
  - Poles: 1P, 2P, 3P
  - Price range: min/max inputs
  - Clear all button
- **Table columns**: Checkbox, Catalog No. (bold), Description, Category (chip), Poles, Amp Rating, Selling Price (PHP, right-aligned, formatted), SEP Equivalent
- **Sticky bottom bar** (visible when items selected): "N items selected" + "Add to Quotation" button
- **"Add to Quotation" dialog**: Two cascading dropdowns (Project -> Quotation). Confirm adds items as component lines. Success snackbar with link to quotation.

### PricelistPickerDialog (inside Quotation Editor)

- Triggered by "Browse Catalog" icon-button in Components section header
- MUI Dialog `maxWidth="lg"`
- Reuses `PricelistTable` + `PricelistFilters`
- Multi-select with "Add N Items" confirm button
- On confirm: inserts ComponentLine items directly into current quotation state:
  - `brand` = "ABB"
  - `partNo` = catalogNo
  - `description` = pricelist description
  - `unitCost` = sellingPrice
  - `qty` = 1
  - `uom` = "pc"
  - `code` = auto-generated sequential (B-XXXX)

### States

- **Loading**: Skeleton rows
- **Empty search**: "No items match your search" + clear filters link
- **Error**: Snackbar with retry

## Product Categories (from PDF)

| Category | Label | Pages |
|----------|-------|-------|
| SH200 C-Series | Miniature Circuit Breaker - Compact Home | 1 |
| S200 C-Series | Miniature Circuit Breaker - Commercial & Industrial | 2 |
| AX Series | Magnetic Contactor and Overload Relay | 3 |
| TA Series | Thermal Overload Relay | 4 |
| Formula A1 | SACE Molded Case Circuit Breaker - Formula A1 | 5-7 |
| Formula A2 | SACE Molded Case Circuit Breaker - Formula A2 | 8 |
| Formula A3 | SACE Molded Case Circuit Breaker - Formula A3 | 9 |
| TMAX XT | SACE Molded Case Circuit Breaker - TMAX XT Series | 10-13 |
| EMAX 2 | SACE Air Circuit Breaker - EMAX 2 Series | 14-15 |

## Out of Scope

- PDF upload/parser UI (future: when next quarterly pricelist arrives)
- Supplier management CRUD (existing SuppliersPage is separate/localStorage)
- Price history / version comparison across pricelists
- Bulk import from pricelist to multiple quotations at once
