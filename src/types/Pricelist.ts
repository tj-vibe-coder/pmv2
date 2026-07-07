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
  uom?: string;          // unit of measure (pc, m, length, box…) — materials/cables
  poles?: number;
  ampRating?: number;
  dimensions?: { w: number; d: number; h: number };
  sellingPrice: number;
  sepEquivalent?: string;
  coilVoltage?: string;
  frameSize?: number;
  kaic?: string;
  createdAt?: string | { _seconds?: number; seconds?: number };
  updatedAt?: string | { _seconds?: number; seconds?: number };
  createdBy?: string;
  updatedBy?: string;
}

export interface PricelistAuditEntry {
  id: string;
  itemId: string;
  catalogNo?: string;
  action: 'create' | 'update' | 'delete';
  changes?: Record<string, { from: unknown; to: unknown }>;
  snapshot?: { description?: string; sellingPrice?: number };
  byName?: string;
  at: string;
}

export interface PricelistFiltersState {
  search: string;
  categories: string[];
  brands: string[];
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
  brands: [],
  poles: null,
  minPrice: null,
  maxPrice: null,
};
