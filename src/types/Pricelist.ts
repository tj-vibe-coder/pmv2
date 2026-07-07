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
