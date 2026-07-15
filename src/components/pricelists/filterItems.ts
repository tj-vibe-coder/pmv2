import type { PricelistItem, PricelistFiltersState } from '../../types/Pricelist';

/** Client-side filtering — mirrors the (now unused) server-side query params. */
export function filterItems(items: PricelistItem[], filters: PricelistFiltersState): PricelistItem[] {
  let result = items;
  if (filters.suppliers.length) result = result.filter((i) => filters.suppliers.includes(i.supplier));
  if (filters.categories.length) result = result.filter((i) => filters.categories.includes(i.category));
  if (filters.brands.length) result = result.filter((i) => filters.brands.includes(i.brand));
  if (filters.poles != null) result = result.filter((i) => Number(i.poles) === filters.poles);
  if (filters.minPrice != null) result = result.filter((i) => i.sellingPrice >= (filters.minPrice as number));
  if (filters.maxPrice != null) result = result.filter((i) => i.sellingPrice <= (filters.maxPrice as number));
  if (filters.search) {
    const t = filters.search.toLowerCase();
    result = result.filter((i) =>
      [i.catalogNo, i.description, i.brand, i.category, i.supplier, i.abbRefNo, i.sepEquivalent]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }
  return result;
}
