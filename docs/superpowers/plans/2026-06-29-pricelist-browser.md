# Pricelist Browser & Calcsheet Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone pricelist browser at `/sales/pricelists` backed by Firestore, with cart-style import into Calcsheet quotations and a "Browse Catalog" picker inside the quotation editor.

**Architecture:** Pricelist items stored in Firestore `pricelist_items` collection, seeded by a one-time Node import script. Server exposes read-only GET endpoints. Frontend uses a new Zustand store (`pricelistStore.ts`) and four components under `src/components/pricelists/`. The `PricelistTable` component is reused in both the standalone page and the quotation editor dialog.

**Tech Stack:** React 19, TypeScript, MUI v7, Zustand, Express, Firebase Firestore, firebase-admin (for import script)

## Global Constraints

- Follow existing design system: `NET_PACIFIC_COLORS`, Box root, MUI v7 `Grid size={{}}` syntax, sticky tables with `size="small"`
- Use native `fetch()` for API calls (not axios) — match `quotationStore.ts` pattern
- Server endpoints go in `server.js` BEFORE the `/*splat` catch-all (currently line 4096)
- Auth via `netpacific_token` in localStorage — match existing `authHeaders()` pattern
- No composite Firestore indexes needed (~300 items, fetch-all + in-memory filter)
- Deterministic Firestore doc IDs for idempotent re-imports
- All PHP currency values stored as numbers, formatted on display

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/types/Pricelist.ts` | PricelistItem interface + filter types |
| Create | `src/store/pricelistStore.ts` | Zustand store for pricelist state |
| Create | `src/components/pricelists/PricelistFilters.tsx` | Search bar + filter dropdowns |
| Create | `src/components/pricelists/PricelistTable.tsx` | Reusable data table with selection |
| Create | `src/components/pricelists/PricelistBrowser.tsx` | Standalone page at `/sales/pricelists` |
| Create | `src/components/pricelists/PricelistPickerDialog.tsx` | Dialog wrapper for quotation editor |
| Create | `scripts/import-pricelist-dcpi-abb.js` | One-time Firestore seed script |
| Modify | `server.js` | Add GET `/api/pricelists` and `/api/pricelists/filters` endpoints |
| Modify | `src/App.tsx` | Add route for `/sales/pricelists` |
| Modify | `src/components/sales/SalesNavList.tsx` | Add "Pricelists" nav item |
| Modify | `src/components/calcsheet/CalcsheetQuotationEditor.tsx` | Add "Browse Catalog" button + dialog integration |

---

### Task 1: Types + Zustand Store + Server Endpoints

**Files:**
- Create: `src/types/Pricelist.ts`
- Create: `src/store/pricelistStore.ts`
- Modify: `server.js` (before line 4092, the static files section)

**Produces:**
- `PricelistItem` interface used by all frontend components
- `PricelistFiltersState` interface used by `PricelistFilters.tsx`
- `usePricelistStore` Zustand hook with `fetchItems()`, `fetchFilters()`, `items`, `filters`, `loading`, `filterOptions`
- `GET /api/pricelists` and `GET /api/pricelists/filters` server endpoints

- [ ] **Step 1: Create `src/types/Pricelist.ts`**

```typescript
export interface PricelistItem {
  id: string;
  supplier: string;
  brand: string;
  pricelistName: string;
  pricelistDate: string;
  category: string;
  categoryLabel: string;
  catalogNo: string;
  abbRefNo: string;
  description: string;
  poles?: number;
  ampRating?: number;
  dimensions?: { w: number; d: number; h: number };
  sellingPrice: number;
  sepEquivalent?: string;
  coilVoltage?: string;
  frameSize?: number;
  kaic?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricelistFiltersState {
  search: string;
  categories: string[];
  poles: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

export interface PricelistFilterOptions {
  suppliers: string[];
  brands: string[];
  categories: string[];
  poles: number[];
}

export const EMPTY_FILTERS: PricelistFiltersState = {
  search: '',
  categories: [],
  poles: null,
  minPrice: null,
  maxPrice: null,
};
```

- [ ] **Step 2: Add server endpoints in `server.js`**

Find the comment `// ========== STATIC FILES & SPA FALLBACK ==========` (line 4092) and insert BEFORE it:

```javascript
// ========== PRICELISTS ==========

app.get('/api/pricelists/filters', async (req, res) => {
  try {
    const snap = await db.collection('pricelist_items').get();
    const items = snap.docs.map((d) => d.data());
    const suppliers = [...new Set(items.map((i) => i.supplier).filter(Boolean))].sort();
    const brands = [...new Set(items.map((i) => i.brand).filter(Boolean))].sort();
    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
    const poles = [...new Set(items.map((i) => i.poles).filter((p) => p != null))].sort((a, b) => a - b);
    res.json({ success: true, suppliers, brands, categories, poles });
  } catch (err) {
    console.error('[pricelists] get filters failed:', err);
    res.status(500).json({ error: 'Failed to get pricelist filters' });
  }
});

app.get('/api/pricelists', async (req, res) => {
  try {
    const snap = await db.collection('pricelist_items').orderBy('category').orderBy('catalogNo').get();
    let items = snap.docs.map((d) => {
      const { id: _stored, ...data } = d.data();
      return { ...data, id: d.id };
    });

    // In-memory filtering
    const { supplier, brand, category, poles, minPrice, maxPrice, search } = req.query;
    if (supplier) items = items.filter((i) => i.supplier === supplier);
    if (brand) items = items.filter((i) => i.brand === brand);
    if (category) {
      const cats = Array.isArray(category) ? category : [category];
      items = items.filter((i) => cats.includes(i.category));
    }
    if (poles) items = items.filter((i) => i.poles === Number(poles));
    if (minPrice) items = items.filter((i) => i.sellingPrice >= Number(minPrice));
    if (maxPrice) items = items.filter((i) => i.sellingPrice <= Number(maxPrice));
    if (search) {
      const q = String(search).toLowerCase();
      items = items.filter((i) =>
        (i.catalogNo || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.abbRefNo || '').toLowerCase().includes(q) ||
        (i.sepEquivalent || '').toLowerCase().includes(q) ||
        (i.categoryLabel || '').toLowerCase().includes(q)
      );
    }

    res.json({ success: true, items });
  } catch (err) {
    console.error('[pricelists] get items failed:', err);
    res.status(500).json({ error: 'Failed to get pricelist items' });
  }
});
```

**Important:** The `/api/pricelists/filters` route MUST come before `/api/pricelists` because Express matches routes in order and `/api/pricelists/:id` would match "filters" as an ID param. Since we don't have a `/:id` route yet, this ordering just prevents future bugs.

- [ ] **Step 3: Create `src/store/pricelistStore.ts`**

```typescript
import { create } from 'zustand';
import type { PricelistItem, PricelistFiltersState, PricelistFilterOptions } from '../types/Pricelist';
import { EMPTY_FILTERS } from '../types/Pricelist';

const API_BASE = process.env.REACT_APP_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

interface PricelistState {
  items: PricelistItem[];
  filterOptions: PricelistFilterOptions;
  filters: PricelistFiltersState;
  loading: boolean;
  error: string | null;

  fetchItems: () => Promise<void>;
  fetchFilters: () => Promise<void>;
  setFilters: (filters: Partial<PricelistFiltersState>) => void;
  resetFilters: () => void;
}

export const usePricelistStore = create<PricelistState>((set, get) => ({
  items: [],
  filterOptions: { suppliers: [], brands: [], categories: [], poles: [] },
  filters: { ...EMPTY_FILTERS },
  loading: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.categories.length) filters.categories.forEach((c) => params.append('category', c));
      if (filters.poles != null) params.set('poles', String(filters.poles));
      if (filters.minPrice != null) params.set('minPrice', String(filters.minPrice));
      if (filters.maxPrice != null) params.set('maxPrice', String(filters.maxPrice));
      const qs = params.toString();
      const url = `${API_BASE}/api/pricelists${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch pricelist');
      const data = await res.json();
      set({ items: data.items, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchFilters: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pricelists/filters`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      set({ filterOptions: { suppliers: data.suppliers, brands: data.brands, categories: data.categories, poles: data.poles } });
    } catch {
      // non-critical, filters just won't populate
    }
  },

  setFilters: (partial) => {
    set((s) => ({ filters: { ...s.filters, ...partial } }));
  },

  resetFilters: () => {
    set({ filters: { ...EMPTY_FILTERS } });
  },
}));
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to the new files.

- [ ] **Step 5: Commit**

```bash
git add src/types/Pricelist.ts src/store/pricelistStore.ts server.js
git commit -m "feat(pricelist): add types, Zustand store, and server endpoints"
```

---

### Task 2: Import Script — Seed Firestore with ABB Pricelist Data

**Files:**
- Create: `scripts/import-pricelist-dcpi-abb.js`

**Consumes:** Firestore `pricelist_items` collection (same schema as `PricelistItem` interface from Task 1)

**Produces:** ~300+ documents in Firestore `pricelist_items` collection, ready for the server endpoints to serve

- [ ] **Step 1: Create `scripts/import-pricelist-dcpi-abb.js`**

This is a large file. It contains ALL items parsed from the 15-page PDF, hardcoded as a JS array. The script uses firebase-admin to write them to Firestore with deterministic doc IDs.

```javascript
/**
 * One-time import: HVC DCPI ABB Pricelist March 2026
 * 
 * Usage:
 *   node scripts/import-pricelist-dcpi-abb.js
 * 
 * Requires: service account JSON at repo root (gitignored)
 * Idempotent: uses deterministic doc IDs, re-running overwrites existing docs
 */

const admin = require('firebase-admin');
const path = require('path');

// --- Firebase init ---
const serviceAccountPath = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// --- Helpers ---
function docId(catalogNo) {
  // Deterministic ID: lowercase, replace non-alphanumeric with underscore
  return `dcpi_abb_${catalogNo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
}

function makeItem(overrides) {
  return {
    supplier: 'HVC DCPI',
    brand: 'ABB',
    pricelistName: 'HVC DCPI ABB Pricelist March 2026',
    pricelistDate: '2026-03',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  };
}

// --- Pricelist Data ---
// Each entry: { catalogNo, abbRefNo, description, category, categoryLabel, poles?, ampRating?, sellingPrice, sepEquivalent?, dimensions?, coilVoltage?, frameSize?, kaic? }

const ITEMS = [
  // ==================== PAGE 1: SH200 C-SERIES (Compact Home) ====================
  // Single Pole (1P)
  { catalogNo: 'SH201-C6', abbRefNo: '2CDS211001R0064', description: '6AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 6, sellingPrice: 339.05, sepEquivalent: 'EZ9F56106', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C10', abbRefNo: '2CDS211001R0104', description: '10AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 10, sellingPrice: 339.05, sepEquivalent: 'EZ9F56110', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C16', abbRefNo: '2CDS211001R0164', description: '16AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 16, sellingPrice: 339.05, sepEquivalent: 'EZ9F56116', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C20', abbRefNo: '2CDS211001R0204', description: '20AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 20, sellingPrice: 339.05, sepEquivalent: 'EZ9F56120', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C25', abbRefNo: '2CDS211001R0254', description: '25AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 25, sellingPrice: 339.05, sepEquivalent: 'EZ9F56125', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C32', abbRefNo: '2CDS211001R0324', description: '32AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 32, sellingPrice: 339.05, sepEquivalent: 'EZ9F56132', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C40', abbRefNo: '2CDS211001R0404', description: '40AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 40, sellingPrice: 339.05, sepEquivalent: 'EZ9F56140', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C50', abbRefNo: '2CDS211001R0504', description: '50AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 50, sellingPrice: 424.16, sepEquivalent: 'EZ9F56150', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH201-C63', abbRefNo: '2CDS211001R0634', description: '63AT 1P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 1, ampRating: 63, sellingPrice: 424.16, sepEquivalent: 'EZ9F56163', dimensions: { w: 17.5, d: 69.0, h: 85.0 } },
  // 2-Pole (2P)
  { catalogNo: 'SH202-C6', abbRefNo: '2CDS212001R0064', description: '6AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 6, sellingPrice: 617.02, sepEquivalent: 'EZ9F56206', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C10', abbRefNo: '2CDS212001R0104', description: '10AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 10, sellingPrice: 617.02, sepEquivalent: 'EZ9F56210', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C16', abbRefNo: '2CDS212001R0164', description: '16AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 16, sellingPrice: 617.02, sepEquivalent: 'EZ9F56216', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C20', abbRefNo: '2CDS212001R0204', description: '20AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 20, sellingPrice: 617.02, sepEquivalent: 'EZ9F56220', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C25', abbRefNo: '2CDS212001R0254', description: '25AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 25, sellingPrice: 617.02, sepEquivalent: 'EZ9F56225', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C32', abbRefNo: '2CDS212001R0324', description: '32AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 32, sellingPrice: 617.02, sepEquivalent: 'EZ9F56232', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C40', abbRefNo: '2CDS212001R0404', description: '40AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 40, sellingPrice: 617.02, sepEquivalent: 'EZ9F56240', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C50', abbRefNo: '2CDS212001R0504', description: '50AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 50, sellingPrice: 768.70, sepEquivalent: 'EZ9F56250', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'SH202-C63', abbRefNo: '2CDS212001R0634', description: '63AT 2P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 2, ampRating: 63, sellingPrice: 768.70, sepEquivalent: 'EZ9F56263', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  // 3-Pole (3P)
  { catalogNo: 'SH203-C6', abbRefNo: '2CDS213001R0064', description: '6AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 6, sellingPrice: 992.45, sepEquivalent: 'EZ9F56306', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C10', abbRefNo: '2CDS213001R0104', description: '10AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 10, sellingPrice: 992.45, sepEquivalent: 'EZ9F56310', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C16', abbRefNo: '2CDS213001R0164', description: '16AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 16, sellingPrice: 992.45, sepEquivalent: 'EZ9F56316', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C20', abbRefNo: '2CDS213001R0204', description: '20AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 20, sellingPrice: 992.45, sepEquivalent: 'EZ9F56320', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C25', abbRefNo: '2CDS213001R0254', description: '25AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 25, sellingPrice: 992.45, sepEquivalent: 'EZ9F56325', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C32', abbRefNo: '2CDS213001R0324', description: '32AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 32, sellingPrice: 992.45, sepEquivalent: 'EZ9F56332', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C40', abbRefNo: '2CDS213001R0404', description: '40AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 40, sellingPrice: 992.45, sepEquivalent: 'EZ9F56340', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C50', abbRefNo: '2CDS213001R0504', description: '50AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 50, sellingPrice: 1238.85, sepEquivalent: 'EZ9F56350', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },
  { catalogNo: 'SH203-C63', abbRefNo: '2CDS213001R0634', description: '63AT 3P 10Kaic@240V, 6Kaic@440V', category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home', poles: 3, ampRating: 63, sellingPrice: 1238.85, sepEquivalent: 'EZ9F56363', dimensions: { w: 52.5, d: 69.0, h: 85.0 } },

  // ==================== PAGE 2: S200 C-SERIES (Commercial & Industrial) ====================
  // Single Pole (1P)
  { catalogNo: 'S201-C6', abbRefNo: '2CDS251001R0064', description: '6AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 6, sellingPrice: 535.35, sepEquivalent: 'A9F74106', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C10', abbRefNo: '2CDS251001R0104', description: '10AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 10, sellingPrice: 408.37, sepEquivalent: 'A9F74110', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C16', abbRefNo: '2CDS251001R0164', description: '16AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 16, sellingPrice: 408.37, sepEquivalent: 'A9F74116', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C20', abbRefNo: '2CDS251001R0204', description: '20AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 20, sellingPrice: 408.37, sepEquivalent: 'A9F74120', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C25', abbRefNo: '2CDS251001R0254', description: '25AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 25, sellingPrice: 535.35, sepEquivalent: 'A9F74125', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C32', abbRefNo: '2CDS251001R0324', description: '32AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 32, sellingPrice: 535.35, sepEquivalent: 'A9F74132', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C40', abbRefNo: '2CDS251001R0404', description: '40AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 40, sellingPrice: 437.89, sepEquivalent: 'A9F74140', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C50', abbRefNo: '2CDS251001R0504', description: '50AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 50, sellingPrice: 682.91, sepEquivalent: 'A9F74150', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C63', abbRefNo: '2CDS251001R0634', description: '63AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 63, sellingPrice: 682.91, sepEquivalent: 'A9F74163', dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C80', abbRefNo: '2CDS251001R0804', description: '80AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 80, sellingPrice: 2023.34, sepEquivalent: null, dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S201-C100', abbRefNo: '2CDS251001R0824', description: '100AT 1P 6Kaic@240V, 4.5Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 1, ampRating: 100, sellingPrice: 2131.78, sepEquivalent: null, dimensions: { w: 17.5, d: 69.0, h: 88.0 } },
  // 2-Pole (2P)
  { catalogNo: 'S202-C6', abbRefNo: '2CDS252001R0064', description: '6AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 6, sellingPrice: 909.20, sepEquivalent: 'A9F74206', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C10', abbRefNo: '2CDS252001R0104', description: '10AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 10, sellingPrice: 831.16, sepEquivalent: 'A9F74210', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C16', abbRefNo: '2CDS252001R0164', description: '16AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 16, sellingPrice: 831.16, sepEquivalent: 'A9F74216', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C20', abbRefNo: '2CDS252001R0204', description: '20AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 20, sellingPrice: 831.16, sepEquivalent: 'A9F74220', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C25', abbRefNo: '2CDS252001R0254', description: '25AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 25, sellingPrice: 1020.59, sepEquivalent: 'A9F74225', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C32', abbRefNo: '2CDS252001R0324', description: '32AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 32, sellingPrice: 831.16, sepEquivalent: 'A9F74232', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C40', abbRefNo: '2CDS252001R0404', description: '40AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 40, sellingPrice: 975.77, sepEquivalent: 'A9F74240', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C50', abbRefNo: '2CDS252001R0504', description: '50AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 50, sellingPrice: 1054.22, sepEquivalent: 'A9F74250', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C63', abbRefNo: '2CDS252001R0634', description: '63AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 63, sellingPrice: 1054.22, sepEquivalent: 'A9F74263', dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C80', abbRefNo: '2CDS252001R0804', description: '80AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 80, sellingPrice: 4056.28, sepEquivalent: null, dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  { catalogNo: 'S202-C100', abbRefNo: '2CDS252001R0824', description: '100AT 2P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 2, ampRating: 100, sellingPrice: 4265.61, sepEquivalent: null, dimensions: { w: 35.0, d: 69.0, h: 88.0 } },
  // 3-Pole (3P)
  { catalogNo: 'S203-C6', abbRefNo: '2CDS253001R0064', description: '6AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 6, sellingPrice: 1551.13, sepEquivalent: 'A9F74306', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C10', abbRefNo: '2CDS253001R0104', description: '10AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 10, sellingPrice: 1373.37, sepEquivalent: 'A9F74310', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C16', abbRefNo: '2CDS253001R0164', description: '16AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 16, sellingPrice: 1373.37, sepEquivalent: 'A9F74316', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C20', abbRefNo: '2CDS253001R0204', description: '20AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 20, sellingPrice: 1373.37, sepEquivalent: 'A9F74320', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C25', abbRefNo: '2CDS253001R0254', description: '25AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 25, sellingPrice: 1551.13, sepEquivalent: 'A9F74325', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C32', abbRefNo: '2CDS253001R0324', description: '32AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 32, sellingPrice: 1424.85, sepEquivalent: 'A9F74332', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C40', abbRefNo: '2CDS253001R0404', description: '40AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 40, sellingPrice: 1595.74, sepEquivalent: 'A9F74340', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C50', abbRefNo: '2CDS253001R0504', description: '50AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 50, sellingPrice: 2093.34, sepEquivalent: 'A9F74350', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C63', abbRefNo: '2CDS253001R0634', description: '63AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 63, sellingPrice: 2093.34, sepEquivalent: 'A9F74363', dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C80', abbRefNo: '2CDS253001R0804', description: '80AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 80, sellingPrice: 4730.95, sepEquivalent: null, dimensions: { w: 52.5, d: 69.0, h: 88.0 } },
  { catalogNo: 'S203-C100', abbRefNo: '2CDS253001R0824', description: '100AT 3P 20Kaic@240V, 10Kaic@440V', category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial', poles: 3, ampRating: 100, sellingPrice: 4965.68, sepEquivalent: null, dimensions: { w: 52.5, d: 69.0, h: 88.0 } },

  // ==================== PAGE 3-4: AX SERIES (Magnetic Contactor & Overload Relay) ====================
  // AX Series - 3P | 9A TO 375A — 110V Coil Voltage
  { catalogNo: 'AX09-30-10,110-120V', abbRefNo: '1SBL901074R8410', description: '9A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 9, sellingPrice: 1075.70, sepEquivalent: 'LC1D09F7', coilVoltage: '110V' },
  { catalogNo: 'AX12-30-10,110-120V', abbRefNo: '1SBL911074R8410', description: '12A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 12, sellingPrice: 1280.34, sepEquivalent: 'LC1D12F7', coilVoltage: '110V' },
  { catalogNo: 'AX18-30-10,110-120V', abbRefNo: '1SBL921074R8410', description: '18A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 18, sellingPrice: 1570.26, sepEquivalent: 'LC1D18F7', coilVoltage: '110V' },
  { catalogNo: 'AX25-30-10,110-120V', abbRefNo: '1SBL931074R8410', description: '25A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 25, sellingPrice: 2142.22, sepEquivalent: 'LC1D25F7', coilVoltage: '110V' },
  { catalogNo: 'AX32-30-10,110-120V', abbRefNo: '1SBL281074R8410', description: '32A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 32, sellingPrice: 3223.16, sepEquivalent: 'LC1D32F7', coilVoltage: '110V' },
  { catalogNo: 'AX40-30-10,110-120V', abbRefNo: '1SBL321074R8410', description: '40A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 40, sellingPrice: 3972.87, sepEquivalent: 'LC1D40F7', coilVoltage: '110V' },
  { catalogNo: 'AX50-30-11,110-120V', abbRefNo: '1SBL351074R8411', description: '50A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 50, sellingPrice: 5819.27, sepEquivalent: 'LC1D50F7', coilVoltage: '110V' },
  { catalogNo: 'AX65-30-11,110-120V', abbRefNo: '1SBL371074R8411', description: '65A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 65, sellingPrice: 6702.13, sepEquivalent: 'LC1D65F7', coilVoltage: '110V' },
  { catalogNo: 'AX80-30-11,110-120V', abbRefNo: '1SBL411074R8411', description: '80A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 80, sellingPrice: 7673.54, sepEquivalent: 'LC1D80F7', coilVoltage: '110V' },
  { catalogNo: 'AX95-30-11,110-120V', abbRefNo: '1SFL431074R8411', description: '95A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 95, sellingPrice: 9158.53, sepEquivalent: 'LC1D95F7', coilVoltage: '110V' },
  { catalogNo: 'AX115-30-11,110-120V', abbRefNo: '1SFL981074R8411', description: '115A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 115, sellingPrice: 12605.35, sepEquivalent: 'LC1D115F7', coilVoltage: '110V' },
  { catalogNo: 'AX185-30-11,110-120V', abbRefNo: '1SFL491074R8411', description: '185A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 185, sellingPrice: 17891.37, sepEquivalent: 'LC1F185F7', coilVoltage: '110V' },
  { catalogNo: 'AX205-30-11,110-120V', abbRefNo: '1SFL501074R8411', description: '205A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 205, sellingPrice: 23919.87, sepEquivalent: null, coilVoltage: '110V' },
  { catalogNo: 'AX260-30-11,110-120V', abbRefNo: '1SFL547074R8411', description: '260A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 260, sellingPrice: 31634.08, sepEquivalent: null, coilVoltage: '110V' },
  { catalogNo: 'AX300-30-11,110-120V', abbRefNo: '1SFL587074R8411', description: '300A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 300, sellingPrice: 33334.86, sepEquivalent: null, coilVoltage: '110V' },
  { catalogNo: 'AX370-30-11,110-120V', abbRefNo: '1SFL607074R8411', description: '370A, 3P 110V 50Hz, 110-120V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 370, sellingPrice: 39993.70, sepEquivalent: 'LC1F330F7', coilVoltage: '110V' },
  // AX Series — 230V Coil Voltage
  { catalogNo: 'AX09-30-10,230-240V', abbRefNo: '1SBL901074R8010', description: '9A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 9, sellingPrice: 1075.70, sepEquivalent: 'LC1D09M7', coilVoltage: '230V' },
  { catalogNo: 'AX12-30-10,230-240V', abbRefNo: '1SBL911074R8010', description: '12A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 12, sellingPrice: 1280.34, sepEquivalent: 'LC1D12M7', coilVoltage: '230V' },
  { catalogNo: 'AX18-30-10,230-240V', abbRefNo: '1SBL921074R8010', description: '18A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 18, sellingPrice: 1570.26, sepEquivalent: 'LC1D18M7', coilVoltage: '230V' },
  { catalogNo: 'AX25-30-10,230-240V', abbRefNo: '1SBL931074R8010', description: '25A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 25, sellingPrice: 2142.22, sepEquivalent: 'LC1D25M7', coilVoltage: '230V' },
  { catalogNo: 'AX32-30-10,230-240V', abbRefNo: '1SBL281074R8010', description: '32A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 32, sellingPrice: 3223.16, sepEquivalent: 'LC1D32M7', coilVoltage: '230V' },
  { catalogNo: 'AX40-30-10,230-240V', abbRefNo: '1SBL321074R8010', description: '40A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 40, sellingPrice: 3972.87, sepEquivalent: 'LC1D40M7', coilVoltage: '230V' },
  { catalogNo: 'AX50-30-11,230-240V', abbRefNo: '1SBL351074R8011', description: '50A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 50, sellingPrice: 5819.27, sepEquivalent: 'LC1D50M7', coilVoltage: '230V' },
  { catalogNo: 'AX65-30-11,230-240V', abbRefNo: '1SBL371074R8011', description: '65A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 65, sellingPrice: 6702.13, sepEquivalent: 'LC1D65M7', coilVoltage: '230V' },
  { catalogNo: 'AX80-30-11,230-240V', abbRefNo: '1SBL411074R8011', description: '80A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 80, sellingPrice: 7673.54, sepEquivalent: 'LC1D80M7', coilVoltage: '230V' },
  { catalogNo: 'AX95-30-11,230-240V', abbRefNo: '1SFL431074R8011', description: '95A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 95, sellingPrice: 9158.53, sepEquivalent: 'LC1D95M7', coilVoltage: '230V' },
  { catalogNo: 'AX115-30-11,230-240V', abbRefNo: '1SFL981074R8011', description: '115A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 115, sellingPrice: 12605.35, sepEquivalent: 'LC1D115M7', coilVoltage: '230V' },
  { catalogNo: 'AX185-30-11,230-240V', abbRefNo: '1SFL491074R8011', description: '185A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 185, sellingPrice: 17891.37, sepEquivalent: 'LC1F185M7', coilVoltage: '230V' },
  { catalogNo: 'AX205-30-11,230-240V', abbRefNo: '1SFL501074R8011', description: '205A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 205, sellingPrice: 23919.87, sepEquivalent: null, coilVoltage: '230V' },
  { catalogNo: 'AX260-30-11,230-240V', abbRefNo: '1SFL547074R8011', description: '260A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 260, sellingPrice: 31634.08, sepEquivalent: null, coilVoltage: '230V' },
  { catalogNo: 'AX300-30-11,230-240V', abbRefNo: '1SFL587074R8011', description: '300A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 300, sellingPrice: 33334.86, sepEquivalent: null, coilVoltage: '230V' },
  { catalogNo: 'AX370-30-11,230-240V', abbRefNo: '1SFL607074R8011', description: '370A, 3P 230V 50Hz, 240-260V 60Hz', category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay', poles: 3, ampRating: 370, sellingPrice: 39993.70, sepEquivalent: 'LC1F330M7', coilVoltage: '230V' },

  // ==================== PAGE 4: TA SERIES (Thermal Overload Relay) ====================
  // TA25DU-M Series (FOR AX09 ~ AX40)
  { catalogNo: 'TA25DU-0.16M', abbRefNo: '1SAZ211201R2005', description: 'Setting Range 0.10-0.16A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1329.54, sepEquivalent: 'LRD01' },
  { catalogNo: 'TA25DU-0.25M', abbRefNo: '1SAZ211201R2009', description: 'Setting Range 0.16-0.25A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1329.54, sepEquivalent: 'LRD02' },
  { catalogNo: 'TA25DU-0.4M', abbRefNo: '1SAZ211201R2013', description: 'Setting Range 0.25-0.40A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1166.87, sepEquivalent: null },
  { catalogNo: 'TA25DU-0.63M', abbRefNo: '1SAZ211201R2017', description: 'Setting Range 0.40-0.63A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1166.87, sepEquivalent: 'LRD04' },
  { catalogNo: 'TA25DU-1.0M', abbRefNo: '1SAZ211201R2021', description: 'Setting Range 0.63-1.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD05' },
  { catalogNo: 'TA25DU-1.4M', abbRefNo: '1SAZ211201R2023', description: 'Setting Range 1.00-1.40A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1166.87, sepEquivalent: 'LRD06' },
  { catalogNo: 'TA25DU-1.8M', abbRefNo: '1SAZ211201R2025', description: 'Setting Range 1.30-1.80A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1166.87, sepEquivalent: 'LRD06' },
  { catalogNo: 'TA25DU-2.4M', abbRefNo: '1SAZ211201R2028', description: 'Setting Range 1.70-2.40A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1166.87, sepEquivalent: 'LRD07' },
  { catalogNo: 'TA25DU-3.1M', abbRefNo: '1SAZ211201R2031', description: 'Setting Range 2.20-3.10A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD08' },
  { catalogNo: 'TA25DU-4.0M', abbRefNo: '1SAZ211201R2033', description: 'Setting Range 2.80-4.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD08' },
  { catalogNo: 'TA25DU-5.0M', abbRefNo: '1SAZ211201R2035', description: 'Setting Range 3.50-5.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD10' },
  { catalogNo: 'TA25DU-6.5M', abbRefNo: '1SAZ211201R2038', description: 'Setting Range 4.50-6.50A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD10' },
  { catalogNo: 'TA25DU-8.5M', abbRefNo: '1SAZ211201R2040', description: 'Setting Range 6.00-8.50A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD12' },
  { catalogNo: 'TA25DU-11M', abbRefNo: '1SAZ211201R2043', description: 'Setting Range 7.50-11.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1003.55, sepEquivalent: 'LRD14' },
  { catalogNo: 'TA25DU-14M', abbRefNo: '1SAZ211201R2045', description: 'Setting Range 10.00-14.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1166.87, sepEquivalent: 'LRD16' },
  { catalogNo: 'TA25DU-19M', abbRefNo: '1SAZ211201R2047', description: 'Setting Range 13.00-19.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1586.00, sepEquivalent: 'LRD21' },
  { catalogNo: 'TA25DU-25M', abbRefNo: '1SAZ211201R2051', description: 'Setting Range 18.00-25.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1586.00, sepEquivalent: 'LRD22' },
  { catalogNo: 'TA25DU-32M', abbRefNo: '1SAZ211201R2053', description: 'Setting Range 24.00-32.00A, FOR AX09~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 1824.75, sepEquivalent: 'LRD32' },
  // TA42DU-M Series (FOR AX30 ~ AX40)
  { catalogNo: 'TA42DU-25M', abbRefNo: '1SAZ311201R2001', description: 'Setting Range 18.00-25.00A, FOR AX30~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3233.66, sepEquivalent: null },
  { catalogNo: 'TA42DU-32M', abbRefNo: '1SAZ311201R2002', description: 'Setting Range 22.00-32.00A, FOR AX30~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3233.66, sepEquivalent: null },
  { catalogNo: 'TA42DU-42M', abbRefNo: '1SAZ311201R2003', description: 'Setting Range 29.00-42.00A, FOR AX30~AX40', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3233.66, sepEquivalent: null },
  // TA75DU-M Series (FOR AX50 ~ AX80)
  { catalogNo: 'TA75DU-25M', abbRefNo: '1SAZ321201R2001', description: 'Setting Range 18.00-25.00A, FOR AX50~AX80', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3305.15, sepEquivalent: null },
  { catalogNo: 'TA75DU-32M', abbRefNo: '1SAZ321201R2002', description: 'Setting Range 22.00-32.00A, FOR AX50~AX80', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3305.15, sepEquivalent: null },
  { catalogNo: 'TA75DU-42M', abbRefNo: '1SAZ321201R2003', description: 'Setting Range 29.00-42.00A, FOR AX50~AX80', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3305.15, sepEquivalent: null },
  { catalogNo: 'TA75DU-52M', abbRefNo: '1SAZ321201R2004', description: 'Setting Range 36.00-52.00A, FOR AX50~AX80', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3305.15, sepEquivalent: null },
  { catalogNo: 'TA75DU-63M', abbRefNo: '1SAZ321201R2005', description: 'Setting Range 45.00-63.00A, FOR AX50~AX80', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3393.70, sepEquivalent: null },
  { catalogNo: 'TA75DU-80M', abbRefNo: '1SAZ321201R2006', description: 'Setting Range 60.00-80.00A, FOR AX50~AX80', category: 'TA Series', categoryLabel: 'Thermal Overload Relay', sellingPrice: 3652.13, sepEquivalent: null },

  // ==================== PAGES 5-9: FORMULA A1/A2/A3 (MCCB) ====================
  // The remaining ~150+ items from pages 5-15 follow the same pattern.
  // For brevity in this plan, the import script will contain ALL items.
  // The implementer MUST extract every row from the PDF and include it.
  // Placeholder comment — actual implementation will include all items.
  //
  // Categories and approximate counts:
  //   Formula A1 Series (pages 5-7): ~80 items (A1A/A1B/A1C/A1N variants, 1P/2P/3P, 10-125Kaic frames)
  //   Formula A2 Series (page 8): ~20 items (A2B/A2C/A2N variants, 2P/3P, 125-250A frames)
  //   Formula A3 Series (page 9): ~10 items (A3N/A3S variants, 320-630A)
  //   TMAX XT Series (pages 10-13): ~60 items (XT1N through XT7L, 32-1600A, TMD/LS/I/LSIG functions)
  //   EMAX 2 Series (pages 14-15): ~30 items (E1.2N/E2.2N/E4.2N, 800-4000A, LI/LSIG functions)
];

// --- Import ---
async function importItems() {
  console.log(`Importing ${ITEMS.length} pricelist items...`);
  const batch_size = 400; // Firestore batch limit is 500
  let written = 0;

  for (let i = 0; i < ITEMS.length; i += batch_size) {
    const batch = db.batch();
    const slice = ITEMS.slice(i, i + batch_size);

    for (const item of slice) {
      const id = docId(item.catalogNo);
      const ref = db.collection('pricelist_items').doc(id);
      batch.set(ref, makeItem(item));
    }

    await batch.commit();
    written += slice.length;
    console.log(`  Written ${written} / ${ITEMS.length}`);
  }

  console.log('Done!');
}

importItems().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
```

**IMPORTANT for implementer:** The `ITEMS` array above includes all items from pages 1-4 of the PDF. The implementer MUST also extract and include ALL items from pages 5-15 following the exact same object shape. The complete script will have ~300+ entries. Use the PDF data extracted during the design phase (the spec lists the categories and page ranges).

- [ ] **Step 2: Run the import script**

Run: `cd /Users/tjc/PM/pmv2 && node scripts/import-pricelist-dcpi-abb.js`
Expected: "Importing N pricelist items..." followed by "Done!" with no errors.

- [ ] **Step 3: Verify data in Firestore**

Run: `cd /Users/tjc/PM/pmv2 && node -e "
const admin = require('firebase-admin');
const sa = require('./pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
admin.firestore().collection('pricelist_items').get().then(s => {
  console.log('Total docs:', s.size);
  const cats = [...new Set(s.docs.map(d => d.data().category))];
  console.log('Categories:', cats.sort().join(', '));
});
"`
Expected: Total docs >= 300, Categories listing all 9 categories.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-pricelist-dcpi-abb.js
git commit -m "feat(pricelist): add Firestore import script for HVC DCPI ABB pricelist"
```

---

### Task 3: Pricelist Filters + Table Components

**Files:**
- Create: `src/components/pricelists/PricelistFilters.tsx`
- Create: `src/components/pricelists/PricelistTable.tsx`

**Consumes:**
- `PricelistItem`, `PricelistFiltersState`, `PricelistFilterOptions`, `EMPTY_FILTERS` from `src/types/Pricelist.ts`
- `usePricelistStore` from `src/store/pricelistStore.ts`

**Produces:**
- `<PricelistFilters />` — renders search bar + filter dropdowns, calls `setFilters()` on change
- `<PricelistTable selectable onSelectionChange />` — renders the data table with optional checkbox selection

- [ ] **Step 1: Create `src/components/pricelists/PricelistFilters.tsx`**

```tsx
import { useState, useEffect } from 'react';
import {
  Box, TextField, InputAdornment, FormControl, InputLabel, Select, MenuItem,
  Chip, Stack, Button, OutlinedInput, SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { usePricelistStore } from '../../store/pricelistStore';
import { EMPTY_FILTERS } from '../../types/Pricelist';

export default function PricelistFilters() {
  const filters = usePricelistStore((s) => s.filters);
  const filterOptions = usePricelistStore((s) => s.filterOptions);
  const setFilters = usePricelistStore((s) => s.setFilters);
  const resetFilters = usePricelistStore((s) => s.resetFilters);
  const fetchItems = usePricelistStore((s) => s.fetchItems);

  // Debounced search
  const [searchLocal, setSearchLocal] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchLocal !== filters.search) {
        setFilters({ search: searchLocal });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchLocal, filters.search, setFilters]);

  // Re-fetch when filters change (except search, which debounces above)
  useEffect(() => {
    fetchItems();
  }, [filters, fetchItems]);

  const handleCategoryChange = (e: SelectChangeEvent<string[]>) => {
    const val = e.target.value;
    setFilters({ categories: typeof val === 'string' ? val.split(',') : val });
  };

  const handlePolesChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setFilters({ poles: val ? Number(val) : null });
  };

  const hasFilters = filters.search || filters.categories.length || filters.poles != null ||
    filters.minPrice != null || filters.maxPrice != null;

  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search by catalog no., description, ABB ref, SEP equivalent..."
        value={searchLocal}
        onChange={(e) => setSearchLocal(e.target.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: searchLocal ? (
              <InputAdornment position="end">
                <ClearIcon fontSize="small" sx={{ cursor: 'pointer' }} onClick={() => { setSearchLocal(''); setFilters({ search: '' }); }} />
              </InputAdornment>
            ) : null,
          },
        }}
        sx={{ mb: 1.5 }}
      />
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Category</InputLabel>
          <Select
            multiple
            value={filters.categories}
            onChange={handleCategoryChange}
            input={<OutlinedInput label="Category" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((v) => <Chip key={v} label={v} size="small" />)}
              </Box>
            )}
          >
            {filterOptions.categories.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Poles</InputLabel>
          <Select value={filters.poles != null ? String(filters.poles) : ''} onChange={handlePolesChange} label="Poles">
            <MenuItem value="">All</MenuItem>
            {filterOptions.poles.map((p) => (
              <MenuItem key={p} value={String(p)}>{p}P</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Min Price"
          type="number"
          sx={{ width: 120 }}
          value={filters.minPrice ?? ''}
          onChange={(e) => setFilters({ minPrice: e.target.value ? Number(e.target.value) : null })}
        />
        <TextField
          size="small"
          label="Max Price"
          type="number"
          sx={{ width: 120 }}
          value={filters.maxPrice ?? ''}
          onChange={(e) => setFilters({ maxPrice: e.target.value ? Number(e.target.value) : null })}
        />

        {hasFilters && (
          <Button size="small" onClick={() => { resetFilters(); setSearchLocal(''); }}>
            Clear all
          </Button>
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Create `src/components/pricelists/PricelistTable.tsx`**

```tsx
import { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, Chip, TablePagination, Skeleton, Typography, Box, TableSortLabel,
} from '@mui/material';
import type { PricelistItem } from '../../types/Pricelist';

const PHP = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  items: PricelistItem[];
  loading: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
}

type SortKey = 'catalogNo' | 'description' | 'category' | 'poles' | 'ampRating' | 'sellingPrice';
type SortDir = 'asc' | 'desc';

export default function PricelistTable({ items, loading, selectable = false, selected, onSelectionChange }: Props) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>('catalogNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const paged = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSort = (key: SortKey) => {
    setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selected) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange || !selected) return;
    if (selected.size === items.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map((i) => i.id)));
    }
  };

  if (loading) {
    return (
      <Box>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (!items.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No items match your search</Typography>
      </Box>
    );
  }

  const sortLabel = (key: SortKey, label: string) => (
    <TableSortLabel active={sortKey === key} direction={sortKey === key ? sortDir : 'asc'} onClick={() => handleSort(key)}>
      {label}
    </TableSortLabel>
  );

  return (
    <>
      <TableContainer sx={{ maxHeight: 'calc(100vh - 340px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={!!selected && selected.size > 0 && selected.size < items.length}
                    checked={!!selected && selected.size === items.length}
                    onChange={toggleAll}
                    size="small"
                  />
                </TableCell>
              )}
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('catalogNo', 'Catalog No.')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('description', 'Description')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{sortLabel('category', 'Category')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('poles', 'Poles')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{sortLabel('ampRating', 'Amps')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">{sortLabel('sellingPrice', 'Price')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>SEP Equiv.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((item) => (
              <TableRow
                key={item.id}
                hover
                selected={selected?.has(item.id)}
                onClick={selectable ? () => toggleOne(item.id) : undefined}
                sx={selectable ? { cursor: 'pointer' } : undefined}
              >
                {selectable && (
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected?.has(item.id) ?? false} size="small" />
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{item.catalogNo}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell><Chip label={item.category} size="small" variant="outlined" /></TableCell>
                <TableCell align="center">{item.poles ? `${item.poles}P` : '—'}</TableCell>
                <TableCell align="center">{item.ampRating ?? '—'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{PHP(item.sellingPrice)}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{item.sepEquivalent ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={items.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add src/components/pricelists/PricelistFilters.tsx src/components/pricelists/PricelistTable.tsx
git commit -m "feat(pricelist): add PricelistFilters and PricelistTable components"
```

---

### Task 4: Standalone Pricelist Browser Page + Route + Nav

**Files:**
- Create: `src/components/pricelists/PricelistBrowser.tsx`
- Modify: `src/App.tsx` (add route import + Route component)
- Modify: `src/components/sales/SalesNavList.tsx` (add nav item)

**Consumes:**
- `<PricelistFilters />` from `src/components/pricelists/PricelistFilters.tsx`
- `<PricelistTable />` from `src/components/pricelists/PricelistTable.tsx`
- `usePricelistStore` from `src/store/pricelistStore.ts`
- `useQuotationStore` from `src/store/quotationStore.ts` (for the "Add to Quotation" dialog)

**Produces:**
- `/sales/pricelists` page fully functional with search, filter, select, and "Add to Quotation" cart flow

- [ ] **Step 1: Create `src/components/pricelists/PricelistBrowser.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert, Stack, Chip,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { nanoid } from 'nanoid';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';
import { usePricelistStore } from '../../store/pricelistStore';
import { useQuotationStore } from '../../store/quotationStore';
import type { PricelistItem } from '../../types/Pricelist';
import type { ComponentLine } from '../../types/Quotation';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};

/** Convert a set of selected pricelist items into ComponentLine objects */
function toComponentLines(items: PricelistItem[], existingComponents: ComponentLine[]): ComponentLine[] {
  let nextNum = 10;
  if (existingComponents.length) {
    const nums = existingComponents.map((c) => parseInt(c.code.replace(/^B-/, ''), 10)).filter((n) => !isNaN(n));
    if (nums.length) nextNum = Math.max(...nums) + 10;
  }
  return items.map((item, idx) => ({
    id: nanoid(),
    code: `B-${String(nextNum + idx * 10).padStart(4, '0')}`,
    description: `${item.description} [${item.catalogNo}]`,
    brand: 'ABB',
    partNo: item.catalogNo,
    qty: 1,
    uom: 'pc',
    unitCost: item.sellingPrice,
    forex: 1,
    contingencyPct: 0,
    contingencyPctOverridden: false,
    discountPct: 0,
  }));
}

export default function PricelistBrowser() {
  const items = usePricelistStore((s) => s.items);
  const loading = usePricelistStore((s) => s.loading);
  const fetchFilters = usePricelistStore((s) => s.fetchFilters);

  const projects = useQuotationStore((s) => s.projects);
  const quotations = useQuotationStore((s) => s.quotations);
  const updateQuotation = useQuotationStore((s) => s.updateQuotation);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetQuotationId, setTargetQuotationId] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  const selectedItems = items.filter((i) => selected.has(i.id));
  const projectQuotations = quotations.filter((q) => q.projectId === targetProjectId);

  const handleAddToQuotation = useCallback(async () => {
    if (!targetQuotationId) return;
    const quotation = quotations.find((q) => q.id === targetQuotationId);
    if (!quotation) return;

    const newLines = toComponentLines(selectedItems, quotation.components);
    try {
      await updateQuotation(targetQuotationId, {
        components: [...quotation.components, ...newLines],
      });
      setSnackbar({ open: true, message: `Added ${newLines.length} item(s) to quotation`, severity: 'success' });
      setDialogOpen(false);
      setSelected(new Set());
      setTargetProjectId('');
      setTargetQuotationId('');
    } catch {
      setSnackbar({ open: true, message: 'Failed to add items to quotation', severity: 'error' });
    }
  }, [targetQuotationId, selectedItems, quotations, updateQuotation]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 2, pb: 0 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Pricelists</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          HVC DCPI — ABB Products (March 2026) &middot; {items.length} items
        </Typography>
      </Box>

      <Box sx={{ px: 2, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <PricelistFilters />
        <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <PricelistTable
            items={items}
            loading={loading}
            selectable
            selected={selected}
            onSelectionChange={setSelected}
          />
        </Paper>
      </Box>

      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            p: 1.5, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '1px solid #e0e0e0',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={`${selected.size} item${selected.size > 1 ? 's' : ''} selected`} color="primary" />
            <Button size="small" onClick={() => setSelected(new Set())}>Clear</Button>
          </Stack>
          <Button
            variant="contained"
            startIcon={<AddShoppingCartIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add to Quotation
          </Button>
        </Paper>
      )}

      {/* Target quotation picker dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add {selected.size} item(s) to quotation</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 2 }}>
            <InputLabel>Project</InputLabel>
            <Select
              value={targetProjectId}
              onChange={(e) => { setTargetProjectId(e.target.value); setTargetQuotationId(''); }}
              label="Project"
            >
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" disabled={!targetProjectId}>
            <InputLabel>Quotation</InputLabel>
            <Select value={targetQuotationId} onChange={(e) => setTargetQuotationId(e.target.value)} label="Quotation">
              {projectQuotations.map((q) => (
                <MenuItem key={q.id} value={q.id}>{q.code || q.id} ({q.kind})</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!targetQuotationId} onClick={handleAddToQuotation}
            sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}
          >
            Add items
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
```

- [ ] **Step 2: Add route in `src/App.tsx`**

Add import near the other calcsheet imports (around line 53):
```tsx
import PricelistBrowser from './components/pricelists/PricelistBrowser';
```

Add route inside the Sales workspace section (after the `/sales/calcsheet/presets` route, before the clients route):
```tsx
<Route path="/sales/pricelists" element={<ProtectedRoute><AppLayout><PricelistBrowser /></AppLayout></ProtectedRoute>} />
```

- [ ] **Step 3: Add nav item in `src/components/sales/SalesNavList.tsx`**

Add `MenuBook` to the icon imports:
```tsx
import {
  QueryStats as QueryStatsIcon,
  Calculate as CalculateIcon,
  People as ClientsIcon,
  MenuBook as PricelistIcon,
  // ... rest of imports
} from '@mui/icons-material';
```

Insert the Pricelists nav item between the Calcsheet and Clients items (after the Calcsheet `</ListItem>` close tag around line 100):
```tsx
      {/* Pricelists */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Pricelists'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/sales/pricelists'}
            onClick={() => navigate('/sales/pricelists')}
            sx={navBtnSx(location.pathname === '/sales/pricelists')}
          >
            <ListItemIcon sx={iconSx()}>
              <PricelistIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Pricelists"
                secondary="Supplier catalogs & pricing"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 5: Test in browser**

Run: `cd /Users/tjc/PM/pmv2 && npm start`
Navigate to `http://localhost:3000/sales/pricelists`. Verify:
- Page loads with "Pricelists" title
- Search bar and filter dropdowns appear
- Table shows pricelist items with correct data
- Checkbox selection works, sticky bottom bar appears
- "Add to Quotation" dialog opens with project/quotation picker
- Nav sidebar shows "Pricelists" item

- [ ] **Step 6: Commit**

```bash
git add src/components/pricelists/PricelistBrowser.tsx src/App.tsx src/components/sales/SalesNavList.tsx
git commit -m "feat(pricelist): add standalone pricelist browser page with nav and routing"
```

---

### Task 5: PricelistPickerDialog + Quotation Editor Integration

**Files:**
- Create: `src/components/pricelists/PricelistPickerDialog.tsx`
- Modify: `src/components/calcsheet/CalcsheetQuotationEditor.tsx`

**Consumes:**
- `<PricelistFilters />` from `src/components/pricelists/PricelistFilters.tsx`
- `<PricelistTable />` from `src/components/pricelists/PricelistTable.tsx`
- `usePricelistStore` from `src/store/pricelistStore.ts`
- `PricelistItem` from `src/types/Pricelist.ts`
- `ComponentLine` from `src/types/Quotation.ts`

**Produces:**
- `<PricelistPickerDialog open onClose onAdd />` — dialog with pricelist browser for use inside the quotation editor
- "Browse Catalog" button in the quotation editor's Section B header

- [ ] **Step 1: Create `src/components/pricelists/PricelistPickerDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Chip, Stack,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PricelistFilters from './PricelistFilters';
import PricelistTable from './PricelistTable';
import { usePricelistStore } from '../../store/pricelistStore';
import type { PricelistItem } from '../../types/Pricelist';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (items: PricelistItem[]) => void;
}

export default function PricelistPickerDialog({ open, onClose, onAdd }: Props) {
  const items = usePricelistStore((s) => s.items);
  const loading = usePricelistStore((s) => s.loading);
  const fetchItems = usePricelistStore((s) => s.fetchItems);
  const fetchFilters = usePricelistStore((s) => s.fetchFilters);
  const resetFilters = usePricelistStore((s) => s.resetFilters);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      resetFilters();
      fetchFilters();
      fetchItems();
      setSelected(new Set());
    }
  }, [open, fetchItems, fetchFilters, resetFilters]);

  const handleConfirm = () => {
    const picked = items.filter((i) => selected.has(i.id));
    onAdd(picked);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '85vh' } }}>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <MenuBookIcon />
          <span>Browse Catalog</span>
          {selected.size > 0 && <Chip label={`${selected.size} selected`} color="primary" size="small" />}
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
        <PricelistFilters />
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <PricelistTable
            items={items}
            loading={loading}
            selectable
            selected={selected}
            onSelectionChange={setSelected}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={selected.size === 0} onClick={handleConfirm}>
          Add {selected.size || ''} item{selected.size !== 1 ? 's' : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add "Browse Catalog" button and dialog to `CalcsheetQuotationEditor.tsx`**

Add imports at the top of the file (near existing imports):
```tsx
import PricelistPickerDialog from '../pricelists/PricelistPickerDialog';
import type { PricelistItem } from '../../types/Pricelist';
```

Add state for the dialog (near other `useState` declarations):
```tsx
const [catalogOpen, setCatalogOpen] = useState(false);
```

Add the handler function that converts picked pricelist items to component lines (near the `addComponent` function, around line 385):
```tsx
const addFromCatalog = (pickedItems: PricelistItem[]) => {
  let nextNum = 10;
  const nums = quotation.components.map((c) => parseInt(c.code.replace(/^B-/, ''), 10)).filter((n) => !isNaN(n));
  if (nums.length) nextNum = Math.max(...nums) + 10;

  const newLines: ComponentLine[] = pickedItems.map((item, idx) => ({
    id: id(),
    code: `B-${String(nextNum + idx * 10).padStart(4, '0')}`,
    description: `${item.description} [${item.catalogNo}]`,
    brand: 'ABB',
    partNo: item.catalogNo,
    qty: 1,
    uom: 'pc',
    unitCost: item.sellingPrice,
    forex: 1,
    contingencyPct: quotation.productContingencyPct ?? 0,
    contingencyPctOverridden: false,
    discountPct: 0,
  }));
  commit('components', [...quotation.components, ...newLines] as ComponentLine[]);
};
```

Find the Section B header Stack (around line 1165-1168) that contains the "Add row" button. Add a "Browse Catalog" button next to it:

Before (existing):
```tsx
{!isLegacy && <Button startIcon={<AddIcon />} size="small" onClick={addComponent}>Add row</Button>}
```

After (modified):
```tsx
{!isLegacy && (
  <>
    <Button startIcon={<MenuBookIcon />} size="small" variant="outlined" onClick={() => setCatalogOpen(true)}>
      Browse Catalog
    </Button>
    <Button startIcon={<AddIcon />} size="small" onClick={addComponent}>Add row</Button>
  </>
)}
```

Add the `MenuBookIcon` import at the top with other icon imports:
```tsx
import MenuBookIcon from '@mui/icons-material/MenuBook';
```

Add the dialog component at the end of the JSX return, before the final closing tags:
```tsx
<PricelistPickerDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} onAdd={addFromCatalog} />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Test in browser**

Navigate to any non-legacy quotation editor. Verify:
- "Browse Catalog" button appears in Section B header
- Clicking it opens the pricelist dialog
- Search/filter works inside the dialog
- Selecting items and clicking "Add N items" inserts component lines
- Inserted lines have correct brand ("ABB"), partNo (catalogNo), unitCost (sellingPrice)
- Existing component lines are preserved (new ones appended)

- [ ] **Step 5: Commit**

```bash
git add src/components/pricelists/PricelistPickerDialog.tsx src/components/calcsheet/CalcsheetQuotationEditor.tsx
git commit -m "feat(pricelist): add Browse Catalog dialog in quotation editor"
```

---

### Task 6: Final Verification + Build Check

**Files:** None (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run: `cd /Users/tjc/PM/pmv2 && npx tsc --noEmit`
Expected: Clean — zero errors.

- [ ] **Step 2: Run production build**

Run: `cd /Users/tjc/PM/pmv2 && CI=true npm run build 2>&1 | tail -20`
Expected: "Compiled successfully" with no errors. Warnings about unused vars are acceptable as long as they're not in the new pricelist files.

- [ ] **Step 3: End-to-end browser verification**

Run the dev server and test the complete flow:

1. **Standalone browser**: Navigate to `/sales/pricelists`
   - Page loads, items appear in table
   - Search "SH201" → filters to SH200 1P items
   - Filter by category "AX Series" → shows contactors
   - Filter by Poles "3P" → filters by pole count
   - Set min price 10000 → shows only expensive items
   - "Clear all" resets all filters
   - Select 3 items → bottom bar shows "3 items selected"
   - Click "Add to Quotation" → dialog opens
   - Pick a project and quotation → click "Add items"
   - Success snackbar appears

2. **Quotation editor integration**: Navigate to any non-legacy quotation
   - "Browse Catalog" button visible in Section B header
   - Click → dialog opens with full pricelist
   - Search, select items, click "Add N items"
   - Component lines appear in the editor with correct data
   - Save quotation → items persist

3. **Nav**: Sidebar shows "Pricelists" between Calcsheet and Clients
