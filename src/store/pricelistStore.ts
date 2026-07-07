import { create } from 'zustand';
import type { PricelistItem, PricelistFiltersState, PricelistFilterOptions, PricelistAuditEntry } from '../types/Pricelist';
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
  createItem: (item: Partial<PricelistItem>) => Promise<void>;
  updateItem: (id: string, item: Partial<PricelistItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  fetchHistory: (id: string) => Promise<PricelistAuditEntry[]>;
}

export const usePricelistStore = create<PricelistState>((set, get) => ({
  items: [],
  filterOptions: { suppliers: [], brands: [], categories: [], poles: [] },
  filters: { ...EMPTY_FILTERS },
  loading: false,
  error: null,

  // Fetches the whole catalog once; filtering happens client-side (see filterItems.ts).
  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/pricelists`, { headers: authHeaders() });
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

  createItem: async (item) => {
    const res = await fetch(`${API_BASE}/api/pricelists`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create item');
    await get().fetchItems();
    await get().fetchFilters();
  },

  updateItem: async (id, item) => {
    const res = await fetch(`${API_BASE}/api/pricelists/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update item');
    await get().fetchItems();
    await get().fetchFilters();
  },

  deleteItem: async (id) => {
    const res = await fetch(`${API_BASE}/api/pricelists/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to delete item');
    await get().fetchItems();
    await get().fetchFilters();
  },

  fetchHistory: async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/pricelists/${id}/audit`, { headers: authHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.entries || []) as PricelistAuditEntry[];
    } catch {
      return [];
    }
  },
}));
